// Creates any missing tables from database.sql and upgrades older tables in place
// (adds missing columns/indexes). Existing data is kept. Usage: npm run setup-db
const fs = require('fs');
const path = require('path');
const pool = require('./db');

const db = pool.promise();
const DB_NAME = process.env.DB_NAME || 'food_menu';

// Columns added since the original README schema: [table, column, definition]
const COLUMNS = [
    ['users', 'role', "ENUM('user','admin') NOT NULL DEFAULT 'user'"],
    ['users', 'verified', 'BOOLEAN NOT NULL DEFAULT FALSE'],
    ['users', 'otp_code', 'VARCHAR(10) DEFAULT NULL'],
    ['users', 'otp_expires', 'DATETIME DEFAULT NULL'],
    ['users', 'otp_attempts', 'INT NOT NULL DEFAULT 0'],
    ['users', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
    ['orders', 'status', "VARCHAR(20) NOT NULL DEFAULT 'Pending'"],
    ['orders', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
    ['feedback', 'created_at', 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
];

async function columnExists(table, column) {
    const [rows] = await db.query(
        'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?',
        [DB_NAME, table, column]
    );
    return rows.length > 0;
}

async function indexExists(table, index) {
    const [rows] = await db.query(
        'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND INDEX_NAME = ?',
        [DB_NAME, table, index]
    );
    return rows.length > 0;
}

async function main() {
    const sql = fs.readFileSync(path.join(__dirname, 'database.sql'), 'utf8');
    const creates = sql.split(';').map(s => s.trim()).filter(s => /^CREATE TABLE/i.test(s.replace(/^--.*$/gm, '').trim()));
    for (const stmt of creates) await db.query(stmt);

    for (const [table, column, def] of COLUMNS) {
        if (!(await columnExists(table, column))) {
            await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${def}`);
            console.log(`Added ${table}.${column}`);
        }
    }

    // Old schema stored the OTP as a number; codes are compared as text now.
    await db.query('ALTER TABLE users MODIFY otp_code VARCHAR(10) DEFAULT NULL');
    // One cart row per user and dish (the add-to-cart upsert relies on it); drop old duplicate rows first.
    if (!(await indexExists('cart', 'uq_cart_user_dish'))) {
        await db.query(`DELETE c1 FROM cart c1 JOIN cart c2
                        ON c1.user_id = c2.user_id AND c1.dish_id = c2.dish_id AND c1.id > c2.id`);
        await db.query('ALTER TABLE cart ADD UNIQUE KEY uq_cart_user_dish (user_id, dish_id)');
        console.log('Added unique index cart(user_id, dish_id)');
    }
    if (!(await indexExists('orders', 'mpesaCode'))) {
        await db.query('ALTER TABLE orders ADD UNIQUE KEY mpesaCode (mpesaCode)').then(
            () => console.log('Added unique index orders(mpesaCode)'),
            (err) => console.warn('Could not add unique index on orders.mpesaCode (duplicate codes exist?):', err.message)
        );
    }

    console.log(`Database "${DB_NAME}" is up to date.`);
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('Database setup failed:', err.message);
        process.exit(1);
    });
