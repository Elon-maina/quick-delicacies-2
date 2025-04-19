const mysql = require('mysql');

const db = mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '@$1A2b3c4d',
    database: 'food_menu'
});

db.connect(err => {
    if (err) throw err;
    console.log('Connected to MySQL Database')
});

module.exports = db;