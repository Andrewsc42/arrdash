const express = require('express');
const axios = require('axios');
const config = require('../config');

const router = express.Router();

const api = () => axios.create({
  baseURL: `${config.radarr.url}/api/v3`,
  headers: { 'X-Api-Key': config.radarr.apiKey },
  timeout: 8000,
});

// GET /api/radarr/status
router.get('/status', async (req, res) => {
  try {
    const [sysStatus, movies, queue, wanted] = await Promise.all([
      api().get('/system/status'),
      api().get('/movie?monitored=true'),
      api().get('/queue'),
      api().get('/wanted/missing?pageSize=1'),
    ]);
    res.json({
      online: true,
      version: sysStatus.data.version,
      movieCount: movies.data.length,
      queueCount: queue.data.totalRecords ?? queue.data.records?.length ?? 0,
      missingCount: wanted.data.totalRecords ?? 0,
    });
  } catch (err) {
    res.json({ online: false, error: err.message });
  }
});

// GET /api/radarr/queue
router.get('/queue', async (req, res) => {
  try {
    const response = await api().get('/queue?pageSize=50&includeMovie=true');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/radarr/movies?pageSize=20&page=1
router.get('/movies', async (req, res) => {
  try {
    const response = await api().get('/movie');
    // Sort by added date descending
    const sorted = response.data.sort((a, b) => new Date(b.added) - new Date(a.added));
    res.json(sorted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/radarr/wanted
router.get('/wanted', async (req, res) => {
  try {
    const { pageSize = 25, page = 1 } = req.query;
    const response = await api().get(`/wanted/missing?pageSize=${pageSize}&page=${page}&monitored=true`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/radarr/search?query=...
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) return res.status(400).json({ error: 'query required' });
    const response = await api().get(`/movie/lookup?term=${encodeURIComponent(query)}`);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/radarr/qualityprofiles
router.get('/qualityprofiles', async (req, res) => {
  try {
    const response = await api().get('/qualityprofile');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/radarr/rootfolders
router.get('/rootfolders', async (req, res) => {
  try {
    const response = await api().get('/rootfolder');
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/radarr/movies  — add a movie
router.post('/movies', async (req, res) => {
  try {
    const response = await api().post('/movie', req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});

// DELETE /api/radarr/movies/:id
router.delete('/movies/:id', async (req, res) => {
  try {
    const { deleteFiles = false } = req.query;
    await api().delete(`/movie/${req.params.id}?deleteFiles=${deleteFiles}`);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/radarr/command  — trigger commands like MovieSearch
router.post('/command', async (req, res) => {
  try {
    const response = await api().post('/command', req.body);
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
