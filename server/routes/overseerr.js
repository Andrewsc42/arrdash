const express = require('express');
const axios = require('axios');
const config = require('../config');

const router = express.Router();

const api = () => axios.create({
  baseURL: `${config.overseerr.url}/api/v1`,
  headers: { 'X-Api-Key': config.overseerr.apiKey },
  timeout: 8000,
});

// GET /api/overseerr/status
router.get('/status', async (req, res) => {
  try {
    const [settings, requests] = await Promise.all([
      api().get('/settings/public'),
      api().get('/request?take=1&skip=0&filter=pending'),
    ]);
    res.json({
      online: true,
      pendingCount: requests.data.pageInfo?.results ?? 0,
      applicationTitle: settings.data.applicationTitle,
    });
  } catch (err) {
    res.json({ online: false, error: err.message });
  }
});

// GET /api/overseerr/requests?filter=pending&take=25&skip=0
router.get('/requests', async (req, res) => {
  try {
    const { filter = 'all', take = 25, skip = 0 } = req.query;
    const response = await api().get(`/request?take=${take}&skip=${skip}&filter=${filter}&sort=added`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/overseerr/requests/:id/approve
router.post('/requests/:id/approve', async (req, res) => {
  try {
    const response = await api().post(`/request/${req.params.id}/approve`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/overseerr/requests/:id/decline
router.post('/requests/:id/decline', async (req, res) => {
  try {
    const response = await api().post(`/request/${req.params.id}/decline`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/overseerr/requests/:id
router.delete('/requests/:id', async (req, res) => {
  try {
    await api().delete(`/request/${req.params.id}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/overseerr/search?query=...
router.get('/search', async (req, res) => {
  try {
    const { query, page = 1 } = req.query;
    if (!query) return res.status(400).json({ error: 'query required' });
    const response = await api().get(`/search?query=${encodeURIComponent(query)}&page=${page}&language=en`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
