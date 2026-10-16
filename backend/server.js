const express = require("express");
const cors = require("cors");
const session = require("express-session");
const path = require("path");
const db = require("./db"); // also loads .env
const menuRoutes = require("./routes/menuRoutes");
const cartRoutes = require("./routes/cartRoutes");
const authRoutes = require("./routes/auth");
const feedbackRoutes = require("./routes/feedbackRoutes");
const ordersRoutes = require("./routes/orders");

if (!process.env.SECRET_KEY || process.env.SECRET_KEY.length < 32) {
    throw new Error("SECRET_KEY must be set in .env to a random string of at least 32 characters (see backend/.env.example).");
}

const MySQLStore = require("express-mysql-session")(session);
const sessionStore = new MySQLStore({}, db);

const app = express();

// Trust Proxy (Only for Production)
if (process.env.NODE_ENV === "production") {
    app.set("trust proxy", 1);
}

// The frontend is served by this server, so cross-origin requests are only needed for origins
// listed in CORS_ORIGINS (comma-separated), e.g. a live-server URL during development.
const corsOrigins = (process.env.CORS_ORIGINS || "").split(",").map(o => o.trim()).filter(Boolean);
app.use(cors({
    origin: corsOrigins.length ? corsOrigins : false,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
}));

app.use(express.json({ limit: "100kb" }));

// Session Middleware
app.use(session({
    name: process.env.SESSION_NAME || "qd_sid",
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: process.env.NODE_ENV === "production",
        httpOnly: true,
        sameSite: "lax",
        maxAge: 86400000,
    }
}));

// Static files: uploaded dish images and the frontend pages
app.use("/uploads", express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) => res.set("X-Content-Type-Options", "nosniff")
}));
app.get("/", (req, res) => res.redirect("/home.html"));
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Routes
app.use("/menu", menuRoutes);
app.use("/cart", cartRoutes);
app.use("/auth", authRoutes);
app.use("/api/orders", ordersRoutes);
app.use("/api/feedback", feedbackRoutes);

// JSON errors instead of HTML stack traces
app.use((err, req, res, next) => {
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ error: "Invalid JSON body" });
    }
    console.error("Unhandled error:", err.message);
    res.status(500).json({ error: "Server error" });
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
