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
    client = new WebTorrentClass({ maxConns: 100 }); // más peers = descarga más rápida
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

// Mapa de Promises en vuelo: evita que dos llamadas simultáneas al mismo hash
// hagan c.add() dos veces o devuelvan el torrent antes de que files esté listo.
const pendingTorrents = new Map();

async function getOrAddTorrent(magnet) {
  const c = await getClient();
  const normalizedMagnet = normalizeMagnet(magnet);
  const hash = parseMagnetHash(normalizedMagnet);

  // 1. Torrent ya cargado completamente
  if (hash && activeTorrents.has(hash)) {
    const existing = activeTorrents.get(hash);
    if (!existing.destroyed) {
      console.log(`[WebTorrent] Reutilizando torrent: ${hash.substring(0, 12)}...`);
      return existing;
    }
    activeTorrents.delete(hash);
  }

  // 2. Metadatos en proceso de carga: reutilizar la misma Promise en lugar de
  //    llamar c.add() otra vez (que devolvería el torrent sin files aún)
  if (hash && pendingTorrents.has(hash)) {
    console.log(`[WebTorrent] Esperando metadatos ya en curso: ${hash.substring(0, 12)}...`);
    return pendingTorrents.get(hash);
  }

  // 3. Añadir nuevo torrent
  console.log(`[WebTorrent] Añadiendo torrent: ${hash ? hash.substring(0, 12) + '...' : 'desconocido'}`);

  const promise = new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      if (hash) pendingTorrents.delete(hash);
      reject(new Error('Timeout conectando al torrent (180s). Prueba un torrent con más seeds.'));
    }, 180000);

    c.add(normalizedMagnet, { path: TORRENT_DIR, announce: DEFAULT_TRACKERS }, torrent => {
      clearTimeout(timeoutId);
      console.log(`[WebTorrent] Torrent listo: "${torrent.name}" (${torrent.files.length} archivos)`);
      torrent.files.forEach(f => console.log(`  - ${f.name} (${(f.length / 1048576).toFixed(1)} MB)`));

      if (torrent.infoHash) {
        activeTorrents.set(torrent.infoHash, torrent);
        pendingTorrents.delete(torrent.infoHash);
      }

      // Priorizar el archivo de video más grande para iniciar la descarga de sus piezas
      const primaryVideo = torrent.files
        .filter(f => VIDEO_EXT_RE.test(f.name || f.path || ''))
        .sort((a, b) => b.length - a.length)[0];
      if (primaryVideo) primaryVideo.select();

      torrent.on('error', err => console.error(`[WebTorrent] Torrent error: ${err.message}`));

      resolve(torrent);
    });

    c.on('error', err => {
      clearTimeout(timeoutId);
      if (hash) pendingTorrents.delete(hash);
      reject(err);
    });
  });

  if (hash) pendingTorrents.set(hash, promise);
  return promise;
}

const VIDEO_EXT_RE = /\.(mp4|mkv|avi|webm|ts|m4v|flv|mov|rmvb|vob|mpg|mpeg|wmv|3gp|ogv|divx|xvid|hevc|h264|h265)$/i;

function findVideoFile(torrent) {
  return torrent.files
    .filter(f => VIDEO_EXT_RE.test(f.name || f.path || ''))
    .sort((a, b) => b.length - a.length)[0];
}

function findSubtitleFiles(torrent) {
  return torrent.files
    .filter(f => /\.(srt|vtt|ass|ssa|sub)$/i.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function getTorrentInfo(magnet) {
  const torrent = await getOrAddTorrent(magnet);

  // Filtro principal: extensiones de video conocidas (comprueba name y path)
  let videos = torrent.files
    .filter(f => VIDEO_EXT_RE.test(f.name || f.path || ''))
    .sort((a, b) => b.length - a.length)
    .map(f => ({
      index: torrent.files.indexOf(f),
      name: f.name || f.path || `archivo_${torrent.files.indexOf(f)}`,
      size: (f.length / 1048576).toFixed(1) + ' MB',
      sizeBytes: f.length
    }));

  // Fallback: si no hay videos reconocidos, tratar archivos grandes (>50 MB) como video
  if (videos.length === 0 && torrent.files.length > 0) {
    console.warn(`[WebTorrent] No se detectaron videos por extensión en "${torrent.name}". Usando fallback de archivos grandes.`);
    videos = torrent.files
      .filter(f => f.length > 50 * 1024 * 1024)
      .sort((a, b) => b.length - a.length)
      .map(f => ({
        index: torrent.files.indexOf(f),
        name: f.name || f.path || `archivo_${torrent.files.indexOf(f)}`,
        size: (f.length / 1048576).toFixed(1) + ' MB',
        sizeBytes: f.length
      }));
  }

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

  // Priorizar las piezas de este archivo para streaming más ágil
  file.select();

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
// dataSaver=true: re-codifica video a 720p ~1.8 Mbps (ahorro ~10x datos)
// dataSaver=false: copia video sin re-codificar, solo convierte audio a AAC
async function streamFileTranscoded(magnet, fileIndex, res, dataSaver = false) {
  const torrent = await getOrAddTorrent(magnet);
  const file = torrent.files[fileIndex];
  if (!file) throw new Error(`File index ${fileIndex} not found in torrent`);

  file.select(); // priorizar piezas de este archivo

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Transfer-Encoding': 'chunked',
    'Cache-Control': 'no-store',
    ...getCorsHeadersForRequest(res.req)
  });

  // analyzeduration/probesize: crítico al leer desde pipe — da tiempo a FFmpeg
  // para detectar el codec de audio antes de iniciar la codificación.
  // map 0:v:0 / 0:a:0? — mapeo explícito de streams; '?' hace el audio opcional
  // (no falla si el archivo no tiene pista de audio).
  const commonProbe = [
    '-analyzeduration', '20000000',  // 20 s de análisis
    '-probesize',       '20000000',  // 20 MB de sondeo
  ];

  const ffmpegArgs = dataSaver ? [
    ...commonProbe,
    '-i', 'pipe:0',
    '-map', '0:v:0',
    '-map', '0:a:0?',
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '28',
    '-maxrate', '1800k',
    '-bufsize', '3600k',
    '-vf', 'scale=-2:720',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    'pipe:1'
  ] : [
    ...commonProbe,
    '-i', 'pipe:0',
    '-map', '0:v:0',            // primer stream de video
    '-map', '0:a:0?',           // primer stream de audio (opcional)
    '-c:v', 'copy',             // copia video sin re-codificar
    '-c:a', 'aac',              // convierte audio (AC3/DTS/EAC3/TrueHD…) → AAC
    '-b:a', '192k',
    '-ac', '2',                 // stereo (downmix 5.1/7.1)
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
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
