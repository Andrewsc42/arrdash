const express = require('express');
const axios = require('axios');
const config = require('../config');

const router = express.Router();

const api = () => axios.create({
  baseURL: `${config.prowlarr.url}/api/v1`,
  headers: { 'X-Api-Key': config.prowlarr.apiKey },
  timeout: 8000,
});

// GET /api/prowlarr/status
router.get('/status', async (req, res) => {
  try {
    const [indexers, stats] = await Promise.all([
      api().get('/indexer'),
      api().get('/indexerstats'),
    ]);
    const healthy = indexers.data.filter(i => i.enable && !i.status?.disabled).length;
    const total = indexers.data.filter(i => i.enable).length;
    res.json({
      online: true,
      indexerCount: total,
      healthyCount: healthy,
    });
  } catch (err) {
    res.json({ online: false, error: err.message });
  }
});

// GET /api/prowlarr/indexers
router.get('/indexers', async (req, res) => {
  try {
    const response = await api().get('/indexer');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prowlarr/stats
router.get('/stats', async (req, res) => {
  try {
    const response = await api().get('/indexerstats');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/prowlarr/history?pageSize=25
router.get('/history', async (req, res) => {
  try {
    const { pageSize = 25 } = req.query;
    const response = await api().get(`/history?pageSize=${pageSize}&sortKey=date&sortDirection=descending`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prowlarr/indexers/:id/test
router.post('/indexers/:id/test', async (req, res) => {
  try {
    await api().post(`/indexer/test`, { id: parseInt(req.params.id) });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/prowlarr/indexers/testall
router.post('/indexers/testall', async (req, res) => {
  try {
    await api().post('/indexer/testall');
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
