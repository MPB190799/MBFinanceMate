"use strict";
/* =====================================================
   MBFinanceMate – portfolio.js v4 (Komplett-Neuschrift)
   
   KERNPRINZIP: YOC und Official Yield werden IMMER
   aus lokalen Broker-Daten berechnet. Dem Server wird
   für Prozent-Werte NICHT vertraut.
   ===================================================== */

/* ── FORMATIERUNG ── */
function parseLocaleNumber(v) {
  if (typeof v === "number") return isFinite(v) ? v : 0;
  const s = String(v ?? "").trim().replace(/\s/g, "");
  if (!s) return 0;
  const hasComma = s.includes(","), hasDot = s.includes(".");
  if (hasComma && hasDot) {
    const dec = s.lastIndexOf(",") > s.lastIndexOf(".") ? "," : ".";
    const grp = dec === "," ? "." : ",";
    return parseFloat(s.replace(new RegExp("\\" + grp, "g"), "").replace(dec, ".")) || 0;
  }
  if (hasComma) return parseFloat(s.replace(/\./g, "").replace(",", ".")) || 0;
  return parseFloat(s.replace(/,/g, "")) || 0;
}
const $      = s  => document.querySelector(s);
const $id    = id => document.getElementById(id);
const setTxt = (id, v) => { const el = $id(id); if (el) el.textContent = v; };
const fmtEur = x => (x == null || isNaN(x)) ? "–" : Number(x).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum = (x, d=2) => (x == null || isNaN(x)) ? "–" : Number(x).toFixed(d);
const fmtPct = x => (x == null || isNaN(x)) ? "–" : `${x>0?"+":""}${Number(x).toFixed(2)}%`;

/* ── SEKTOR-MAPPING ── */
const SECTOR_MAP = {
  TORM:"Shipping",TRMD:"Shipping",CMBT:"Shipping",SEA:"Shipping",SFL:"Shipping",
  FLNG:"LNG Shipping","FLNG.OL":"LNG Shipping",
  ZIM:"Container",MPCC:"Container","MPCC.OL":"Container",GSL:"Container","HLAG.DE":"Container",
  GOGL:"Dry Bulk",SBLK:"Dry Bulk",GNK:"Dry Bulk",DSX:"Dry Bulk",
  FRO:"Tanker",STNG:"Tanker",INSW:"Tanker",DHT:"Tanker",TNK:"Tanker",
  ASC:"Tanker",NAT:"Tanker","OET.OL":"Tanker","HAFNI.OL":"Tanker",
  BWLPG:"LPG Shipping","BWLPG.OL":"LPG Shipping",LPG:"LPG Shipping",
  "HSHIP.OL":"Shipping","HAUTO.OL":"Shipping","WALWIL.OL":"Shipping",
  EC:"Upstream",PBR:"Upstream","PBR.A":"Upstream",
  XOM:"Upstream",CVX:"Upstream",COP:"Upstream",OXY:"Upstream",
  BP:"Upstream","BP.L":"Upstream","ENOG.L":"Upstream","TAL.L":"Upstream",
  "PEN.OL":"Upstream","AKRBP.OL":"Upstream",EQNR:"Upstream","VAR.OL":"Upstream",
  "DNO.OL":"Upstream","HBR.L":"Upstream","SQZ.L":"Upstream","ENQ.L":"Upstream",
  APA:"Upstream",REPX:"Upstream",EPM:"Upstream",DVN:"Upstream",
  "STO.AX":"Upstream","WDS.AX":"Upstream","HZN.AX":"Upstream",
  CSAN:"Upstream",VOC:"Upstream",SD:"Upstream",CVI:"Upstream",PBF:"Upstream",PSX:"Upstream",
  "0883.HK":"Oil & Gas","0386.HK":"Oil & Gas","0857.HK":"Oil & Gas",
  AM:"Midstream",KMI:"Pipeline",OKE:"Pipeline",ET:"Pipeline",MPLX:"Pipeline",
  "ENG.MC":"Pipeline","PPL.TO":"Pipeline","TRP.TO":"Pipeline","ENB.TO":"Pipeline","SOBO.TO":"Pipeline",
  "BIR.TO":"Gas E&P","IPO.TO":"Upstream","WCP.TO":"Upstream","CDV.TO":"Upstream",
  "CNE.TO":"Upstream","SU.TO":"Upstream","TOU.TO":"Upstream","FRU.TO":"Royalties",KRP:"Royalties",
  VALE:"Mining","RIO.AX":"Mining","RIO.L":"Mining","BHP.AX":"Mining",FCX:"Mining",
  "AAL.L":"Mining","GLEN.L":"Mining","CIA.AX":"Mining","S32.AX":"Mining",
  "KIO.J":"Mining","EXX.J":"Mining","GGB":"Mining","CAML.L":"Mining","0358.HK":"Mining",
  "TGA.L":"Coal Mining",
  "PTBA.JK":"Coal","ITMG.JK":"Coal","ADRO.JK":"Coal","WHC.AX":"Coal","YAL.AX":"Coal",SXC:"Coal","1088.HK":"Coal",
  BTG:"Gold Mining","ABX.TO":"Gold Mining",NEM:"Gold Mining",AU:"Gold Mining","FRES.L":"Silver Mining",
  "IMP.J":"Platinum Mining","KAP.L":"Uranium",
  MO:"Tobacco",PM:"Tobacco","BATS.L":"Tobacco",UVV:"Tobacco","STG.CO":"Tobacco",
  PFE:"Pharma",BAX:"Healthcare",CVS:"Healthcare","BAYN.DE":"Pharma",
  O:"REIT",MPW:"REIT",WPC:"REIT",ABR:"REIT",LAND:"REIT",GMRE:"REIT",
  FPI:"REIT",OHI:"REIT",IIPR:"REIT","0823.HK":"REIT","0688.HK":"REIT","GRT.J":"REIT",
  ARCC:"BDC",MAIN:"BDC",HTGC:"BDC",NEWT:"BDC",OXLC:"BDC",CCAP:"BDC",
  RITM:"mREIT",AGNC:"mREIT",EFC:"mREIT",
  UPS:"Logistics",TRN:"Logistics","LHA.DE":"Logistics","PNL.AS":"Logistics","TOUP.PA":"Logistics",
  D:"Utilities",EIX:"Utilities",WTRG:"Utilities","ENEL.MI":"Utilities",ENIC:"Utilities",
  "ENGI.PA":"Utilities","VIE.PA":"Utilities","POST.VI":"Utilities","SVT.L":"Utilities",
  "NG.L":"Utilities","FORTUM.HE":"Utilities","OMV.VI":"Utilities","CEZ.PR":"Utilities",
  "0003.HK":"Utilities","0836.HK":"Utilities",CIG:"Utilities",ELP:"Utilities",
  "FNTN.DE":"Telecom",VZ:"Telecom",T:"Telecom","ORA.PA":"Telecom","BCE.TO":"Telecom","VOD.J":"Telecom",
  "VOW3.DE":"Auto",VWAGY:"Auto","BMW.DE":"Auto","MBG.DE":"Auto","DTR.DE":"Auto","STLAM.MI":"Auto","PAH3.DE":"Auto",
  NTR:"Agriculture",ADM:"Agriculture",LND:"Agriculture",AGRO:"Agriculture",
  DOW:"Chemicals","BAS.DE":"Chemicals",CF:"Chemicals",CTRA:"Upstream",LYB:"Chemicals",
  "1398.HK":"Banking","3988.HK":"Banking","2628.HK":"Insurance","2318.HK":"Insurance",
  "1919.HK":"Shipping",BDORY:"Banking","BNS.TO":"Banking",ITUB:"Banking",
  OWL:"Finance",BEN:"Finance",WU:"Finance",
  INTC:"Tech",PYPL:"Tech",JD:"Tech",BABA:"Tech",XPEV:"EV",
  MARA:"Crypto",BITF:"Crypto",OCGN:"Biotech",
  "SBMO.AS":"Offshore",HP:"Oil Services",NOV:"Oil Services","TGS.OL":"Oil Services",
  "ENI.MI":"Upstream","TTE.PA":"Upstream","REP.MC":"Upstream",
  "ERNX.AS":"ETF","IDTL.L":"ETF","DF-A.TO":"ETF",
  KHC:"Consumer",FLO:"Consumer",CPB:"Consumer",ABEV:"Beverages",
  DEO:"Beverages","DGE.L":"Beverages","6862.HK":"Consumer","2319.HK":"Consumer",
  "F34.SI":"Consumer","UNVR.JK":"Consumer","INDF.JK":"Consumer","MNSO":"Consumer",
  "TBS.J":"Consumer","SZU.DE":"Consumer",
  "ADN.TO":"Forestry","AQN.TO":"Utilities","AFN.TO":"Agriculture",
  "WEED.TO":"Speculative","INGA.AS":"Banking","BN4.SI":"Conglomerate",
  "PTT.BK":"Upstream","MEDC.JK":"Upstream","PGAS.JK":"Utilities",
  "0639.HK":"Mining","855":"Utilities","EC.PA":"Upstream","ENAGAS":"Pipeline",
};
function getSector(ticker) {
  const t = (ticker||"").trim();
  return SECTOR_MAP[t.toUpperCase()]||SECTOR_MAP[t]||"Other";
}
const SECTOR_COLORS = {
  "Shipping":       {bg:"rgba(56,189,248,.15)",  color:"#38bdf8"},
  "LNG Shipping":   {bg:"rgba(56,189,248,.15)",  color:"#38bdf8"},
  "Container":      {bg:"rgba(56,189,248,.12)",  color:"#7dd3fc"},
  "Dry Bulk":       {bg:"rgba(56,189,248,.10)",  color:"#93c5fd"},
  "Tanker":         {bg:"rgba(56,189,248,.18)",  color:"#38bdf8"},
  "LPG Shipping":   {bg:"rgba(56,189,248,.13)",  color:"#38bdf8"},
  "Upstream":       {bg:"rgba(251,146,60,.15)",  color:"#fb923c"},
  "Oil & Gas":      {bg:"rgba(251,146,60,.12)",  color:"#fb923c"},
  "Midstream":      {bg:"rgba(251,191,36,.15)",  color:"#fbbf24"},
  "Pipeline":       {bg:"rgba(251,191,36,.15)",  color:"#fbbf24"},
  "Royalties":      {bg:"rgba(251,191,36,.12)",  color:"#fbbf24"},
  "Gas E&P":        {bg:"rgba(251,146,60,.12)",  color:"#fb923c"},
  "Oil Services":   {bg:"rgba(251,146,60,.10)",  color:"#fdba74"},
  "Mining":         {bg:"rgba(167,139,250,.15)", color:"#a78bfa"},
  "Coal":           {bg:"rgba(156,163,175,.15)", color:"#9ca3af"},
  "Coal Mining":    {bg:"rgba(156,163,175,.15)", color:"#9ca3af"},
  "Gold Mining":    {bg:"rgba(212,175,55,.20)",  color:"#d4af37"},
  "Silver Mining":  {bg:"rgba(192,192,192,.15)", color:"#c0c0c0"},
  "Platinum Mining":{bg:"rgba(192,192,192,.18)", color:"#e5e7eb"},
  "Uranium":        {bg:"rgba(134,239,172,.15)", color:"#86efac"},
  "Tobacco":        {bg:"rgba(239,68,68,.12)",   color:"#ef4444"},
  "Pharma":         {bg:"rgba(52,211,153,.15)",  color:"#34d399"},
  "Healthcare":     {bg:"rgba(52,211,153,.12)",  color:"#6ee7b7"},
  "REIT":           {bg:"rgba(99,102,241,.15)",  color:"#818cf8"},
  "BDC":            {bg:"rgba(99,102,241,.12)",  color:"#818cf8"},
  "mREIT":          {bg:"rgba(99,102,241,.10)",  color:"#a5b4fc"},
  "Logistics":      {bg:"rgba(34,197,94,.12)",   color:"#22c55e"},
  "Offshore":       {bg:"rgba(251,146,60,.12)",  color:"#fb923c"},
  "Utilities":      {bg:"rgba(96,165,250,.12)",  color:"#60a5fa"},
  "Telecom":        {bg:"rgba(96,165,250,.10)",  color:"#93c5fd"},
  "Banking":        {bg:"rgba(248,113,113,.12)", color:"#f87171"},
  "Insurance":      {bg:"rgba(248,113,113,.10)", color:"#fca5a5"},
  "Finance":        {bg:"rgba(248,113,113,.08)", color:"#fca5a5"},
  "Auto":           {bg:"rgba(148,163,184,.12)", color:"#94a3b8"},
  "Chemicals":      {bg:"rgba(167,139,250,.10)", color:"#c4b5fd"},
  "Agriculture":    {bg:"rgba(134,239,172,.12)", color:"#86efac"},
  "Consumer":       {bg:"rgba(148,163,184,.10)", color:"#94a3b8"},
  "Beverages":      {bg:"rgba(148,163,184,.10)", color:"#94a3b8"},
  "Tech":           {bg:"rgba(56,189,248,.10)",  color:"#67e8f9"},
  "EV":             {bg:"rgba(56,189,248,.08)",  color:"#67e8f9"},
  "Crypto":         {bg:"rgba(251,191,36,.10)",  color:"#fde68a"},
  "Biotech":        {bg:"rgba(52,211,153,.10)",  color:"#6ee7b7"},
  "ETF":            {bg:"rgba(148,163,184,.08)", color:"#94a3b8"},
  "Conglomerate":   {bg:"rgba(148,163,184,.10)", color:"#94a3b8"},
  "Forestry":       {bg:"rgba(134,239,172,.10)", color:"#86efac"},
  "Speculative":    {bg:"rgba(239,68,68,.08)",   color:"#fca5a5"},
  "Other":          {bg:"rgba(148,163,184,.08)", color:"#94a3b8"},
};
function sectorBadge(ticker) {
  const s = getSector(ticker);
  const c = SECTOR_COLORS[s]||SECTOR_COLORS["Other"];
  return `<span style="display:inline-block;font-size:.6rem;padding:1px 5px;border-radius:3px;font-weight:700;background:${c.bg};color:${c.color};white-space:nowrap;">${s}</span>`;
}

/* ── FX ── */
const TICKER_CURRENCY = {
  TORM:"USD",TRMD:"USD",FLNG:"USD",ZIM:"USD",GOGL:"USD",FRO:"USD",STNG:"USD",INSW:"USD",
  DHT:"USD",TNK:"USD",ASC:"USD",NAT:"USD",GSL:"USD",SFL:"USD",GNK:"USD",SBLK:"USD",
  VALE:"USD",FCX:"USD",XOM:"USD",CVX:"USD",COP:"USD",OXY:"USD",BP:"USD",SHEL:"USD",
  EC:"USD","PBR.A":"USD",PBR:"USD",CMBT:"USD",LPG:"USD",APA:"USD",REPX:"USD",
  EPM:"USD",DVN:"USD",PSX:"USD",KMI:"USD",OKE:"USD",ET:"USD",MPLX:"USD",AM:"USD",
  O:"USD",MPW:"USD",WPC:"USD",ARCC:"USD",MAIN:"USD",ABR:"USD",HTGC:"USD",OXLC:"USD",
  CCAP:"USD",RITM:"USD",AGNC:"USD",EFC:"USD",NEWT:"USD",OHI:"USD",IIPR:"USD",
  LAND:"USD",GMRE:"USD",FPI:"USD",KRP:"USD",BTG:"USD",NEM:"USD",AU:"USD",
  UPS:"USD",PFE:"USD",BAX:"USD",CVS:"USD",ABEV:"USD",MARA:"USD",BITF:"USD",
  OCGN:"USD",INTC:"USD",PYPL:"USD",JD:"USD",BABA:"USD",XPEV:"USD",
  D:"USD",EIX:"USD",WTRG:"USD",VZ:"USD",T:"USD",BDORY:"USD",ITUB:"USD",
  OWL:"USD",BEN:"USD",WU:"USD",LND:"USD",AGRO:"USD",CVI:"USD",PBF:"USD",
  GGB:"USD",VOC:"USD",SD:"USD",SXC:"USD",CTRA:"USD",DOW:"USD",CF:"USD",
  LYB:"USD",ADM:"USD",HP:"USD",NOV:"USD",KHC:"USD",FLO:"USD",CPB:"USD",
  DEO:"USD",MO:"USD",PM:"USD",UVV:"USD",TRN:"USD",VWAGY:"USD",
  CSAN:"USD",ENIC:"USD",CIG:"USD",ELP:"USD",EQNR:"USD",
  "TGA.L":"GBp","FRES.L":"GBp","BP.L":"GBp","SHEL.L":"GBp","ENOG.L":"GBp",
  "MPE.L":"GBp","AAL.L":"GBp","GLEN.L":"GBp","TAL.L":"GBp","CAML.L":"GBp",
  "SQZ.L":"GBp","HBR.L":"GBp","ENQ.L":"GBp","DEC.L":"GBp","KAP.L":"GBp",
  "RIO.L":"GBp","NG.L":"GBp","SVT.L":"GBp","IDTL.L":"GBp",
  "BWLPG.OL":"NOK","FLNG.OL":"NOK","HAUTO.OL":"NOK","WALWIL.OL":"NOK",
  "HSHIP.OL":"NOK","OET.OL":"NOK","HAFNI.OL":"NOK","PEN.OL":"NOK",
  "AKRBP.OL":"NOK","VAR.OL":"NOK","DNO.OL":"NOK","MPCC.OL":"NOK",
  "ENG.MC":"EUR","SBMO.AS":"EUR","FNTN.DE":"EUR","REP.MC":"EUR","ENGI.PA":"EUR",
  "VIE.PA":"EUR","ORA.PA":"EUR","ENEL.MI":"EUR","ENI.MI":"EUR","STLAM.MI":"EUR",
  "TTE.PA":"EUR","EC.PA":"EUR","TOUP.PA":"EUR","LHA.DE":"EUR","VOW3.DE":"EUR",
  "BMW.DE":"EUR","MBG.DE":"EUR","DTR.DE":"EUR","PAH3.DE":"EUR","BAS.DE":"EUR",
  "BAYN.DE":"EUR","SZU.DE":"EUR","HLAG.DE":"EUR","POST.VI":"EUR","OMV.VI":"EUR",
  "INGA.AS":"EUR","PNL.AS":"EUR","ERNX.AS":"EUR","FORTUM.HE":"EUR",
  "NOVO-B.CO":"EUR","STG.CO":"EUR","PKN.WA":"EUR",
  "BIR.TO":"CAD","FRU.TO":"CAD","CDV.TO":"CAD","WCP.TO":"CAD","IPO.TO":"CAD",
  "CNE.TO":"CAD","TOU.TO":"CAD","SU.TO":"CAD","PPL.TO":"CAD","TRP.TO":"CAD",
  "ENB.TO":"CAD","SOBO.TO":"CAD","ABX.TO":"CAD","BNS.TO":"CAD","NTR.TO":"CAD",
  "BCE.TO":"CAD","AQN.TO":"CAD","ADN.TO":"CAD","AFN.TO":"CAD","DF-A.TO":"CAD","WEED.TO":"CAD",
  "0883.HK":"HKD","1398.HK":"HKD","0386.HK":"HKD","0857.HK":"HKD","1919.HK":"HKD",
  "1088.HK":"HKD","2628.HK":"HKD","2318.HK":"HKD","2319.HK":"HKD","0836.HK":"HKD",
  "0639.HK":"HKD","0688.HK":"HKD","0003.HK":"HKD","6862.HK":"HKD","0823.HK":"HKD","855":"HKD",
  "RIO.AX":"AUD","BHP.AX":"AUD","CIA.AX":"AUD","S32.AX":"AUD","FMG.AX":"AUD",
  "WDS.AX":"AUD","STO.AX":"AUD","HZN.AX":"AUD","WHC.AX":"AUD","YAL.AX":"AUD",
  "TBS.J":"ZAR","EXX.J":"ZAR","KIO.J":"ZAR","IMP.J":"ZAR","GRT.J":"ZAR","VOD.J":"ZAR",
  "F34.SI":"SGD","BN4.SI":"SGD","PTT.BK":"THB","CEZ.PR":"CZK",
};
let FX = {USD:1.0,EUR:1.08,GBP:1.27,GBp:0.0127,NOK:0.092,ZAR:0.055,AUD:0.65,CAD:0.74,HKD:0.128,CZK:0.042,SGD:0.74,THB:0.027,DKK:0.145,PLN:0.25};
async function loadFxRates() {
  try { const r=await fetch("/api/fx-rates",{cache:"no-store"}); if(r.ok){const d=await r.json();if(d?.rates)Object.assign(FX,d.rates);} } catch{}
}
function toEUR(amt,cur) {
  const a=Number(amt); if(!a||!cur||cur==="EUR") return a||0;
  return (a*(FX[cur]??1.0))/(FX["EUR"]??1.08);
}
function detectCurrency(ticker,srv) {
  const t=(ticker||"").trim();
  return TICKER_CURRENCY[t.toUpperCase()]||TICKER_CURRENCY[t]||srv||"USD";
}
/* ══════════════════════════════════════════════════════
   applyFx – Clean Cashflow Logik
   YOC = DPS / Kaufpreis
   Official Yield = DPS / aktueller Kurs
   Keine Broker-Werte. Keine Server-Prozente.
   ══════════════════════════════════════════════════════ */
function applyFx(row) {
  const currency = detectCurrency(row.ticker, row.currency);

  const shares   = Number(row.shares || 0);
  const avgPrice = Number(row.avgPrice || 0);

  // Aktueller Kurs in EUR
  const currentPriceEUR = toEUR(
    Number(row.currentPrice || row.curPrice || 0),
    currency
  );

  // DPS in EUR (Jahresdividende je Aktie)
  const dpsEUR = toEUR(
    Number(row.dividendPerShareTTM || row.dps || 0),
    currency
  );

  // === KERNLOGIK ===

  // Annual Dividend Income
  const dividendIncomeAnnual = dpsEUR > 0
    ? +(dpsEUR * shares).toFixed(2)
    : 0;

  // Your YOC (nur aus Einstand!)
  const yocPct = (avgPrice > 0 && dpsEUR > 0)
    ? +((dpsEUR / avgPrice) * 100).toFixed(2)
    : null;

  // Official Yield (aktueller Kurs!)
  const officialYieldPct = (currentPriceEUR > 0 && dpsEUR > 0)
    ? +((dpsEUR / currentPriceEUR) * 100).toFixed(2)
    : null;

  // Positionswerte
  const investedVal = +(avgPrice * shares).toFixed(2);
  const positionVal = +(currentPriceEUR * shares).toFixed(2);

  const gainAbs = +(positionVal - investedVal).toFixed(2);
  const gainPct = investedVal > 0
    ? +((gainAbs / investedVal) * 100).toFixed(2)
    : null;

  return {
    ...row,
    currency,
    dpsEUR,
    curPriceEUR: currentPriceEUR,
    dividendIncomeAnnual,
    yocPct,
    officialYieldPct,
    investedVal,
    positionVal,
    gainAbs,
    gainPct,
    fxCorrected: currency !== "EUR",
    sector: getSector(row.ticker),
  };
}

/* ── STATE & API ── */
const state = {rows:[],totals:{portfolioValue:0,costBasis:0,gainAbs:0,gainPct:null},editingRow:null};

async function apiGet()      { const r=await fetch("/api/portfolio",{cache:"no-store"}); if(!r.ok) throw new Error("Ladefehler: "+r.status); return r.json(); }
async function apiAdd(body)  { const r=await fetch("/api/portfolio/add",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}); if(!r.ok) throw new Error("Fehler: "+r.status); return r.json(); }
async function apiUpdate(id,p){ const r=await fetch(`/api/portfolio/${encodeURIComponent(id)}`,{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(p)}); if(!r.ok){const t=await r.text().catch(()=>""); throw new Error(`Speichern fehlgeschlagen (${r.status}): ${t}`);} return r.json(); }
async function apiDelete(id) { const r=await fetch(`/api/portfolio/${encodeURIComponent(id)}`,{method:"DELETE"}); if(!r.ok) throw new Error("Löschen fehlgeschlagen: "+r.status); return r.json(); }

/* ── TOAST ── */
function showToast(msg,type="success") {
  let el=$id("mb-toast");
  if(!el){el=document.createElement("div");el.id="mb-toast";el.style.cssText="position:fixed;bottom:28px;right:28px;z-index:99999;padding:12px 22px;border-radius:10px;font-size:.84rem;font-weight:600;box-shadow:0 8px 32px rgba(0,0,0,.6);transition:opacity .4s;max-width:340px;line-height:1.4;pointer-events:none;";document.body.appendChild(el);}
  const ok=type==="success";
  el.style.background=ok?"rgba(34,197,94,.2)":"rgba(239,68,68,.2)";
  el.style.border=ok?"1px solid rgba(34,197,94,.5)":"1px solid rgba(239,68,68,.5)";
  el.style.color=ok?"#4ade80":"#f87171";
  el.style.opacity="1"; el.textContent=msg;
  clearTimeout(el._t); el._t=setTimeout(()=>{el.style.opacity="0";},3500);
}

/* ── POSITION HINZUFÜGEN ── */
window.addPos = async function() {
  const btn=$id("btn-add-pos");
  try {
    const body={
      name:    ($id("f-name")?.value||"").trim(),
      isin:    ($id("f-isin")?.value||"").trim(),
      ticker:  ($id("f-ticker")?.value||"").trim().toUpperCase(),
      shares:          parseLocaleNumber($id("f-shares")?.value),
      avgPrice:        parseLocaleNumber($id("f-pp")?.value),
      divPaidTotal:    parseLocaleNumber($id("f-divpaid")?.value||0),
      yocBroker:       parseLocaleNumber($id("f-yocbroker")?.value||0),
      divIncomeAnnual: parseLocaleNumber($id("f-divincome")?.value||0),
    };
    if(!body.shares||!body.avgPrice){alert("Bitte Shares und Kaufpreis angeben.");return;}
    if(btn){btn.disabled=true;btn.textContent="⏳ Speichern…";}
    const result=await apiAdd(body);
    showToast(result?.action==="updated" ? `✅ ${body.ticker||body.name} aktualisiert` : `✅ ${body.ticker||body.name} hinzugefügt`);
    $id("stock-form")?.reset();
    await loadAndRender();
  } catch(e){showToast("❌ "+e.message,"error");}
  finally{if(btn){btn.disabled=false;btn.textContent="+ Position hinzufügen";}}
};

/* ── INCOME GOAL PROGRESS ── */
const MONTHLY_GOAL = 2000;
function renderGoalProgress() {
  const rows = state.rows;
  const totalIncome = rows.reduce((s,r)=>s+(r.dividendIncomeAnnual||0),0);
  const monthlyIncome = totalIncome / 12;
  const pct = Math.min(100, (monthlyIncome / MONTHLY_GOAL) * 100);
  const remaining = Math.max(0, MONTHLY_GOAL - monthlyIncome);

  const bar = $id("goal-bar");
  if(bar) bar.style.width = pct.toFixed(1)+"%";

  setTxt("goal-current-monthly", fmtEur(monthlyIncome)+" €");
  setTxt("goal-pct-label", pct.toFixed(0)+"%");
  setTxt("goal-yearly-income", "Annual: "+fmtEur(totalIncome)+" €");
  setTxt("goal-monthly-missing", "Missing: "+fmtEur(remaining)+" €/mo");

  const remEl=$id("goal-remaining");
  if(remEl) {
    if(monthlyIncome >= MONTHLY_GOAL) {
      remEl.textContent = "🎉 Goal reached!";
      remEl.style.color = "#4ade80";
    } else {
      remEl.textContent = fmtEur(remaining)+" € below goal";
    }
  }

  // ETA: How many years at 8% annual growth until goal?
  const etaEl = $id("goal-eta");
  if(etaEl && monthlyIncome > 0 && monthlyIncome < MONTHLY_GOAL) {
    let y=0, cur=monthlyIncome;
    while(cur < MONTHLY_GOAL && y < 30){ cur*=1.08; y++; }
    const yr = new Date().getFullYear() + y;
    etaEl.textContent = `Target ETA: ~${yr} (at 8% p.a. growth)`;
  } else if(etaEl) {
    etaEl.textContent = monthlyIncome >= MONTHLY_GOAL ? "Target ETA: Now ✅" : "";
  }

  // Update KPI monthly income card
  setTxt("kpi-monthly-income", fmtEur(monthlyIncome)+" €");
}

/* ── NACHKAUF RANKING ── */
function renderNachkaufRanking() {
  const tbody = $id("nachkauf-ranking-body");
  if(!tbody) return;
  const rows = state.rows;

  const ranked = rows
    .filter(r => r.curPriceEUR > 0 && r.officialYieldPct > 0)
    .map(r => ({
      ...r,
      incomePerK: (r.officialYieldPct / 100) * 1000,
      monthlyPerK: ((r.officialYieldPct / 100) * 1000) / 12,
    }))
    .sort((a,b) => b.officialYieldPct - a.officialYieldPct)
    .slice(0, 12);

  if(!ranked.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:20px;color:#7a8aaa;">No data available yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = ranked.map((r,i) => {
    const yld = r.officialYieldPct;
    const yoc = r.yocPct;
    const rec = yld > 15 ? `<span style="color:#ef4444;font-size:.72rem;font-weight:700;">⚠️ Check risk</span>`
              : yld > 10 ? `<span style="color:#fb923c;font-size:.72rem;font-weight:700;">🟠 High yield</span>`
              : yld > 6  ? `<span style="color:#4ade80;font-size:.72rem;font-weight:700;">✅ Good</span>`
              : `<span style="color:#7a8aaa;font-size:.72rem;">—</span>`;
    const medal = i===0?"🥇 ":i===1?"🥈 ":i===2?"🥉 ":"";
    const yldCol = yld>=10?"color:#fb923c":yld>=6?"color:#4ade80":"color:#94a3b8";
    const yocCol = yoc!=null&&yoc>=8?"color:#e8c050":yoc!=null&&yoc>=5?"color:#4ade80":"color:#9aa6c0";
    return `<tr>
      <td><strong style="color:#f0f4ff;">${medal}${r.ticker}</strong><br><span style="font-size:.75rem;color:#7a8aaa;">${r.name||""}</span></td>
      <td class="num">${fmtEur(r.curPriceEUR)} €</td>
      <td class="num"><span style="${yldCol};font-weight:700;">${fmtPct(yld)}</span></td>
      <td class="num"><span style="${yocCol};font-weight:700;">${yoc!=null?fmtPct(yoc):"–"}</span></td>
      <td class="num" style="color:#e8c050;font-weight:700;">+${fmtEur(r.monthlyPerK)} €/mo</td>
      <td class="num" style="color:#4ade80;font-weight:700;">+${fmtEur(r.incomePerK)} €/yr</td>
      <td class="num">${rec}</td>
    </tr>`;
  }).join("");
}

/* ── KPIs ── */
function renderKPIs() {
  const rows=state.rows, t=state.totals;
  const totalIncome  = rows.reduce((s,r)=>s+(r.dividendIncomeAnnual||0),0);
  const totalDivPaid = rows.reduce((s,r)=>s+(r.divPaidTotal||0),0);
  const totalValue   = rows.reduce((s,r)=>s+(r.positionVal||r.positionValue||r.curValue||0),0);
  const totalInv     = rows.reduce((s,r)=>s+(r.investedVal||r.costBasis||r.investedValue||0),0);
  const gain         = totalValue-totalInv;
  const gainPct      = totalInv>0?(gain/totalInv)*100:null;
  let yocSum=0,yocW=0;
  rows.forEach(r=>{if(r.yocPct!=null){const w=r.investedVal||r.costBasis||1;yocSum+=r.yocPct*w;yocW+=w;}});
  const avgYoc=yocW>0?yocSum/yocW:null;

  setTxt("portfolio-value-summary",fmtEur(t.portfolioValue||totalValue)+" €");
  setTxt("total-invested",         fmtEur(t.costBasis||totalInv)+" €");
  setTxt("total-dividend-income",  fmtEur(totalIncome)+" €");
  setTxt("total-div-paid",         fmtEur(totalDivPaid)+" €");
  setTxt("average-yoc",            avgYoc!=null?fmtPct(avgYoc):"–");
  const gainEl=$id("total-gain-loss");
  if(gainEl){
    const a=t.gainAbs??gain; const p=t.gainPct??gainPct;
    gainEl.textContent=p!=null?`${fmtEur(a)} € (${fmtPct(p)})`:`${fmtEur(a)} €`;
    gainEl.style.color=a>=0?"#4ade80":"#f87171";
  }
}

/* ── TABELLE ── */
function makeCell(t,c){const td=document.createElement("td");if(c)td.className=c;td.textContent=t;return td;}
function htmlCell(h,c){const td=document.createElement("td");if(c)td.className=c;td.innerHTML=h;return td;}

function renderTable() {
  const tbody=$id("portfolio-body");
  if(!tbody) return;
  tbody.innerHTML="";
  if(!state.rows.length){
    tbody.innerHTML=`<tr><td colspan="14" style="text-align:center;padding:32px;color:#7a8aaa;">Noch keine Positionen vorhanden.</td></tr>`;
    return;
  }
  const sorted=[...state.rows].sort((a,b)=>(b.positionVal||b.positionValue||b.curValue||0)-(a.positionVal||a.positionValue||a.curValue||0));
  sorted.forEach((row,idx)=>{
    if(!row.id) row={...row,id:"tmp-"+idx};
    const yoc=row.yocPct, yld=row.officialYieldPct;
    const tr=document.createElement("tr");
    tr.dataset.rowId=String(row.id);
    tr.style.cursor="pointer";
    tr.title="Klicken zum Bearbeiten / Nachkaufen";

    // Farblogik
    if(yoc!=null&&yoc>=8){
      tr.style.background="rgba(212,175,55,0.08)";
      tr.style.borderLeft="3px solid #d4af37";
    } else if(yoc!=null&&yld!=null&&yoc>yld+0.5){
      tr.style.background="rgba(74,222,128,0.05)";
      tr.style.borderLeft="3px solid rgba(74,222,128,0.35)";
    } else if(yld!=null&&yld>=8){
      tr.style.background="rgba(251,146,60,0.05)";
      tr.style.borderLeft="3px solid rgba(251,146,60,0.35)";
    }
    tr.addEventListener("click",()=>{if(window.getSelection()?.toString())return;window.openEdit(row.id);});

    const inv=row.investedVal||row.costBasis||row.investedValue||0;
    const cur=row.positionVal||row.positionValue||row.curValue||0;
    const gAbs=row.gainAbs??(cur-inv);
    const gPct=row.gainPct??(inv>0?(gAbs/inv)*100:null);
    const gainStr=gPct!=null?`${fmtEur(gAbs)} € (${fmtPct(gPct)})`:`${fmtEur(gAbs)} €`;

    let badge="";
    if(yoc!=null&&yoc>=8) badge=`<span style="font-size:.6rem;padding:1px 5px;border-radius:3px;background:rgba(212,175,55,.25);color:#d4af37;font-weight:800;margin-left:3px;">★ GOLD</span>`;
    else if(yoc!=null&&yld!=null&&yoc>yld+0.5) badge=`<span style="font-size:.6rem;padding:1px 5px;border-radius:3px;background:rgba(74,222,128,.18);color:#4ade80;font-weight:800;margin-left:3px;">↑ YOC</span>`;

    const yocCol=yoc==null?"":yoc>=8?"color:#d4af37;font-weight:800;":yoc>=5?"color:#4ade80;":"color:#9aa6c0;";
    const yldCol=yld==null?"":yld>=8?"color:#fb923c;":yld>=5?"color:#4ade80;":"color:#94a3b8;";
    const fxTag=row.fxCorrected?`<span title="${row.currency}→EUR" style="font-size:.6rem;color:#d4af37;margin-left:3px;">${row.currency}</span>`:"";
    const p=row.curPriceEUR??row.currentPrice??row.curPrice??0;
    const dps=row.dpsEUR??row.dividendPerShareTTM??0;

    tr.append(
      htmlCell(`<span style="font-weight:600;color:#e8edf8;">${row.name||"–"}</span><br>${sectorBadge(row.ticker)}`),
      makeCell(row.isin||"–"),
      makeCell((row.ticker||"–").toUpperCase()),
      makeCell(fmtNum(row.shares,2),"num"),
      makeCell(fmtEur(row.avgPrice)+" €","num"),
      htmlCell(fmtEur(p)+" €"+fxTag,"num"),
      makeCell(fmtNum(dps,4)+" €","num"),
      htmlCell(`<span style="${yldCol}">${fmtPct(yld)}</span>`,"num"),
      htmlCell(`<span style="${yocCol}">${fmtPct(yoc)}</span>${badge}`,"num"),
      makeCell(fmtEur(row.dividendIncomeAnnual||0)+" €","num"),
      makeCell(fmtEur(inv)+" €","num"),
      makeCell(fmtEur(cur)+" €","num"),
      htmlCell(gainStr,gAbs>=0?"num mc-up":"num mc-down"),
      htmlCell(`<span style="font-size:.85rem;cursor:pointer;opacity:.7;" title="Bearbeiten">✏️</span>`,"num"),
    );
    tbody.appendChild(tr);
  });
}

/* ── SMART WATCHLIST ── */
function renderWatchlist() {
  const el=$id("smart-watchlist"); if(!el) return;
  const scored=state.rows.map(r=>{
    let sc=0; const sigs=[];
    const yld=r.officialYieldPct,yoc=r.yocPct,gp=r.gainPct;
    if(yld!=null&&yld>20)         {sc+=5;sigs.push(`⚠️ Yield <strong>${fmtNum(yld)}%</strong> → extremes Div-Cut Risiko`);}
    else if(yld!=null&&yld>12)    {sc+=3;sigs.push(`⚠️ Yield <strong>${fmtNum(yld)}%</strong> → erhöhtes Div-Cut Risiko`);}
    else if(yld!=null&&yld>8)     {sc+=1;sigs.push(`🟠 Yield <strong>${fmtNum(yld)}%</strong> → prüfen`);}
    if(gp!=null&&gp<-30)          {sc+=4;sigs.push(`📉 <strong>${Math.abs(gp).toFixed(0)}%</strong> unter Einstand – Stop-Loss?`);}
    else if(gp!=null&&gp<-20)     {sc+=2;sigs.push(`📉 <strong>${Math.abs(gp).toFixed(0)}%</strong> unter Einstand`);}
    else if(gp!=null&&gp<-10)     {sc+=1;sigs.push(`📉 <strong>${Math.abs(gp).toFixed(0)}%</strong> unter Einstand – beobachten`);}
    if(gp!=null&&gp>100)          {sc+=4;sigs.push(`🚀 +<strong>${gp.toFixed(0)}%</strong> Gewinn → Gewinnsicherung erwägen`);}
    else if(gp!=null&&gp>60)      {sc+=2;sigs.push(`🎯 +<strong>${gp.toFixed(0)}%</strong> Gewinn → Rebalancing?`);}
    else if(gp!=null&&gp>40)      {sc+=1;sigs.push(`🎯 +<strong>${gp.toFixed(0)}%</strong> Gewinn – im Blick`);}
    if(yoc!=null&&yoc>20)         {sc+=3;sigs.push(`🎰 YOC <strong>${fmtNum(yoc)}%</strong> → Sonderdividenden möglich`);}
    if(yoc!=null&&yoc>=8)         {sc+=1;sigs.push(`⭐ YOC <strong>${fmtNum(yoc)}%</strong> ≥ 8% – exzellent`);}
    if(yoc!=null&&yld!=null&&yoc>yld+3){sc+=1;sigs.push(`💚 YOC (${fmtNum(yoc)}%) übertrifft Markt-Yield (${fmtNum(yld)}%) deutlich`);}
    return{...r,score:sc,sigs};
  }).filter(r=>r.score>0).sort((a,b)=>b.score-a.score).slice(0,12);

  if(!scored.length){el.innerHTML=`<p style="color:#7a8aaa;font-style:italic;">Keine Signale – Portfolio im grünen Bereich ✅</p>`;return;}
  el.innerHTML=scored.map(r=>`
    <div style="margin-bottom:8px;padding:10px 14px;background:rgba(255,255,255,.025);border-left:3px solid #c9a227;border-radius:6px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;margin-bottom:4px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <strong style="color:#f0f4ff;">${r.ticker} – ${r.name}</strong>${sectorBadge(r.ticker)}
        </div>
        <span style="color:#7a8aaa;font-size:.76rem;">YOC: ${fmtPct(r.yocPct)} | Yield: ${fmtPct(r.officialYieldPct)} | P/L: ${fmtPct(r.gainPct)}</span>
      </div>
      ${r.sigs.map(s=>`<div style="font-size:.82rem;color:#c8d4ec;margin-bottom:2px;">${s}</div>`).join("")}
    </div>`).join("");
}

/* ── ALLOCATION CHART ── */
function renderAllocation() {
  const cvs=$id("allocationChart"); if(!cvs?.getContext) return;
  const ctx=cvs.getContext("2d");
  const data=state.rows.map(r=>({label:r.ticker||r.name||"–",value:Number(r.positionVal||r.positionValue||r.curValue||0),sector:r.sector||"Other",yoc:r.yocPct}))
    .filter(d=>d.value>0).sort((a,b)=>b.value-a.value).slice(0,15);
  const total=data.reduce((s,d)=>s+d.value,0);
  const W=cvs.width=cvs.offsetWidth||800;
  const H=cvs.height=cvs.offsetHeight||320;
  ctx.clearRect(0,0,W,H);
  if(!data.length||total<=0) return;
  const barH=Math.max(14,Math.min(26,Math.floor((H-40)/data.length)));
  const x0=150,maxW=W-x0-60;
  ctx.font="11px 'Sora',system-ui"; ctx.fillStyle="#7a8aaa";
  ctx.textAlign="left"; ctx.fillText("Portfolio-Allokation (Top 15)",0,14);
  data.forEach((d,i)=>{
    const y=28+i*(barH+4),pct=d.value/total,bw=Math.max(4,Math.floor(maxW*pct));
    const col=SECTOR_COLORS[d.sector]||SECTOR_COLORS["Other"];
    ctx.fillStyle="#9aa6c0"; ctx.textAlign="right";
    ctx.fillText(d.label.length>12?d.label.slice(0,11)+"…":d.label,x0-6,y+barH*.72);
    ctx.fillStyle="rgba(255,255,255,.03)"; ctx.fillRect(x0,y,maxW,barH);
    ctx.fillStyle=col.bg.replace(/[\d.]+\)$/,"0.85)"); ctx.fillRect(x0,y,bw,barH);
    if(d.yoc!=null&&d.yoc>=8){ctx.strokeStyle="#d4af37";ctx.lineWidth=1.5;ctx.strokeRect(x0,y,bw,barH);}
    ctx.fillStyle="#e8edf8"; ctx.textAlign="left";
    ctx.fillText((pct*100).toFixed(1)+"%",x0+bw+4,y+barH*.72);
  });
}

/* ── EDIT MODAL ── */
window.openEdit = function(id) {
  const row=state.rows.find(r=>String(r.id)===String(id)); if(!row) return;
  state.editingRow=row;
  const set=(eid,v)=>{const el=$id(eid);if(el)el.value=v??""};
  set("e-name",     row.name);
  set("e-isin",     row.isin);
  set("e-ticker",   row.ticker);
  set("e-shares",   row.shares);
  set("e-pp",       row.avgPrice);
  set("e-divpaid",  row.divPaidTotal||0);
  set("e-yocbroker",row.yocBroker||0);
  set("e-divincome",row.divIncomeAnnual||0);
  const infoEl=$id("e-info");
  if(infoEl){
    infoEl.innerHTML=[
      `💰 Kurs: <strong>${fmtEur(row.curPriceEUR||row.curPrice||0)} €</strong>${row.fxCorrected?` <em style="color:#d4af37;font-size:.75rem;">(${row.currency})</em>`:""}`,
      `📈 YOC: <strong style="color:${(row.yocPct||0)>=8?"#d4af37":"#4ade80"}">${fmtPct(row.yocPct)}</strong>`,
      `🎯 Yield: <strong>${fmtPct(row.officialYieldPct)}</strong>`,
      `P/L: <strong style="color:${(row.gainAbs||0)>=0?"#4ade80":"#f87171"}">${fmtPct(row.gainPct)}</strong>`,
    ].join(" &nbsp;·&nbsp; ");
  }
  set("e-nachkauf-shares",""); set("e-nachkauf-price","");
  const prev=$id("e-nachkauf-preview"); if(prev) prev.textContent="";
  const modal=$id("edit-modal"); if(modal){modal.style.display="flex";modal.style.opacity="1";}
};
window.closeEdit = function() {
  state.editingRow=null;
  const modal=$id("edit-modal"); if(modal) modal.style.display="none";
};
window.updateNachkaufPreview = function() {
  const row=state.editingRow; if(!row) return;
  const addS=parseLocaleNumber($id("e-nachkauf-shares")?.value);
  const addP=parseLocaleNumber($id("e-nachkauf-price")?.value);
  const prev=$id("e-nachkauf-preview"); if(!prev) return;
  if(!addS||!addP){prev.textContent="";return;}
  const newS=Number(row.shares||0)+addS;
  const newA=(Number(row.shares||0)*Number(row.avgPrice||0)+addS*addP)/newS;
  prev.innerHTML=`Neuer Ø-Preis: <strong style="color:#d4af37;">${fmtEur(newA)} €</strong> &nbsp;|&nbsp; Neue Stückzahl: <strong>${fmtNum(newS,2)}</strong>`;
  prev.dataset.newShares=newS; prev.dataset.newAvg=newA;
};
window.applyNachkauf = function() {
  const prev=$id("e-nachkauf-preview"); if(!prev?.dataset.newShares) return;
  const sEl=$id("e-shares"),pEl=$id("e-pp");
  if(sEl){sEl.value=fmtNum(parseFloat(prev.dataset.newShares),2);sEl.style.outline="2px solid #d4af37";setTimeout(()=>{sEl.style.outline="";},1200);}
  if(pEl){pEl.value=fmtNum(parseFloat(prev.dataset.newAvg),2);pEl.style.outline="2px solid #d4af37";setTimeout(()=>{pEl.style.outline="";},1200);}
};
window.saveEdit = async function() {
  const row=state.editingRow; if(!row) return;
  const btn=$id("e-save-btn");
  if(btn){btn.disabled=true;btn.textContent="⏳ Speichern…";}
  try {
    const patch={
      name:    ($id("e-name")?.value||"").trim(),
      isin:    ($id("e-isin")?.value||"").trim(),
      ticker:  ($id("e-ticker")?.value||"").trim().toUpperCase(),
      shares:          parseLocaleNumber($id("e-shares")?.value),
      avgPrice:        parseLocaleNumber($id("e-pp")?.value),
      divPaidTotal:    parseLocaleNumber($id("e-divpaid")?.value||0),
      yocBroker:       parseLocaleNumber($id("e-yocbroker")?.value||0),
      divIncomeAnnual: parseLocaleNumber($id("e-divincome")?.value||0),
    };
    if(!patch.shares||!patch.avgPrice){alert("Shares und Kaufpreis erforderlich.");return;}
    await apiUpdate(row.id,patch);
    showToast(`✅ ${patch.ticker||patch.name} gespeichert`);
    closeEdit(); await loadAndRender();
  } catch(e){showToast("❌ "+e.message,"error");alert(e.message);}
  finally{if(btn){btn.disabled=false;btn.textContent="💾 Speichern";}}
};
window.deletePos = async function() {
  const row=state.editingRow; if(!row) return;
  if(!confirm(`Position "${row.name}" (${row.ticker}) wirklich löschen?`)) return;
  const btn=$id("e-delete-btn"); if(btn){btn.disabled=true;btn.textContent="⏳…";}
  try {
    await apiDelete(row.id);
    showToast(`🗑 ${row.ticker||row.name} gelöscht`);
    closeEdit(); await loadAndRender();
  } catch(e){showToast("❌ "+e.message,"error");if(btn){btn.disabled=false;btn.textContent="🗑 Löschen";}}
};
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeEdit();});
document.addEventListener("click",e=>{const m=$id("edit-modal");if(m&&e.target===m)closeEdit();});

/* ── BOOTSTRAP ── */
async function loadAndRender() {
  const tbody=$id("portfolio-body");
  if(tbody) tbody.innerHTML=`<tr><td colspan="14" style="text-align:center;padding:24px;color:#7a8aaa;">⏳ Lade Portfolio…</td></tr>`;
  try {
    await loadFxRates();
    const data=await apiGet();
    state.rows=(data?.portfolio||[]).map(applyFx);
    state.totals=data?.totals||state.totals;
    renderKPIs(); renderGoalProgress(); renderNachkaufRanking(); renderTable(); renderAllocation(); renderWatchlist();
  } catch(e) {
    console.error("[Portfolio]",e);
    if(tbody) tbody.innerHTML=`<tr><td colspan="14" style="color:#ef4444;padding:20px;text-align:center;">⚠️ Fehler: ${e.message}<br><small style="color:#7a8aaa;">Prüfe ob der Server läuft.</small></td></tr>`;
  }
}
window.loadAndRender=loadAndRender;
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",loadAndRender);}else{loadAndRender();}