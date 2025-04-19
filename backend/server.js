const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const menuRoutes = require("./routes/menuRoutes");
const cartRoutes = require("./routes/cartRoutes");
const authRoutes = require("./routes/auth");
const feedbackRoutes = require("./routes/feedbackRoutes");
const nodemailer = require("nodemailer");
const crypto = require("crypto");
const db = require("./db");
const ordersRoutes = require("./routes/orders"); // Import Orders Routes
const path = require('path');

require("dotenv").config();

const MySQLStore = require("express-mysql-session")(session);
const sessionStore = new MySQLStore({}, db);

const app = express();

// Trust Proxy (Only for Production)
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

// Serve static files from "uploads" folder
app.use("/uploads", express.static("uploads"));
app.use(express.static(path.join(__dirname, 'public')));

// CORS Setup
app.use(cors({
    origin: ["http://localhost:5500", "http://127.0.0.1:5500"], 
    credentials: true, 
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], 
    allowedHeaders: ["Content-Type", "Authorization"],
}));

// Middleware Setup
app.use(cookieParser());
app.use(bodyParser.json());

// Session Middleware
app.use(session({
    secret: process.env.SECRET_KEY || "default_secret",
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: { 
        secure: false,
        httpOnly: true,
        sameSite: "lax",
        maxAge: 86400000,
    }
}));

// Email Transporter Setup
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

// Signup Route
app.post("/auth/signup", async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return res.status(400).json({ error: "All fields are required!" });
    }

    try {
        db.query("SELECT * FROM users WHERE email = ?", [email], async (err, results) => {
            if (err) return res.status(500).json({ error: "Database error" });

            if (results.length > 0) {
                return res.status(400).json({ error: "Email already registered!" });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const otp = crypto.randomInt(100000, 999999);

            const sql = "INSERT INTO users (name, email, password, otp_code, verified) VALUES (?, ?, ?, ?, ?)";
            db.query(sql, [name, email, hashedPassword, otp, false], (err) => {
                if (err) return res.status(500).json({ error: "Database error" });

                const mailOptions = {
                    from: process.env.EMAIL_USER,
                    to: email,
                    subject: "Verify Your Email",
                    text: `Your OTP code is: ${otp}. Enter this code to verify your email.`
                };

                transporter.sendMail(mailOptions, (err) => {
                    if (err) {
                        console.error("Error sending email:", err);
                        return res.status(500).json({ error: "Failed to send OTP" });
                    }
                    res.json({ message: "Signup successful! Check your email for the OTP." });
                });
            });
        });
    } catch (error) {
        res.status(500).json({ error: "Server error" });
    }
});

// Verify OTP
app.post("/auth/verify", (req, res) => {
    const { email, otp } = req.body;

    if (!email || !otp) {
        return res.status(400).json({ error: "Email and OTP are required!" });
    }

    db.query("SELECT otp_code FROM users WHERE email = ? AND verified = false", [email], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        if (results.length === 0) {
            return res.status(400).json({ error: "Invalid email or already verified!" });
        }

        if (String(results[0].otp_code) === String(otp)) {
            db.query("UPDATE users SET verified = true, otp_code = NULL WHERE email = ?", [email], (err) => {
                if (err) return res.status(500).json({ error: "Database error" });
                res.json({ message: "Email verified successfully!" });
            });
        } else {
            res.status(400).json({ error: "Incorrect OTP!" });
        }
    });
});

// Resend OTP
app.post("/auth/resend-otp", (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: "Email is required!" });
    }

    const otp = crypto.randomInt(100000, 999999);

    db.query("UPDATE users SET otp_code = ? WHERE email = ? AND verified = false", [otp, email], (err, result) => {
        if (err) return res.status(500).json({ error: "Database error" });

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: "User not found or already verified!" });
        }

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Resend OTP Code",
            text: `Your new OTP code is: ${otp}.`
        };

        transporter.sendMail(mailOptions, (err) => {
            if (err) {
                console.error("Error sending email:", err);
                return res.status(500).json({ error: "Failed to resend OTP" });
            }
            res.json({ message: "OTP resent successfully!" });
        });
    });
});

// Login
app.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Missing email or password" });
    }

    db.query("SELECT id, name, email, password, verified FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        if (results.length === 0) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        const user = results[0];

        if (!user.verified) {
            return res.status(401).json({ error: "Please verify your email before logging in!" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(401).json({ error: "Invalid credentials" });
        }

        req.session.user = { id: user.id, email: user.email };
        req.session.save((err) => {
            if (err) return res.status(500).json({ error: "Session save failed" });

            res.json({ 
                message: "Login successful", 
                userId: user.id, 
                name: user.name,  
                email: user.email 
            });
        });
    });
});

// Routes
app.use("/menu", menuRoutes);
app.use("/cart", cartRoutes);
app.use("/auth", authRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/feedback", feedbackRoutes);

// Session debug
app.get("/auth/session", (req, res) => {
    if (req.session.user) {
        res.json({ loggedIn: true, user: req.session.user });
    } else {
        res.json({ loggedIn: false });
    }
});

// Menu debug
app.get("/menu", (req, res) => {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized. Please log in." });
    }

    db.query("SELECT * FROM menu", (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });
        res.json(results);
    });
});

// Forgot Password
app.post("/auth/forgot-password", (req, res) => {
    const { email } = req.body;

    if (!email) {
        return res.status(400).json({ error: "Email is required!" });
    }

    db.query("SELECT * FROM users WHERE email = ?", [email], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        if (results.length === 0) {
            return res.status(400).json({ error: "Email not found!" });
        }

        const resetCode = crypto.randomInt(100000, 999999);

        db.query("UPDATE users SET otp_code = ? WHERE email = ?", [resetCode, email], (err) => {
            if (err) return res.status(500).json({ error: "Database error" });

            const mailOptions = {
                from: process.env.EMAIL_USER,
                to: email,
                subject: "Password Reset Code",
                text: `Your password reset code is: ${resetCode}.`
            };

            transporter.sendMail(mailOptions, (err) => {
                if (err) {
                    console.error("Error sending email:", err);
                    return res.status(500).json({ error: "Failed to send reset code" });
                }
                res.json({ message: "Reset code sent successfully!" });
            });
        });
    });
});

// Resend Reset Code
app.post("/auth/resend-code", (req, res) => {
    const { email } = req.body;

    if (!email) return res.status(400).json({ error: "Email is required!" });

    const newCode = crypto.randomInt(100000, 999999);

    db.query("UPDATE users SET otp_code = ? WHERE email = ?", [newCode, email], (err) => {
        if (err) return res.status(500).json({ error: "Database error" });

        const mailOptions = {
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Resend Password Reset Code",
            text: `Your new password reset code is: ${newCode}.`
        };

        transporter.sendMail(mailOptions, (err) => {
            if (err) {
                console.error("Error sending email:", err);
                return res.status(500).json({ error: "Failed to resend code" });
            }
            res.json({ message: "New reset code sent successfully!" });
        });
    });
});

// Verify Reset Code
app.post("/auth/verify-reset-code", (req, res) => {
    const { email, code } = req.body;

    if (!email || !code) {
        return res.status(400).json({ error: "Email and code are required!" });
    }

    db.query("SELECT otp_code FROM users WHERE email = ?", [email], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        if (results.length === 0 || String(results[0].otp_code) !== String(code)) {
            return res.status(400).json({ error: "Invalid code!" });
        }

        res.json({ message: "Code verified! Proceed to reset your password.", otp: code });
    });
});

// Reset Password
app.post("/auth/reset-password", async (req, res) => {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
        return res.status(400).json({ error: "All fields are required!" });
    }

    db.query("SELECT otp_code FROM users WHERE email = ?", [email], async (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });

        if (results.length === 0 || results[0].otp_code !== code) {
            return res.status(400).json({ error: "Invalid code!" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        db.query("UPDATE users SET password = ?, otp_code = NULL WHERE email = ?", [hashedPassword, email], (err) => {
            if (err) return res.status(500).json({ error: "Database error" });

            res.json({ message: "Password reset successfully!" });
        });
    });
});
// In-memory storage for demonstration (replace with a database in production)
let feedbacks = [];

// Handle feedback submission (from form)
app.post('/Admin/feedback', (req, res) => {
    const { name, email, message } = req.body;

    const query = 'INSERT INTO feedback (name, email, message) VALUES (?, ?, ?)';
    db.query(query, [name, email, message], (err, results) => {
        if (err) {
            console.error('Error inserting feedback:', err);
            return res.status(500).send('Error saving feedback');
        }
        res.status(200).send('Feedback submitted successfully');
    });
});

// Fetch all feedback messages (for admin display)
app.get('/Admin/feedback/data', (req, res) => {
    const query = 'SELECT * FROM feedback';
    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching feedback:', err);
            return res.status(500).send('Error retrieving feedback');
        }
        res.json(results);
    });
});

// Delete a feedback message by ID (admin action)
app.delete('/Admin/feedback/:id', (req, res) => {
    const feedbackId = req.params.id;

    const query = 'DELETE FROM feedback WHERE id = ?';
    db.query(query, [feedbackId], (err, results) => {
        if (err) {
            console.error('Error deleting feedback:', err);
            return res.status(500).send('Error deleting feedback');
        }
        if (results.affectedRows === 0) {
            return res.status(404).send('Feedback not found');
        }
        res.status(200).send('Feedback deleted successfully');
    });
});



// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
