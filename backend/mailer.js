const nodemailer = require("nodemailer");
require("dotenv").config();

// Nodemailer Transporter Setup
const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
        user: process.env.EMAIL_USER, // Use environment variables for security
        pass: process.env.EMAIL_PASS,
    },
});

// Function to send verification code (OTP)
const sendVerificationCode = async (to, code) => {
    try {
        const info = await transporter.sendMail({
            from: `"Quick Delicacies" <${process.env.EMAIL_USER}>`,
            to,
            subject: "Your Verification Code",
            text: `Your verification code is: ${code}`,
            html: `<p>Your verification code is: <strong>${code}</strong></p>`,
        });

        console.log("Email sent:", info.response);
        return true;
    } catch (error) {
        console.error("Error sending email:", error);
        return false;
    }
};

module.exports = { sendVerificationCode };
