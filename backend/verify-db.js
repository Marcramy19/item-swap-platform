const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// ✅ FIX: Go up one level from 'backend/' to 'database/'
const dbPath = path.join(__dirname, '..', 'database', 'swap.db');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Database connection error:', err.message);
        process.exit(1);
    }
    console.log('🔍 Connected to database...');
    
    db.all('SELECT id, email, substr(password_hash, 1, 10) as hash_start FROM users', (err, rows) => {
        if (err) {
            console.error('❌ SQL Error:', err.message);
        } else {
            console.log(`✅ Users found: ${rows.length}`);
            rows.forEach(r => {
                const isHashed = r.hash_start.startsWith('$2b$') ? '✅' : '❌';
                console.log(`   ID:${r.id} | ${r.email} | Hash:${isHashed}`);
            });
        }
        db.close();
    });
});