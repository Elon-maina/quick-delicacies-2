const express = require('express');
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const { requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Only real image types are accepted, and files get a random server-chosen name
// (never the uploader's filename) so nothing like ".html" or "../" can be stored.
const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'image/gif': '.gif', 'image/avif': '.avif' };

const upload = multer({
    storage: multer.diskStorage({
        destination: UPLOAD_DIR,
        filename: (req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${IMAGE_TYPES[file.mimetype]}`)
    }),
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => cb(null, Boolean(IMAGE_TYPES[file.mimetype]))
});

const withImageUrl = (item) => ({ ...item, image: `/uploads/${encodeURIComponent(item.image)}` });

// List the menu (public)
router.get('/', (req, res) => {
    db.query('SELECT * FROM menu', (err, results) => {
        if (err) {
            console.error('Error fetching menu:', err.message);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results.map(withImageUrl));
    });
});

// Add a new dish to the menu (admin only)
router.post('/add', requireAdmin, (req, res) => {
    upload.single('image')(req, res, (uploadErr) => {
        if (uploadErr) return res.status(400).json({ error: uploadErr.message });
        if (!req.file) {
            return res.status(400).json({ error: "Please upload a JPG, PNG, WEBP, GIF or AVIF image (max 5 MB)" });
        }

        const name = String(req.body.name || '').trim();
        const price = Number(req.body.price);
        if (!name || !Number.isFinite(price) || price <= 0) {
            fs.unlink(req.file.path, () => {});
            return res.status(400).json({ error: "A dish name and a positive price are required" });
        }

        db.query('INSERT INTO menu (name, price, image) VALUES (?, ?, ?)', [name, price, req.file.filename], (err) => {
            if (err) {
                console.error('Error adding dish:', err.message);
                fs.unlink(req.file.path, () => {});
                return res.status(500).json({ error: "Database insert error" });
            }
            res.json({ message: 'Dish added successfully!' });
        });
    });
});

// Delete a dish by name (admin only)
router.delete('/delete', requireAdmin, (req, res) => {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Dish name is required" });

    db.query('SELECT id, image FROM menu WHERE name = ?', [name], (err, result) => {
        if (err) {
            console.error('Error finding dish:', err.message);
            return res.status(500).json({ error: "Database query error" });
        }
        if (result.length === 0) {
            return res.status(404).json({ error: "Dish not found", message: "Dish not found" });
        }

        db.query('DELETE FROM menu WHERE name = ?', [name], (err) => {
            if (err) {
                console.error('Error deleting dish:', err.message);
                return res.status(500).json({ error: "Database delete error" });
            }

            // Delete image files, staying inside the uploads folder
            for (const row of result) {
                const imagePath = path.join(UPLOAD_DIR, path.basename(row.image));
                fs.unlink(imagePath, (err) => {
                    if (err) console.error("Error deleting image:", err.message);
                });
            }

            res.json({ message: "Dish deleted successfully!" });
        });
    });
});

// Search for menu items by name (public)
router.get('/search', (req, res) => {
    const query = req.query.query;
    if (!query) {
        return res.status(400).json({ error: "Search query is required" });
    }

    db.query('SELECT * FROM menu WHERE name LIKE ?', [`%${query}%`], (err, results) => {
        if (err) {
            console.error('Database error:', err.message);
            return res.status(500).json({ error: "Database error" });
        }
        res.json(results.map(withImageUrl));
    });
});

module.exports = router;
