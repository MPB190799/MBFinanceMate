// ====== MBFinanceMate server.js (enhanced full version) ======

// ====== Load ENV ======
require('dotenv').config();
const trim = s => (s || '').trim();
process.env.POLY_STOCKS_KEY = trim(process.env.POLY_STOCKS_KEY);
process.env.POLY_INDEX_KEY  = trim(process.env.POLY_INDEX_KEY);
process.env.EIA_API_KEY     = trim(process.env.EIA_API_KEY);
process.env.FRED_API_KEY    = trim(process.env.FRED_API_KEY);
process.env.BLS_API_KEY     = trim(process.env.BLS_API_KEY);

console.log('[KEY LEN] FRED:', (process.env.FRED_API_KEY||'').length,
            '| EIA:', (process.env.EIA_API_KEY||'').length);

// ====== Imports ======
const path    = require('path');
const express = require('express');
const axios   = require('axios');
const fs      = require('fs');
const helmet  = require('helmet');
const cors    = require('cors');
const rateLimit = require('express-rate-limit');
const crypto  = require('crypto');

// ====== App ======
const app  = express();
const port = Number(process.env.PORT ?? 3001);
console.log('🔧 ENV PORT =', process.env.PORT);

// ====== Keys ======
const POLY_STOCKS_KEY = process.env.POLY_STOCKS_KEY;
const POLY_INDEX_KEY  = process.env.POLY_INDEX_KEY;
const EIA_API_KEY     = process.env.EIA_API_KEY || null;
const BLS_API_KEY     = process.env.BLS_API_KEY || null;
const FRED_API_KEY    = process.env.FRED_API_KEY || null;

if (!POLY_STOCKS_KEY) {
  console.error('❌ POLY_STOCKS_KEY fehlt in .env');
  process.exit(1);
}
if (!POLY_INDEX_KEY) {
  console.warn('⚠️ POLY_INDEX_KEY fehlt – Indizes (z. B. VIX) werden nicht funktionieren');
}

// ====== App & Security ======
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true, credentials: false }));
app.use(express.json({ limit: '1mb' }));

// ====== Static Files ======
const STATIC_DIR = path.join(__dirname, 'public');
console.log('🗂️ Static dir:', STATIC_DIR);
app.use(express.static(STATIC_DIR, { maxAge: '1h', etag: true, index: false }));
app.get('/', (_req, res) => res.sendFile(path.join(STATIC_DIR, 'index.html')));

// ====== Rate Limit nur für /api ======
app.use('/api/', rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.ip,
}));

// ====== Utils / Cache ======
const cache = new Map();
function cacheGet(key){
  const e = cache.get(key);
  if(!e) return null;
  if(Date.now() > e.expires){ cache.delete(key); return null; }
  return e.value;
}
function cacheSet(key, value, ttlMs = 30_000){
  cache.set(key, { value, expires: Date.now() + ttlMs });
}
const sleep = (ms)=>new Promise(r=>setTimeout(r,ms));
async function withRetry(fn, tries=3){
  let last;
  for(let i=0;i<tries;i++){
    try{ return await fn(); }
    catch(e){ last = e; await sleep(300*Math.pow(2,i)); }
  }
  throw last;
}
const fmtYMD = d => new Date(d).toISOString().slice(0,10);

async function cachedGetRaw(url, params={}, ttlMs=60_000, method='get'){
  const key = `RAW:${method}:${url}:${JSON.stringify(params)}`;
  const hit = cacheGet(key);
  if(hit) return hit;
  const cfg = { timeout: 12000, headers: { 'User-Agent':'MBFinanceMate/1.0' } };
  const resp = method==='post'
    ? await axios.post(url, params, cfg)
    : await axios.get(url, { params, ...cfg });
  cacheSet(key, resp.data, ttlMs);
  return resp.data;
}

// Simple concurrency limiter
function pLimit(conc){
  const q=[]; let a=0;
  const next=()=>{ a--; if(q.length) q.shift()(); };
  return fn=>new Promise((res,rej)=>{
    const run=()=>{ a++; Promise.resolve().then(fn).then(res,rej).finally(next); };
    a<conc ? run() : q.push(run);
  });
}
const limit4 = pLimit(4);

// ====== Polygon Client ======
function makePolygonClient(key){
  return axios.create({
    baseURL: 'https://api.polygon.io',
    timeout: 10_000,
    headers: {
      'Accept-Encoding':'gzip, deflate, compress',
      'User-Agent':'MBFinanceMate/1.0'
    },
    params: { apikey: key },
  });
}
const polygonStocks = makePolygonClient(POLY_STOCKS_KEY);
const polygonIndex  = POLY_INDEX_KEY ? makePolygonClient(POLY_INDEX_KEY) : null;

async function polygonGET(client, url, params={}, ttlMs=30_000){
  const key = `GET:${url}:${JSON.stringify(params)}:${client.defaults.params.apikey}`;
  const hit = cacheGet(key);
  if(hit) return hit;
  const res = await withRetry(()=>client.get(url, { params }));
  cacheSet(key, res.data, ttlMs);
  return res.data;
}

// ====== Portfolio (Tab 1) ======
const filePath = path.resolve(process.cwd(), 'portfolio.json');

function ensureIds(items){
  let changed = false;
  const out = items.map(it => {
    if (!it.id) { changed = true; it.id = crypto.randomUUID(); }
    return it;
  });
  return { out, changed };
}
// --- Add Position ---
app.post('/api/portfolio/add', async (req, res) => {
  try {
    const json = fs.existsSync(filePath)
      ? JSON.parse(fs.readFileSync(filePath, 'utf8'))
      : { portfolio: [] };
    const items = Array.isArray(json.portfolio) ? json.portfolio : [];
    const it = req.body || {};

    const row = {
      id: crypto.randomUUID(),
      name: (it.name || '').trim(),
      isin: (it.isin || '').trim(),
      ticker: (it.ticker || '').trim().toUpperCase(),
      shares: Number(it.shares || 0),
      avgPrice: Number(it.avgPrice || 0),
      note: (it.note || '').trim(),
      divPaidTotal: Number(it.divPaidTotal || 0)
    };

    if (!row.shares || !row.avgPrice || (!row.ticker && !row.isin && !row.name)) {
      return res.status(400).json({ error: 'shares, avgPrice und mindestens eins von (ticker|isin|name) erforderlich' });
    }

    items.push(row);
    fs.writeFileSync(filePath, JSON.stringify({ portfolio: items }, null, 2), 'utf8');
    res.json({ ok: true, added: row });
  } catch (e) {
    console.error('portfolio/add error', e?.message);
    res.status(500).json({ error: 'Add failed' });
  }
});

// --- Update ---
app.put('/api/portfolio/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const json = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : { portfolio: [] };
    const items = Array.isArray(json.portfolio) ? json.portfolio : [];
    const idx = items.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });

    const allowed = ['name','isin','ticker','shares','avgPrice','note','divPaidTotal'];
    const upd = {};
    for (const k of allowed) {
      if (k in req.body) {
        upd[k] = (k==='ticker') ? String(req.body[k]).toUpperCase().trim()
                 : (k==='shares'||k==='avgPrice'||k==='divPaidTotal') ? Number(req.body[k])
                 : String(req.body[k]||'').trim();
      }
    }
    items[idx] = { ...items[idx], ...upd };
    fs.writeFileSync(filePath, JSON.stringify({ portfolio: items }, null, 2), 'utf8');
    res.json({ ok: true, updated: items[idx] });
  } catch (e) {
    console.error('portfolio put error', e?.message);
    res.status(500).json({ error: 'Update failed' });
  }
});

// --- Patch ---
app.patch('/api/portfolio/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const json = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : { portfolio: [] };
    const items = Array.isArray(json.portfolio) ? json.portfolio : [];
    const idx = items.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });

    const allowed = ['name','isin','ticker','shares','avgPrice','note','divPaidTotal'];
    for (const k of Object.keys(req.body||{})) {
      if (!allowed.includes(k)) delete req.body[k];
    }
    const norm = (k,v)=> (k==='ticker') ? String(v).toUpperCase().trim()
                      : (k==='shares'||k==='avgPrice'||k==='divPaidTotal') ? Number(v)
                      : String(v||'').trim();
    items[idx] = { ...items[idx], ...Object.fromEntries(Object.entries(req.body).map(([k,v])=>[k,norm(k,v)])) };
    fs.writeFileSync(filePath, JSON.stringify({ portfolio: items }, null, 2), 'utf8');
    res.json({ ok: true, updated: items[idx] });
  } catch (e) {
    console.error('portfolio patch error', e?.message);
    res.status(500).json({ error: 'Update failed' });
  }
});

// --- Delete ---
app.delete('/api/portfolio/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const json = fs.existsSync(filePath) ? JSON.parse(fs.readFileSync(filePath, 'utf8')) : { portfolio: [] };
    let items = Array.isArray(json.portfolio) ? json.portfolio : [];
    const idx = items.findIndex(p => p.id === id);
    if (idx === -1) return res.status(404).json({ error: 'not_found' });

    const removed = items.splice(idx, 1);
    fs.writeFileSync(filePath, JSON.stringify({ portfolio: items }, null, 2), 'utf8');
    res.json({ ok: true, removed: removed[0] });
  } catch (e) {
    console.error('portfolio delete error', e?.message);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// --- Get Portfolio inkl. Kursen & Dividenden ---
async function getQuotePolygon(ticker) {
  try {
    const data = await polygonGET(polygonStocks, `/v2/aggs/ticker/${encodeURIComponent(ticker)}/prev`);
    if (data?.results?.[0]) {
      const r = data.results[0];
      return { price: r.c, source: "polygon" };
    }
  } catch (e) {
    console.error("Polygon quote error", ticker, e.message);
  }
  return { price: null, source: "polygon" };
}

async function resolveToTicker(input){
  if(!input) return null;
  const s = String(input).trim();
  if(/^[A-Za-z.\-]{1,10}$/.test(s)) return s.toUpperCase();
  try{
    const q = s.toUpperCase();
    const isISIN = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/.test(q);
    const params = isISIN ? { search: q, market: 'stocks', limit: 1 }
                          : { search: s, market: 'stocks', limit: 1 };
    const data = await polygonGET(polygonStocks, '/v3/reference/tickers', params, 120_000);
    const t = data?.results?.[0]?.ticker;
    return t ? String(t).toUpperCase() : null;
  }catch(e){
    console.error('resolveToTicker error', s, e.message);
    return null;
  }
}

async function getDividendTTM(ticker){
  try{
    const twoYearsAgo = fmtYMD(new Date(Date.now() - 730*24*3600*1000));
    const today       = fmtYMD(new Date());
    const data = await polygonGET(polygonStocks, '/v3/reference/dividends', {
      ticker: ticker.toUpperCase(),
      order: 'desc',
      limit: 500,
      ex_dividend_date_gte: twoYearsAgo,
      ex_dividend_date_lte: today
    }, 120_000);

    const rows = (data?.results || [])
      .filter(d => d?.cash_amount != null && d?.ex_dividend_date)
      .map(d => ({ exDate: d.ex_dividend_date, amount: Number(d.cash_amount) }));

    const cutoff = Date.now() - 365*24*3600*1000;
    const ttm = rows.filter(r => new Date(r.exDate).getTime() >= cutoff);
    const dps_ttm = +ttm.reduce((s,r)=>s + (r.amount||0), 0).toFixed(4);

    return { dps_ttm, samples: rows.length, history: rows };
  }catch(e){
    console.error('getDividendTTM error', ticker, e.message);
    return { dps_ttm: 0, samples: 0, history: [] };
  }
}

app.get('/api/portfolio', async (_req, res) => {
  try {
    const raw = fs.existsSync(filePath) ? (JSON.parse(fs.readFileSync(filePath, 'utf8'))?.portfolio || []) : [];
    const { out: items, changed } = ensureIds(raw);
    if (changed) fs.writeFileSync(filePath, JSON.stringify({ portfolio: items }, null, 2), 'utf8');

    const enriched = await Promise.all(items.map(it => limit4(async () => {
      let ticker = it.ticker || (it.isin && await resolveToTicker(it.isin)) || (it.name && await resolveToTicker(it.name));
      if (!ticker) return { ...it, error: 'Ticker konnte nicht aufgelöst werden' };

      const q   = await getQuotePolygon(ticker);
      const div = await getDividendTTM(ticker);

      const shares   = Number(it.shares || 0);
      const avgPrice = Number(it.avgPrice || 0);
      const curPrice = Number(q.price ?? 0);

      const costBasis  = +(avgPrice * shares).toFixed(2);
      const position   = +(curPrice * shares).toFixed(2);
      const gainAbs    = +(position - costBasis).toFixed(2);
      const gainPct    = costBasis > 0 ? +(((position - costBasis) / costBasis) * 100).toFixed(2) : null;

      const dps        = Number(div.dps_ttm || 0);
      const incomeAnn  = +(dps * shares).toFixed(2);

      const yocPct     = (dps > 0 && avgPrice > 0) ? +((dps / avgPrice) * 100).toFixed(2) : null;
      const yieldPct   = (dps > 0 && curPrice > 0) ? +((dps / curPrice) * 100).toFixed(2) : null;

      return {
        ...it,
        ticker: ticker.toUpperCase(),
        currentPrice: curPrice,
        shares, avgPrice,
        costBasis, positionValue: position,
        gainAbs, gainPct,
        dividendPerShareTTM: +dps.toFixed(4),
        dividendIncomeAnnual: incomeAnn,
        yocPct, currentYieldPct: yieldPct,
        dividendSamples: div.samples || 0,
        dividendHistory: div.history || []
      };
    })));

    const totals = {
      portfolioValue: +enriched.reduce((s,r)=> s + (r.positionValue||0), 0).toFixed(2),
      costBasis:      +enriched.reduce((s,r)=> s + (r.costBasis||0),     0).toFixed(2),
      incomeAnnual:   +enriched.reduce((s,r)=> s + (r.dividendIncomeAnnual||0), 0).toFixed(2)
    };
    totals.gainAbs = +(totals.portfolioValue - totals.costBasis).toFixed(2);
    totals.gainPct = totals.costBasis > 0 ? +(((totals.portfolioValue - totals.costBasis)/totals.costBasis)*100).toFixed(2) : null;

    res.json({ portfolio: enriched, totals });
  } catch (e) {
    console.error('portfolio error', e?.message);
    res.status(500).json({ error: 'Error loading portfolio' });
  }
});
// ====== News & Reports (Tab 2) ======

// Helper zur Kategorisierung (optional nutzbar im Frontend/Backend)
function categorizeNewsItem(n){
  const title = (n.title || '').toLowerCase();
  const cats = [];
  if (title.includes('dividend')) {
    if (title.includes('increase') || title.includes('raise')) cats.push('DIVIDEND_UP');
    if (title.includes('cut') || title.includes('reduce') || title.includes('slash')) cats.push('DIVIDEND_DOWN');
  }
  if (title.includes('spin') && title.includes('off')) cats.push('SPIN_OFF');
  if (title.match(/\bq[1-4]\b/) || title.includes('earnings')) cats.push('EARNINGS');
  return cats;
}

// --- Standard-News für manuelle Ticker-Eingabe ---
// Pagination-Strategie: Wir holen pro Ticker die neuesten Artikel (bis max. limitPerTicker),
// mergen & sortieren global und liefern dann Slice(offset..offset+limit).
app.get('/api/news', async (req, res) => {
  try {
    const tickers = String(req.query.tickers || '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean)
      .slice(0, 20); // Sicherung: max. 20 Ticker pro Request

    const limit = Math.min(Number(req.query.limit) || 150, 1000);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    if (!tickers.length) return res.status(400).json({ error: 'tickers query required' });

    // Wir nehmen pro Ticker eine großzügige Obergrenze (hier 200) und filtern danach global.
    const perTickerCap = Math.min(Math.max(limit, 150), 200);

    const all = [];
    await Promise.all(tickers.map(t =>
      polygonGET(polygonStocks, '/v2/reference/news', { ticker: t, limit: perTickerCap, order: 'desc' }, 60_000)
        .then(d => (d?.results || []).forEach(n => all.push({ ...n, ticker: t })))
        .catch(e => console.warn('news fetch err', t, e?.message))
    ));

    // Timestamps + Zeitraumfilter (12 Monate)
    all.forEach(n => n._ts = new Date(n.published_utc || 0).getTime());
    const oneYearAgo = Date.now() - 365 * 24 * 3600 * 1000;
    let filtered = all.filter(n => !isNaN(n._ts) && n._ts >= oneYearAgo);

    // Kategorien anreichern
    filtered = filtered.map(n => ({ ...n, categories: categorizeNewsItem(n) }));

    // Neueste zuerst
    filtered.sort((a, b) => b._ts - a._ts);

    const total = filtered.length;
    const slice = filtered.slice(offset, offset + limit);

    res.json({ items: slice, total, limit, offset });
  } catch (e) {
    console.error('news error', e?.message);
    res.status(500).json({ error: 'News failed' });
  }
});

// --- Automatische News basierend auf Portfolio ---
// Gleiches Pagination-Prinzip: total zusammenzählen, dann Slice zurückgeben.
app.get('/api/news/portfolio', async (_req, res) => {
  try {
    const pfPath = path.resolve(process.cwd(), 'portfolio.json');
    if (!fs.existsSync(pfPath)) {
      return res.status(400).json({ error: 'Kein Portfolio gefunden' });
    }

    const limit = Math.min(Number(_req.query.limit) || 150, 1000);
    const offset = Math.max(Number(_req.query.offset) || 0, 0);

    const json = JSON.parse(fs.readFileSync(pfPath, 'utf8'));
    const items = Array.isArray(json.portfolio) ? json.portfolio : [];
    const tickers = items.map(it => (it.ticker || '').trim().toUpperCase()).filter(Boolean);

    if (!tickers.length) {
      return res.status(400).json({ error: 'Keine Ticker im Portfolio hinterlegt' });
    }

    // Chunking (20 Ticker pro Runde)
    const chunkSize = 20;
    const chunks = [];
    for (let i = 0; i < tickers.length; i += chunkSize) {
      chunks.push(tickers.slice(i, i + chunkSize));
    }

    // Obergrenze pro Ticker
    const perTickerCap = 50;

    const allNews = [];
    for (const group of chunks) {
      const groupNews = [];
      await Promise.all(group.map(t =>
        polygonGET(polygonStocks, '/v2/reference/news', { ticker: t, limit: perTickerCap, order: 'desc' }, 60_000)
          .then(d => (d?.results || []).forEach(n => groupNews.push({ ...n, ticker: t })))
          .catch(e => console.warn('news/portfolio fetch err', t, e?.message))
      ));
      allNews.push(...groupNews);
    }

    allNews.forEach(n => n._ts = new Date(n.published_utc || 0).getTime());
    const oneYearAgo = Date.now() - 365 * 24 * 3600 * 1000;
    let filtered = allNews.filter(n => !isNaN(n._ts) && n._ts >= oneYearAgo);
    filtered = filtered.map(n => ({ ...n, categories: categorizeNewsItem(n) }));
    filtered.sort((a, b) => b._ts - a._ts);

    const total = filtered.length;
    const slice = filtered.slice(offset, offset + limit);

    console.log(`📢 Portfolio-News: ${total} Artikel für ${tickers.length} Ticker`);
    res.json({ items: slice, total, limit, offset, tickers });
  } catch (e) {
    console.error('news/portfolio error', e?.message);
    res.status(500).json({ error: 'Portfolio News failed' });
  }
});
// ====== Market Dashboard (Tab 4) ======

// --- Treasury via FRED ---
async function fredLatestValue(series_id) {
  if (!FRED_API_KEY) return null;
  try {
    const data = await cachedGetRaw(
      "https://api.stlouisfed.org/fred/series/observations",
      { series_id, api_key: FRED_API_KEY, file_type: "json", sort_order: "desc", limit: 1 },
      120_000,
      "get"
    );
    const obs = Array.isArray(data?.observations) ? data.observations : [];
    const row = obs.find(o => o?.value && o.value !== ".");
    if (!row) return null;
    return { date: row.date, value: Number(row.value) };
  } catch (e) {
    console.error("FRED latest error", series_id, e?.message);
    return null;
  }
}

async function getTreasuryLatest() {
  try {
    const y2  = await fredLatestValue("DGS2");
    const y10 = await fredLatestValue("DGS10");
    if (y2 && y10) {
      const date = (new Date(y10.date) > new Date(y2.date)) ? y10.date : y2.date;
      return { date, y2: y2.value, y10: y10.value, spread: +(y10.value - y2.value).toFixed(2) };
    }
  } catch (e) {
    console.error("treasury (fred) error", e?.message);
  }
  return null;
}

// --- EIA Helper ---
async function getEiaSeriesLatest(seriesKey) {
  if (!EIA_API_KEY) return null;
  try {
    const [dataset, series] = seriesKey.split(":");
    const url = `https://api.eia.gov/v2/${dataset}/data/`;
    const params = {
      api_key: EIA_API_KEY,
      frequency: "weekly",
      sort: [{ column: "period", direction: "desc" }],
      offset: 0,
      length: 1
    };
    if (series) params["facets[series][]"] = series;
    const data = await cachedGetRaw(url, params, 300_000, "get");
    const row = Array.isArray(data?.response?.data) ? data.response.data[0] : null;
    if (!row) return null;
    return { period: String(row.period), value: Number(row.value) };
  } catch (e) {
    console.error("EIA latest error", seriesKey, e?.message);
    return null;
  }
}

async function getEia5yAvgSameWeek(seriesKey) {
  if (!EIA_API_KEY) return null;
  try {
    const [dataset, series] = seriesKey.split(":");
    const url = `https://api.eia.gov/v2/${dataset}/data/`;
    const params = {
      api_key: EIA_API_KEY,
      frequency: "weekly",
      sort: [{ column: "period", direction: "desc" }],
      offset: 0,
      length: 5000
    };
    if (series) params["facets[series][]"] = series;
    const data = await cachedGetRaw(url, params, 600_000, "get");
    const arr = Array.isArray(data?.response?.data) ? data.response.data : [];
    if (!arr.length) return null;

    const latest = arr[0];
    const latestPeriod = String(latest.period);
    const latestVal = Number(latest.value);

    const year = Number(latestPeriod.slice(0, 4));
    const week = latestPeriod.slice(4);

    let sum = 0, cnt = 0;
    for (let k = 1; k <= 5; k++) {
      const key = `${year - k}${week}`;
      const hit = arr.find(r => String(r.period) === key);
      if (hit && hit.value != null) {
        sum += Number(hit.value);
        cnt++;
      }
    }
    if (!cnt) return null;
    return { latestDate: latestPeriod, latestVal, avg5y: sum / cnt };
  } catch (e) {
    console.error("EIA 5y avg error", seriesKey, e?.message);
    return null;
  }
}

// --- EIA Series Keys ---
const EIA_SERIES = {
  crude_total:   "petroleum/sum/sndw:WCRSTUS1",
  crude_ex_spr:  "petroleum/sum/sndw:WCESTUS1",
  gasoline:      "petroleum/sum/sndw:WGTSTUS1",
  distillate:    "petroleum/sum/sndw:WDISTUS1",
  ng_storage:    "natural-gas/stor/wkly"
};

// --- Main Dashboard Endpoint ---
app.get('/api/market-dashboard', async (req,res)=>{
  try {
    const tickers = String(req.query.tickers||'')
      .split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);

    const out={};
    if(tickers.length){
      await Promise.all(tickers.map(async t=>{
        try{
          const q=await getQuotePolygon(t);
          out[t]={ price:q.price, source:q.source };
        }catch{ out[t]={ error:'no_data' }; }
      }));
    }

    const treasury=await getTreasuryLatest();

    const inventories={};
    await Promise.all(Object.entries(EIA_SERIES).map(async ([key,id])=>{
      try{
        const latest=await getEiaSeriesLatest(id);
        const avg=await getEia5yAvgSameWeek(id);
        const value=latest?.value??null;
        const vs5y=(avg&&value!=null)?((value-avg.avg5y)/avg.avg5y)*100:null;
        inventories[key]={ value, unit:key==='ng_storage'?'Bcf':'kbbl', vs5y_pct:vs5y!=null?+vs5y.toFixed(2):null };
      }catch{ inventories[key]={ value:null, unit:null, vs5y_pct:null }; }
    }));

    res.json({
      tickers: out,
      treasury,
      inventories
    });
  } catch (e) {
    console.error('market-dashboard error', e?.message);
    res.status(500).json({ error:'Market dashboard failed' });
  }
});

// ====== Commodities (inkl. Uran via URA ETF) ======
app.get('/api/commodities', async (_req,res)=>{
  try {
    const out = {};

    const coal = await fredLatestValue("PCOALAUUSDM");
    if (coal) out.coal = { date: coal.date, value: coal.value, unit: "USD/mt" };

    const wti = await fredLatestValue("DCOILWTICO");
    if (wti) out.wti = { date: wti.date, value: wti.value, unit: "USD/bbl" };

    const brent = await fredLatestValue("DCOILBRENTEU");
    if (brent) out.brent = { date: brent.date, value: brent.value, unit: "USD/bbl" };

    const ng = await fredLatestValue("DHHNGSP");
    if (ng) out.henryHub = { date: ng.date, value: ng.value, unit: "USD/MMBtu" };

    // Uranium Proxy (URA)
    try {
      const ura = await getQuotePolygon("URA");
      if (ura?.price) {
        out.uranium = { date: new Date().toISOString().slice(0,10), value: ura.price, unit: "USD (URA ETF)" };
      }
    } catch (e) {
      console.error("URA fetch error", e?.message);
    }

    res.json(out);
  } catch(e){
    console.error("commodities error", e?.message);
    res.status(500).json({ error:"Commodities failed" });
  }
});

// ====== Dividends (Tab 5) ======
app.get('/api/dividends/:ticker', async (req,res)=>{
  try{
    const t=req.params.ticker.toUpperCase();
    const data=await polygonGET(polygonStocks, '/v3/reference/dividends',{ ticker:t, limit:200, order:'desc' },60_000);
    res.json({ ticker:t, results:data?.results||[] });
  }catch(e){
    console.error('dividends error', e?.message);
    res.status(500).json({ error:'Dividends failed' });
  }
});

// --- Dividend Calendar für Portfolio ---
app.get('/api/dividend-calendar', async (_req,res)=>{
  try{
    const pfPath = path.resolve(process.cwd(), 'portfolio.json');
    if (!fs.existsSync(pfPath)) return res.json({ items:[] });

    const json = JSON.parse(fs.readFileSync(pfPath,'utf8'));
    const items = Array.isArray(json.portfolio) ? json.portfolio : [];
    const tickers = items.map(it=>(it.ticker||'').trim().toUpperCase()).filter(Boolean);

    const nowISO = fmtYMD(new Date());
    const out=[];
    for(const t of tickers){
      try{
        const data=await polygonGET(polygonStocks, '/v3/reference/dividends',{ ticker:t, limit:100, order:'desc' },60_000);
        let list=(data?.results||[]).filter(d=>d?.ex_dividend_date).map(d=>({
          ticker:t,
          exDate:d.ex_dividend_date,
          payDate:d.pay_date||null,
          recordDate:d.record_date||null,
          amount:d.cash_amount||null,
          frequency:d.frequency||null,
          declarationDate:d.declaration_date||null
        }));
        list=list.filter(d=>d.exDate>=nowISO);
        out.push(...list);
      }catch(err){ console.error("dividend-calendar fetch error", t, err?.message); }
    }

    out.sort((a,b)=>String(a.exDate).localeCompare(String(b.exDate)));
    res.json({ items:out });
  }catch(e){
    console.error('dividend-calendar error', e?.message);
    res.status(500).json({ error:'Dividend calendar failed' });
  }
});
// ====== Sector Analysis (Tab 6) ======
const SECTOR_MAP = {
  XLE: "Energy",
  XLF: "Financials",
  XLK: "Technology",
  XLV: "Health Care",
  XLU: "Utilities",
  XLI: "Industrials",
  XLY: "Consumer Discretionary",
  XLP: "Consumer Staples",
  XLRE: "Real Estate",
  XLB: "Materials",
  XLC: "Communication Services"
};

app.get('/api/sectors', async (_req, res) => {
  try {
    const tickers = Object.keys(SECTOR_MAP);
    const out = {};

    await Promise.all(tickers.map(async t => {
      try {
        const q   = await getQuotePolygon(t);
        const div = await getDividendTTM(t);

        const price = Number(q.price ?? 0);
        const dps   = Number(div.dps_ttm || 0);
        const yieldPct = (dps > 0 && price > 0) ? +((dps / price) * 100).toFixed(2) : null;

        out[t] = {
          sector: SECTOR_MAP[t],
          price,
          yieldPct,
          samples: div.samples || 0
        };
      } catch {
        out[t] = { sector: SECTOR_MAP[t], error: "no_data" };
      }
    }));

    res.json({ sectors: out });
  } catch (e) {
    console.error("sector error", e?.message);
    res.status(500).json({ error: "Sector analysis failed" });
  }
});

// ====== Macro Summary (Tab Analyse) ======
// VIX: 1) POLY_INDEX_KEY → 2) POLY_STOCKS_KEY → 3) Yahoo-Fallback
async function getVIX() {
  // 1) Polygon Index-Key
  if (polygonIndex) {
    try {
      const data = await polygonGET(polygonIndex, '/v2/aggs/ticker/CBOE:VIX/prev');
      const r = data?.results?.[0];
      if (r && r.c != null) {
        return { value: +r.c, ts: r.t || Date.now(), source: 'polygon_index' };
      }
    } catch (e) {
      console.error('VIX Polygon INDEX error:', e?.message);
    }
  }

  // 2) Polygon Stocks-Key (Fallback)
  try {
    const data = await polygonGET(polygonStocks, '/v2/aggs/ticker/CBOE:VIX/prev');
    const r = data?.results?.[0];
    if (r && r.c != null) {
      return { value: +r.c, ts: r.t || Date.now(), source: 'polygon_stocks' };
    }
  } catch (e) {
    console.error('VIX Polygon STOCKS error:', e?.message);
  }

  // 3) Yahoo-Fallback (stabil & JSON-basiert)
  try {
    const url = "https://query2.finance.yahoo.com/v8/finance/chart/^VIX";
    const { data } = await axios.get(url, { timeout: 10000, headers: { 'User-Agent':'MBFinanceMate/1.0' } });
    const r = data?.chart?.result?.[0];
    if (r?.meta?.regularMarketPrice != null) {
      return {
        value: +r.meta.regularMarketPrice,
        ts: (r.meta.regularMarketTime || Math.floor(Date.now()/1000)) * 1000,
        source: 'yahoo'
      };
    }
  } catch (e) {
    console.error('VIX Yahoo error:', e?.message);
  }

  return { value: null, ts: null, source: 'none' };
}

async function getFearGreed(){
  try{
    const url="https://fear-and-greed-index.p.rapidapi.com/v1/fgi";
    const { data } = await axios.get(url,{
      headers:{
        "X-RapidAPI-Key":process.env.RAPIDAPI_KEY||"",
        "X-RapidAPI-Host":"fear-and-greed-index.p.rapidapi.com"
      },
      timeout:10000
    }).catch(()=>({}));
    if(data?.fgi?.now?.value){
      return { value:data.fgi.now.value, label:data.fgi.now.valueText };
    }
  }catch(e){ console.error("fear&greed error", e?.message); }
  return null;
}

async function getCPIYoY(){
  try{
    const data=await cachedGetRaw(
      "https://api.bls.gov/publicAPI/v2/timeseries/data/",
      { seriesid:["CUSR0000SA0"], ...(BLS_API_KEY?{ registrationkey:BLS_API_KEY }:{}) },
      300_000,"post"
    );
    const arr=data?.Results?.series?.[0]?.data||[];
    if(arr.length>=13){
      const latest=Number(arr[0].value), prev12=Number(arr[12].value);
      if(latest>0&&prev12>0){
        const yoy=((latest-prev12)/prev12)*100;
        return { period:`${arr[0].year}-${arr[0].periodName}`, cpiIndex:latest, yoy:+yoy.toFixed(2) };
      }
    }
  }catch(e){ console.error("cpi error", e?.message); }
  return null;
}

async function getM2YoY(){
  if(!FRED_API_KEY) return null;
  try{
    const data=await cachedGetRaw(
      "https://api.stlouisfed.org/fred/series/observations",
      { series_id:"M2SL", file_type:"json", api_key:FRED_API_KEY, frequency:"m" },
      300_000,"get"
    );
    const obs=data?.observations|| [];
    const clean=obs.filter(o=>o.value!==".").map(o=>({ date:o.date, v:Number(o.value) }));
    if(clean.length>=13){
      const a=clean.at(-1).v, b=clean.at(-13).v;
      const yoy=((a-b)/b)*100;
      return { date:clean.at(-1).date, m2:a, yoy:+yoy.toFixed(2) };
    }
  }catch(e){ console.error("m2 error", e?.message); }
  return null;
}

// --- Macro Endpoint mit Einschätzung ---
app.get("/api/macro/summary", async (_req,res)=>{
  try{
    const treasury = await getTreasuryLatest();
    const cpi      = await getCPIYoY();
    const m2       = await getM2YoY();
    const vix      = await getVIX();
    const fg       = await getFearGreed();

    let text = "📊 Makro-Überblick:\n";

    if (treasury) {
      text += `- 10Y: ${treasury.y10}%, 2Y: ${treasury.y2}%, Spread: ${treasury.spread}% → `;
      text += (treasury.spread < 0) ? "🔻 Inverted Yield Curve\n" : "✅ Normal Curve\n";
    }
    if (cpi) text += `- CPI YoY: ${cpi.yoy}% (${cpi.period})\n`;
    if (m2)  text += `- M2 YoY: ${m2.yoy}% (bis ${m2.date})\n`;
    if (vix) text += `- VIX: ${vix.value} (${vix.source})\n`;
    if (fg)  text += `- Fear & Greed: ${fg.value} (${fg.label})\n`;

    res.json({ summary: text.trim(), treasury, cpi, m2, vix, fearGreed: fg });
  }catch(e){
    console.error("macro summary error", e?.message);
    res.status(500).json({ error:"Macro summary failed" });
  }
});
// ====== Market Cycles (Tab 4 & 6) ======
app.get('/api/market-cycles', async (req, res) => {
  try {
    const tickers = (req.query.tickers || '')
      .split(',')
      .map(s => s.trim().toUpperCase())
      .filter(Boolean);

    if (!tickers.length) {
      return res.status(400).json({ error: 'tickers query required' });
    }

    const out = {};
    await Promise.all(tickers.map(async t => {
      try {
        const now = new Date();
        const d90 = new Date(now.getTime() - 90*24*3600*1000).toISOString().slice(0,10);
        const d30 = new Date(now.getTime() - 30*24*3600*1000).toISOString().slice(0,10);
        const d1  = new Date(now.getTime() - 1*24*3600*1000).toISOString().slice(0,10);

        // aktueller Kurs
        const qNow = await getQuotePolygon(t);
        const price = Number(qNow.price ?? 0);

        // Historische Preise
        async function getClose(ticker, date){
          try {
            const r = await polygonGET(
              polygonStocks,
              `/v1/open-close/${encodeURIComponent(ticker)}/${date}`
            );
            return r?.close ?? null;
          } catch { return null; }
        }

        const [c1, c30, c90] = await Promise.all([
          getClose(t, d1),
          getClose(t, d30),
          getClose(t, d90)
        ]);

        function pct(ref){
          return (price && ref) ? +(((price - ref) / ref) * 100).toFixed(2) : null;
        }

        out[t] = {
          ticker: t,
          price,
          d1: pct(c1),
          d30: pct(c30),
          d90: pct(c90)
        };
      } catch (e) {
        out[t] = { ticker: t, error: e?.message || 'fetch_failed' };
      }
    }));

    res.json({ data: out });
  } catch (e) {
    console.error('market-cycles error', e?.message);
    res.status(500).json({ error: 'Market cycles failed' });
  }
});
// ====== Market Dashboard (Inventories & Freight) ======
app.get("/api/market-dashboard", async (req, res) => {
  try {
    const apiKey = process.env.EIA_API_KEY;
    if (!apiKey) return res.status(500).json({ error: "EIA_API_KEY missing" });

    // Helper zum Abrufen von EIA-Daten
    async function fetchEIA(seriesId){
      const url = `https://api.eia.gov/v2/petroleum/sum/sndw/data/` +
        `?frequency=weekly&data[0]=value&facets[series][]=${seriesId}` +
        `&sort[0][column]=period&sort[0][direction]=desc&offset=0&length=1&api_key=${apiKey}`;
      const r = await fetch(url);
      if (!r.ok) throw new Error(`EIA fetch failed (${r.status})`);
      const j = await r.json();
      return j?.response?.data?.[0]?.value ?? null;
    }

    // 5 wichtige Inventories von EIA
    const [crude_total, crude_ex_spr, gasoline, distillate, ng_storage] = await Promise.all([
      fetchEIA("WCESTUS1"), // Crude oil incl. SPR
      fetchEIA("WCRSTUS1"), // Crude oil ex. SPR
      fetchEIA("WGTSTUS1"), // Gasoline
      fetchEIA("WDITSTUS1"), // Distillate
      fetchEIA("WNGSTUS1")  // Natural gas storage
    ]);

    res.json({
      inventories: {
        crude_total:   { value: crude_total, unit: "Mbbl" },
        crude_ex_spr:  { value: crude_ex_spr, unit: "Mbbl" },
        gasoline:      { value: gasoline, unit: "Mbbl" },
        distillate:    { value: distillate, unit: "Mbbl" },
        ng_storage:    { value: ng_storage, unit: "Bcf" }
      }
    });
  } catch (e) {
    console.error("market-dashboard error", e?.message);
    res.status(500).json({ error: "Market dashboard failed" });
  }
});

// ====== Global Error Handler ======
app.use((err,_req,res,_next)=>{
  console.error('Unhandled', err);
  res.status(500).json({ error:'internal' });
});

// ====== Server Start ======
app.listen(port, ()=>{
  console.log(`✅ Server läuft: http://localhost:${port}`);
});
