require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── MIDDLEWARE ──────────────────────────────────────────

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public')));
// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// ─── ROUTES ──────────────────────────────────────────────

app.use('/api', require('./routes/api'));
app.use('/api/admin', require('./routes/admin'));

// ─── SPA FALLBACK ────────────────────────────────────────

app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ─── START ───────────────────────────────────────────────

async function start() {
  try {
    await getDb(); // Initialize DB first
    app.listen(PORT, () => {
      console.log(`🚀 FIFUSA server running on http://localhost:${PORT}`);
      console.log(`📁 Admin panel: http://localhost:${PORT}/admin/`);
      console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
  } catch (err) {
    console.error('❌ Failed to start:', err);
    process.exit(1);
  }
}

start();

module.exports = app;
