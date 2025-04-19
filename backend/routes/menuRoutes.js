const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const db = require('../db');

const router = express.Router();
const BASE_URL = "http://localhost:5000";

// Configure Multer for image uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/'); // Ensure "uploads/" folder exists
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage });

// Serve images with full URLs
router.get('/', (req, res) => {
    db.query('SELECT * FROM menu', (err, results) => {
        if (err) {
            return res.status(500).json({ error: "Database error", details: err });
        }

        const updatedResults = results.map(item => ({
            ...item,
            image: `${BASE_URL}/uploads/${item.image}`
        }));

        res.json(updatedResults);
    });
});

// Add a new dish to the menu
router.post('/add', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: "No image uploaded" });
    }

    const { name, price } = req.body;
    const image = req.file.filename;

    db.query('INSERT INTO menu (name, price, image) VALUES (?, ?, ?)', [name, price, image], (err) => {
        if (err) {
            return res.status(500).json({ error: "Database insert error", details: err });
        }
        res.json({ message: 'Dish added successfully!' });
    });
});

// Delete a dish by name
router.delete('/delete', (req, res) => {
    const { name } = req.body;

    db.query('SELECT image FROM menu WHERE name = ?', [name], (err, result) => {
        if (err) {
            return res.status(500).json({ error: "Database query error", details: err });
        }
        if (result.length === 0) {
            return res.status(404).json({ error: "Dish not found" });
        }

        const image = result[0].image;
        const imagePath = path.join(__dirname, '../uploads/', image);

        db.query('DELETE FROM menu WHERE name = ?', [name], (err) => {
            if (err) {
                return res.status(500).json({ error: "Database delete error", details: err });
            }

            // Delete image file
            fs.unlink(imagePath, (err) => {
                if (err) {
                    console.error("Error deleting image:", err);
                }
            });

            res.json({ message: "Dish deleted successfully!" });
        });
    });
});

// Search for menu items by name
router.get('/search', (req, res) => {
    const query = req.query.query;

    if (!query) {
        return res.status(400).json({ error: "Search query is required" });
    }

    const searchTerm = `%${query}%`;

    db.query('SELECT * FROM menu WHERE name LIKE ?', [searchTerm], (err, results) => {
        if (err) {
            console.error('Database error:', err);
            return res.status(500).json({ error: "Database error", details: err.message });
        }

        const updatedResults = results.map(item => ({
            ...item,
            image: `${BASE_URL}/uploads/${item.image}`
        }));

        res.json(updatedResults);
    });
});

module.exports = router;