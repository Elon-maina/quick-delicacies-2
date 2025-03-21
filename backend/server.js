const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const bcrypt = require("bcrypt");
const menuRoutes = require("./routes/menuRoutes");
const cartRoutes = require("./routes/cartRoutes");
const authRoutes = require("./routes/auth");
const db = require("./db");
require("dotenv").config();

const MySQLStore = require("express-mysql-session")(session);
const sessionStore = new MySQLStore({}, db);

const app = express();

//Trust Proxy (Only for Production)
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

//Serve static files from "uploads" folder
app.use("/uploads", express.static("uploads"));

//CORS Setup (Allow frontend to access session cookies)
app.use(cors({
    origin: ["http://localhost:5500", "http://127.0.0.1:5500"], //Match frontend
    credentials: true, //Allow session cookies
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"], 
    allowedHeaders: ["Content-Type", "Authorization"],
}));

//Middleware Setup (Order Matters)
app.use(cookieParser());
app.use(bodyParser.json());

//Session Middleware (Using MySQL Store)
app.use(session({
    secret: process.env.SECRET_KEY || "default_secret",
    resave: false,
    saveUninitialized: false,
    store: sessionStore, 
    cookie: { 
        secure: false, //Set to true in production with HTTPS
        httpOnly: true,
        sameSite: "lax", //Allows session sharing in same-origin requests
        maxAge: 86400000, //Session expires in 24 hours
    }
}));

//Debugging Middleware to Log Sessions
app.use((req, res, next) => {
    console.log("Incoming Request:", req.method, req.url);
    console.log("Session Data Before:", req.session);
    console.log("Cookies Received:", req.cookies);
    next();
});

//Check Session Route (For Debugging)
app.get("/check-session", (req, res) => {
    console.log("Checking Session:", req.session);
    res.json({ session: req.session.user || null });
});

//Updated Login Route (Using Database Authentication)
app.post("/auth/login", async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Missing email or password" });
    }

    try {
        const query = "SELECT id, email, password FROM users WHERE email = ?";
        db.query(query, [email], async (err, results) => {
            if (err) {
                console.error("Database Error:", err);
                return res.status(500).json({ error: "Database error" });
            }

            if (results.length === 0) {
                console.log("No user found with this email");
                return res.status(401).json({ error: "Invalid credentials" });
            }

            const user = results[0];

            //Compare hashed passwords
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) {
                console.log("Password does not match");
                return res.status(401).json({ error: "Invalid credentials" });
            }

            //Store user data in session
            req.session.user = { id: user.id, email: user.email };
            console.log("User Logged In:", req.session.user);

            //Save session before sending response
            req.session.save((err) => {
                if (err) {
                    console.error("Session Save Error:", err);
                    return res.status(500).json({ error: "Session save failed" });
                }

                //Send session cookie explicitly
                res.cookie("connect.sid", req.sessionID, { 
                    httpOnly: true, 
                    sameSite: "lax",
                    secure: false, //Set to true in production with HTTPS
                    maxAge: 86400000 
                });

                return res.json({ message: "Login successful", session: req.session });
            });
        });
    } catch (error) {
        console.error("Login Error:", error.message);
        res.status(500).json({ error: "Internal server error" });
    }
});

//Logout Route
app.post("/auth/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error("Logout Error:", err);
            return res.status(500).json({ error: "Logout failed" });
        }
        res.clearCookie("connect.sid");
        res.json({ message: "Logged out successfully" });
    });
});

//Routes
app.use("/menu", menuRoutes);
app.use("/cart", cartRoutes);
app.use("/auth", authRoutes);

//Global Error Handler
app.use((err, req, res, next) => {
    console.error("Server Error:", err.message);
    res.status(500).json({ error: "Internal Server Error" });
});

//Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
