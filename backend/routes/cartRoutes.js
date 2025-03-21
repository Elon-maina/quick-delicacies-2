const express = require("express");
const router = express.Router();
const db = require("../db");

//Middleware to check if user is logged in
const authenticateUser = (req, res, next) => {
    console.log("Session Data:", req.session); // Debugging
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: "Unauthorized. Please log in first." });
    }
    req.user_id = req.session.user?.id;
    next();
};

//Get cart items
router.get("/", authenticateUser, (req, res) => {
    const user_id = req.user_id;
    const sql = `SELECT cart.id, cart.dish_id, cart.quantity, cart.total_price, menu.name, menu.price 
                 FROM cart 
                 JOIN menu ON cart.dish_id = menu.id 
                 WHERE cart.user_id = ?`;
    db.query(sql, [user_id], (err, results) => {
        if (err) {
            console.error("Error fetching cart:", err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
        res.json(results);
    });
});

//Add item to cart
router.post("/add", authenticateUser, (req, res) => {
    const { dish_id, quantity } = req.body;
    const user_id = req.user_id;

    const sqlInsert = `INSERT INTO cart (user_id, dish_id, quantity, total_price) 
                       VALUES (?, ?, ?, (SELECT price FROM menu WHERE id = ?) * ?) 
                       ON DUPLICATE KEY UPDATE 
                       quantity = quantity + VALUES(quantity), 
                       total_price = (quantity + VALUES(quantity)) * (SELECT price FROM menu WHERE id = ?);`;
    
    db.query(sqlInsert, [user_id, dish_id, quantity, dish_id, quantity, dish_id], (err, result) => {
        if (err) {
            console.error("Error adding to cart:", err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
        res.json({ success: true, message: "Item added to cart" });
    });
});

//Increment item quantity
router.put("/increment/:id", authenticateUser, (req, res) => {
    const { id } = req.params;
    const user_id = req.user_id;

                    const sqlUpdate = `UPDATE cart 
                JOIN menu ON cart.dish_id = menu.id 
                SET cart.quantity = ?, 
                    cart.total_price = ? * menu.price 
                WHERE cart.id = ? AND cart.user_id = ?`;
    db.query(sqlUpdate, [id, user_id], (err) => {
        if (err) {
            console.error("Error updating quantity:", err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
        res.json({ success: true, message: "Item quantity increased" });
    });
});

//Decrement item quantity
router.put("/decrement/:id", authenticateUser, (req, res) => {
    const { id } = req.params;
    const user_id = req.user_id;

    const sqlCheck = "SELECT quantity FROM cart WHERE id = ? AND user_id = ?";
    db.query(sqlCheck, [id, user_id], (err, result) => {
        if (err) {
            console.error("Error checking item:", err);
            return res.status(500).json({ error: "Internal Server Error" });
        }

        if (result.length === 0) {
            return res.status(404).json({ error: "Item not found in cart" });
        }

        if (result[0].quantity > 1) {
            const sqlUpdate = `UPDATE cart 
                               JOIN menu ON cart.dish_id = menu.id 
                               SET cart.quantity = cart.quantity - 1, 
                                   cart.total_price = (cart.quantity - 1) * menu.price 
                               WHERE cart.id = ? AND cart.user_id = ?`;
            db.query(sqlUpdate, [id, user_id], (err) => {
                if (err) {
                    console.error("Error updating quantity:", err);
                    return res.status(500).json({ error: "Internal Server Error" });
                }
                res.json({ success: true, message: "Item quantity decreased" });
            });
        } else {
            const sqlDelete = "DELETE FROM cart WHERE id = ? AND user_id = ?";
            db.query(sqlDelete, [id, user_id], (err) => {
                if (err) {
                    console.error("Error deleting item:", err);
                    return res.status(500).json({ error: "Internal Server Error" });
                }
                res.json({ success: true, message: "Item removed from cart" });
            });
        }
    });
});

//Update item quantity manually
router.put("/update/:id", authenticateUser, (req, res) => {
    const { id } = req.params;
    const { quantity } = req.body;
    const user_id = req.user_id;

    if (quantity < 1) {
        return res.status(400).json({ error: "Quantity must be at least 1" });
    }

    const sqlUpdate = `UPDATE cart 
                       JOIN menu ON cart.dish_id = menu.id 
                       SET cart.quantity = ?, 
                           cart.total_price = ? * menu.price 
                       WHERE cart.id = ? AND cart.user_id = ?`;

    db.query(sqlUpdate, [quantity, quantity, id, user_id], (err) => {
        if (err) {
            console.error("Error updating quantity:", err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
        res.json({ success: true, message: "Quantity updated" });
    });
});

//Remove item from cart
router.delete("/remove/:id", authenticateUser, (req, res) => {
    const { id } = req.params;
    const user_id = req.user_id;

    const sqlDelete = "DELETE FROM cart WHERE id = ? AND user_id = ?";
    db.query(sqlDelete, [id, user_id], (err) => {
        if (err) {
            console.error("Error deleting item:", err);
            return res.status(500).json({ error: "Internal Server Error" });
        }
        res.json({ success: true, message: "Item removed from cart" });
    });
});

module.exports = router;
