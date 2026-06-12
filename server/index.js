require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// API Routes
app.use('/api/overseerr', require('./routes/overseerr'));
app.use('/api/radarr',    require('./routes/radarr'));
app.use('/api/sonarr',    require('./routes/sonarr'));
app.use('/api/prowlarr',  require('./routes/prowlarr'));
app.use('/api/deluge',    require('./routes/deluge'));

// Aggregate status endpoint — used by the Overview page and footer
app.get('/api/status', async (req, res) => {
  const fetch = (url) =>
    fetch(`http://localhost:${config.port}${url}`)
      .then(r => r.json())
      .catch(() => ({ online: false }));

  // Use internal HTTP calls to reuse existing route logic
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

// Catch-all: serve the frontend
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
});
