// Create an admin account, or promote an existing user to admin.
// Usage: npm run create-admin -- <email> "<password>" "Full Name"
const bcrypt = require('bcryptjs');
const db = require('./db').promise();

async function main() {
    const [email, password, name] = process.argv.slice(2);
    if (!email || !password || !name) {
        console.log('Usage: npm run create-admin -- <email> "<password>" "Full Name"');
        process.exit(1);
    }

    const hashed = await bcrypt.hash(password, 10);
    const [rows] = await db.query('SELECT id FROM users WHERE email = ?', [email]);
    if (rows.length) {
        await db.query("UPDATE users SET name = ?, password = ?, role = 'admin', verified = TRUE WHERE id = ?", [name, hashed, rows[0].id]);
        console.log(`Updated user ${email} as admin.`);
    } else {
        await db.query("INSERT INTO users (name, email, password, role, verified) VALUES (?, ?, ?, 'admin', TRUE)", [name, email, hashed]);
        console.log(`Created admin ${email}.`);
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Error creating admin:', err.message);
        process.exit(1);
    });
