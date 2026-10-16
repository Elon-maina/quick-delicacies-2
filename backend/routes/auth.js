const express = require("express");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const db = require("../db").promise();
const { sendMail } = require("../mailer");

const router = express.Router();

const CODE_TTL_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;

// ---------------------
// Helpers
// ---------------------

// Same rules the signup and reset pages enforce in the browser.
function passwordProblem(password) {
    if (typeof password !== "string" || password.length < 8) return "Password must be at least 8 characters long.";
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[\W_]/.test(password)) {
        return "Password must contain upper and lower case letters, a number and a special character.";
    }
    return null;
}

const newCode = () => String(crypto.randomInt(100000, 1000000));

// Store a fresh one-time code for the user; returns the code.
async function issueCode(userId) {
    const code = newCode();
    await db.query(
        "UPDATE users SET otp_code = ?, otp_expires = DATE_ADD(NOW(), INTERVAL ? MINUTE), otp_attempts = 0 WHERE id = ?",
        [code, CODE_TTL_MINUTES, userId]
    );
    return code;
}

// Check a one-time code. Wrong guesses are counted and the code is destroyed after MAX_CODE_ATTEMPTS.
async function checkCode(email, code) {
    const [rows] = await db.query(
        "SELECT id, otp_code, otp_attempts, otp_expires > NOW() AS fresh FROM users WHERE email = ?",
        [email]
    );
    const user = rows[0];
    if (!user || !user.otp_code || !user.fresh || user.otp_attempts >= MAX_CODE_ATTEMPTS) return null;

    const a = Buffer.from(String(user.otp_code));
    const b = Buffer.from(String(code));
    if (a.length === b.length && crypto.timingSafeEqual(a, b)) return user;

    await db.query("UPDATE users SET otp_attempts = otp_attempts + 1 WHERE id = ?", [user.id]);
    return null;
}

async function clearCode(userId) {
    await db.query("UPDATE users SET otp_code = NULL, otp_expires = NULL, otp_attempts = 0 WHERE id = ?", [userId]);
}

// Simple in-memory limiter, keyed by an arbitrary string (IP + email).
function limiter(max, windowMs) {
    const hits = new Map();
    return (key) => {
        const now = Date.now();
        const entry = hits.get(key);
        if (!entry || now - entry.first > windowMs) {
            hits.set(key, { count: 1, first: now });
            return false;
        }
        entry.count++;
        return entry.count > max;
    };
}
const loginLimited = limiter(10, 15 * 60 * 1000);
const emailLimited = limiter(5, 60 * 60 * 1000);
const limitKey = (req) => `${req.ip}|${String(req.body.email || "").toLowerCase()}`;

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
    console.error(`Auth error on ${req.path}:`, err.message);
    res.status(500).json({ error: "Server error" });
});

// ---------------------
// Signup + email verification
// ---------------------
router.post("/signup", wrap(async (req, res) => {
    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: "All fields are required!" });
    }
    if (confirmPassword !== undefined && password !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match" });
    }
    const problem = passwordProblem(password);
    if (problem) return res.status(400).json({ error: problem });

    const [existing] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    if (existing.length > 0) {
        return res.status(400).json({ error: "Email already registered!" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const [result] = await db.query(
        "INSERT INTO users (name, email, password, verified) VALUES (?, ?, ?, FALSE)",
        [name, email, hashedPassword]
    );
    const code = await issueCode(result.insertId);

    const sent = await sendMail(email, "Verify Your Email",
        `Your OTP code is: ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`);
    if (!sent) {
        return res.status(500).json({ error: "Account created, but the OTP email could not be sent. Use 'Resend OTP'." });
    }
    res.json({ message: "Signup successful! Check your email for the OTP." });
}));

router.post("/verify", wrap(async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp) {
        return res.status(400).json({ error: "Email and OTP are required!" });
    }

    const user = await checkCode(email, otp);
    if (!user) return res.status(400).json({ error: "Incorrect or expired OTP!" });

    await db.query("UPDATE users SET verified = TRUE WHERE id = ?", [user.id]);
    await clearCode(user.id);
    res.json({ message: "Email verified successfully!" });
}));

router.post("/resend-otp", wrap(async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required!" });
    if (emailLimited(limitKey(req))) return res.status(429).json({ error: "Too many requests. Try again later." });

    const [rows] = await db.query("SELECT id FROM users WHERE email = ? AND verified = FALSE", [email]);
    if (rows.length === 0) {
        return res.status(400).json({ error: "User not found or already verified!" });
    }

    const code = await issueCode(rows[0].id);
    const sent = await sendMail(email, "Resend OTP Code",
        `Your new OTP code is: ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`);
    if (!sent) return res.status(500).json({ error: "Failed to resend OTP" });
    res.json({ message: "OTP resent successfully!" });
}));

// ---------------------
// Login / session / logout
// ---------------------
router.post("/login", wrap(async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: "Missing email or password" });
    }
    if (loginLimited(limitKey(req))) {
        return res.status(429).json({ error: "Too many login attempts. Try again in 15 minutes." });
    }

    const [rows] = await db.query("SELECT id, name, email, password, role, verified FROM users WHERE email = ?", [email]);
    const user = rows[0];
    // Check the password before anything else so responses don't reveal which emails are registered.
    if (!user || !(await bcrypt.compare(password, user.password))) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    if (!user.verified) {
        return res.status(401).json({ error: "Please verify your email before logging in!" });
    }

    // New session id on login prevents session fixation.
    req.session.regenerate((err) => {
        if (err) return res.status(500).json({ error: "Session error" });
        req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
        req.session.save((err) => {
            if (err) return res.status(500).json({ error: "Session save failed" });
            res.json({
                message: "Login successful",
                userId: user.id,
                name: user.name,
                email: user.email,
                role: user.role
            });
        });
    });
}));

router.get("/session", (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

router.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.status(500).json({ error: "Could not log out" });
        res.clearCookie(process.env.SESSION_NAME || "qd_sid", { path: "/" });
        res.json({ message: "Logout successful" });
    });
});

// ---------------------
// Password reset
// ---------------------
const RESET_SENT = { message: "If that email is registered, a reset code has been sent." };

async function sendResetCode(req, res, subject) {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required!" });
    if (emailLimited(limitKey(req))) return res.status(429).json({ error: "Too many requests. Try again later." });

    const [rows] = await db.query("SELECT id FROM users WHERE email = ?", [email]);
    // Same response whether or not the account exists, so emails can't be enumerated.
    if (rows.length === 0) return res.json(RESET_SENT);

    const code = await issueCode(rows[0].id);
    const sent = await sendMail(email, subject,
        `Your password reset code is: ${code}. It expires in ${CODE_TTL_MINUTES} minutes.`);
    if (!sent) return res.status(500).json({ error: "Failed to send reset code" });
    res.json(RESET_SENT);
}

router.post("/forgot-password", wrap((req, res) => sendResetCode(req, res, "Password Reset Code")));
router.post("/resend-code", wrap((req, res) => sendResetCode(req, res, "Resend Password Reset Code")));

// Lets the page confirm the code before showing the new-password form. The code stays valid until it is used.
router.post("/verify-reset-code", wrap(async (req, res) => {
    const { email, code } = req.body;
    if (!email || !code) {
        return res.status(400).json({ error: "Email and code are required!" });
    }
    const user = await checkCode(email, code);
    if (!user) return res.status(400).json({ error: "Invalid or expired code!" });
    res.json({ message: "Code verified! Proceed to reset your password.", otp: String(code) });
}));

router.post("/reset-password", wrap(async (req, res) => {
    const { email, code, newPassword } = req.body;
    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "All fields are required!" });
    }
    const problem = passwordProblem(newPassword);
    if (problem) return res.status(400).json({ error: problem });

    const user = await checkCode(email, code);
    if (!user) return res.status(400).json({ error: "Invalid or expired code!" });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query("UPDATE users SET password = ? WHERE id = ?", [hashedPassword, user.id]);
    await clearCode(user.id);
    res.json({ message: "Password reset successfully!" });
}));

module.exports = router;
