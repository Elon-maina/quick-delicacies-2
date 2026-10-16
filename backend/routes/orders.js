const express = require("express");
const router = express.Router();
const db = require("../db").promise();
const pool = require("../db");
const { sendMail } = require("../mailer");
const { authenticateUser, requireAdmin } = require("../middleware/authMiddleware");

const DELIVERY_FEE = 20;
const ORDER_STATUSES = ["Pending", "Delivered", "Cancelled"];

const wrap = (fn) => (req, res) => fn(req, res).catch((err) => {
    console.error(`Orders error on ${req.method} ${req.path}:`, err.message);
    res.status(500).json({ success: false, message: "Server error" });
});

// Attach order_items to each order
async function withItems(orders) {
    if (!orders.length) return orders;
    const [items] = await db.query(
        "SELECT order_id, itemName, price, quantity FROM order_items WHERE order_id IN (?)",
        [orders.map(o => o.id)]
    );
    return orders.map(o => ({ ...o, items: items.filter(i => i.order_id === o.id) }));
}

// Place Order Route (logged-in user).
// The items and total come from the user's cart in the database, never from the browser.
router.post("/placeOrder", authenticateUser, wrap(async (req, res) => {
    const { phone, residence, room } = req.body;
    const mpesaCode = String(req.body.mpesaCode || "").trim().toUpperCase();

    if (!phone || !residence || !room || !mpesaCode) {
        return res.status(400).json({ message: "All fields are required." });
    }
    if (!/^[A-Z0-9]{8,12}$/.test(mpesaCode)) {
        return res.status(400).json({ message: "Enter a valid M-Pesa transaction code." });
    }

    const [[user]] = await db.query("SELECT id, name, email FROM users WHERE id = ?", [req.user_id]);
    if (!user) return res.status(401).json({ message: "Please log in again." });

    const [cart] = await db.query(
        `SELECT menu.name AS itemName, menu.price, cart.quantity
         FROM cart JOIN menu ON cart.dish_id = menu.id
         WHERE cart.user_id = ?`,
        [req.user_id]
    );
    if (cart.length === 0) {
        return res.status(400).json({ message: "Your cart is empty." });
    }
    const amountPaid = cart.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0) + DELIVERY_FEE;

    const conn = await pool.promise().getConnection();
    let orderId;
    try {
        await conn.beginTransaction();
        const [orderResult] = await conn.query(
            `INSERT INTO orders (user_id, name, email, phone, residence, room, amountPaid, mpesaCode, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
            [user.id, user.name, user.email, phone, residence, room, amountPaid, mpesaCode]
        );
        orderId = orderResult.insertId;
        for (const item of cart) {
            await conn.query(
                "INSERT INTO order_items (order_id, itemName, price, quantity) VALUES (?, ?, ?, ?)",
                [orderId, item.itemName, item.price, item.quantity]
            );
        }
        await conn.query("DELETE FROM cart WHERE user_id = ?", [user.id]);
        await conn.commit();
    } catch (err) {
        await conn.rollback().catch(() => {});
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(400).json({ message: "This M-Pesa code has already been used." });
        }
        throw err;
    } finally {
        conn.release();
    }

    const orderItemsText = cart.map(item => `${item.itemName} - Ksh ${item.price} x ${item.quantity}`).join("\n");
    sendMail(user.email, `Order #${orderId} Placed Successfully`,
        `Dear ${user.name},\n\nYour order has been successfully placed!\n\nOrder Details:\n${orderItemsText}\nDelivery fee: Ksh ${DELIVERY_FEE}\n\nTotal Amount: Ksh ${amountPaid}\nMPesa Code: ${mpesaCode}\nOrder Number: #${orderId}\n\nUse this order number for any follow-ups.\n\nThank you for ordering with us!\n\nBest Regards,\nQuick Delicacies😊`);

    res.json({ success: true, orderId, amountPaid, message: "Order placed successfully and confirmation email sent!" });
}));

// Fetch the logged-in user's own orders
router.get("/mine", authenticateUser, wrap(async (req, res) => {
    const [orders] = await db.query("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC", [req.user_id]);
    if (orders.length === 0) return res.json({ success: false, message: "No orders found." });
    res.json({ success: true, orders: await withItems(orders) });
}));

// Fetch all orders (admin only)
router.get("/", requireAdmin, wrap(async (req, res) => {
    const [orders] = await db.query("SELECT * FROM orders ORDER BY id DESC");
    if (orders.length === 0) return res.json({ success: false, message: "No orders found." });
    res.json({ success: true, orders: await withItems(orders) });
}));

// Kept for older pages: users may only fetch their own orders by id; admins may fetch anyone's.
router.get("/:user_id", authenticateUser, wrap(async (req, res) => {
    const userId = Number(req.params.user_id);
    if (userId !== Number(req.user_id)) {
        const [[me]] = await db.query("SELECT role FROM users WHERE id = ?", [req.user_id]);
        if (!me || me.role !== "admin") return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const [orders] = await db.query("SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC", [userId]);
    if (orders.length === 0) return res.json({ success: false, message: "No orders found." });
    res.json({ success: true, orders: await withItems(orders) });
}));

// Update order status (admin only)
router.put("/:order_id/status", requireAdmin, wrap(async (req, res) => {
    const { status } = req.body;
    if (!ORDER_STATUSES.includes(status)) {
        return res.status(400).json({ success: false, message: `Status must be one of: ${ORDER_STATUSES.join(", ")}` });
    }

    const [result] = await db.query("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.order_id]);
    if (result.affectedRows === 0) {
        return res.status(404).json({ success: false, message: "Order not found." });
    }
    res.json({ success: true, message: "Order status updated successfully!" });
}));

module.exports = router;
