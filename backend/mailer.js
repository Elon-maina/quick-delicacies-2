const nodemailer = require("nodemailer");
require("./db"); // loads backend/.env and the repository-root .env

// Shared Gmail transporter. EMAIL_PASS must be a Google "App password", kept only in .env.
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

// Send a plain-text email; resolves true on success and false on failure.
const sendMail = async (to, subject, text) => {
    try {
        await transporter.sendMail({
            from: `"Quick Delicacies" <${process.env.EMAIL_USER}>`,
            to,
            subject,
            text,
        });
        return true;
    } catch (error) {
        console.error("Error sending email:", error.message);
        return false;
    }
};

module.exports = { sendMail };
