const express = require("express");
const router = express.Router();
const db = require("../db"); // Import MySQL connection

require("dotenv").config(); // Load environment variables
const nodemailer = require("nodemailer");

// Setup Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER, // Stored in .env file
        pass: process.env.EMAIL_PASS  // Stored in .env file
    }
});

// Place Order Route
router.post("/placeOrder", (req, res) => {
    const { user_id, name, email, phone, residence, room, amountPaid, mpesaCode, items } = req.body;

    if (!user_id || !name || !email || !phone || !residence || !room || !amountPaid || !mpesaCode || !items.length) {
        return res.status(400).json({ message: "All fields are required." });
    }

    // Check if the M-Pesa code has already been used
    const checkMpesaCodeQuery = "SELECT * FROM orders WHERE mpesaCode = ?";
    
    db.query(checkMpesaCodeQuery, [mpesaCode], (err, results) => {
        if (err) {
            console.error("Error checking M-Pesa code:", err);
            return res.status(500).json({ message: "Database error while checking M-Pesa code." });
        }

        if (results.length > 0) {
            return res.status(400).json({ message: "This M-Pesa code has already been used." });
        }

        // If M-Pesa code is unique, insert order details into the database
        const orderQuery = `
            INSERT INTO orders (user_id, name, email, phone, residence, room, amountPaid, mpesaCode) 
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `;
        
        db.query(orderQuery, [user_id, name, email, phone, residence, room, amountPaid, mpesaCode], (err, orderResult) => {
            if (err) {
                console.error("Error inserting order:", err);
                return res.status(500).json({ message: "Database error while inserting order." });
            }

            const orderId = orderResult.insertId;

            // Insert each item into the order_items table
            const itemQuery = `
                INSERT INTO order_items (order_id, itemName, price, quantity) 
                VALUES (?, ?, ?, ?)
            `;

            const itemInserts = items.map(item => new Promise((resolve, reject) => {
                db.query(itemQuery, [orderId, item.itemName, item.price, item.quantity], (err) => {
                    if (err) {
                        console.error("Error inserting order item:", err);
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            }));

            Promise.all(itemInserts)
                .then(() => {
                    // Format order items for email
                    const orderItemsText = items.map(item => `${item.itemName} - Ksh ${item.price} x ${item.quantity}`).join("\n");

                    // Email content
                    const mailOptions = {
                        from: process.env.EMAIL_USER,
                        to: email,
                        subject: `Order #${orderId} Placed Successfully`,
                        text: `Dear ${name},\n\nYour order has been successfully placed!\n\nOrder Details:\n${orderItemsText}\n\nTotal Amount: Ksh ${amountPaid}\nMPesa Code: ${mpesaCode}\nOrder Number: #${orderId}\n\nUse this order number for any follow-ups.\n\nThank you for ordering with us!\n\nBest Regards,\nQuick Delicacies😊`
                    };

                    // Send email
                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) {
                            console.error("Error sending email:", error);
                        } else {
                            console.log("Order confirmation email sent:", info.response);
                        }
                    });

                    res.json({ success: true, message: "Order placed successfully and confirmation email sent!" });
                })
                .catch(() => res.status(500).json({ message: "Database error while inserting order items." }));
        });
    });
});

// Fetch Orders with Items
router.get("/:user_id", (req, res) => {
    const { user_id } = req.params;

    // Get user orders
    const orderQuery = `SELECT * FROM orders WHERE user_id = ? ORDER BY id DESC`;

    db.query(orderQuery, [user_id], (err, orders) => {
        if (err) {
            console.error("Error fetching orders:", err);
            return res.status(500).json({ message: "Database error while fetching orders." });
        }

        if (orders.length === 0) {
            return res.json({ success: false, message: "No orders found." });
        }

        let pendingQueries = orders.length;
        orders.forEach((order, index) => {
            const itemQuery = `SELECT itemName, price, quantity FROM order_items WHERE order_id = ?`;
            db.query(itemQuery, [order.id], (err, items) => {
                if (err) {
                    console.error("Error fetching order items:", err);
                    return res.status(500).json({ message: "Database error while fetching order items." });
                }

                orders[index].items = items;
                pendingQueries--;

                if (pendingQueries === 0) {
                    res.json({ success: true, orders });
                }
            });
        });
    });
});

// Fetch all orders for Admin
router.get("/", (req, res) => {
    const orderQuery = "SELECT * FROM orders ORDER BY id DESC";

    db.query(orderQuery, (err, orders) => {
        if (err) {
            console.error("Error fetching orders:", err);
            return res.status(500).json({ message: "Database error while fetching orders." });
        }

        if (orders.length === 0) {
            return res.json({ success: false, message: "No orders found." });
        }

        // Fetch items for each order
        let orderItemsPromises = orders.map(order => {
            return new Promise((resolve, reject) => {
                const itemQuery = "SELECT itemName, price, quantity FROM order_items WHERE order_id = ?";
                db.query(itemQuery, [order.id], (err, items) => {
                    if (err) {
                        console.error("Error fetching order items:", err);
                        reject(err);
                    } else {
                        order.items = items;
                        resolve();
                    }
                });
            });
        });

        Promise.all(orderItemsPromises)
            .then(() => res.json({ success: true, orders }))
            .catch(() => res.status(500).json({ message: "Database error while fetching order items." }));
    });
});

// Update order status
router.put("/:order_id/status", (req, res) => {
    const { order_id } = req.params;
    const { status } = req.body;

    if (!order_id) {
        return res.status(400).json({ success: false, message: "Order ID is required." });
    }

    if (!status) {
        return res.status(400).json({ success: false, message: "Status is required." });
    }

    const updateQuery = "UPDATE orders SET status = ? WHERE id = ?";

    db.query(updateQuery, [status, order_id], (err, result) => {
        if (err) {
            console.error("Error updating order status:", err);
            return res.status(500).json({ success: false, message: "Database error while updating order status." });
        }

        if (result.affectedRows === 0) {
            return res.status(404).json({ success: false, message: "Order not found." });
        }

        return res.json({ success: true, message: "Order status updated successfully!" });
    });
});



module.exports = router;
