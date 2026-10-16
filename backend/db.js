const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const mysql = require('mysql2');

if (!process.env.DB_USER || process.env.DB_PASSWORD === undefined) {
    throw new Error('DB_USER and DB_PASSWORD must be set in backend/.env (see backend/.env.example).');
}

// A pool reconnects automatically if MySQL drops a connection, unlike a single connection.
const db = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'food_menu',
    waitForConnections: true,
    connectionLimit: 10,
    decimalNumbers: true // return DECIMAL prices as numbers, not strings
});

db.getConnection((err, conn) => {
    if (err) {
        console.error('MySQL connection failed:', err.message);
        return;
    }
    console.log('Connected to MySQL Database');
    conn.release();
});

module.exports = db;
