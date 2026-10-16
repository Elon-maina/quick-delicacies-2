const db = require("../db");

// Require a logged-in user (cookie session).
const authenticateUser = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Unauthorized: Please log in" });
    }

    req.user_id = req.session.user.id;
    next();
};

// Require an admin. The role is re-read from the database so a revoked admin loses access immediately.
const requireAdmin = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Admin login required" });
    }

    db.query("SELECT role FROM users WHERE id = ?", [req.session.user.id], (err, results) => {
        if (err) return res.status(500).json({ error: "Database error" });
        if (!results.length || results[0].role !== "admin") {
            return res.status(403).json({ error: "Admin privileges required" });
        }
        req.user_id = req.session.user.id;
        next();
    });
};

module.exports = authenticateUser;
module.exports.authenticateUser = authenticateUser;
module.exports.requireAdmin = requireAdmin;
