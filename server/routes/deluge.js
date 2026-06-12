const express = require('express');
const axios = require('axios');
const config = require('../config');

const router = express.Router();

// Deluge uses a JSON-RPC style API with cookie-based session auth
let sessionCookie = null;

const delugeRpc = async (method, params = []) => {
  const url = `${config.deluge.url}/json`;
  const response = await axios.post(url, {
    method,
    params,
    id: Date.now(),
  }, {
    headers: {
      'Content-Type': 'application/json',
      ...(sessionCookie ? { Cookie: sessionCookie } : {}),
    },
    timeout: 8000,
  });

  // Capture session cookie on login
  if (response.headers['set-cookie']) {
    sessionCookie = response.headers['set-cookie'][0].split(';')[0];
  }

  return response.data;
};

const ensureAuth = async () => {
  const result = await delugeRpc('auth.login', [config.deluge.password]);
  if (!result.result) throw new Error('Deluge auth failed');
  return true;
};

// GET /api/deluge/status
router.get('/status', async (req, res) => {
  try {
    await ensureAuth();
    const result = await delugeRpc('web.update_ui', [
      ['download_payload_rate', 'upload_payload_rate', 'num_connections'],
      {},
    ]);
    const stats = result.result?.stats || {};
    res.json({
      online: true,
      downloadSpeed: stats.download_payload_rate || 0,
      uploadSpeed: stats.upload_payload_rate || 0,
      connections: stats.num_connections || 0,
    });
  } catch (err) {
    res.json({ online: false, error: err.message });
  }
});

// GET /api/deluge/torrents
router.get('/torrents', async (req, res) => {
  try {
    await ensureAuth();
    const fields = [
      'name', 'state', 'progress', 'download_payload_rate',
      'upload_payload_rate', 'eta', 'total_size', 'ratio',
      'label', 'time_added', 'completed_time', 'save_path',
    ];
    const result = await delugeRpc('web.update_ui', [fields, {}]);
    const torrents = result.result?.torrents || {};

    // Normalize into array
    const list = Object.entries(torrents).map(([hash, t]) => ({
      hash,
      name: t.name,
      state: t.state,
      progress: t.progress,
      downloadSpeed: t.download_payload_rate,
      uploadSpeed: t.upload_payload_rate,
      eta: t.eta,
      size: t.total_size,
      ratio: t.ratio,
      label: t.label,
      added: t.time_added,
    }));

    res.json(list);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deluge/torrents/:hash/pause
router.post('/torrents/:hash/pause', async (req, res) => {
  try {
    await ensureAuth();
    await delugeRpc('core.pause_torrent', [[req.params.hash]]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deluge/torrents/:hash/resume
router.post('/torrents/:hash/resume', async (req, res) => {
  try {
    await ensureAuth();
    await delugeRpc('core.resume_torrent', [[req.params.hash]]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/deluge/torrents/:hash
router.delete('/torrents/:hash', async (req, res) => {
  try {
    await ensureAuth();
    const { deleteFiles = false } = req.query;
    await delugeRpc('core.remove_torrent', [req.params.hash, deleteFiles === 'true']);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deluge/torrents  — add by magnet or URL
router.post('/torrents', async (req, res) => {
  try {
    await ensureAuth();
    const { url, options = {} } = req.body;
    if (!url) return res.status(400).json({ error: 'url required' });
    const result = await delugeRpc('web.add_torrents', [[{ path: url, options }]]);
    res.json({ success: true, result: result.result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
