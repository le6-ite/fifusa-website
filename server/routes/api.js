const express = require('express');
const router = express.Router();
const { query, get } = require('../db');
const nodemailer = require('nodemailer');

// ─── NEWS ────────────────────────────────────────────────

router.get('/news', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const offset = (page - 1) * limit;

  const totalRow = get('SELECT COUNT(*) as count FROM news WHERE is_published = 1');
  const total = totalRow?.count || 0;
  const items = query(
    'SELECT id, slug, title_ru, title_en, title_es, preview_image, published_at FROM news WHERE is_published = 1 ORDER BY published_at DESC LIMIT ? OFFSET ?',
    [limit, offset]
  );

  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

router.get('/news/:slug', (req, res) => {
  const item = get('SELECT * FROM news WHERE slug = ? AND is_published = 1', [req.params.slug]);
  if (!item) return res.status(404).json({ error: 'Not found' });
  item.images = query('SELECT image_path FROM news_images WHERE news_id = ? ORDER BY sort_order ASC', [item.id])
    .map(row => row.image_path);
  res.json(item);
});

// ─── MEDIA ──────────────────────────────────────────────

router.get('/media', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 9;
  const offset = (page - 1) * limit;
  const type = req.query.type;

  let sql = 'SELECT * FROM media';
  let countSql = 'SELECT COUNT(*) as count FROM media';
  const params = [];

  if (type) {
    sql += ' WHERE media_type = ?';
    countSql += ' WHERE media_type = ?';
    params.push(type);
  }

  const total = get(countSql, params)?.count || 0;
  const items = query(sql + ' ORDER BY event_date DESC LIMIT ? OFFSET ?', [...params, limit, offset]);

  res.json({ items, total, page, pages: Math.ceil(total / limit) });
});

// ─── DOCUMENTS ──────────────────────────────────────────

router.get('/documents', (req, res) => {
  const items = query('SELECT * FROM documents ORDER BY created_at DESC');
  res.json({ items });
});

// ─── PARTNERS ───────────────────────────────────────────

router.get('/partners', (req, res) => {
  const items = query('SELECT * FROM partners ORDER BY sort_order ASC');
  res.json({ items });
});

// ─── CONTACT FORM ────────────────────────────────────────

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

router.post('/contact', async (req, res) => {
  const name = (req.body.name || '').trim();
  const email = (req.body.email || '').trim();
  const message = (req.body.message || '').trim();
  if (!name || !email || !message) return res.status(400).json({ error: 'All fields are required' });
  if (name.length > 200 || email.length > 320 || message.length > 5000) {
    return res.status(400).json({ error: 'Message is too long' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) return res.status(400).json({ error: 'Invalid email address' });

  const { run } = require('../db');
  run('INSERT INTO contact_messages (name, email, message) VALUES (?, ?, ?)', [name, email, message]);

  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      });
      await transporter.sendMail({
        from: `"FIFUSA Website" <${process.env.SMTP_USER}>`,
        to: process.env.CONTACT_EMAIL || process.env.SMTP_USER,
        subject: `New contact message from ${name}`,
        html: `<h3>New message</h3><p><b>Name:</b> ${escapeHtml(name)}</p><p><b>Email:</b> ${escapeHtml(email)}</p><p><b>Message:</b><br>${escapeHtml(message).replace(/\n/g, '<br>')}</p>`,
      });
    } catch (e) {
      console.error('Email error:', e.message);
    }
  }

  res.json({ success: true });
});

module.exports = router;
