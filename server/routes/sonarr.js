const express = require('express');
const axios = require('axios');
const config = require('../config');

const router = express.Router();

const api = () => axios.create({
  baseURL: `${config.sonarr.url}/api/v3`,
  headers: { 'X-Api-Key': config.sonarr.apiKey },
  timeout: 8000,
});

// GET /api/sonarr/status
router.get('/status', async (req, res) => {
  try {
    const [sysStatus, series, queue, wanted] = await Promise.all([
      api().get('/system/status'),
      api().get('/series'),
      api().get('/queue'),
      api().get('/wanted/missing?pageSize=1'),
    ]);
    res.json({
      online: true,
      version: sysStatus.data.version,
      seriesCount: series.data.length,
      queueCount: queue.data.totalRecords ?? queue.data.records?.length ?? 0,
      missingCount: wanted.data.totalRecords ?? 0,
    });
  } catch (err) {
    res.json({ online: false, error: err.message });
  }
});

// GET /api/sonarr/queue
router.get('/queue', async (req, res) => {
  try {
    const response = await api().get('/queue?pageSize=50&includeSeries=true&includeEpisode=true');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sonarr/series
router.get('/series', async (req, res) => {
  try {
    const response = await api().get('/series');
    const sorted = response.data.sort((a, b) => new Date(b.added) - new Date(a.added));
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sonarr/wanted
router.get('/wanted', async (req, res) => {
  try {
    const { pageSize = 25, page = 1 } = req.query;
    const response = await api().get(`/wanted/missing?pageSize=${pageSize}&page=${page}&monitored=true`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sonarr/cutoff
router.get('/cutoff', async (req, res) => {
  try {
    const response = await api().get('/wanted/cutoff?pageSize=25&monitored=true');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sonarr/calendar?start=YYYY-MM-DD&end=YYYY-MM-DD
router.get('/calendar', async (req, res) => {
  try {
    const now = new Date();
    const start = req.query.start || new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const end = req.query.end || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
    const response = await api().get(`/calendar?start=${start}&end=${end}&includeSeries=true`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sonarr/search?query=...
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'query required' });
    const response = await api().get(`/series/lookup?term=${encodeURIComponent(query)}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sonarr/qualityprofiles
router.get('/qualityprofiles', async (req, res) => {
  try {
    const response = await api().get('/qualityprofile');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/sonarr/rootfolders
router.get('/rootfolders', async (req, res) => {
  try {
    const response = await api().get('/rootfolder');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sonarr/series  — add a series
router.post('/series', async (req, res) => {
  try {
    const response = await api().post('/series', req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

// DELETE /api/sonarr/series/:id
router.delete('/series/:id', async (req, res) => {
  try {
    const { deleteFiles = false } = req.query;
    await api().delete(`/series/${req.params.id}?deleteFiles=${deleteFiles}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/sonarr/command
router.post('/command', async (req, res) => {
  try {
    const response = await api().post('/command', req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
