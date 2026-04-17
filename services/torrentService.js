// services/torrentService.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TORRENT_DIR = '/tmp/webtorrent';
const MAX_DISK_USAGE_MB = 2048; // 2 GB max
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // check every 5 min
const MAX_TORRENT_AGE_MS = 30 * 60 * 1000; // remove files older than 30 min

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
// Cache de torrents activos: infoHash → torrent
const activeTorrents = new Map();

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

async function getOrAddTorrent(magnet) {
  const c = await getClient();
  const hash = parseMagnetHash(magnet);

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

    c.add(magnet, { path: '/tmp/webtorrent' }, torrent => {
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
    res.setHeader('Access-Control-Allow-Origin', '*');

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
      'Access-Control-Allow-Origin': '*'
    });

    const stream = file.createReadStream({ start, end });
    stream.pipe(res);
    stream.on('error', err => {
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    res.on('close', () => stream.destroy());
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
      'Access-Control-Allow-Origin': '*'
    });

    const stream = file.createReadStream();
    stream.pipe(res);
    stream.on('error', err => {
      if (!res.headersSent) res.status(500).end();
      else res.end();
    });
    res.on('close', () => stream.destroy());
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
    });
  }
}

module.exports = { streamTorrent, getTorrentInfo, streamFile, cleanupTorrentDir };
