const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const validUser = username === process.env.ARRDASH_USERNAME;
  const validPass = await bcrypt.compare(password, process.env.ARRDASH_PASSWORD_HASH || '');

  if (!validUser || !validPass) {
    // Artificial delay to slow brute force attempts
    await new Promise(r => setTimeout(r, 800));
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  req.session.authenticated = true;
  req.session.username = username;
  res.json({ success: true });
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ success: true });
  });
});

// GET /api/auth/status
router.get('/status', (req, res) => {
  res.json({
    authenticated: !!(req.session && req.session.authenticated),
    username: req.session?.username || null,
  });
});

module.exports = router;
