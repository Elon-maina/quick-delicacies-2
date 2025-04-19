const express = require('express');
const db = require('../db'); // Import your database connection
const router = express.Router();

// DELETE feedback by ID
router.delete('/:id', (req, res) => {
    const feedbackId = req.params.id;

    // Query to delete feedback from the database
    db.query('DELETE FROM feedback WHERE id = ?', [feedbackId], (err, result) => {
        if (err) return res.status(500).json({ error: "Database delete error", details: err });

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Feedback not found" });
        }

        res.json({ message: "Feedback deleted successfully!" });
    });
});

module.exports = router;