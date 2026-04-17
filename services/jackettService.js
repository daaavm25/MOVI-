// services/jackettService.js
const axios = require('axios');

const JACKETT_URL = process.env.JACKETT_URL || 'http://localhost:9117';
const JACKETT_API_KEY = process.env.JACKETT_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_API_KEY = String(process.env.TMDB_API_KEY || '').trim();

if (!JACKETT_API_KEY) {
  throw new Error('JACKETT_API_KEY is not set in environment variables');
}

const LANG_SEARCH_KEYWORDS = {
  'es-lat': ['latino', 'lat'],
  'es-es':  ['castellano', 'spanish'],
  'pt-br':  ['dublado', 'legendado'],
  'fr':     ['french', 'vff', 'truefrench'],
  'de':     ['german'],
  'it':     ['italian'],
  'ja':     ['japanese'],
  'ko':     ['korean'],
  'zh':     ['chinese'],
  'hi':     ['hindi'],
  'ru':     ['russian']
};

let TorrentSearchApi;

// ─── TMDB title resolution ───────────────────────────────────────
const _tmdbCache = new Map();

async function resolveTmdbInfo(tmdbId) {
  if (!tmdbId || !TMDB_API_KEY) return null;
  if (_tmdbCache.has(tmdbId)) return _tmdbCache.get(tmdbId);

  try {
    const res = await axios.get(`${TMDB_BASE_URL}/movie/${tmdbId}`, {
      params: { api_key: TMDB_API_KEY, language: 'en' },
      timeout: 5000
    });
    const d = res.data;
    const info = {
      englishTitle: d.title || '',
      originalTitle: d.original_title || '',
      year: d.release_date ? d.release_date.slice(0, 4) : ''
    };
    console.log(`[TMDB] ID ${tmdbId} → en: "${info.englishTitle}", orig: "${info.originalTitle}", year: ${info.year}`);
    _tmdbCache.set(tmdbId, info);
    return info;
  } catch (err) {
    console.log(`[TMDB] Fetch failed for ${tmdbId}: ${err.message}`);
    return null;
  }
}

// ─── Smart query generation ──────────────────────────────────────

function generateSearchQueries(title, year, lang) {
  const queries = [];
  if (!title) return queries;

  const clean = title.trim();

  // 1. Full title + year  (most specific)
  if (year) queries.push(`${clean} ${year}`);
  // 2. Full title alone
  queries.push(clean);
  // 3. Title without subtitle (everything after : or -)
  const simplified = clean.split(/[:\-–—]/)[0].trim();
  if (simplified && simplified !== clean && simplified.length > 3) {
    if (year) queries.push(`${simplified} ${year}`);
    queries.push(simplified);
  }
  // 4. Language-specific variant
  if (lang && lang !== 'all' && lang !== 'en' && LANG_SEARCH_KEYWORDS[lang]) {
    queries.push(`${clean} ${LANG_SEARCH_KEYWORDS[lang][0]}`);
  }

  // Deduplicate while preserving order
  return [...new Set(queries)];
}

// ─── Main search function ────────────────────────────────────────

async function searchTorrents(query, options = {}) {
  const { lang, year: yearHint, tmdbId } = options;

  // 1. Resolve best title via TMDB
  let bestTitle = query;
  let year = yearHint || '';
  const tmdbInfo = await resolveTmdbInfo(tmdbId);
  if (tmdbInfo) {
    bestTitle = tmdbInfo.englishTitle || tmdbInfo.originalTitle || query;
    if (!year) year = tmdbInfo.year;
  }

  // 2. Generate ordered list of search queries
  const queries = generateSearchQueries(bestTitle, year, lang);

  // Also add the original query (Spanish/local title) as a last resort
  if (query !== bestTitle) {
    queries.push(query);
  }

  console.log(`[Torrent] Search plan (${queries.length} queries): ${queries.map(q => `"${q}"`).join(' → ')}`);

  // 3. Try each query — stop once we get enough results
  let allResults = [];
  for (const searchQuery of queries) {
    const results = await _searchAllProviders(searchQuery);
    if (results.length > 0) {
      allResults.push(...results);
      console.log(`[Torrent] ✓ "${searchQuery}" → ${results.length} resultados. Deteniendo búsqueda.`);
      break; // We have results, no need to try more queries
    }
    console.log(`[Torrent] ✗ "${searchQuery}" → 0 resultados, probando siguiente...`);
  }

  // 4. Deduplicate by info_hash
  const seen = new Set();
  allResults = allResults.filter(r => {
    const hash = r.magnet ? (r.magnet.match(/btih:([a-fA-F0-9]{40})/i) || [])[1] : null;
    if (hash) {
      const lh = hash.toLowerCase();
      if (seen.has(lh)) return false;
      seen.add(lh);
    }
    return true;
  });

  // 5. STRICT TITLE RELEVANCE FILTER — only keep torrents that match the movie title
  const titleWords = extractTitleWords(bestTitle);
  if (titleWords.length > 0) {
    const beforeTitle = allResults.length;
    const titleMatched = allResults.filter(r => isTitleRelevant(r.title, titleWords, bestTitle));
    if (titleMatched.length > 0) {
      allResults = titleMatched;
      console.log(`[Torrent] Filtro título estricto: ${beforeTitle} → ${allResults.length} (descartados ${beforeTitle - allResults.length})`);
    } else {
      console.log(`[Torrent] Filtro título: 0 coincidencias estrictas de "${bestTitle}", mostrando todos`);
    }
  }

  // 6. Filter out obvious music/audio-only torrents (for a movie search)
  const MUSIC_AUDIO_RE = /\b(flac|mp3|aac|ogg|wav|alac|lossless|v0|cbr|vbr)\b|\d{3}[_\s]*kbps|beats[^\w]|discograph|album|vinyl|\bsingle\b|\bEP\b|PMEDIA|channel\s*neo/i;
  // Also check size — music albums are typically < 500 MB
  const MUSIC_SIZE_RE = /^(\d+(?:\.\d+)?)\s*(MB|GB)/i;
  const beforeMusic = allResults.length;
  const videoResults = allResults.filter(r => {
    const title = r.title || '';
    if (MUSIC_AUDIO_RE.test(title)) return false;
    // Size heuristic: if size is provided and very small (< 200MB), likely music
    if (r.size) {
      const sizeMatch = r.size.match(MUSIC_SIZE_RE);
      if (sizeMatch) {
        const val = parseFloat(sizeMatch[1]);
        const unit = sizeMatch[2].toUpperCase();
        const mb = unit === 'GB' ? val * 1024 : val;
        // Very small torrents with band-like names are likely music
        if (mb < 200 && !/720p|1080p|2160p|4k|webrip|bluray|brrip|hdtv|dvdrip|cam|hdrip/i.test(title)) {
          return false;
        }
      }
    }
    return true;
  });
  if (videoResults.length > 0) {
    allResults = videoResults;
    if (beforeMusic !== allResults.length) {
      console.log(`[Torrent] Filtro música: removidos ${beforeMusic - allResults.length} torrents de audio`);
    }
  }

  // 6. Tag each result with detected language and quality
  allResults = allResults.map(r => ({
    ...r,
    detectedLang: detectLanguage(r.title),
    detectedQuality: detectQuality(r.title)
  }));

  // 7. Strict language filter on server side
  if (lang && lang !== 'all') {
    const langFiltered = allResults.filter(r => r.detectedLang === lang);
    if (langFiltered.length > 0) {
      console.log(`[Torrent] Filtro idioma "${lang}": ${langFiltered.length}/${allResults.length} coinciden`);
      allResults = langFiltered;
    } else {
      console.log(`[Torrent] Filtro idioma "${lang}": 0 coincidencias exactas, mostrando todos marcados`);
    }
  }

  // 8. Sort by seeds
  allResults.sort((a, b) => (b.seeds || 0) - (a.seeds || 0));

  return allResults;
}

// ─── Strict title relevance matching ─────────────────────────────

const STOP_WORDS = new Set(['the', 'a', 'an', 'of', 'and', 'in', 'to', 'for', 'is', 'on', 'at', 'by', 'or', 'vs', 'de', 'la', 'el', 'los', 'las', 'un', 'una', 'del', 'y', 'en']);

function extractTitleWords(title) {
  if (!title) return [];
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter(w => w.length > 1 && !STOP_WORDS.has(w));
}

function isTitleRelevant(torrentName, titleWords, fullTitle) {
  if (!torrentName || titleWords.length === 0) return false;
  const tn = torrentName.toLowerCase().replace(/[._\-]/g, ' ');

  // Quick check: does the full title appear (ignoring punctuation)?
  const cleanFull = fullTitle.toLowerCase().replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ').trim();
  const cleanTorrent = tn.replace(/[^a-z0-9\s]/gi, ' ').replace(/\s+/g, ' ');
  if (cleanTorrent.includes(cleanFull)) return true;

  // Word overlap: count how many title words appear in the torrent name
  let matches = 0;
  for (const word of titleWords) {
    // Use word boundary for short words to avoid partial matches
    const pattern = word.length <= 3
      ? new RegExp(`\\b${word}\\b`, 'i')
      : new RegExp(word, 'i');
    if (pattern.test(tn)) matches++;
  }

  // Require at least 75% of significant title words to match
  const threshold = Math.max(1, Math.ceil(titleWords.length * 0.75));
  return matches >= threshold;
}

// ─── Language detection from torrent name ────────────────────────

const LANG_DETECT_RULES = [
  { lang: 'es-lat', patterns: [/latino/i, /\blat\b/i, /spa.*lat/i, /dual.*lat/i] },
  { lang: 'es-es',  patterns: [/castellano/i, /\bcast\b/i, /spanish.*spain/i, /spa(?!.*lat)/i] },
  { lang: 'pt-br',  patterns: [/dublado/i, /legendado/i, /portuguese/i, /\bptbr\b/i, /\bpt-br\b/i] },
  { lang: 'fr',     patterns: [/french/i, /\bvff\b/i, /\bvostfr\b/i, /truefrench/i, /\bmulti\b.*\bfr\b/i] },
  { lang: 'de',     patterns: [/german/i, /deutsch/i] },
  { lang: 'it',     patterns: [/italian/i, /italiano/i] },
  { lang: 'hi',     patterns: [/hindi/i, /\bhin\b/i] },
  { lang: 'ru',     patterns: [/russian/i, /\brus\b/i] },
  { lang: 'ja',     patterns: [/japanese/i, /\bjpn\b/i] },
  { lang: 'ko',     patterns: [/korean/i, /\bkor\b/i] },
  { lang: 'zh',     patterns: [/chinese/i, /mandarin/i] },
  { lang: 'dual',   patterns: [/dual.*audio/i, /\bdual\b/i, /multi/i] },
];

function detectLanguage(title) {
  if (!title) return 'en';
  const t = title;
  for (const rule of LANG_DETECT_RULES) {
    if (rule.patterns.some(p => p.test(t))) return rule.lang;
  }
  return 'en'; // Default: English (most torrents without language tag are English)
}

// ─── Quality detection from torrent name ─────────────────────────

function detectQuality(title) {
  if (!title) return 'unknown';
  const t = title.toLowerCase();
  if (/2160p|4k|uhd/i.test(t)) return '4k';
  if (/1080p|fullhd|fhd/i.test(t)) return '1080p';
  if (/720p|hd(?!r)/i.test(t)) return '720p';
  if (/480p|sd/i.test(t)) return '480p';
  if (/cam|hdts|telesync|telecine/i.test(t)) return 'cam';
  return 'unknown';
}

async function _searchAllProviders(query) {

  // 1. Intentar Jackett
  try {
    console.log('[Torrent] Buscando en Jackett...');
    const url = `${JACKETT_URL}/api/v2.0/indexers/all/results`;
    const response = await axios.get(url, {
      params: {
        Query: query,
        apikey: JACKETT_API_KEY,
      },
      timeout: 10000, // 10s timeout
    });

    if (response.data && Array.isArray(response.data.Results) && response.data.Results.length > 0) {
      console.log(`[Torrent] Jackett encontró ${response.data.Results.length} resultados`);
      return response.data.Results.map(r => ({
        title: r.Title,
        seeds: r.Seeders,
        size: r.Size,
        magnet: r.MagnetUri,
        link: r.Link,
        tracker: r.Tracker,
        provider: 'Jackett'
      }));
    }
  } catch (err) {
    console.log(`[Torrent] Jackett falló: ${err.message}`);
    // Si Jackett falla, sigue con otros proveedores
  }

  // 2. Fallback: apibay.org (proxy público de The Pirate Bay) — acceso directo sin Cloudflare
  try {
    console.log('[Torrent] Buscando en apibay.org (TPB proxy)...');
    const apibayRes = await axios.get('https://apibay.org/q.php', {
      params: { q: query },
      timeout: 10000
    });
    const apibayResults = apibayRes.data;
    if (Array.isArray(apibayResults) && apibayResults.length > 0 && apibayResults[0].id !== '0') {
      const trackers = [
        'udp://tracker.opentrackr.org:1337/announce',
        'udp://open.stealth.si:80/announce',
        'udp://tracker.torrent.eu.org:451/announce',
        'udp://tracker.bittor.pw:1337/announce',
        'udp://public.popcorn-tracker.org:6969/announce',
        'udp://tracker.dler.org:6969/announce',
        'udp://exodus.desync.com:6969',
        'udp://open.demonii.com:1337/announce'
      ];
      const trackersStr = trackers.map(t => `&tr=${encodeURIComponent(t)}`).join('');
      const mapped = apibayResults
        .filter(r => r.id !== '0' && parseInt(r.seeders) > 0)
        .slice(0, 20)
        .map(r => ({
          title: r.name,
          seeds: parseInt(r.seeders),
          size: formatBytes(parseInt(r.size)),
          magnet: `magnet:?xt=urn:btih:${r.info_hash}&dn=${encodeURIComponent(r.name)}${trackersStr}`,
          link: `https://apibay.org/description.php?id=${r.id}`,
          tracker: 'The Pirate Bay',
          provider: 'The Pirate Bay'
        }));
      if (mapped.length > 0) {
        console.log(`[Torrent] apibay encontró ${mapped.length} resultados`);
        return mapped;
      }
    }
    console.log('[Torrent] apibay no encontró resultados');
  } catch (err) {
    console.log(`[Torrent] apibay falló: ${err.message}`);
  }

  // 3. Fallback: torrent-search-api con múltiples proveedores
  try {
    console.log('[Torrent] Buscando en torrent-search-api (1337x, YTS, TPB, etc.)...');
    if (!TorrentSearchApi) {
      TorrentSearchApi = (await import('torrent-search-api')).default;
      // Habilitar múltiples proveedores populares
      TorrentSearchApi.enableProvider('1337x');
      TorrentSearchApi.enableProvider('YTS');
      TorrentSearchApi.enableProvider('The Pirate Bay');
      TorrentSearchApi.enableProvider('LimeTorrents');
      TorrentSearchApi.enableProvider('TorrentGalaxy');
    }
    const results = await TorrentSearchApi.search(query, 'Movies', 20);
    console.log(`[Torrent] torrent-search-api encontró ${results ? results.length : 0} resultados`);
    if (results && results.length > 0) {
      return results.map(r => ({
        title: r.title,
        seeds: r.seeds,
        size: r.size,
        magnet: r.magnet,
        link: r.desc,
        tracker: r.provider,
        provider: r.provider
      }));
    }
  } catch (err) {
    console.log(`[Torrent] torrent-search-api falló: ${err.message}`);
    // Si torrent-search-api falla, sigue con YTS
  }

  // 4. Fallback: YTS API pública (solo películas)
  try {
    console.log('[Torrent] Buscando en YTS API...');
    const ytsRes = await axios.get(`https://yts.mx/api/v2/list_movies.json`, {
      params: { query_term: query, limit: 10 }
    });
    const movies = ytsRes.data && ytsRes.data.data && ytsRes.data.data.movies ? ytsRes.data.data.movies : [];
    // Extraer torrents de cada película
    let torrents = [];
    for (const movie of movies) {
      if (movie.torrents && Array.isArray(movie.torrents)) {
        for (const t of movie.torrents) {
          torrents.push({
            title: `${movie.title} (${movie.year}) [${t.quality}]`,
            seeds: t.seeds,
            size: t.size,
            magnet: t.url, // YTS da url .torrent, no magnet
            link: t.url,
            tracker: 'YTS',
            provider: 'YTS'
          });
        }
      }
    }
    if (torrents.length > 0) {
      console.log(`[Torrent] YTS API encontró ${torrents.length} resultados`);
      return torrents;
    }
    console.log('[Torrent] YTS API no encontró resultados');
  } catch (err) {
    console.log(`[Torrent] YTS API falló: ${err.message}`);
    // Si YTS falla, devolver vacío
  }

  // 5. Si todo falla, devolver vacío
  console.log('[Torrent] Ningún proveedor encontró resultados');
  return [];
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes)) return '';
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return (bytes / Math.pow(1024, i)).toFixed(1) + ' ' + sizes[i];
}

module.exports = { searchTorrents };
