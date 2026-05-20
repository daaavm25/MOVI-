// services/jackettService.js
const axios = require('axios');

function getRequiredEnv(name) {
  const value = String(process.env[name] || '').trim();
  if (!value) {
    throw new Error(`Variable de entorno requerida no configurada: ${name}`);
  }
  return value;
}

const JACKETT_URL = getRequiredEnv('JACKETT_URL');
const JACKETT_API_KEY = process.env.JACKETT_API_KEY;
const TMDB_BASE_URL = getRequiredEnv('TMDB_BASE_URL');
const TMDB_API_KEY = String(process.env.TMDB_API_KEY || '').trim();

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
      params: { api_key: TMDB_API_KEY, language: 'en', append_to_response: 'external_ids' },
      timeout: 5000
    });
    const d = res.data;
    const info = {
      englishTitle: d.title || '',
      originalTitle: d.original_title || '',
      year: d.release_date ? d.release_date.slice(0, 4) : '',
      imdbId: d.external_ids?.imdb_id || d.imdb_id || ''
    };
    console.log(`[TMDB] ID ${tmdbId} → en: "${info.englishTitle}", orig: "${info.originalTitle}", year: ${info.year}, imdb: ${info.imdbId}`);
    _tmdbCache.set(tmdbId, info);
    return info;
  } catch (err) {
    console.log(`[TMDB] Fetch failed for ${tmdbId}: ${err.message}`);
    return null;
  }
}

// Search TMDB by title to resolve English title when no tmdbId is available
const _tmdbSearchCache = new Map();

async function searchTmdbByTitle(title, year) {
  if (!TMDB_API_KEY || !title) return null;
  const cacheKey = `${title}|${year}`;
  if (_tmdbSearchCache.has(cacheKey)) return _tmdbSearchCache.get(cacheKey);

  try {
    const params = { api_key: TMDB_API_KEY, query: title, language: 'en' };
    if (year) params.year = year;
    const res = await axios.get(`${TMDB_BASE_URL}/search/movie`, { params, timeout: 5000 });
    const results = res.data?.results || [];
    if (results.length === 0) { _tmdbSearchCache.set(cacheKey, null); return null; }
    const best = results[0];
    let imdbId = '';
    try {
      const extRes = await axios.get(`${TMDB_BASE_URL}/movie/${best.id}/external_ids`, {
        params: { api_key: TMDB_API_KEY }, timeout: 5000
      });
      imdbId = extRes.data?.imdb_id || '';
    } catch (_) {}
    const info = {
      englishTitle: best.title || '',
      originalTitle: best.original_title || '',
      year: best.release_date ? best.release_date.slice(0, 4) : '',
      imdbId
    };
    console.log(`[TMDB] Search "${title}" → en: "${info.englishTitle}", orig: "${info.originalTitle}", year: ${info.year}, imdb: ${info.imdbId}`);
    _tmdbSearchCache.set(cacheKey, info);
    return info;
  } catch (err) {
    console.log(`[TMDB] Search failed for "${title}": ${err.message}`);
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
  if (!JACKETT_API_KEY) {
    throw new Error('JACKETT_API_KEY no configurada. Define la variable para usar /api/torrent/search.');
  }

  const { lang, year: yearHint, tmdbId } = options;

  // 1. Resolve best title via TMDB
  let bestTitle = query;
  let year = yearHint || '';
  let imdbId = '';
  const tmdbInfo = await resolveTmdbInfo(tmdbId);
  if (tmdbInfo) {
    bestTitle = tmdbInfo.englishTitle || tmdbInfo.originalTitle || query;
    if (!year) year = tmdbInfo.year;
    imdbId = tmdbInfo.imdbId || '';
  } else if (TMDB_API_KEY) {
    const searchInfo = await searchTmdbByTitle(query, year);
    if (searchInfo && searchInfo.englishTitle && searchInfo.englishTitle.toLowerCase() !== query.toLowerCase()) {
      bestTitle = searchInfo.englishTitle;
      if (!year) year = searchInfo.year;
    }
    if (searchInfo?.imdbId) imdbId = searchInfo.imdbId;
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
      break;
    }
    console.log(`[Torrent] ✗ "${searchQuery}" → 0 resultados, probando siguiente...`);
  }

  // 4. Phase 4 fallback: Torrentio (works from cloud IPs, requires IMDB ID)
  if (allResults.length === 0 && imdbId) {
    try {
      console.log(`[Torrent] Fase 4: Torrentio (IMDB: ${imdbId})...`);
      const torrentioResults = await _searchTorrentio(imdbId);
      if (torrentioResults.length > 0) {
        console.log(`[Torrent] Torrentio encontró ${torrentioResults.length} resultados`);
        allResults.push(...torrentioResults);
      }
    } catch (err) {
      console.log(`[Torrent] Torrentio falló: ${err.message}`);
    }
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

// ─── Individual provider functions ───────────────────────────────

const MAGNET_TRACKERS = [
  'udp://tracker.opentrackr.org:1337/announce',
  'udp://open.stealth.si:80/announce',
  'udp://tracker.torrent.eu.org:451/announce',
  'udp://tracker.bittor.pw:1337/announce',
  'udp://public.popcorn-tracker.org:6969/announce',
  'udp://tracker.dler.org:6969/announce',
  'udp://exodus.desync.com:6969',
  'udp://open.demonii.com:1337/announce'
];
const TRACKERS_STR = MAGNET_TRACKERS.map(t => `&tr=${encodeURIComponent(t)}`).join('');

async function _resolveMagnetFromLink(link) {
  try {
    const resp = await axios.get(link, {
      maxRedirects: 0,
      validateStatus: s => s >= 200 && s < 400,
      timeout: 6000
    });
    const loc = resp.headers?.location;
    if (loc && loc.startsWith('magnet:')) return loc;
  } catch (e) {
    const loc = e.response?.headers?.location;
    if (loc && loc.startsWith('magnet:')) return loc;
  }
  return null;
}

async function _searchJackett(query) {
  if (!JACKETT_API_KEY) return [];
  const url = `${JACKETT_URL}/api/v2.0/indexers/all/results`;
  const response = await axios.get(url, {
    params: { Query: query, apikey: JACKETT_API_KEY },
    timeout: 15000,
  });
  if (response.data && Array.isArray(response.data.Results) && response.data.Results.length > 0) {
    const results = response.data.Results.map(r => {
      const sizeBytes = r.Size;
      let sizeStr = '';
      if (typeof sizeBytes === 'number' && sizeBytes > 0) {
        if (sizeBytes >= 1e9) sizeStr = (sizeBytes / 1e9).toFixed(2) + ' GB';
        else sizeStr = (sizeBytes / 1e6).toFixed(0) + ' MB';
      } else if (typeof sizeBytes === 'string') {
        sizeStr = sizeBytes;
      }
      return {
        title: r.Title,
        seeds: r.Seeders,
        size: sizeStr,
        magnet: r.MagnetUri || null,
        link: r.Link,
        tracker: r.Tracker,
        provider: 'Jackett'
      };
    });

    // Resolve null magnets concurrently from Jackett download links (which redirect to magnet: URIs)
    const noMagnet = results.filter(r => !r.magnet && r.link && r.link.includes(JACKETT_URL.replace('http://', '')));
    if (noMagnet.length > 0) {
      await Promise.allSettled(
        noMagnet.map(async r => {
          const magnet = await _resolveMagnetFromLink(r.link);
          if (magnet) r.magnet = magnet;
        })
      );
      const resolved = noMagnet.filter(r => r.magnet).length;
      if (resolved > 0) console.log(`[Jackett] Resueltos ${resolved}/${noMagnet.length} magnets desde links de descarga`);
    }

    return results;
  }
  return [];
}

async function _searchTPB(query) {
  const apibayRes = await axios.get('https://apibay.org/q.php', {
    params: { q: query },
    timeout: 10000
  });
  const data = apibayRes.data;
  if (!Array.isArray(data) || data.length === 0 || data[0].id === '0') return [];
  return data
    .filter(r => r.id !== '0' && parseInt(r.seeders) > 0)
    .slice(0, 30)
    .map(r => ({
      title: r.name,
      seeds: parseInt(r.seeders),
      size: formatBytes(parseInt(r.size)),
      magnet: `magnet:?xt=urn:btih:${r.info_hash}&dn=${encodeURIComponent(r.name)}${TRACKERS_STR}`,
      link: `https://apibay.org/description.php?id=${r.id}`,
      tracker: 'The Pirate Bay',
      provider: 'The Pirate Bay'
    }));
}

async function _searchTorrentSearchApi(query) {
  if (!TorrentSearchApi) {
    TorrentSearchApi = (await import('torrent-search-api')).default;
    for (const provider of ['1337x', 'ThePirateBay', 'LimeTorrents', 'TorrentGalaxy']) {
      try { TorrentSearchApi.enableProvider(provider); } catch (_) { /* provider not available */ }
    }
  }
  const results = await TorrentSearchApi.search(query, 'Movies', 20);
  if (!results || results.length === 0) return [];
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

async function _searchYTS(query) {
  const YTS_DOMAINS = ['yts.mx', 'yts.torrentbay.st', 'yts.rs'];
  for (const domain of YTS_DOMAINS) {
    try {
      const ytsRes = await axios.get(`https://${domain}/api/v2/list_movies.json`, {
        params: { query_term: query, limit: 10 },
        timeout: 8000
      });
      const movies = ytsRes.data?.data?.movies || [];
      let torrents = [];
      for (const movie of movies) {
        if (movie.torrents && Array.isArray(movie.torrents)) {
          for (const t of movie.torrents) {
            const hash = t.hash || '';
            torrents.push({
              title: `${movie.title} (${movie.year}) [${t.quality}]`,
              seeds: t.seeds,
              size: t.size,
              magnet: hash
                ? `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(movie.title)}${TRACKERS_STR}`
                : t.url,
              link: t.url,
              tracker: 'YTS',
              provider: 'YTS'
            });
          }
        }
      }
      if (torrents.length > 0) return torrents;
    } catch { /* try next domain */ }
  }
  return [];
}

async function _searchTorrentio(imdbId) {
  if (!imdbId) return [];
  const res = await axios.get(`https://torrentio.strem.fun/stream/movie/${imdbId}.json`, {
    timeout: 15000
  });
  const streams = res.data?.streams || [];
  if (streams.length === 0) return [];
  return streams.map(s => {
    const hash = s.infoHash || '';
    const filename = s.behaviorHints?.filename || '';
    const title = s.title || '';
    const name = s.name || '';
    const displayTitle = filename || title.split('\n').slice(1).join(' ').trim() || name;
    const seedMatch = title.match(/👤\s*(\d+)/);
    const seeds = seedMatch ? parseInt(seedMatch[1]) : 0;
    const sizeMatch = title.match(/💾\s*([\d.]+\s*(?:GB|MB|TB))/);
    const size = sizeMatch ? sizeMatch[1] : '';
    return {
      title: displayTitle,
      seeds,
      size,
      magnet: hash ? `magnet:?xt=urn:btih:${hash}&dn=${encodeURIComponent(displayTitle)}${TRACKERS_STR}` : null,
      link: null,
      tracker: 'Torrentio',
      provider: 'Torrentio'
    };
  }).filter(r => r.magnet);
}

// ─── Main provider orchestrator ──────────────────────────────────

async function _searchAllProviders(query) {
  let allResults = [];

  // Phase 1: Search Jackett + TPB in parallel (fastest & most reliable)
  const phase1 = await Promise.allSettled([
    _searchJackett(query).catch(err => { console.log(`[Torrent] Jackett falló: ${err.message}`); return []; }),
    _searchTPB(query).catch(err => { console.log(`[Torrent] TPB falló: ${err.message}`); return []; }),
  ]);

  for (const result of phase1) {
    if (result.status === 'fulfilled' && result.value.length > 0) {
      const src = result.value[0].provider;
      console.log(`[Torrent] ${src} encontró ${result.value.length} resultados`);
      allResults.push(...result.value);
    }
  }

  // If we got results from phase 1, return them combined
  if (allResults.length > 0) {
    console.log(`[Torrent] Fase 1 (Jackett+TPB): ${allResults.length} resultados totales`);
    return allResults;
  }

  // Phase 2: torrent-search-api (1337x, LimeTorrents, TorrentGalaxy)
  try {
    console.log('[Torrent] Fase 2: torrent-search-api (1337x, LimeTorrents, TorrentGalaxy)...');
    const tsaResults = await _searchTorrentSearchApi(query);
    if (tsaResults.length > 0) {
      console.log(`[Torrent] torrent-search-api encontró ${tsaResults.length} resultados`);
      return tsaResults;
    }
  } catch (err) {
    console.log(`[Torrent] torrent-search-api falló: ${err.message}`);
  }

  // Phase 3: YTS API (multiple domains)
  try {
    console.log('[Torrent] Fase 3: YTS API...');
    const ytsResults = await _searchYTS(query);
    if (ytsResults.length > 0) {
      console.log(`[Torrent] YTS encontró ${ytsResults.length} resultados`);
      return ytsResults;
    }
  } catch (err) {
    console.log(`[Torrent] YTS falló: ${err.message}`);
  }

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
