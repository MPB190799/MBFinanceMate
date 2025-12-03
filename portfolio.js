/* ===== MBFinanceMate – portfolio.js =====
 * - Lädt Portfolio (GET /api/portfolio) und rendert Tabelle + KPIs
 * - Fügt Positionen hinzu (POST /api/portfolio/add)
 * - Optionales Feld "Dividende erhalten (gesamt, €)" mit id="f-divpaid"
 * - YOC/Current Yield kommen serverseitig aus TTM (Polygon)
 */

/* ---------- Utilities ---------- */

// robustes Parsen: akzeptiert "1.234,56", "1,234.56", "1234,56" oder "1234.56"
function parseLocaleNumber(v) {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').trim();
  if (!s) return 0;

  const hasComma = s.includes(',');
  const hasDot   = s.includes('.');

  if (hasComma && hasDot) {
    const decSep = s.lastIndexOf(',') > s.lastIndexOf('.') ? ',' : '.';
    const grpSep = decSep === ',' ? '.' : ',';
    return Number(
      s.replace(new RegExp('\\' + grpSep, 'g'), '').replace(decSep, '.')
    );
  }
  if (hasComma) {
    return Number(s.replace(/\./g, '').replace(',', '.'));
  }
  return Number(s.replace(/,/g, ''));
}

const $ = (sel) => document.querySelector(sel);
const setTxt = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
const fmtEur = (x) => (x==null || isNaN(x)) ? '–' : Number(x).toLocaleString(undefined,{minimumFractionDigits:2, maximumFractionDigits:2});
const fmtNum = (x, d=2) => (x==null || isNaN(x)) ? '–' : Number(x).toFixed(d);
const fmtPct = (x) => (x==null || isNaN(x)) ? '–' : `${x>0?'+':''}${Number(x).toFixed(2)}%`;

/* ---------- State ---------- */

const state = {
  rows: [],
  totals: { portfolioValue:0, costBasis:0, incomeAnnual:0, gainAbs:0, gainPct:null }
};

/* ---------- API ---------- */

async function apiGetPortfolio(){
  const r = await fetch('/api/portfolio', { cache:'no-store' });
  if(!r.ok) throw new Error(`GET /api/portfolio → ${r.status}`);
  return r.json();
}

async function apiAddPosition(body){
  const r = await fetch('/api/portfolio/add', {
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });
  if(!r.ok){
    const t = await r.text().catch(()=> '');
    throw new Error(`POST /api/portfolio/add → ${r.status} ${t||''}`);
  }
  return r.json();
}

/* ---------- Form Handling ---------- */

window.addPos = async function addPos(){
  try{
    const body = {
      name:   $('#f-name')?.value?.trim() || '',
      isin:   $('#f-isin')?.value?.trim() || '',
      ticker: $('#f-ticker')?.value?.trim().toUpperCase() || '',
      shares: parseLocaleNumber($('#f-shares')?.value),
      avgPrice: parseLocaleNumber($('#f-pp')?.value),
      // optional: gesamthaft bereits erhaltene Dividende (in €)
      divPaidTotal: parseLocaleNumber($('#f-divpaid')?.value || 0)
      // Hinweis: "Current Price" wird serverseitig live geholt; das Feld f-price ist optional.
    };

    if(!body.shares || !body.avgPrice || (!body.ticker && !body.isin && !body.name)){
      alert('Bitte gib Shares, Purchase Price und mindestens eins von (Name/ISIN/Ticker) an.');
      return;
    }

    // UI blocken
    const btn = document.activeElement;
    if(btn && btn.tagName==='BUTTON'){ btn.disabled = true; btn.textContent = 'Hinzufügen…'; }

    await apiAddPosition(body);

    // Formular zurücksetzen
    $('#stock-form')?.reset();

    // Reload
    await loadAndRender();

  }catch(e){
    console.error('addPos error', e);
    alert('Fehler beim Hinzufügen: ' + (e.message||e));
  }finally{
    const btn = document.activeElement;
    if(btn && btn.tagName==='BUTTON'){ btn.disabled = false; btn.textContent = 'Add Position'; }
  }
};

/* ---------- Rendering ---------- */

function renderKPIs(){
  const t = state.totals || {};
  setTxt('portfolio-value-summary', fmtEur(t.portfolioValue));
  setTxt('total-invested',          fmtEur(t.costBasis));

  const gainTxt = t.gainPct==null
    ? `${fmtEur(t.gainAbs)}`
    : `${fmtEur(t.gainAbs)} (${fmtPct(t.gainPct)})`;
  setTxt('total-gain-loss', gainTxt);

  // Ø YOC (TTM/Einstand) – sinnvoll als "IncomeAnnual / CostBasis"
  const avgYOCpct = (t.costBasis>0) ? ( (Number(t.incomeAnnual||0) / Number(t.costBasis||1)) * 100 ) : null;
  setTxt('average-yoc', fmtPct(avgYOCpct));
}

function makeCell(text, cls){
  const td = document.createElement('td');
  if(cls) td.className = cls;
  td.textContent = text;
  return td;
}

function renderTable(){
  const tbody = document.getElementById('portfolio-body');
  if(!tbody) return;

  tbody.innerHTML = '';

  state.rows.forEach(row=>{
    const tr = document.createElement('tr');

    const invested = Number(row.costBasis || 0);
    const valueNow = Number(row.positionValue || 0);

    tr.append(
      makeCell(row.name || '—'),
      makeCell(row.isin || '—'),
      makeCell((row.ticker||'').toUpperCase() || '—'),
      makeCell(fmtNum(row.shares, 2), 'num'),

      makeCell(fmtEur(row.avgPrice), 'num'),
      makeCell(fmtEur(row.currentPrice), 'num'),

      makeCell(fmtNum(row.dividendPerShareTTM, 4), 'num'),
      makeCell(fmtPct(row.yocPct), 'num'),

      makeCell(fmtEur(invested), 'num'),
      makeCell(fmtEur(valueNow), 'num'),

      makeCell(`${fmtEur(row.gainAbs)}${row.gainPct==null?'':` (${fmtPct(row.gainPct)})`}`, 'num'),

      // Optional: Paid (€) & Paid Yield (nur Anzeige, YOC/Yield bleiben TTM-basiert)
      // Wenn du diese zwei Spalten in <thead> ergänzt hast, dann HIER einkommentieren:
      // makeCell(fmtEur(row.paidDividendTotal), 'num'),
      // makeCell(fmtPct(row.paidYieldPct), 'num'),

      makeCell('—') // Action (kein Delete-Endpunkt vorhanden)
    );

    tbody.appendChild(tr);
  });
}

function renderAllocation(){
  // Einfaches Balkendiagramm per Canvas-API (ohne externe Libs)
  const cvs = document.getElementById('allocationChart');
  if(!cvs || !cvs.getContext) return;
  const ctx = cvs.getContext('2d');

  // Daten: Top 8 Positionen nach Positionswert
  const data = state.rows
    .map(r => ({ label:(r.ticker||r.name||'—'), value:Number(r.positionValue||0) }))
    .filter(d => d.value>0)
    .sort((a,b)=>b.value-a.value)
    .slice(0, 8);

  const total = data.reduce((s,d)=>s+d.value,0);
  const W = cvs.width = cvs.clientWidth || 800;
  const H = cvs.height = cvs.clientHeight || 380;

  // Clear
  ctx.clearRect(0,0,W,H);
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillStyle = '#cfd6e6';

  if (!data.length || total<=0) {
    ctx.fillText('Keine Daten für Allokation.', 12, 18);
    return;
  }

  // Balken-Layout
  const barH = Math.max(18, Math.min(36, Math.floor((H-40)/data.length) - 6));
  const x0 = 160; // Platz für Label
  const y0 = 24;

  // Titel
  ctx.fillText('Allokation (Top 8)', 12, 16);

  data.forEach((d, i)=>{
    const y = y0 + i*(barH+10);
    const pct = d.value/total;
    const w = Math.max(4, Math.floor((W - x0 - 24) * pct));

    // Label
    ctx.fillStyle = '#9aa6c0';
    ctx.textAlign = 'left';
    ctx.fillText(d.label, 12, y + barH*0.75);

    // Bar-Hintergrund
    ctx.fillStyle = 'rgba(212,175,55,0.25)';
    ctx.fillRect(x0, y, W - x0 - 24, barH);

    // Bar-Füllung
    ctx.fillStyle = '#d4af37';
    ctx.fillRect(x0, y, w, barH);

    // Prozent
    ctx.fillStyle = '#f5f6fa';
    ctx.textAlign = 'right';
    ctx.fillText((pct*100).toFixed(1)+'%', x0 + w - 6, y + barH*0.75);
  });
}

/* ---------- Load & Bootstrap ---------- */

async function loadAndRender(){
  // kleine Skelett-Anzeige (optional)
  const tbody = document.getElementById('portfolio-body');
  if (tbody) {
    tbody.innerHTML = `
      <tr><td colspan="12">
        <div class="skel" style="height:14px;width:40%"></div>
        <div class="skel" style="height:14px;width:60%;margin-top:8px"></div>
      </td></tr>`;
  }

  const data = await apiGetPortfolio();
  // API liefert { portfolio: [...], totals: {...} }
  state.rows   = Array.isArray(data?.portfolio) ? data.portfolio : (Array.isArray(data?.enriched) ? data.enriched : []);
  state.totals = data?.totals || { portfolioValue:0, costBasis:0, incomeAnnual:0, gainAbs:0, gainPct:null };

  renderKPIs();
  renderTable();
  renderAllocation();
}

document.addEventListener('DOMContentLoaded', () => {
  loadAndRender().catch(err=>{
    console.error(err);
    const tbody = document.getElementById('portfolio-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="12">Fehler: ${err.message||err}</td></tr>`;
  });
});
