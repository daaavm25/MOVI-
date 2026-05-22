// services/torrentService.js
const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');
const { getCorsHeadersForRequest } = require('../config/cors');

const TORRENT_DIR = '/tmp/webtorrent';
const MAX_DISK_USAGE_MB = 512;                    // 512 MB max en disco
const CLEANUP_INTERVAL_MS = 60 * 1000;            // revisar cada 1 min
const MAX_TORRENT_AGE_MS = 5 * 60 * 1000;         // eliminar archivos > 5 min inactivos
const DEFAULT_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://exodus.desync.com:6969',
  'udp://open.demonii.com:1337/announce'
];
// Cache de torrents activos: infoHash → torrent
const activeTorrents = new Map();

// ─── Automatic disk cleanup ─────────────────────────────────────

function getDirSizeMB(dir) {
  try {
    const out = execSync(`du -sm "${dir}" 2>/dev/null`).toString();
    return parseInt(out, 10) || 0;
  } catch { return 0; }
}

function cleanupTorrentDir() {
  try {
    if (!fs.existsSync(TORRENT_DIR)) return;

    const now = Date.now();
    const entries = fs.readdirSync(TORRENT_DIR, { withFileTypes: true });

    // 1. Remove entries older than MAX_TORRENT_AGE_MS
    let removed = 0;
    for (const entry of entries) {
      const full = path.join(TORRENT_DIR, entry.name);
      try {
        const stat = fs.statSync(full);
        if (now - stat.mtimeMs > MAX_TORRENT_AGE_MS) {
          // Check it's not being actively streamed
          const hash = findHashForPath(entry.name);
          if (hash && activeTorrents.has(hash)) continue;
          fs.rmSync(full, { recursive: true, force: true });
          removed++;
          if (hash) destroyTorrent(hash);
        }
      } catch { /* skip */ }
    }

    // 2. If still over limit, remove oldest first
    const sizeMB = getDirSizeMB(TORRENT_DIR);
    if (sizeMB > MAX_DISK_USAGE_MB) {
      const remaining = fs.readdirSync(TORRENT_DIR, { withFileTypes: true })
        .map(e => {
          const full = path.join(TORRENT_DIR, e.name);
          try { return { name: e.name, full, mtime: fs.statSync(full).mtimeMs }; }
          catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => a.mtime - b.mtime); // oldest first

      for (const item of remaining) {
        if (getDirSizeMB(TORRENT_DIR) <= MAX_DISK_USAGE_MB) break;
        const hash = findHashForPath(item.name);
        if (hash && activeTorrents.has(hash)) continue;
        fs.rmSync(item.full, { recursive: true, force: true });
        removed++;
        if (hash) destroyTorrent(hash);
      }
    }

    if (removed > 0) {
      const newSize = getDirSizeMB(TORRENT_DIR);
      console.log(`[Cleanup] Eliminados ${removed} torrents antiguos. Uso actual: ${newSize} MB`);
    }
  } catch (err) {
    console.error('[Cleanup] Error:', err.message);
  }
}

function findHashForPath(dirName) {
  for (const [hash, torrent] of activeTorrents) {
    if (torrent.name === dirName) return hash;
  }
  return null;
}

function destroyTorrent(hash) {
  const torrent = activeTorrents.get(hash);
  if (torrent && !torrent.destroyed) {
    try { torrent.destroy(); } catch (_) {}
  }
  activeTorrents.delete(hash);
}

// Run cleanup on startup and periodically
cleanupTorrentDir();
setInterval(cleanupTorrentDir, CLEANUP_INTERVAL_MS);

// ─── WebTorrent setup ───────────────────────────────────────────

let WebTorrent;
const getWebTorrent = async () => {
  if (!WebTorrent) {
    WebTorrent = (await import('webtorrent')).default;
  }
  return WebTorrent;
};
let mime;
const getMime = async () => {
  if (!mime) {
    mime = (await import('mime')).default;
  }
  return mime;
};

let client;

async function getClient() {
  if (!client) {
    const WebTorrentClass = await getWebTorrent();
    client = new WebTorrentClass();
    client.on('error', err => console.error('[WebTorrent] Client error:', err.message));
  }
  return client;
}

function parseMagnetHash(magnet) {
  const m = magnet.match(/btih:([a-fA-F0-9]{40})/i) || magnet.match(/btih:([a-zA-Z2-7]{32})/i);
  return m ? m[1].toLowerCase() : null;
}

function normalizeMagnet(magnet) {
  if (!magnet || typeof magnet !== 'string') return magnet;
  const raw = magnet.trim();
  if (!raw.startsWith('magnet:?')) return raw;

  const hasTrackers = /[?&]tr=/i.test(raw);
  if (hasTrackers) return raw;

  const trackerParams = DEFAULT_TRACKERS
    .map(tr => `tr=${encodeURIComponent(tr)}`)
    .join('&');

  return `${raw}${raw.includes('?') ? '&' : '?'}${trackerParams}`;
}

async function getOrAddTorrent(magnet) {
  const c = await getClient();
  const normalizedMagnet = normalizeMagnet(magnet);
  const hash = parseMagnetHash(normalizedMagnet);

  // Si ya tenemos este torrent, reutilizar
  if (hash && activeTorrents.has(hash)) {
    const existing = activeTorrents.get(hash);
    if (!existing.destroyed) {
      console.log(`[WebTorrent] Reutilizando torrent existente: ${hash.substring(0, 12)}...`);
      return existing;
    }
    activeTorrents.delete(hash);
  }

  // También verificar en el cliente
  const existingInClient = hash ? c.torrents.find(t => t.infoHash === hash) : null;
  if (existingInClient && !existingInClient.destroyed) {
    console.log(`[WebTorrent] Torrent ya existe en cliente: ${hash.substring(0, 12)}...`);
    activeTorrents.set(hash, existingInClient);
    return existingInClient;
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Timeout conectando al torrent (180s). Prueba un torrent con más seeds.'));
    }, 180000);

    console.log(`[WebTorrent] Añadiendo torrent: ${hash ? hash.substring(0, 12) + '...' : 'desconocido'}`);

    c.add(normalizedMagnet, { path: TORRENT_DIR, announce: DEFAULT_TRACKERS }, torrent => {
      clearTimeout(timeoutId);
      console.log(`[WebTorrent] Torrent listo: "${torrent.name}" (${torrent.files.length} archivos)`);
      torrent.files.forEach(f => console.log(`  - ${f.name} (${(f.length / 1048576).toFixed(1)} MB)`));

      if (torrent.infoHash) {
        activeTorrents.set(torrent.infoHash, torrent);
      }

      torrent.on('error', err => console.error(`[WebTorrent] Torrent error: ${err.message}`));

      resolve(torrent);
    });

    c.on('error', err => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

function findVideoFile(torrent) {
  return torrent.files
    .filter(f => /\.(mp4|mkv|avi|webm|ts|m4v|flv|mov)$/i.test(f.name))
    .sort((a, b) => b.length - a.length)[0];
}

function findSubtitleFiles(torrent) {
  return torrent.files
    .filter(f => /\.(srt|vtt|ass|ssa|sub)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getTorrentInfo(magnet) {
  const torrent = await getOrAddTorrent(magnet);
  const videos = torrent.files
    .filter(f => /\.(mp4|mkv|avi|webm|ts|m4v|flv|mov)$/i.test(f.name))
    .sort((a, b) => b.length - a.length)
    .map(f => ({
      index: torrent.files.indexOf(f),
      name: f.name,
      size: (f.length / 1048576).toFixed(1) + ' MB',
      sizeBytes: f.length
    }));

  const subtitles = findSubtitleFiles(torrent).map(f => ({
    index: torrent.files.indexOf(f),
    name: f.name,
    label: guessSubtitleLabel(f.name),
    lang: guessSubtitleLang(f.name)
  }));

  return { name: torrent.name, videos, subtitles, infoHash: torrent.infoHash };
}

function guessSubtitleLabel(filename) {
  const n = filename.toLowerCase();
  if (/espa[nñ]ol|spanish|latino|lat\b|spa\b|es\b/i.test(n)) return 'Español';
  if (/english|eng?\b|en\b/i.test(n)) return 'English';
  if (/portugu|ptbr|pt-br|por\b/i.test(n)) return 'Português';
  if (/french|fre?\b|fra?\b/i.test(n)) return 'Français';
  if (/german|deu?\b|ger\b/i.test(n)) return 'Deutsch';
  if (/italian|ita?\b/i.test(n)) return 'Italiano';
  if (/forced/i.test(n)) return 'Forced';
  const m = filename.match(/\.([a-z]{2,3})\.\w{3}$/i);
  if (m) return m[1].toUpperCase();
  return filename.replace(/^.*[\\/]/, '').replace(/\.\w+$/, '');
}

function guessSubtitleLang(filename) {
  const n = filename.toLowerCase();
  if (/espa[nñ]ol|spanish|latino|lat\b|spa\b|\.es\./i.test(n)) return 'es';
  if (/english|\.eng?\.|\.en\./i.test(n)) return 'en';
  if (/portugu|ptbr|\.pt\./i.test(n)) return 'pt';
  if (/french|\.fr\./i.test(n)) return 'fr';
  if (/german|\.de\./i.test(n)) return 'de';
  return '';
}

async function streamFile(magnet, fileIndex, res) {
  const torrent = await getOrAddTorrent(magnet);
  const file = torrent.files[fileIndex];
  if (!file) {
    throw new Error(`File index ${fileIndex} not found in torrent`);
  }

  const mimeModule = await getMime();
  let mimeType = mimeModule.getType(file.name) || 'application/octet-stream';

  const isSrt = /\.srt$/i.test(file.name);
  if (isSrt) mimeType = 'text/vtt';

  if (/\.(srt|vtt|ass|ssa|sub)$/i.test(file.name)) {
    res.setHeader('Content-Type', mimeType);
    const subtitleCorsHeaders = getCorsHeadersForRequest(res.req);
    Object.entries(subtitleCorsHeaders).forEach(([key, value]) => {
      res.setHeader(key, value);
    });

    const chunks = [];
    const stream = file.createReadStream();
    stream.on('data', chunk => chunks.push(chunk));
    stream.on('end', () => {
      let text = Buffer.concat(chunks).toString('utf8');
      if (isSrt) {
        text = 'WEBVTT\n\n' + text
          .replace(/\r\n/g, '\n')
          .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      }
      res.send(text);
    });
    stream.on('error', err => {
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    return;
  }

  // Video file — support range requests
  const fileSize = file.length;
  const range = res.req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
      ...getCorsHeadersForRequest(res.req)
    });

    const stream = file.createReadStream({ start, end });
    stream.pipe(res);
    stream.on('error', err => {
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    res.on('close', () => { stream.destroy(); setImmediate(cleanupTorrentDir); });
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      ...getCorsHeadersForRequest(res.req)
    });

    const stream = file.createReadStream();
    stream.pipe(res);
    stream.on('error', err => {
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    res.on('close', () => { stream.destroy(); setImmediate(cleanupTorrentDir); });
  }
}

async function streamTorrent(magnet, res) {
  const torrent = await getOrAddTorrent(magnet);
  const videoFile = findVideoFile(torrent);
  if (!videoFile) {
    throw new Error('No video file found in torrent');
  }

  const mimeModule = await getMime();
  const mimeType = mimeModule.getType(videoFile.name) || 'video/mp4';
  const fileSize = videoFile.length;
  const range = res.req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': mimeType,
      ...getCorsHeadersForRequest(res.req)
    });

    const stream = videoFile.createReadStream({ start, end });
    stream.pipe(res);
    stream.on('error', err => {
      console.error(`[WebTorrent] Stream error: ${err.message}`);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    res.on('close', () => {
      stream.destroy();
      console.log(`[WebTorrent] Conexión cerrada por cliente`);
    });
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      ...getCorsHeadersForRequest(res.req)
    });

    const stream = videoFile.createReadStream();
    stream.pipe(res);
    stream.on('error', err => {
      console.error(`[WebTorrent] Stream error: ${err.message}`);
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    res.on('close', () => {
      stream.destroy();
      console.log(`[WebTorrent] Conexión cerrada por cliente`);
      setImmediate(cleanupTorrentDir);
    });
  }
}

// ─── Transcode: pipe a través de FFmpeg para convertir audio AC3/DTS → AAC ───
// El video se copia sin recodificar (rápido). Salida: fragmented MP4 (web-compatible)
async function streamFileTranscoded(magnet, fileIndex, res) {
  const torrent = await getOrAddTorrent(magnet);
  const file = torrent.files[fileIndex];
  if (!file) throw new Error(`File index ${fileIndex} not found in torrent`);

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-store',
    ...getCorsHeadersForRequest(res.req)
  });

  const ffmpegArgs = [
    '-i', 'pipe:0',
    '-c:v', 'copy',          // copia video sin recodificar (rápido, sin pérdida)
    '-c:a', 'aac',           // convierte audio (AC3/DTS/etc.) → AAC
    '-b:a', '192k',          // bitrate de audio
    '-ac', '2',              // stereo (compatible con todos los navegadores)
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof', // fragmented MP4
    'pipe:1'
  ];

  const ffmpegProc = spawn('ffmpeg', ffmpegArgs);
  const inputStream = file.createReadStream();

  inputStream.pipe(ffmpegProc.stdin);
  ffmpegProc.stdout.pipe(res);
  ffmpegProc.stderr.on('data', () => {}); // ffmpeg escribe progreso en stderr, no es error

  ffmpegProc.on('error', (err) => {
    console.error('[FFmpeg] Error al iniciar:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'FFmpeg no disponible' });
    else res.end();
  });

  ffmpegProc.on('close', (code) => {
    if (code !== 0 && code !== null) console.warn(`[FFmpeg] Terminó con código ${code}`);
    res.end();
  });

  res.on('close', () => {
    inputStream.destroy();
    try { ffmpegProc.stdin.destroy(); } catch (_) {}
    ffmpegProc.kill('SIGTERM');
  });
}

module.exports = { streamTorrent, getTorrentInfo, streamFile, streamFileTranscoded, cleanupTorrentDir };
