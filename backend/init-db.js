// backend/init-db.js
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const path = require('path');

// Resolve paths relative to this script
const dbDir = path.join(__dirname, '..', 'database');
const dbPath = path.join(dbDir, 'swap.db');
const sqlPath = path.join(dbDir, 'init.sql');

// Ensure database folder exists
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir);

console.log(`🔄 Initializing SQLite at: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
        return;
    }
    console.log('✅ Connected to database. Running schema...');
    
    // Read and execute SQL
    const sql = fs.readFileSync(sqlPath, 'utf8');
    db.exec(sql, (err) => {
        if (err) {
            console.error('❌ SQL execution error:', err.message);
        } else {
            console.log('✅ Database tables created successfully!');
            console.log('👉 Ready for Step 2.5: API Testing');
        }
        db.close();
    });
});