require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const config = require('./config');
const requireAuth = require('./middleware/auth');

const app = express();

app.use(cors());
app.use(express.json());

// ── SESSION ──────────────────────────────────────────────────
app.use(session({
  secret: process.env.SESSION_SECRET || 'arrdash-default-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  },
}));

// ── AUTH MIDDLEWARE ──────────────────────────────────────────
app.use(requireAuth);

// ── STATIC FILES ─────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public')));

// ── AUTH ROUTES (unprotected — handled inside requireAuth) ───
app.use('/api/auth', require('./routes/auth'));

// ── SERVICE API ROUTES (all protected by requireAuth) ────────
app.use('/api/overseerr', require('./routes/overseerr'));
app.use('/api/radarr',    require('./routes/radarr'));
app.use('/api/sonarr',    require('./routes/sonarr'));
app.use('/api/prowlarr',  require('./routes/prowlarr'));
app.use('/api/deluge',    require('./routes/deluge'));

// ── AGGREGATE STATUS ─────────────────────────────────────────
app.get('/api/status', async (req, res) => {
  const axios = require('axios');
  const base = `http://localhost:${config.port}`;

  const results = await Promise.allSettled([
    axios.get(`${base}/api/overseerr/status`).then(r => r.data),
    axios.get(`${base}/api/radarr/status`).then(r => r.data),
    axios.get(`${base}/api/sonarr/status`).then(r => r.data),
    axios.get(`${base}/api/prowlarr/status`).then(r => r.data),
    axios.get(`${base}/api/deluge/status`).then(r => r.data),
  ]);

  res.json({
    overseerr: results[0].value ?? { online: false },
    radarr:    results[1].value ?? { online: false },
    sonarr:    results[2].value ?? { online: false },
    prowlarr:  results[3].value ?? { online: false },
    deluge:    results[4].value ?? { online: false },
  });
});

// ── LOGIN PAGE ───────────────────────────────────────────────
app.get('/login', (req, res) => {
  if (req.session?.authenticated) return res.redirect('/');
  res.sendFile(path.join(__dirname, '../public/login.html'));
});

// ── CATCH-ALL: serve the frontend ────────────────────────────
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(config.port, () => {
  console.log(`
  ╔══════════════════════════════════════╗
  ║           ArrDash v1.0.0             ║
  ║  Running at http://localhost:${config.port}    ║
  ╚══════════════════════════════════════╝
  `);

  // Warn if auth isn't configured
  if (!process.env.ARRDASH_PASSWORD_HASH) {
    console.warn('  ⚠️  WARNING: ARRDASH_PASSWORD_HASH is not set in .env');
    console.warn('     ArrDash is running WITHOUT authentication!');
    console.warn('     Run the following to generate a hash:');
    console.warn('     node -e "const b=require(\'bcryptjs\'); console.log(b.hashSync(\'yourpassword\', 12))"');
    console.warn('');
  }
});
