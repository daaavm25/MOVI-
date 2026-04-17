// routes/torrentRoutes.js
const express = require('express');
const router = express.Router();
const { searchTorrents } = require('../services/jackettService');
const { streamTorrent, getTorrentInfo, streamFile } = require('../services/torrentService');

// GET /api/torrent/search?query=<title>&lang=<lang>&year=<year>&tmdbId=<id>
router.get('/search', async (req, res) => {
  try {
    const { query, lang, year, tmdbId } = req.query;
    if (!query) {
      return res.status(400).json({ error: 'Missing query parameter' });
    }
    const results = await searchTorrents(query, { lang, year, tmdbId });
    res.json({ results });
  } catch (err) {
    console.error('[TorrentRoutes] Search error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/torrent/info?magnet=<magnet_link> — list files (videos + subtitles)
router.get('/info', async (req, res) => {
  try {
    const { magnet } = req.query;
    if (!magnet) return res.status(400).json({ error: 'Missing magnet' });
    const info = await getTorrentInfo(magnet);
    res.json(info);
  } catch (err) {
    console.error('[TorrentRoutes] Info error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/torrent/file?magnet=<magnet>&index=<fileIndex> — stream specific file
router.get('/file', async (req, res) => {
  try {
    const { magnet, index } = req.query;
    if (!magnet || index === undefined) {
      return res.status(400).json({ error: 'Missing magnet or index' });
    }
    await streamFile(magnet, parseInt(index, 10), res);
  } catch (err) {
    console.error('[TorrentRoutes] File stream error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: err.message });
    else res.end();
  }
});

// GET /api/torrent/stream?magnet=<magnet_link> — legacy: stream largest video
router.get('/stream', async (req, res) => {
  try {
    const { magnet } = req.query;
    if (!magnet) {
      return res.status(400).json({ error: 'Missing magnet link' });
    }
    await streamTorrent(magnet, res);
  } catch (err) {
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    } else {
      res.end();
    }
  }
});

module.exports = router;
