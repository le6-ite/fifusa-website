const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, '..', 'database.sqlite');

let db = null;

async function getDb() {
  if (db) return db;

  const SQL = await initSqlJs();

  // Load existing DB or create new
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Enable WAL-like behavior (sql.js is in-memory, we persist manually)
  initSchema();
  await createDefaultAdmin();
  console.log('✅ Database initialized');

  return db;
}

function initSchema() {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title_ru TEXT,
      title_en TEXT,
      title_es TEXT,
      body_ru TEXT,
      body_en TEXT,
      body_es TEXT,
      preview_image TEXT,
      published_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_published INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_ru TEXT,
      title_en TEXT,
      title_es TEXT,
      description_ru TEXT,
      description_en TEXT,
      description_es TEXT,
      cover_image TEXT,
      media_type TEXT DEFAULT 'photo',
      embed_url TEXT,
      event_date DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title_ru TEXT,
      title_en TEXT,
      title_es TEXT,
      file_path TEXT NOT NULL,
      category TEXT DEFAULT 'general',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS partners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      logo_path TEXT,
      website_url TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_read INTEGER DEFAULT 0
    );
  `);
}

async function createDefaultAdmin() {
  const res = db.exec("SELECT id FROM users WHERE username = 'admin'");
  if (res.length === 0 || res[0].values.length === 0) {
    const defaultPassword = process.env.ADMIN_PASSWORD || 'fifusa2024!';
    const hash = bcrypt.hashSync(defaultPassword, 10);
    db.run('INSERT INTO users (username, password_hash) VALUES (?, ?)', ['admin', hash]);
    persistDb();
    console.log('✅ Default admin created. Password:', defaultPassword);
  }
}

// ─── QUERY HELPERS ────────────────────────────────────────
// Wrap sql.js API to look similar to better-sqlite3 for convenience

function query(sql, params = []) {
  try {
    const result = db.exec(sql, params);
    if (!result.length) return [];
    const { columns, values } = result[0];
    return values.map(row => {
      const obj = {};
      columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj;
    });
  } catch (e) {
    console.error('DB query error:', sql, e.message);
    throw e;
  }
}

function run(sql, params = []) {
  try {
    db.run(sql, params);
    const lastId = db.exec('SELECT last_insert_rowid() as id')[0]?.values[0][0];
    persistDb();
    return { lastInsertRowid: lastId };
  } catch (e) {
    console.error('DB run error:', sql, e.message);
    throw e;
  }
}

function get(sql, params = []) {
  const rows = query(sql, params);
  return rows[0] || null;
}

// Persist in-memory DB to file after every write
function persistDb() {
  if (!db) return;
  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
}

module.exports = { getDb, query, run, get, persistDb };
