const express = require("express");
const bcrypt = require("bcrypt");
const db = require("../db");
const jwt = require("jsonwebtoken");

const router = express.Router();
const SECRET_KEY = process.env.SECRET_KEY || "your_secret_key"; // Use env variable in production

// User Signup
router.post("/signup", async (req, res) => {
    console.log("Signup Request Body:", req.body); // Debugging: Log received data

    const { name, email, password, confirmPassword } = req.body;

    if (!name || !email || !password || !confirmPassword) {
        return res.status(400).json({ error: "All fields are required" });
    }

    if (password !== confirmPassword) {
        return res.status(400).json({ error: "Passwords do not match" });
    }

    try {
        // Check if email already exists
        db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
            if (err) return res.status(500).json({ error: "Database error" });
            if (results.length > 0) {
                return res.status(400).json({ error: "Email already exists" });
            }

            // Hash password and insert new user
            const hashedPassword = await bcrypt.hash(password, 10);
            db.query(
                "INSERT INTO users (name, email, password) VALUES (?, ?, ?)", 
                [name, email, hashedPassword], 
                (err, result) => {
                    if (err) return res.status(500).json({ error: "Signup failed" });

                    res.json({ message: "Signup successful! Please log in." });
                }
            );
        });
    } catch (err) {
        res.status(500).json({ error: "Error creating user" });
    }
});

// Email Verification Route
router.post("/verify-email", (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ error: "Email and OTP are required" });
    }

    // Check if OTP exists in the database
    const query = "SELECT otp_code FROM users WHERE email = ? AND otp_code = ?";
    db.query(query, [email, otp], (err, results) => {
        if (err) {
            console.error("Database error:", err);
            return res.status(500).json({ error: "Database error" });
        }

        if (results.length === 0) {
            return res.status(400).json({ error: "Invalid OTP" });
        }

        // Mark user as verified
        const updateQuery = "UPDATE users SET verified = true WHERE email = ?";
        db.query(updateQuery, [email], (updateErr) => {
            if (updateErr) {
                console.error("Update error:", updateErr);
                return res.status(500).json({ error: "Verification update failed" });
            }

            res.json({ message: "Email verified successfully" });
        });
    });
});


// User Login (Ensures Session Works)
router.post("/login", (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required" });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
        if (err || results.length === 0) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const user = results[0];
        const isValid = await bcrypt.compare(password, user.password);

        if (!isValid) {
            return res.status(401).json({ error: "Invalid email or password" });
        }

        const token = jwt.sign({ userId: user.id }, SECRET_KEY, { expiresIn: "1h" });

        if (!req.session) {
            console.error("Session not initialized");
            return res.status(500).json({ error: "Session not initialized" });
        }

        req.session.user = { id: user.id, name: user.name, email: user.email };

        req.session.save((err) => {
            if (err) {
                console.error("Error saving session:", err);
                return res.status(500).json({ error: "Session could not be saved" });
            }

            res.json({ message: "Login successful" });
        });
    });
});

// Check Active Session
router.get("/session", (req, res) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Session expired" });
    }

    res.json({ message: "Session active", user: req.session.user });
});

// Logout
router.post("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Error destroying session:", err);
            return res.status(500).json({ error: "Could not log out" });
        }

        res.clearCookie("connect.sid", { path: "/" });
        res.json({ message: "Logout successful" });
    });
});

module.exports = router;