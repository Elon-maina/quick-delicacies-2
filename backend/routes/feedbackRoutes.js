const express = require('express');
const db = require('../db');
const { requireAdmin } = require('../middleware/authMiddleware');

const router = express.Router();

// Submit feedback from the contact form (public)
router.post('/', (req, res) => {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim();
    const message = String(req.body.message || '').trim();

    if (!name || !email || !message) {
        return res.status(400).json({ error: "Name, email and message are required" });
    }
    if (name.length > 100 || email.length > 255 || message.length > 5000) {
        return res.status(400).json({ error: "Feedback is too long" });
    }

    db.query('INSERT INTO feedback (name, email, message) VALUES (?, ?, ?)', [name, email, message], (err) => {
        if (err) {
            console.error('Error inserting feedback:', err.message);
            return res.status(500).json({ error: "Error saving feedback" });
        }
        res.json({ message: "Feedback submitted successfully" });
    });
});

// List all feedback (admin only)
router.get('/', requireAdmin, (req, res) => {
    db.query('SELECT * FROM feedback ORDER BY id DESC', (err, results) => {
        if (err) {
            console.error('Error fetching feedback:', err.message);
            return res.status(500).json({ error: "Error retrieving feedback" });
        }
        res.json(results);
    });
});

// DELETE feedback by ID (admin only)
router.delete('/:id', requireAdmin, (req, res) => {
    db.query('DELETE FROM feedback WHERE id = ?', [req.params.id], (err, result) => {
        if (err) {
            console.error('Error deleting feedback:', err.message);
            return res.status(500).json({ error: "Database delete error" });
        }
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Feedback not found" });
        }
        res.json({ message: "Feedback deleted successfully!" });
    });
});

module.exports = router;
