// ====== MBFinanceMate server.js – FIXED v2 ======
// Fixes:
// 1. EIA_API_KEY → ENV.EIA_API_KEY (war undefinierte Variable)
// 2. Global Error Handler VOR app.listen verschoben
// 3. pct() Duplikat entfernt (war doppelt definiert)
// 4. fetchYahooHistory als Fallback in /api/market-cycles integriert
// 5. /api/quote/:ticker Endpoint für charts.js hinzugefügt
// 6. /api/news/portfolio nutzt jetzt 30-Tage-Filter (war 1 Jahr)

// ====== Load ENV ======
require('dotenv').config();
const trim = v => (v || '').trim();

const ENV = {
  POLY_STOCKS_KEY: trim(process.env.POLY_STOCKS_KEY),
  POLY_INDEX_KEY:  trim(process.env.POLY_INDEX_KEY),
  EIA_API_KEY:     trim(process.env.EIA_API_KEY),
  FRED_API_KEY:    trim(process.env.FRED_API_KEY),
  BLS_API_KEY:     trim(process.env.BLS_API_KEY),
  PORT:            Number(process.env.PORT ?? 3001)
};

console.log(
  '[KEY LEN] FRED:', ENV.FRED_API_KEY.length,
  '| EIA:', ENV.EIA_API_KEY.length
);

// ====== Imports ======
const path   = require('path');
const fs     = require('fs');
const crypto = require('crypto');

const express   = require('express');
const axios     = require('axios');
const helmet    = require('helmet');
const cors      = require('cors');
const rateLimit = require('express-rate-limit');

// ====== App ======
const app  = express();
const port = ENV.PORT;
console.log('🔧 ENV PORT =', process.env.PORT);

// ====== Key Checks ======
if (!ENV.POLY_STOCKS_KEY) {
  console.error('❌ POLY_STOCKS_KEY fehlt in .env');
  process.exit(1);
}
if (!ENV.POLY_INDEX_KEY) {
  console.warn('⚠️ POLY_INDEX_KEY fehlt – Indizes (z. B. VIX) nicht verfügbar');
}
if (!ENV.EIA_API_KEY) {
  console.warn('⚠️ EIA_API_KEY fehlt – Öl/Gas Inventories nicht verfügbar');
}

// ====== Security & Middleware ======
app.set('trust proxy', 1);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false
}));
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));

// ====== Static Files ======
const STATIC_DIR = path.join(__dirname, 'public');
console.log('🗂️ Static dir:', STATIC_DIR);

app.use(express.static(STATIC_DIR, {
  maxAge: '1h',
  etag: true,
  index: false
}));

app.get('/', (_req, res) =>
  res.sendFile(path.join(STATIC_DIR, 'index.html'))
);

// ====== Rate Limit (nur API) ======
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: req => req.ip
}));

// ============================================================
// ====== Utils & Cache =======================================
// ============================================================

const cache = new Map();

// ── Persistent disk cache (survives server restarts) ──────
const DISK_CACHE_FILE = path.join(__dirname, '.cache.json');
let diskCache = {};
try {
  if (fs.existsSync(DISK_CACHE_FILE)) {
    diskCache = JSON.parse(fs.readFileSync(DISK_CACHE_FILE, 'utf8'));
    // Prune expired on load
    const now = Date.now();
    Object.keys(diskCache).forEach(k => {
      if (diskCache[k].expires < now) delete diskCache[k];
    });
    console.log(`[CACHE] Loaded ${Object.keys(diskCache).length} entries from disk`);
  }
} catch(e) { diskCache = {}; }

let _diskSaveTimer = null;
function saveDiskCache() {
  if (_diskSaveTimer) return;
  _diskSaveTimer = setTimeout(() => {
    _diskSaveTimer = null;
    try { fs.writeFileSync(DISK_CACHE_FILE, JSON.stringify(diskCache)); } catch(e) {}
  }, 2000); // Debounce 2s
}

const cacheGet = key => {
  const now = Date.now();
  // Memory first
  const m = cache.get(key);
  if (m) {
    if (now < m.expires) return m.value;
    cache.delete(key);
  }
  // Disk fallback
  const d = diskCache[key];
  if (d && now < d.expires) {
    cache.set(key, d); // Promote to memory
    return d.value;
  }
  if (d) delete diskCache[key];
  return null;
};

const cacheSet = (key, value, ttlMs = 30_000) => {
  const entry = { value, expires: Date.now() + ttlMs };
  cache.set(key, entry);
  // Only persist longer-lived entries to disk (>= 5 minutes)
  if (ttlMs >= 300_000) {
    diskCache[key] = entry;
    saveDiskCache();
  }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, tries = 3) {
  let last;
  for (let i = 0; i < tries; i++) {
    try { return await fn(); }
    catch (e) { last = e; await sleep(300 * Math.pow(2, i)); }
  }
  throw last;
}

const fmtYMD = d => new Date(d).toISOString().slice(0, 10);

// FIX 3: pct() nur EINMAL definiert (war doppelt)
function pct(now, past) {
  if (now == null || past == null) return null;
  return ((now - past) / past) * 100;
}

async function cachedGetRaw(url, params = {}, ttlMs = 60_000, method = 'get') {
  const key = `RAW:${method}:${url}:${JSON.stringify(params)}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const cfg = {
    timeout: 12_000,
    headers: { 'User-Agent': 'MBFinanceMate/1.0' }
  };

  const resp = method === 'post'
    ? await axios.post(url, params, cfg)
    : await axios.get(url, { params, ...cfg });

  cacheSet(key, resp.data, ttlMs);
  return resp.data;
}

// ====== Concurrency Limiter ======
function pLimit(concurrency) {
  const queue = [];
  let active = 0;

  const next = () => {
    active--;
    if (queue.length) queue.shift()();
  };

  return fn => new Promise((res, rej) => {
    const run = () => {
      active++;
      Promise.resolve().then(fn).then(res, rej).finally(next);
    };
    active < concurrency ? run() : queue.push(run);
  });
}

const limit4  = pLimit(12);  // War 4 → jetzt 12 gleichzeitig (3x schneller)

// ============================================================
// ====== Polygon Client ======================================
// ============================================================

function makePolygonClient(apiKey) {
  return axios.create({
    baseURL: 'https://api.polygon.io',
    timeout: 10_000,
    headers: {
      'Accept-Encoding': 'gzip, deflate, compress',
      'User-Agent': 'MBFinanceMate/1.0'
    },
    params: { apikey: apiKey }
  });
}

const polygonStocks = makePolygonClient(ENV.POLY_STOCKS_KEY);
const polygonIndex  = ENV.POLY_INDEX_KEY
  ? makePolygonClient(ENV.POLY_INDEX_KEY)
  : null;

async function polygonGET(client, url, params = {}, ttlMs = 300_000) {  // War 30s → jetzt 5min
  const key = `GET:${url}:${JSON.stringify(params)}:${client.defaults.params.apikey}`;
  const hit = cacheGet(key);
  if (hit) return hit;

  const res = await withRetry(() => client.get(url, { params }));
  cacheSet(key, res.data, ttlMs);
  return res.data;
}

// ============================================================
// ====== Market Data Helpers =================================
// ============================================================

async function getQuotePolygon(ticker) {
  try {
    const data = await polygonGET(
      polygonStocks,
      `/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`
    );
    const r = data?.results?.[0];
    if (r) return { price: r.c, source: 'polygon' };
  } catch (e) {
    console.error('Polygon quote error', ticker, e.message);
  }
  return { price: null, source: 'polygon' };
}

async function resolveToTicker(input) {
  if (!input) return null;
  const s = String(input).trim();
  if (/^[A-Za-z.\-]{1,10}$/.test(s)) return s.toUpperCase();

  try {
    const q = s.toUpperCase();
    const isISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(q);
    const params = isISIN
      ? { search: q, market: 'stocks', limit: 1 }
      : { search: s, market: 'stocks', limit: 1 };

    const data = await polygonGET(polygonStocks, '/v3/reference/tickers', params, 120_000);
    return data?.results?.[0]?.ticker?.toUpperCase() || null;
  } catch (e) {
    console.error('resolveToTicker error', s, e.message);
    return null;
  }
}

async function getDividendTTM(ticker) {
  try {
    const twoYearsAgo = fmtYMD(Date.now() - 730 * 24 * 3600 * 1000);
    const today = fmtYMD(Date.now());

    const data = await polygonGET(
      polygonStocks,
      '/v3/reference/dividends',
      {
        ticker: ticker.toUpperCase(),
        order: 'desc',
        limit: 500,
        ex_dividend_date_gte: twoYearsAgo,
        ex_dividend_date_lte: today
      },
      6 * 3600_000  // 6 Stunden Cache – Dividenden ändern sich nicht täglich
    );

    const rows = (data?.results || [])
      .filter(d => d?.cash_amount != null && d?.ex_dividend_date)
      .map(d => ({ exDate: d.ex_dividend_date, amount: Number(d.cash_amount) }));

    const cutoff = Date.now() - 365 * 24 * 3600 * 1000;
    const dps_ttm = +rows
      .filter(r => new Date(r.exDate).getTime() >= cutoff)
      .reduce((s, r) => s + r.amount, 0)
      .toFixed(4);

    return { dps_ttm, samples: rows.length, history: rows };
  } catch (e) {
    console.error('getDividendTTM error', ticker, e.message);
    return { dps_ttm: 0, samples: 0, history: [] };
  }
}

// FIX 4: Yahoo Fallback (sauber definiert, wird in market-cycles genutzt)
async function fetchYahooHistory(ticker, days = 120) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?range=${days}d&interval=1d`;
    const r = await axios.get(url, { timeout: 8000, headers: { 'User-Agent': 'MBFinanceMate/1.0' } });

    const result = r.data?.chart?.result?.[0];
    if (!result) return null;

    const closes = result.indicators?.quote?.[0]?.close;
    if (!Array.isArray(closes)) return null;

    const valid = closes.filter(v => typeof v === 'number' && isFinite(v));
    if (valid.length < 65) return null;

    const last = valid.length - 1;
    return {
      price:    valid[last],
      close1d:  valid[last - 1]  ?? null,
      close30d: valid[last - 22] ?? null, // ~1 Monat
      close90d: valid[last - 63] ?? null  // ~3 Monate
    };
  } catch (e) {
    console.error('Yahoo fallback error:', ticker, e.message);
    return null;
  }
}

// ============================================================
// ====== Portfolio (Tab 1) ===================================
// ============================================================

const filePath = path.resolve(process.cwd(), 'portfolio.json');

function loadPortfolio() {
  if (!fs.existsSync(filePath)) return [];
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return Array.isArray(json.portfolio) ? json.portfolio : [];
}

function savePortfolio(items) {
  fs.writeFileSync(filePath, JSON.stringify({ portfolio: items }, null, 2), 'utf8');
}

function ensureIds(items) {
  let changed = false;
  const out = items.map(it => {
    if (!it.id) { it.id = crypto.randomUUID(); changed = true; }
    return it;
  });
  return { out, changed };
}

const PORTFOLIO_FIELDS = ['name','isin','ticker','shares','avgPrice','note','divPaidTotal','yocBroker','divIncomeAnnual'];

function normalizeField(k, v) {
  if (k === 'ticker') return String(v || '').toUpperCase().trim();
  if (['shares','avgPrice','divPaidTotal','yocBroker','divIncomeAnnual'].includes(k)) return Number(v || 0);
  return String(v || '').trim();
}

function loadPortfolioTickers() {
  if (!fs.existsSync(filePath)) return [];
  const json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const items = Array.isArray(json.portfolio) ? json.portfolio : [];
  return [...new Set(items.map(it => (it.ticker || '').trim().toUpperCase()).filter(Boolean))];
}

// ---------- Add (mit Upsert: gleicher Ticker → überschreiben) ----------
app.post('/api/portfolio/add', async (req, res) => {
  try {
    const items = loadPortfolio();
    const it = req.body || {};

    const newTicker = normalizeField('ticker', it.ticker);

    const row = {
      name:            normalizeField('name',            it.name),
      isin:            normalizeField('isin',            it.isin),
      ticker:          newTicker,
      shares:          normalizeField('shares',          it.shares),
      avgPrice:        normalizeField('avgPrice',        it.avgPrice),
      note:            normalizeField('note',            it.note),
      divPaidTotal:    normalizeField('divPaidTotal',    it.divPaidTotal),
      yocBroker:       normalizeField('yocBroker',       it.yocBroker),
      divIncomeAnnual: normalizeField('divIncomeAnnual', it.divIncomeAnnual),
    };

    if (!row.shares || !row.avgPrice || (!row.ticker && !row.isin && !row.name)) {
      return res.status(400).json({
        error: 'shares, avgPrice und mindestens eins von (ticker|isin|name) erforderlich'
      });
    }

    // UPSERT: existiert Ticker bereits → Zeile aktualisieren statt neu anlegen
    const existingIdx = newTicker
      ? items.findIndex(p => (p.ticker || '').toUpperCase() === newTicker)
      : -1;

    if (existingIdx !== -1) {
      // Vorhandene ID behalten, alle anderen Felder überschreiben
      items[existingIdx] = { ...items[existingIdx], ...row };
      savePortfolio(items);
      console.log(`[Portfolio] Upsert: ${newTicker} aktualisiert`);
      res.json({ ok: true, action: 'updated', item: items[existingIdx] });
    } else {
      // Neue Position anlegen
      const newRow = { id: crypto.randomUUID(), ...row };
      items.push(newRow);
      savePortfolio(items);
      console.log(`[Portfolio] Add: ${newTicker || row.name} hinzugefügt`);
      res.json({ ok: true, action: 'added', item: newRow });
    }
  } catch (e) {
    console.error('portfolio/add error', e?.message);
    res.status(500).json({ error: 'Add failed' });
  }
});

// ---------- Update ----------
async function updatePortfolioItem(req, res) {
  try {
    const id = String(req.params.id);
    const items = loadPortfolio();
    const idx = items.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });

    for (const k of Object.keys(req.body || {})) {
      if (PORTFOLIO_FIELDS.includes(k)) {
        items[idx][k] = normalizeField(k, req.body[k]);
      }
    }

    savePortfolio(items);
    res.json({ ok: true, updated: items[idx] });
  } catch (e) {
    console.error('portfolio update error', e?.message);
    res.status(500).json({ error: 'Update failed' });
  }
}

app.put('/api/portfolio/:id', updatePortfolioItem);
app.patch('/api/portfolio/:id', updatePortfolioItem);

// ---------- Delete ----------
app.delete('/api/portfolio/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const items = loadPortfolio();
    const idx = items.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });

    const removed = items.splice(idx, 1)[0];
    savePortfolio(items);
    res.json({ ok: true, removed });
  } catch (e) {
    console.error('portfolio delete error', e?.message);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// ---------- Get Portfolio ----------
app.get('/api/portfolio', async (_req, res) => {
  try {
    const raw = loadPortfolio();
    const { out: items, changed } = ensureIds(raw);
    if (changed) savePortfolio(items);

    const enriched = await Promise.all(
      items.map(it => limit4(async () => {
        const ticker =
          it.ticker ||
          (it.isin && await resolveToTicker(it.isin)) ||
          (it.name && await resolveToTicker(it.name));

        if (!ticker) return { ...it, error: 'Ticker konnte nicht aufgelöst werden' };

        // Quote + Dividend PARALLEL fetchen (war sequenziell → 2x schneller pro Position)
        const [q, div] = await Promise.all([
          getQuotePolygon(ticker),
          getDividendTTM(ticker)
        ]);

        const shares   = Number(it.shares || 0);
        const avgPrice = Number(it.avgPrice || 0);
        const curPrice = Number(q.price || 0);

        const costBasis     = +(avgPrice * shares).toFixed(2);
        const positionValue = +(curPrice * shares).toFixed(2);
        const dps           = Number(div.dps_ttm || 0);

        // Fallback: wenn Polygon keine Dividenden hat (viele non-US Ticker)
        // → nutze yocBroker und divIncomeAnnual aus portfolio.json
        const hasPolygonDiv = dps > 0;
        const brokerYOC     = Number(it.yocBroker || 0);
        const brokerIncome  = Number(it.divIncomeAnnual || 0);

        // DPS aus Broker-Daten zurückrechnen wenn kein Polygon-Wert
        const dpsFinal = hasPolygonDiv
          ? dps
          : (shares > 0 && brokerIncome > 0 ? brokerIncome / shares : 0);

        const yocFinal = hasPolygonDiv
          ? (avgPrice > 0 ? +((dps / avgPrice) * 100).toFixed(2) : null)
          : (brokerYOC > 0 ? brokerYOC : null);

        const yieldFinal = hasPolygonDiv
          ? (curPrice > 0 ? +((dps / curPrice) * 100).toFixed(2) : null)
          : (curPrice > 0 && dpsFinal > 0 ? +((dpsFinal / curPrice) * 100).toFixed(2) : null);

        return {
          ...it,
          ticker,
          currentPrice:         curPrice,
          costBasis,
          positionValue,
          gainAbs:              +(positionValue - costBasis).toFixed(2),
          gainPct:              costBasis > 0 ? +(((positionValue - costBasis) / costBasis) * 100).toFixed(2) : null,
          dividendPerShareTTM:  dpsFinal,
          dividendIncomeAnnual: hasPolygonDiv ? +(dps * shares).toFixed(2) : brokerIncome,
          yocPct:               yocFinal,
          currentYieldPct:      yieldFinal,
          dividendSamples:      div.samples,
          dividendHistory:      div.history,
          divSource:            hasPolygonDiv ? 'polygon' : (brokerYOC > 0 ? 'broker' : 'none')
        };
      }))
    );

    const totals = {
      portfolioValue: +enriched.reduce((s, r) => s + (r.positionValue || 0), 0).toFixed(2),
      costBasis:      +enriched.reduce((s, r) => s + (r.costBasis || 0), 0).toFixed(2),
      incomeAnnual:   +enriched.reduce((s, r) => s + (r.dividendIncomeAnnual || 0), 0).toFixed(2)
    };

    totals.gainAbs = +(totals.portfolioValue - totals.costBasis).toFixed(2);
    totals.gainPct = totals.costBasis > 0
      ? +(((totals.portfolioValue - totals.costBasis) / totals.costBasis) * 100).toFixed(2)
      : null;

    res.json({ portfolio: enriched, totals });
  } catch (e) {
    console.error('portfolio error', e?.message);
    res.status(500).json({ error: 'Error loading portfolio' });
  }
});

// ============================================================
// ====== FIX 5: /api/quote/:ticker (NEU für charts.js) =======
// ============================================================

app.get('/api/quote/:ticker', async (req, res) => {
  try {
    const ticker = req.params.ticker.toUpperCase();

    // Tagesdaten (Polygon)
    const prev = await polygonGET(
      polygonStocks,
      `/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`
    );
    const r = prev?.results?.[0];
    if (!r) return res.status(404).json({ error: 'Keine Kursdaten gefunden' });

    // Fundamentals (Polygon Reference)
    let fundamentals = {};
    try {
      const ref = await polygonGET(
        polygonStocks,
        `/vX/reference/financials`,
        { ticker, limit: 1, timeframe: 'annual' },
        300_000
      );
      const f = ref?.results?.[0]?.financials;
      if (f) {
        fundamentals = {
          revenue:   f.income_statement?.revenues?.value ?? null,
          eps:       f.income_statement?.basic_earnings_per_share?.value ?? null
        };
      }
    } catch {}

    // 52W High/Low (Polygon)
    let week52 = {};
    try {
      const from = fmtYMD(Date.now() - 365 * 864e5);
      const to   = fmtYMD(Date.now());
      const aggs = await polygonGET(
        polygonStocks,
        `/v2/aggs/ticker/${encodeURIComponent(ticker)}/range/1/day/${from}/${to}`,
        { adjusted: true, sort: 'asc', limit: 365 },
        300_000
      );
      const results = aggs?.results || [];
      if (results.length) {
        week52.week52High = Math.max(...results.map(x => x.h));
        week52.week52Low  = Math.min(...results.map(x => x.l));
      }
    } catch {}

    // Dividenden-Yield
    const div = await getDividendTTM(ticker);
    const divYield = r.c > 0 && div.dps_ttm > 0
      ? +((div.dps_ttm / r.c) * 100).toFixed(2)
      : null;

    // Momentum via Yahoo
    const yahoo = await fetchYahooHistory(ticker, 120);
    const d30 = yahoo?.close30d ? +pct(yahoo.price, yahoo.close30d).toFixed(2) : null;
    const d90 = yahoo?.close90d ? +pct(yahoo.price, yahoo.close90d).toFixed(2) : null;

    res.json({
      ticker,
      close:          r.c,
      open:           r.o,
      high:           r.h,
      low:            r.l,
      prev_close:     r.c, // Polygon /prev gibt keinen separaten prev_close
      volume:         r.v,
      vw:             r.vw,
      dividendYield:  divYield,
      payoutRatio:    null, // nicht direkt von Polygon verfügbar
      d30,
      d90,
      ...week52,
      ...fundamentals
    });
  } catch (e) {
    console.error('quote error', e?.message);
    res.status(500).json({ error: 'Quote failed' });
  }
});

// ============================================================
// ====== News (Tab 2) ========================================
// ============================================================

function categorizeNewsItem(n) {
  const title = (n.title || '').toLowerCase();
  const cats  = [];

  if (title.includes('dividend')) {
    if (title.includes('increase') || title.includes('raise')) cats.push('DIVIDEND_UP');
    if (title.includes('cut') || title.includes('reduce') || title.includes('slash')) cats.push('DIVIDEND_DOWN');
  }
  if (title.includes('spin') && title.includes('off')) cats.push('SPIN_OFF');
  if (/\bq[1-4]\b/.test(title) || title.includes('earnings')) cats.push('EARNINGS');

  return cats;
}

async function fetchNewsForTickers(tickers, perTickerCap) {
  const out = [];

  await Promise.all(
    tickers.map(t =>
      polygonGET(
        polygonStocks,
        '/v2/reference/news',
        { ticker: t, limit: perTickerCap, order: 'desc' },
        60_000
      )
        .then(d => (d?.results || []).forEach(n => out.push({ ...n, ticker: t })))
        .catch(e => console.warn('news fetch err', t, e?.message))
    )
  );

  return out;
}

function processNews(items, maxDaysBack = 30) {
  // FIX 6: 30 Tage Standard statt 365
  const cutoff = Date.now() - maxDaysBack * 24 * 3600 * 1000;

  return items
    .map(n => ({
      ...n,
      _ts: new Date(n.published_utc || 0).getTime(),
      categories: categorizeNewsItem(n)
    }))
    .filter(n => !isNaN(n._ts) && n._ts >= cutoff)
    .sort((a, b) => b._ts - a._ts);
}

function paginate(items, limit, offset) {
  return { total: items.length, slice: items.slice(offset, offset + limit) };
}

app.get('/api/news', async (req, res) => {
  try {
    const tickers = String(req.query.tickers || '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 20);

    if (!tickers.length) return res.status(400).json({ error: 'tickers query required' });

    const limit       = Math.min(Number(req.query.limit) || 150, 1000);
    const offset      = Math.max(Number(req.query.offset) || 0, 0);
    const maxDays     = Math.min(Number(req.query.days) || 30, 90);
    const perTickerCap = Math.min(Math.max(limit, 150), 200);

    const raw = await fetchNewsForTickers(tickers, perTickerCap);
    const processed = processNews(raw, maxDays);
    const { total, slice } = paginate(processed, limit, offset);

    res.json({ items: slice, total, limit, offset });
  } catch (e) {
    console.error('news error', e?.message);
    res.status(500).json({ error: 'News failed' });
  }
});

app.get('/api/news/portfolio', async (req, res) => {
  try {
    const items   = loadPortfolio();
    const tickers = items.map(it => it.ticker).filter(Boolean);

    if (!tickers.length) return res.status(400).json({ error: 'Keine Ticker im Portfolio' });

    const limit       = Math.min(Number(req.query.limit) || 150, 1000);
    const offset      = Math.max(Number(req.query.offset) || 0, 0);
    const maxDays     = Math.min(Number(req.query.days) || 30, 90);
    const chunkSize   = 20;
    const perTickerCap = 50;

    let raw = [];
    for (let i = 0; i < tickers.length; i += chunkSize) {
      const group     = tickers.slice(i, i + chunkSize);
      const groupNews = await fetchNewsForTickers(group, perTickerCap);
      raw.push(...groupNews);
    }

    const processed = processNews(raw, maxDays);
    const { total, slice } = paginate(processed, limit, offset);

    console.log(`📢 Portfolio-News: ${total} Artikel für ${tickers.length} Ticker (${maxDays}T)`);
    res.json({ items: slice, total, limit, offset, tickers });
  } catch (e) {
    console.error('news/portfolio error', e?.message);
    res.status(500).json({ error: 'Portfolio News failed' });
  }
});

// ============================================================
// ====== EIA Inventories =====================================
// ============================================================

const EIA_SERIES = {
  crude_total:  { key: "petroleum/sum/sndw:WCRSTUS1", unit: "kbbl" },
  crude_ex_spr: { key: "petroleum/sum/sndw:WCESTUS1", unit: "kbbl" },
  gasoline:     { key: "petroleum/sum/sndw:WGTSTUS1", unit: "kbbl" },
  distillate:   { key: "petroleum/sum/sndw:WDISTUS1", unit: "kbbl" },
  ng_storage:   { key: "natural-gas/stor/wkly",       unit: "Bcf"  }
};

async function eiaFetch(seriesKey, length) {
  const [dataset, series] = seriesKey.split(":");
  const url    = `https://api.eia.gov/v2/${dataset}/data/`;
  // FIX 1: ENV.EIA_API_KEY statt undefined EIA_API_KEY
  const params = {
    api_key:   ENV.EIA_API_KEY,
    frequency: "weekly",
    sort:      [{ column: "period", direction: "desc" }],
    offset:    0,
    length
  };
  if (series) params["facets[series][]"] = series;
  const data = await cachedGetRaw(url, params, 300_000, "get");
  return Array.isArray(data?.response?.data) ? data.response.data : [];
}

async function getInventory(seriesKey) {
  const rows = await eiaFetch(seriesKey, 5000);
  if (!rows.length) return null;

  const latest = rows[0];
  const year   = Number(latest.period.slice(0, 4));
  const week   = latest.period.slice(4);

  let sum = 0, cnt = 0;
  for (let i = 1; i <= 5; i++) {
    const p = `${year - i}${week}`;
    const r = rows.find(x => x.period === p);
    if (r?.value != null) { sum += Number(r.value); cnt++; }
  }

  const value  = Number(latest.value);
  const avg5y  = cnt ? sum / cnt : null;
  const vs5y   = avg5y ? ((value - avg5y) / avg5y) * 100 : null;

  return {
    value,
    avg5y,
    vs5y_pct: vs5y != null ? +vs5y.toFixed(2) : null
  };
}

app.get('/api/eia/inventories', async (_req, res) => {
  try {
    const out = {};

    await Promise.all(
      Object.entries(EIA_SERIES).map(async ([key, cfg]) => {
        try {
          const r    = await getInventory(cfg.key);
          const vs5y = r?.vs5y_pct ?? null;

          out[key] = {
            value:    r?.value ?? null,
            avg5y:    r?.avg5y ?? null,
            vs5y_pct: vs5y,
            unit:     cfg.unit,
            signal:   vs5y == null ? 'neutral' : vs5y < -5 ? 'bullish' : vs5y > 5 ? 'bearish' : 'neutral'
          };
        } catch {
          out[key] = { value: null, avg5y: null, vs5y_pct: null, unit: cfg.unit, signal: 'neutral' };
        }
      })
    );

    res.json(out);
  } catch (e) {
    console.error('EIA unified error', e.message);
    res.status(500).json({ error: 'EIA inventories failed' });
  }
});

// ============================================================
// ====== FRED Helpers ========================================
// ============================================================

async function fredLatestValue(series_id) {
  if (!ENV.FRED_API_KEY) return null;
  try {
    const data = await cachedGetRaw(
      "https://api.stlouisfed.org/fred/series/observations",
      { series_id, api_key: ENV.FRED_API_KEY, file_type: "json", sort_order: "desc", limit: 1 },
      120_000,
      "get"
    );
    const row = data?.observations?.find(o => o?.value && o.value !== ".");
    return row ? { date: row.date, value: Number(row.value) } : null;
  } catch (e) {
    console.error("FRED error", series_id, e?.message);
    return null;
  }
}

async function getTreasuryLatest() {
  const [y2, y10] = await Promise.all([
    fredLatestValue("DGS2"),
    fredLatestValue("DGS10")
  ]);
  if (!y2 || !y10) return null;
  return {
    date:   new Date(y10.date) > new Date(y2.date) ? y10.date : y2.date,
    y2:     y2.value,
    y10:    y10.value,
    spread: +(y10.value - y2.value).toFixed(2)
  };
}

// ============================================================
// ====== Macro Summary =======================================
// ============================================================

async function getVIX() {
  if (polygonIndex) {
    try {
      const d = await polygonGET(polygonIndex, '/v2/aggs/ticker/CBOE:VIX/prev');
      const r = d?.results?.[0];
      if (r?.c != null) return { value: +r.c, ts: r.t || Date.now(), source: 'polygon_index' };
    } catch {}
  }

  try {
    const d = await polygonGET(polygonStocks, '/v2/aggs/ticker/CBOE:VIX/prev');
    const r = d?.results?.[0];
    if (r?.c != null) return { value: +r.c, ts: r.t || Date.now(), source: 'polygon_stocks' };
  } catch {}

  try {
    const { data } = await axios.get(
      "https://query2.finance.yahoo.com/v8/finance/chart/^VIX",
      { timeout: 10000, headers: { 'User-Agent': 'MBFinanceMate/1.0' } }
    );
    const r = data?.chart?.result?.[0]?.meta;
    if (r?.regularMarketPrice != null) {
      return {
        value:  +r.regularMarketPrice,
        ts:     (r.regularMarketTime || Math.floor(Date.now() / 1000)) * 1000,
        source: 'yahoo'
      };
    }
  } catch {}

  return { value: null, ts: null, source: 'none' };
}

async function getFearGreed() {
  try {
    const { data } = await axios.get(
      "https://fear-and-greed-index.p.rapidapi.com/v1/fgi",
      {
        headers: {
          "X-RapidAPI-Key":  process.env.RAPIDAPI_KEY || "",
          "X-RapidAPI-Host": "fear-and-greed-index.p.rapidapi.com"
        },
        timeout: 10000
      }
    );
    if (data?.fgi?.now?.value) return { value: data.fgi.now.value, label: data.fgi.now.valueText };
  } catch {}
  return null;
}

async function getCPIYoY() {
  try {
    const data = await cachedGetRaw(
      "https://api.bls.gov/publicAPI/v2/timeseries/data/",
      {
        seriesid: ["CUSR0000SA0"],
        ...(ENV.BLS_API_KEY ? { registrationkey: ENV.BLS_API_KEY } : {})
      },
      300_000,
      "post"
    );

    const arr = data?.Results?.series?.[0]?.data || [];
    if (arr.length >= 13) {
      const latest  = Number(arr[0].value);
      const prev12  = Number(arr[12].value);
      if (latest && prev12) {
        return {
          period: `${arr[0].year}-${arr[0].periodName}`,
          yoy:    +(((latest - prev12) / prev12) * 100).toFixed(2)
        };
      }
    }
  } catch (e) {
    console.error("CPI error:", e.message);
  }
  return null;
}

async function getM2YoY() {
  if (!ENV.FRED_API_KEY) return null;
  try {
    const data = await cachedGetRaw(
      "https://api.stlouisfed.org/fred/series/observations",
      { series_id: "M2SL", file_type: "json", api_key: ENV.FRED_API_KEY, frequency: "m" },
      300_000,
      "get"
    );
    const obs = (data?.observations || []).filter(o => o.value !== ".");
    if (obs.length >= 13) {
      const a = Number(obs.at(-1).value);
      const b = Number(obs.at(-13).value);
      return { date: obs.at(-1).date, yoy: +(((a - b) / b) * 100).toFixed(2) };
    }
  } catch {}
  return null;
}

async function getFedRate() {
  return await fredLatestValue("FEDFUNDS");
}
async function getUnemployment() {
  return await fredLatestValue("UNRATE");
}
async function getPCEInflation() {
  return await fredLatestValue("PCEPI");
}

app.get("/api/macro/summary", async (_req, res) => {
  try {
    const [treasury, cpi, m2, vix, fg, fedRate, unemployment] = await Promise.all([
      getTreasuryLatest(), getCPIYoY(), getM2YoY(), getVIX(), getFearGreed(),
      getFedRate(), getUnemployment()
    ]);

    let summary = "📊 Makro-Überblick:\n";
    if (treasury) {
      summary += `- 10Y: ${treasury.y10}%, 2Y: ${treasury.y2}%, Spread: ${treasury.spread}% → `;
      summary += treasury.spread < 0 ? "🔻 Inverted Yield Curve\n" : "✅ Normal Curve\n";
    }
    if (cpi) summary += `- CPI YoY: ${cpi.yoy}% (${cpi.period})\n`;
    if (m2)  summary += `- M2 YoY: ${m2.yoy}% (bis ${m2.date})\n`;
    if (vix) summary += `- VIX: ${vix.value} (${vix.source})\n`;
    if (fg)  summary += `- Fear & Greed: ${fg.value} (${fg.label})\n`;

    res.json({ summary: summary.trim(), treasury, cpi, m2, vix, fearGreed: fg, fedRate, unemployment });
  } catch (e) {
    console.error("macro summary error", e?.message);
    res.status(500).json({ error: "Macro summary failed" });
  }
});

// ============================================================
// ====== Market Cycles (mit Yahoo-Fallback) ==================
// ============================================================

app.get('/api/market-cycles', async (req, res) => {
  try {
    const tickers = String(req.query.tickers || '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    if (!tickers.length) return res.status(400).json({ error: 'tickers query required' });

    const data = {};

    await Promise.all(tickers.map(async ticker => {
      try {
        const now = Date.now();
        const d1  = fmtYMD(now - 1  * 864e5);
        const d30 = fmtYMD(now - 30 * 864e5);
        const d90 = fmtYMD(now - 90 * 864e5);

        const price = Number((await getQuotePolygon(ticker)).price ?? 0);

        const getClose = async (date) => {
          try {
            const r = await polygonGET(polygonStocks, `/v1/open-close/${encodeURIComponent(ticker)}/${date}`);
            return r?.close ?? null;
          } catch { return null; }
        };

        let [c1, c30, c90] = await Promise.all([getClose(d1), getClose(d30), getClose(d90)]);

        // FIX 4: Yahoo-Fallback wenn Polygon keine Daten liefert
        if ((!c30 || !c90) && price) {
          const yahoo = await fetchYahooHistory(ticker, 120);
          if (yahoo) {
            if (!c30 && yahoo.close30d) c30 = yahoo.close30d;
            if (!c90 && yahoo.close90d) c90 = yahoo.close90d;
            if (!c1  && yahoo.close1d)  c1  = yahoo.close1d;
          }
        }

        data[ticker] = {
          ticker,
          price,
          d1:  price && c1  ? +pct(price, c1).toFixed(2)  : null,
          d30: price && c30 ? +pct(price, c30).toFixed(2) : null,
          d90: price && c90 ? +pct(price, c90).toFixed(2) : null
        };
      } catch (e) {
        console.error('market-cycles ticker error', ticker, e.message);
        data[ticker] = { ticker, error: 'fetch_failed' };
      }
    }));

    res.json({ data });
  } catch (e) {
    console.error('market-cycles error', e?.message);
    res.status(500).json({ error: 'Market cycles failed' });
  }
});

// ============================================================
// ====== Dividends (Tab 5) ===================================
// ============================================================

async function fetchDividends(ticker, limit = 200) {
  const data = await polygonGET(
    polygonStocks,
    '/v3/reference/dividends',
    { ticker, limit, order: 'desc' },
    60_000
  );
  return data?.results || [];
}

app.get('/api/dividends/:ticker', async (req, res) => {
  try {
    const ticker  = req.params.ticker.toUpperCase();
    const results = await fetchDividends(ticker, 200);
    res.json({ ticker, results });
  } catch (e) {
    console.error('dividends error', e?.message);
    res.status(500).json({ error: 'Dividends failed' });
  }
});

app.get('/api/dividend-calendar', async (_req, res) => {
  try {
    const tickers = loadPortfolioTickers();
    if (!tickers.length) return res.json({ items: [] });

    const nowISO = fmtYMD(new Date());
    const out    = [];

    for (const t of tickers) {
      try {
        const rows   = await fetchDividends(t, 100);
        const future = rows
          .filter(d => d?.ex_dividend_date && d.ex_dividend_date >= nowISO)
          .map(d => ({
            ticker:          t,
            exDate:          d.ex_dividend_date,
            payDate:         d.pay_date || null,
            recordDate:      d.record_date || null,
            amount:          d.cash_amount || null,
            frequency:       d.frequency || null,
            declarationDate: d.declaration_date || null
          }));
        out.push(...future);
      } catch (e) {
        console.error('dividend-calendar fetch error', t, e?.message);
      }
    }

    out.sort((a, b) => a.exDate.localeCompare(b.exDate));
    res.json({ items: out });
  } catch (e) {
    console.error('dividend-calendar error', e?.message);
    res.status(500).json({ error: 'Dividend calendar failed' });
  }
});

// ============================================================
// ====== Sectors (Tab 6) =====================================
// ============================================================

const SECTOR_MAP = {
  XLE:  "Energy",
  XLF:  "Financials",
  XLK:  "Technology",
  XLV:  "Health Care",
  XLU:  "Utilities",
  XLI:  "Industrials",
  XLY:  "Consumer Discretionary",
  XLP:  "Consumer Staples",
  XLRE: "Real Estate",
  XLB:  "Materials",
  XLC:  "Communication Services"
};

app.get('/api/sectors', async (_req, res) => {
  try {
    const sectors = {};

    await Promise.all(
      Object.entries(SECTOR_MAP).map(async ([ticker, sector]) => {
        try {
          const q   = await getQuotePolygon(ticker);
          const div = await getDividendTTM(ticker);

          const price = Number(q.price ?? 0);
          const dps   = Number(div.dps_ttm || 0);

          sectors[ticker] = {
            sector,
            price,
            yieldPct: price > 0 && dps > 0 ? +((dps / price) * 100).toFixed(2) : null,
            samples:  div.samples || 0
          };
        } catch {
          sectors[ticker] = { sector, error: "no_data" };
        }
      })
    );

    res.json({ sectors });
  } catch (e) {
    console.error("sector error", e?.message);
    res.status(500).json({ error: "Sector analysis failed" });
  }
});

// ============================================================
// ====== Commodities =========================================
// ============================================================

app.get('/api/commodities', async (_req, res) => {
  try {
    const out = {};
    const map = [
      ["coal",       "PCOALAUUSDM",  "USD/mt"],
      ["wti",        "DCOILWTICO",   "USD/bbl"],
      ["brent",      "DCOILBRENTEU", "USD/bbl"],
      ["henryHub",   "DHHNGSP",      "USD/MMBtu"]
    ];

    for (const [k, id, unit] of map) {
      const r = await fredLatestValue(id);
      if (r) out[k] = { ...r, unit };
    }

    const ura = await getQuotePolygon("URA").catch(() => null);
    if (ura?.price) {
      out.uranium = { date: fmtYMD(Date.now()), value: ura.price, unit: "USD (URA ETF)" };
    }

    res.json(out);
  } catch (e) {
    console.error("commodities error", e?.message);
    res.status(500).json({ error: "Commodities failed" });
  }
});

// ============================================================
// ====== Shipping Flows ======================================
// ============================================================

app.get('/api/shipping/flows', async (_req, res) => {
  try {
    const out = {};

    // FIX 1: ENV.EIA_API_KEY statt undefined EIA_API_KEY
    const crudeExports = await cachedGetRaw(
      "https://api.eia.gov/v2/petroleum/move/exp/data/",
      { api_key: ENV.EIA_API_KEY, frequency: "weekly", sort: [{ column: "period", direction: "desc" }], length: 1 },
      300_000, "get"
    );
    const crudeVal = Number(crudeExports?.response?.data?.[0]?.value ?? null);
    out.crude_exports = {
      value:  crudeVal,
      unit:   "Mbpd",
      signal: crudeVal > 4 ? "bullish" : "neutral"
    };

    const lngExports = await cachedGetRaw(
      "https://api.eia.gov/v2/natural-gas/move/exp/data/",
      { api_key: ENV.EIA_API_KEY, frequency: "weekly", sort: [{ column: "period", direction: "desc" }], length: 1 },
      300_000, "get"
    );
    const lngVal = Number(lngExports?.response?.data?.[0]?.value ?? null);
    out.lng_exports = {
      value:  lngVal,
      unit:   "Bcf/d",
      signal: lngVal > 12 ? "bullish" : "neutral"
    };

    res.json(out);
  } catch (e) {
    console.error("shipping flows error", e.message);
    res.status(500).json({ error: "Shipping flows failed" });
  }
});

// ============================================================
// ====== Market Dashboard ====================================
// ============================================================

app.get('/api/market-dashboard', async (req, res) => {
  try {
    const tickers = String(req.query.tickers || '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    const prices = {};
    await Promise.all(tickers.map(async t => {
      const q = await getQuotePolygon(t).catch(() => null);
      prices[t] = q?.price ? { price: q.price, source: q.source } : { error: 'no_data' };
    }));

    const treasury    = await getTreasuryLatest();
    const inventories = {};

    await Promise.all(
      Object.entries(EIA_SERIES).map(async ([k, cfg]) => {
        const r = await getInventory(cfg.key);
        inventories[k] = r
          ? { ...r, unit: cfg.unit }
          : { value: null, avg5y: null, vs5y_pct: null, unit: cfg.unit };
      })
    );

    res.json({ tickers: prices, treasury, inventories });
  } catch (e) {
    console.error('market-dashboard error', e?.message);
    res.status(500).json({ error: 'Market dashboard failed' });
  }
});

// ============================================================
// ====== FIX 2: Global Error Handler VOR app.listen ==========
// ============================================================

app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal' });
});

// ====== Server Start ======
app.listen(port, () => {
  console.log(`✅ Server läuft: http://localhost:${port}`);

  // ── Background Cache Warming ──────────────────────────────
  // Startet 5s nach Boot, holt Portfolio im Hintergrund
  // sodass der erste Browser-Request aus dem Cache kommt
  setTimeout(async () => {
    try {
      console.log('[WARM] Starte Cache-Warming…');
      const raw = loadPortfolio();
      const { out: items } = ensureIds(raw);
      const warmLimit = pLimit(8);
      await Promise.all(items.map(it => warmLimit(async () => {
        const ticker = it.ticker || null;
        if (!ticker) return;
        await Promise.all([
          getQuotePolygon(ticker).catch(() => {}),
          getDividendTTM(ticker).catch(() => {})
        ]);
      })));
      console.log(`[WARM] ✅ ${items.length} Positionen gecacht`);
    } catch(e) {
      console.log('[WARM] Fehler:', e.message);
    }
  }, 5000);
});