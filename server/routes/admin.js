const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const slugify = require('slug');
const { query, get, run } = require('../db');
const { generateToken, authMiddleware } = require('../auth');

// ─── FILE UPLOAD SETUP ───────────────────────────────────

const uploadDir = path.join(__dirname, '..', '..', 'uploads');

// Extension is derived from the allowed mimetype, never from the client's
// filename — otherwise "evil.html" declared as image/png would be stored
// as .html and served executable from /uploads.
const EXT_BY_MIME = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'application/pdf': '.pdf',
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const subDir = file.mimetype === 'application/pdf' ? 'documents' : 'images';
    const dir = path.join(uploadDir, subDir);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + EXT_BY_MIME[file.mimetype]);
  },
});

const fileFilter = (req, file, cb) => {
  cb(null, Object.keys(EXT_BY_MIME).includes(file.mimetype));
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 20 * 1024 * 1024 } });

// ─── AUTH ────────────────────────────────────────────────

// Brute-force guard: 5 failed logins per IP → 15-minute lockout.
// In-memory is fine here: single-process app, and a restart clearing the
// counters is acceptable.
const loginAttempts = new Map(); // ip -> { count, lockedUntil }
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;

function loginLimiter(req, res, next) {
  const rec = loginAttempts.get(req.ip);
  if (rec && rec.lockedUntil && rec.lockedUntil > Date.now()) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  }
  next();
}

function recordLoginFailure(ip) {
  const rec = loginAttempts.get(ip) || { count: 0, lockedUntil: 0 };
  rec.count += 1;
  if (rec.count >= MAX_LOGIN_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    rec.count = 0;
  }
  loginAttempts.set(ip, rec);
  // Prune expired lockouts so the map doesn't grow forever
  for (const [key, r] of loginAttempts) {
    if (r.lockedUntil && r.lockedUntil < Date.now()) loginAttempts.delete(key);
  }
}

router.post('/login', loginLimiter, (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required' });

  const user = get('SELECT * FROM users WHERE username = ?', [username]);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    recordLoginFailure(req.ip);
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  loginAttempts.delete(req.ip);
  const token = generateToken(user);
  res.json({ token, username: user.username });
});

router.get('/verify', authMiddleware, (req, res) => {
  res.json({ valid: true, user: req.user });
});

// ─── NEWS CRUD ───────────────────────────────────────────

// Cover = first image in display order. Keeps news.preview_image (used by
// list/card views) in sync whenever the gallery is uploaded, reordered, or trimmed.
function syncCoverImage(newsId) {
  const first = get('SELECT image_path FROM news_images WHERE news_id = ? ORDER BY sort_order ASC LIMIT 1', [newsId]);
  run('UPDATE news SET preview_image = ? WHERE id = ?', [first ? first.image_path : null, newsId]);
}

router.get('/news', authMiddleware, (req, res) => {
  const items = query('SELECT * FROM news ORDER BY published_at DESC');
  res.json({ items });
});

router.get('/news/:id/images', authMiddleware, (req, res) => {
  const items = query('SELECT * FROM news_images WHERE news_id = ? ORDER BY sort_order ASC', [req.params.id]);
  res.json({ items });
});

router.post('/news', authMiddleware, upload.array('images', 10), (req, res) => {
  const { title_ru, title_en, title_es, body_ru, body_en, body_es, is_published, published_at } = req.body;
  if (!title_ru) return res.status(400).json({ error: 'title_ru is required' });

  const slug = slugify(title_ru, { lower: true }) + '-' + Date.now();

  const result = run(
    'INSERT INTO news (slug, title_ru, title_en, title_es, body_ru, body_en, body_es, is_published, published_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))',
    [slug, title_ru, title_en || null, title_es || null, body_ru || null, body_en || null, body_es || null, is_published === '1' ? 1 : 0, published_at || null]
  );

  (req.files || []).forEach((file, i) => {
    run('INSERT INTO news_images (news_id, image_path, sort_order) VALUES (?, ?, ?)',
      [result.lastInsertRowid, `/uploads/images/${file.filename}`, i]);
  });
  syncCoverImage(result.lastInsertRowid);

  res.json({ id: result.lastInsertRowid, slug });
});

router.put('/news/:id', authMiddleware, upload.array('images', 10), (req, res) => {
  const { title_ru, title_en, title_es, body_ru, body_en, body_es, is_published, published_at } = req.body;
  const existing = get('SELECT * FROM news WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  run(
    'UPDATE news SET title_ru=?, title_en=?, title_es=?, body_ru=?, body_en=?, body_es=?, is_published=?, published_at=COALESCE(?, published_at) WHERE id=?',
    [title_ru, title_en || null, title_es || null, body_ru || null, body_en || null, body_es || null, is_published === '1' ? 1 : 0, published_at || null, req.params.id]
  );

  if (req.files && req.files.length) {
    const maxRow = get('SELECT MAX(sort_order) as m FROM news_images WHERE news_id = ?', [req.params.id]);
    let nextOrder = (maxRow && maxRow.m !== null ? maxRow.m : -1) + 1;
    req.files.forEach(file => {
      run('INSERT INTO news_images (news_id, image_path, sort_order) VALUES (?, ?, ?)',
        [req.params.id, `/uploads/images/${file.filename}`, nextOrder++]);
    });
    syncCoverImage(req.params.id);
  }

  res.json({ success: true });
});

router.put('/news/:id/images/order', authMiddleware, (req, res) => {
  const { order } = req.body; // array of news_images.id in desired order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'order must be an array' });

  order.forEach((imageId, i) => {
    run('UPDATE news_images SET sort_order = ? WHERE id = ? AND news_id = ?', [i, imageId, req.params.id]);
  });
  syncCoverImage(req.params.id);
  res.json({ success: true });
});

router.delete('/news/:id/images/:imageId', authMiddleware, (req, res) => {
  const img = get('SELECT * FROM news_images WHERE id = ? AND news_id = ?', [req.params.imageId, req.params.id]);
  if (img) {
    const filePath = path.join(uploadDir, 'images', path.basename(img.image_path));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    run('DELETE FROM news_images WHERE id = ?', [req.params.imageId]);
  }
  syncCoverImage(req.params.id);
  res.json({ success: true });
});

router.delete('/news/:id', authMiddleware, (req, res) => {
  run('DELETE FROM news_images WHERE news_id = ?', [req.params.id]);
  run('DELETE FROM news WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ─── MEDIA CRUD ──────────────────────────────────────────

router.get('/media', authMiddleware, (req, res) => {
  const items = query('SELECT * FROM media ORDER BY event_date DESC');
  res.json({ items });
});

router.post('/media', authMiddleware, upload.single('cover'), (req, res) => {
  const { title_ru, title_en, title_es, description_ru, description_en, description_es, media_type, embed_url, event_date } = req.body;
  const cover_image = req.file ? `/uploads/images/${req.file.filename}` : null;

  const result = run(
    'INSERT INTO media (title_ru, title_en, title_es, description_ru, description_en, description_es, cover_image, media_type, embed_url, event_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [title_ru, title_en || null, title_es || null, description_ru || null, description_en || null, description_es || null, cover_image, media_type || 'photo', embed_url || null, event_date || null]
  );
  res.json({ id: result.lastInsertRowid });
});

router.put('/media/:id', authMiddleware, upload.single('cover'), (req, res) => {
  const { title_ru, title_en, title_es, description_ru, description_en, description_es, media_type, embed_url, event_date } = req.body;
  const existing = get('SELECT * FROM media WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const cover_image = req.file ? `/uploads/images/${req.file.filename}` : existing.cover_image;
  run(
    'UPDATE media SET title_ru=?, title_en=?, title_es=?, description_ru=?, description_en=?, description_es=?, cover_image=?, media_type=?, embed_url=?, event_date=? WHERE id=?',
    [title_ru, title_en || null, title_es || null, description_ru || null, description_en || null, description_es || null, cover_image, media_type || 'photo', embed_url || null, event_date || null, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/media/:id', authMiddleware, (req, res) => {
  run('DELETE FROM media WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ─── DOCUMENTS CRUD ──────────────────────────────────────

router.get('/documents', authMiddleware, (req, res) => {
  const items = query('SELECT * FROM documents ORDER BY created_at DESC');
  res.json({ items });
});

router.post('/documents', authMiddleware, upload.single('file'), (req, res) => {
  const { title_ru, title_en, title_es, category } = req.body;
  if (!req.file) return res.status(400).json({ error: 'PDF file is required' });

  const file_path = `/uploads/documents/${req.file.filename}`;
  const result = run(
    'INSERT INTO documents (title_ru, title_en, title_es, file_path, category) VALUES (?, ?, ?, ?, ?)',
    [title_ru, title_en || null, title_es || null, file_path, category || 'general']
  );
  res.json({ id: result.lastInsertRowid });
});

router.delete('/documents/:id', authMiddleware, (req, res) => {
  const doc = get('SELECT * FROM documents WHERE id = ?', [req.params.id]);
  if (doc) {
    const filePath = path.join(__dirname, '..', '..', doc.file_path);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
  run('DELETE FROM documents WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ─── PARTNERS CRUD ───────────────────────────────────────

router.get('/partners', authMiddleware, (req, res) => {
  const items = query('SELECT * FROM partners ORDER BY sort_order ASC');
  res.json({ items });
});

router.post('/partners', authMiddleware, upload.single('logo'), (req, res) => {
  const { name, website_url, sort_order } = req.body;
  if (!name) return res.status(400).json({ error: 'Name is required' });

  const logo_path = req.file ? `/uploads/images/${req.file.filename}` : null;
  const result = run(
    'INSERT INTO partners (name, logo_path, website_url, sort_order) VALUES (?, ?, ?, ?)',
    [name, logo_path, website_url || null, parseInt(sort_order) || 0]
  );
  res.json({ id: result.lastInsertRowid });
});

router.put('/partners/:id', authMiddleware, upload.single('logo'), (req, res) => {
  const { name, website_url, sort_order } = req.body;
  const existing = get('SELECT * FROM partners WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Not found' });

  const logo_path = req.file ? `/uploads/images/${req.file.filename}` : existing.logo_path;
  run(
    'UPDATE partners SET name=?, logo_path=?, website_url=?, sort_order=? WHERE id=?',
    [name, logo_path, website_url || null, parseInt(sort_order) || 0, req.params.id]
  );
  res.json({ success: true });
});

router.delete('/partners/:id', authMiddleware, (req, res) => {
  run('DELETE FROM partners WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

// ─── CONTACT MESSAGES ────────────────────────────────────

router.get('/messages', authMiddleware, (req, res) => {
  const items = query('SELECT * FROM contact_messages ORDER BY created_at DESC');
  res.json({ items });
});

router.put('/messages/:id/read', authMiddleware, (req, res) => {
  run('UPDATE contact_messages SET is_read = 1 WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

router.delete('/messages/:id', authMiddleware, (req, res) => {
  run('DELETE FROM contact_messages WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

module.exports = router;
