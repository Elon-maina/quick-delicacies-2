const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// MySQL Connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "Rxianopta67",
    database: "food_menu"
});

db.connect((err) => {
    if (err) {
        console.error("Database connection failed:", err);
        return;
    }
    console.log("Connected to MySQL database");
});

// Get all dishes
app.get("/dishes", (req, res) => {
    db.query("SELECT * FROM dishes", (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results);
    });
});

// Add a new dish
app.post("/dishes", (req, res) => {
    const { name, price, imageURL } = req.body;
    db.query("INSERT INTO dishes (name, price, imageURL) VALUES (?, ?, ?)", 
        [name, price, imageURL], 
        (err, result) => {
            if (err) return res.status(500).send(err);
            res.json({ message: "Dish added", id: result.insertId });
        }
    );
});

// Delete a dish
app.delete("/dishes/:id", (req, res) => {
    const dishId = req.params.id;
    db.query("DELETE FROM dishes WHERE id = ?", [dishId], (err, result) => {
        if (err) return res.status(500).send(err);
        res.json({ message: "Dish deleted" });
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
