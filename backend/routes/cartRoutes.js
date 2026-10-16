const express = require("express");
const router = express.Router();
const db = require("../db");
const { authenticateUser } = require("../middleware/authMiddleware");

const toQuantity = (value) => {
    const n = Number(value);
    return Number.isInteger(n) && n >= 1 && n <= 100 ? n : null;
};

//Get cart items
router.get("/", authenticateUser, (req, res) => {
    const sql = `SELECT cart.id, cart.dish_id, cart.quantity, cart.total_price, menu.name, menu.price
                 FROM cart
                 JOIN menu ON cart.dish_id = menu.id
                 WHERE cart.user_id = ?`;
    db.query(sql, [req.user_id], (err, results) => {
        if (err) {
            console.error("Error fetching cart:", err.message);
            return res.status(500).json({ error: "Internal Server Error" });
        }
        res.json(results);
    });
});

//Add item to cart
router.post("/add", authenticateUser, (req, res) => {
    const dishId = Number(req.body.dish_id);
    const quantity = toQuantity(req.body.quantity ?? 1);
    if (!Number.isInteger(dishId) || dishId < 1 || !quantity) {
        return res.status(400).json({ error: "Invalid dish or quantity" });
    }

    const sqlInsert = `INSERT INTO cart (user_id, dish_id, quantity, total_price)
                       SELECT ?, menu.id, ?, menu.price * ? FROM menu WHERE menu.id = ?
                       ON DUPLICATE KEY UPDATE
                       quantity = cart.quantity + VALUES(quantity),
                       total_price = (cart.quantity) * (SELECT price FROM menu WHERE id = ?)`;

    db.query(sqlInsert, [req.user_id, quantity, quantity, dishId, dishId], (err, result) => {
        if (err) {
            console.error("Error adding to cart:", err.message);
            return res.status(500).json({ error: "Internal Server Error" });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: "Dish not found" });
        res.json({ success: true, message: "Item added to cart" });
    });
});

// Change the quantity of one cart row by a fixed step (+1 / -1). Removes the row when it reaches zero.
function step(delta) {
    return (req, res) => {
        const sqlCheck = "SELECT quantity FROM cart WHERE id = ? AND user_id = ?";
        db.query(sqlCheck, [req.params.id, req.user_id], (err, result) => {
            if (err) {
                console.error("Error checking item:", err.message);
                return res.status(500).json({ error: "Internal Server Error" });
            }
            if (result.length === 0) return res.status(404).json({ error: "Item not found in cart" });

            const next = result[0].quantity + delta;
            if (next < 1) {
                return db.query("DELETE FROM cart WHERE id = ? AND user_id = ?", [req.params.id, req.user_id], (err) => {
                    if (err) return res.status(500).json({ error: "Internal Server Error" });
                    res.json({ success: true, message: "Item removed from cart" });
                });
            }
            setQuantity(req, res, next);
        });
    };
}

function setQuantity(req, res, quantity) {
    const sqlUpdate = `UPDATE cart
                       JOIN menu ON cart.dish_id = menu.id
                       SET cart.quantity = ?,
                           cart.total_price = ? * menu.price
                       WHERE cart.id = ? AND cart.user_id = ?`;
    db.query(sqlUpdate, [quantity, quantity, req.params.id, req.user_id], (err, result) => {
        if (err) {
            console.error("Error updating quantity:", err.message);
            return res.status(500).json({ error: "Internal Server Error" });
        }
        if (result.affectedRows === 0) return res.status(404).json({ error: "Item not found in cart" });
        res.json({ success: true, message: "Quantity updated" });
    });
}

router.put("/increment/:id", authenticateUser, step(+1));
router.put("/decrement/:id", authenticateUser, step(-1));

//Update item quantity manually
router.put("/update/:id", authenticateUser, (req, res) => {
    const quantity = toQuantity(req.body.quantity);
    if (!quantity) {
        return res.status(400).json({ error: "Quantity must be a whole number from 1 to 100" });
    }
    setQuantity(req, res, quantity);
});

//Remove item from cart
router.delete("/remove/:id", authenticateUser, (req, res) => {
    db.query("DELETE FROM cart WHERE id = ? AND user_id = ?", [req.params.id, req.user_id], (err) => {
        if (err) {
            console.error("Error deleting item:", err.message);
            return res.status(500).json({ error: "Internal Server Error" });
        }
        res.json({ success: true, message: "Item removed from cart" });
    });
});

module.exports = router;
