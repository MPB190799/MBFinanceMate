"use strict";
/* ============================================================
   MBFinanceMate – calendar.js
   Dividend Calendar with smart payment-month estimation
   Shows monthly cashflow distribution across the year
   ============================================================ */

(function() {

/* ── PAYMENT SCHEDULE KNOWLEDGE BASE ── */
// months = array of month numbers (1=Jan, 12=Dec) in which dividends are paid
const PAYMENT_MONTHS = {
  // ── Monthly payers ──
  O:    [1,2,3,4,5,6,7,8,9,10,11,12],
  AGNC: [1,2,3,4,5,6,7,8,9,10,11,12],
  LAND: [1,2,3,4,5,6,7,8,9,10,11,12],
  MAIN: [1,2,3,4,5,6,7,8,9,10,11,12],
  OXLC: [1,2,3,4,5,6,7,8,9,10,11,12],
  RITM: [1,4,7,10],

  // ── US Quarterly (Mar/Jun/Sep/Dec cycle) ──
  ARCC: [3,6,9,12], HTGC: [3,6,9,12], EFC: [3,6,9,12],
  NEM:  [3,6,9,12], BTG:  [3,6,9,12], AU:  [3,6,9,12],
  XOM:  [3,6,9,12], CVX:  [3,6,9,12], PSX: [3,6,9,12],
  OHI:  [3,6,9,12], MPW:  [3,6,9,12], IIPR:[3,6,9,12],
  WPC:  [1,4,7,10], ABR:  [1,4,7,10], GMRE:[1,4,7,10],
  FPI:  [1,4,7,10], LAND: [1,4,7,10], CCAP:[1,4,7,10],
  NEWT: [1,4,7,10], SFL: [3,6,9,12],

  // ── US Quarterly (Feb/May/Aug/Nov cycle) ──
  VZ:   [2,5,8,11], T:    [2,5,8,11], MO:   [1,4,7,10],
  PM:   [1,4,7,10], KMI:  [2,5,8,11], ET:   [2,5,8,11],
  MPLX: [2,5,8,11], OKE:  [2,5,8,11], DVN:  [3,6,9,12],
  APA:  [3,6,9,12], COP:  [2,5,8,11], OXY:  [1,4,7,10],
  PBF:  [3,6,9,12], CVI:  [3,6,9,12], SD:   [1,4,7,10],
  UPS:  [3,6,9,12], PFE:  [3,6,9,12], DOW:  [3,6,9,12],
  LYB:  [2,5,8,11], CF:   [3,6,9,12], KHC:  [3,6,9,12],
  FLO:  [2,5,8,11], CPB:  [1,4,7,10], ADM:  [3,6,9,12],
  UVV:  [1,4,7,10], DEO:  [1,7], // Diageo semi-annual
  ABEV: [3,9],  ITUB: [3,6,9,12], D: [3,6,9,12],
  EIX:  [1,4,7,10], WTRG:[3,6,9,12],

  // ── Shipping – mostly quarterly ──
  GOGL: [2,5,8,11], SBLK: [3,6,9,12], GNK: [3,6,9,12],
  TRMD: [3,6,9,12], FRO:  [3,6,9,12], INSW:[2,5,8,11],
  DHT:  [3,6,9,12], TNK:  [2,5,8,11], NAT: [2,5,8,11],
  GSL:  [1,4,7,10], STNG: [1,4,7,10], CMBT:[3,6,9,12],
  LPG:  [3,6,9,12], SEA:  [3,6,9,12], ASC: [2,5,8,11],
  DSX:  [3,6,9,12], FLNG: [1,4,7,10],
  ZIM:  [4,12],      // ZIM irregular semi-annual (Apr + Dec)
  MPCC: [3,6,9,12],

  // ── Norwegian tickers (.OL) – often quarterly ──
  "BWLPG.OL": [3,6,9,12], "FLNG.OL":  [1,4,7,10],
  "HAUTO.OL": [3,6,9,12], "WALWIL.OL":[3,6,9,12],
  "HSHIP.OL": [3,6,9,12], "OET.OL":   [3,6,9,12],
  "HAFNI.OL": [3,6,9,12], "PEN.OL":   [6,12],
  "AKRBP.OL": [3,9],      "VAR.OL":   [3,9],
  "DNO.OL":   [3,9],      "MPCC.OL":  [3,6,9,12],

  // ── UK tickers (.L) – semi-annual or annual ──
  "TGA.L":   [5,11],   "FRES.L":  [5,9],
  "BP.L":    [3,6,9,12],"ENOG.L": [5,11],
  "AAL.L":   [5,9],    "GLEN.L":  [3,9],
  "TAL.L":   [5,11],   "CAML.L":  [5,11],
  "SQZ.L":   [6,12],   "HBR.L":   [6,12],
  "ENQ.L":   [6,12],   "KAP.L":   [5,11],
  "RIO.L":   [3,9],    "NG.L":    [1,7],
  "SVT.L":   [1,7],    "IDTL.L":  [1,4,7,10],

  // ── EUR tickers (.DE/.MI/.PA/.AS/.MC etc.) – semi-annual/annual ──
  "ENG.MC":  [6,12], "REP.MC":  [6,12],
  "ENGI.PA": [5,11], "VIE.PA":  [6,12],
  "ORA.PA":  [6,12], "ENEL.MI": [6,12],
  "ENI.MI":  [5,11], "STLAM.MI":[5,11],
  "TTE.PA":  [3,6,9,12], "LHA.DE":[5,11],
  "VOW3.DE": [5],     "BMW.DE":  [5],
  "MBG.DE":  [5],     "DTR.DE":  [5],
  "BAS.DE":  [5],     "BAYN.DE": [5],
  "HLAG.DE": [6,12],  "OMV.VI":  [5],
  "INGA.AS": [6,12],  "PNL.AS":  [6,12],
  "ERNX.AS": [3,6,9,12],
  "FORTUM.HE":[5,11], "POST.VI": [5],

  // ── Canadian tickers (.TO) – quarterly ──
  "ENB.TO":  [3,6,9,12], "TRP.TO":  [1,4,7,10],
  "PPL.TO":  [3,6,9,12], "BCE.TO":  [1,4,7,10],
  "BNS.TO":  [1,4,7,10], "ABX.TO":  [3,6,9,12],

  // ── HK/Asian tickers ──
  "0883.HK": [6,12], "1398.HK": [6,12],
  "0386.HK": [6,12], "0857.HK": [6,12],
  "1088.HK": [6,12], "2628.HK": [6,12],
  "2318.HK": [6,12], "2319.HK": [6,12],
  "0823.HK": [3,9],  "0688.HK": [6,12],

  // ── AUS tickers (.AX) – semi-annual ──
  "RIO.AX": [3,9], "BHP.AX": [3,9],
  "S32.AX": [3,9], "WHC.AX": [9,3],
  "WDS.AX": [3,9], "STO.AX": [3,9],

  // ── South Africa (.J) ──
  "TBS.J": [9], "EXX.J": [3,9],
  "KIO.J": [3,9], "IMP.J": [3,9],

  // ── US Energy/Commodity ──
  EC:   [3,9],    // Ecopetrol semi-annual
  PBR:  [3,9],    "PBR.A": [3,9],
  VALE: [3,9],    FCX: [3,6,9,12],
  CSAN: [3,9],    EQNR: [3,6,9,12],
  ENIC: [3,9],    CIG: [3,6,9,12],
  ELP:  [3,6,9,12],

  // ── BDC / mREIT ──
  AGNC: [1,2,3,4,5,6,7,8,9,10,11,12],
  RITM: [1,4,7,10], EFC: [1,4,7,10],

  // ── Tobacco ──
  MO:   [1,4,7,10], PM: [1,4,7,10],
  "BATS.L": [5,9],  UVV: [1,4,7,10],
};

/* ── HELPERS ── */
function fmtEur(x) {
  if(x==null||isNaN(x)) return "0.00";
  return Number(x).toLocaleString("de-DE",{minimumFractionDigits:2,maximumFractionDigits:2});
}

function getPaymentMonths(ticker) {
  const t = (ticker||"").trim();
  if(PAYMENT_MONTHS[t]) return PAYMENT_MONTHS[t];
  if(PAYMENT_MONTHS[t.toUpperCase()]) return PAYMENT_MONTHS[t.toUpperCase()];

  // Heuristic by suffix
  const suffix = t.match(/\.([A-Z]+)$/)?.[1];
  if(suffix === "L")  return [5,11]; // UK = semi-annual
  if(suffix === "OL") return [3,6,9,12]; // Norway = quarterly
  if(suffix === "DE" || suffix === "MI" || suffix === "PA" || suffix === "AS" || suffix === "MC" || suffix === "VI") return [6,12]; // EUR = semi-annual
  if(suffix === "TO" || suffix === "AX") return [3,6,9,12]; // Canada/Australia = quarterly
  if(suffix === "HK" || suffix === "SI") return [6,12];
  if(suffix === "JK" || suffix === "BK") return [6,12];
  if(suffix === "J")  return [3,9];
  if(suffix === "CO" || suffix === "HE") return [6,12];

  // Hash-based quarterly pattern for unknowns (distributes across 3 patterns)
  const hash = [...t].reduce((s,c)=>s+c.charCodeAt(0),0) % 3;
  return [[3,6,9,12],[2,5,8,11],[1,4,7,10]][hash];
}

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const MONTH_NAMES_FULL = ["January","February","March","April","May","June","July","August","September","October","November","December"];

/* ── MAIN ── */
window.loadCalendar = async function() {
  try {
    const res = await fetch("/api/portfolio", {cache:"no-store"});
    if(!res.ok) throw new Error("HTTP "+res.status);
    const data = await res.json();
    const portfolio = Array.isArray(data?.portfolio) ? data.portfolio : [];

    if(!portfolio.length) {
      document.getElementById("cal-heatmap").innerHTML = '<p style="color:#7a8aaa;">No portfolio data found.</p>';
      return;
    }

    // Build month → [{ticker, name, amount, shares, dps}] map
    const monthData = Array.from({length:12}, ()=>[]);
    let totalAnnual = 0;
    let posCount = 0;

    portfolio.forEach(pos => {
      const ticker  = pos.ticker || "";
      const shares  = Number(pos.shares || 0);
      const divAnn  = Number(pos.divIncomeAnnual || pos.dividendIncomeAnnual || 0);

      if(!shares || !divAnn || divAnn <= 0) return;

      posCount++;
      totalAnnual += divAnn;

      const months = getPaymentMonths(ticker);
      const perPayment = divAnn / months.length;

      months.forEach(m => {
        monthData[m-1].push({
          ticker,
          name: pos.name || ticker,
          shares,
          amount: perPayment,
          dps: Number(pos.dividendPerShareTTM || pos.divIncomeAnnual / shares / months.length || 0),
        });
      });
    });

    const monthTotals = monthData.map(arr => arr.reduce((s,p)=>s+p.amount,0));
    const avgMonthly  = totalAnnual / 12;
    const maxMonth    = Math.max(...monthTotals);
    const minMonth    = Math.min(...monthTotals.filter(v=>v>0));
    const bestIdx     = monthTotals.indexOf(maxMonth);
    const worstIdx    = monthTotals.indexOf(minMonth);

    // ── SUMMARY CARDS ──
    document.getElementById("cal-annual")?.setText  && null;
    const el = id => document.getElementById(id);
    const setText = (id,v) => { const e=el(id); if(e) e.textContent=v; };

    setText("cal-annual",    fmtEur(totalAnnual)+" €");
    setText("cal-avg",       fmtEur(avgMonthly)+" €");
    setText("cal-best",      MONTH_NAMES[bestIdx]+": "+fmtEur(maxMonth)+" €");
    setText("cal-worst",     MONTH_NAMES[worstIdx]+": "+fmtEur(minMonth)+" €");
    setText("cal-positions", posCount+" positions");

    // ── HEATMAP ──
    const heatmap = el("cal-heatmap");
    if(heatmap) {
      const currentMonth = new Date().getMonth(); // 0-indexed
      heatmap.innerHTML = monthTotals.map((amt,i) => {
        const intensity = maxMonth > 0 ? amt / maxMonth : 0;
        const isCurrent = i === currentMonth;
        const isLow     = amt < avgMonthly * 0.5 && amt > 0;
        const isHigh    = amt >= avgMonthly * 1.5;

        const bgColor = amt === 0
          ? "rgba(255,255,255,.03)"
          : isHigh
          ? `rgba(201,162,39,${0.15 + intensity*0.5})`
          : `rgba(201,162,39,${0.06 + intensity*0.35})`;

        const borderColor = isCurrent
          ? "rgba(201,162,39,.8)"
          : isHigh
          ? "rgba(201,162,39,.35)"
          : "rgba(255,255,255,.07)";

        const textColor  = intensity > 0.7 ? "#0a0c0f" : "#f0f4ff";
        const amtColor   = intensity > 0.7 ? "#0a0c0f" : "#e8c050";
        const indicator  = amt === 0 ? "" : isHigh ? " 🔥" : isLow ? " ⚠️" : "";
        const pctOfGoal  = ((amt / 2000) * 100).toFixed(0);

        const numPayers = monthData[i].length;

        return `<div style="
          background:${bgColor};
          border:1px solid ${borderColor};
          border-radius:10px;
          padding:14px 12px;
          cursor:pointer;
          transition:transform 150ms,box-shadow 150ms;
          ${isCurrent ? "box-shadow:0 0 0 2px rgba(201,162,39,.5);" : ""}
          position:relative;
        " onclick="calToggleMonth(${i})" onmouseenter="this.style.transform='translateY(-2px)';this.style.boxShadow='0 8px 24px rgba(0,0,0,.4)'" onmouseleave="this.style.transform='';this.style.boxShadow='${isCurrent?"0 0 0 2px rgba(201,162,39,.5)":""}'">
          ${isCurrent ? `<div style="position:absolute;top:6px;right:8px;font-size:.6rem;font-weight:700;color:#e8c050;letter-spacing:.06em;">NOW</div>` : ""}
          <div style="font-size:.78rem;font-weight:700;color:${textColor};margin-bottom:6px;">${MONTH_NAMES[i]}${indicator}</div>
          <div style="font-family:'JetBrains Mono',monospace;font-size:1.05rem;font-weight:800;color:${amtColor};margin-bottom:4px;">${amt > 0 ? fmtEur(amt)+" €" : "<span style='color:#4a5570;font-size:.85rem;'>no income</span>"}</div>
          ${amt > 0 ? `<div style="font-size:.68rem;color:${intensity>0.7?"#0a0c0f":"#7a8aaa"};">${numPayers} payer${numPayers!==1?"s":""} · ${pctOfGoal}% of goal</div>` : ""}
        </div>`;
      }).join("");
    }

    // ── PAYOUT SCHEDULE TABLE ──
    const schedule = el("cal-schedule");
    if(schedule) {
      let html = '<table class="portfolio-table" style="font-size:.8rem;">';
      html += '<thead><tr><th>Month</th><th>Position</th><th style="text-align:right;">Expected Amount</th><th style="text-align:right;">% of Annual</th></tr></thead><tbody>';

      monthTotals.forEach((total, i) => {
        if(total <= 0) return;
        const payers = monthData[i].sort((a,b)=>b.amount-a.amount);
        const pct    = totalAnnual > 0 ? ((total/totalAnnual)*100).toFixed(1) : "0.0";
        const isHighMonth = total >= avgMonthly * 1.3;

        // Month header row
        html += `<tr style="background:rgba(201,162,39,.07);">
          <td colspan="2" style="font-weight:800;color:#e8c050;">
            ${MONTH_NAMES_FULL[i]} ${isHighMonth?"🔥":""}
          </td>
          <td class="num" style="color:#e8c050;font-weight:800;">${fmtEur(total)} €</td>
          <td class="num" style="color:#9aa6c0;">${pct}%</td>
        </tr>`;

        payers.forEach(p => {
          const pctOfMonth = total > 0 ? ((p.amount/total)*100).toFixed(0) : "0";
          html += `<tr>
            <td style="padding-left:20px;color:#7a8aaa;font-size:.75rem;">↳</td>
            <td>
              <span style="font-weight:600;color:#c8d4ec;">${p.ticker}</span>
              <span style="color:#7a8aaa;font-size:.75rem;margin-left:6px;">${p.name}</span>
            </td>
            <td class="num">${fmtEur(p.amount)} €</td>
            <td class="num" style="color:#7a8aaa;">${pctOfMonth}%</td>
          </tr>`;
        });
      });

      html += '</tbody></table>';
      schedule.innerHTML = html;
    }

    // ── DRY MONTHS WARNING ──
    const dryMonths = monthTotals
      .map((v,i)=>({month:MONTH_NAMES_FULL[i],v,i}))
      .filter(m => m.v < avgMonthly * 0.3);

    const dryWarn = el("cal-dry-warning");
    const dryCont = el("cal-dry-content");
    if(dryMonths.length > 0 && dryWarn && dryCont) {
      dryWarn.style.display = "block";
      const names = dryMonths.map(m=>m.v===0?`<strong>${m.month}</strong> (€0.00)`: `<strong>${m.month}</strong> (${fmtEur(m.v)} €)`).join(", ");
      dryCont.innerHTML = `
        <p>Months with less than 30% of average monthly income detected: ${names}.</p>
        <p style="margin-top:8px;">💡 <strong>Tip:</strong> Consider adding positions that pay in these months to smooth your cashflow.
        Monthly payers (AGNC, O, MAIN, LAND) can fill these gaps effectively.</p>
      `;
    }

    // ── SECTOR DISTRIBUTION ──
    const sectorMap = {};
    portfolio.forEach(pos => {
      const divAnn = Number(pos.divIncomeAnnual || 0);
      if(!divAnn) return;
      const sector = (window.getSector && window.getSector(pos.ticker)) || "Other";
      sectorMap[sector] = (sectorMap[sector]||0) + divAnn;
    });

    const sectorDist = el("cal-sector-dist");
    if(sectorDist) {
      const sorted = Object.entries(sectorMap).sort((a,b)=>b[1]-a[1]);
      const maxVal = sorted[0]?.[1] || 1;
      let html = '<div style="display:flex;flex-direction:column;gap:8px;">';
      sorted.forEach(([sector, val]) => {
        const pct = (val/totalAnnual*100).toFixed(1);
        const w   = (val/maxVal*100).toFixed(1);
        html += `<div style="display:flex;align-items:center;gap:10px;">
          <div style="width:100px;flex-shrink:0;font-size:.78rem;color:#c8d4ec;text-align:right;">${sector}</div>
          <div style="flex:1;height:20px;background:rgba(255,255,255,.04);border-radius:4px;overflow:hidden;">
            <div style="height:100%;width:${w}%;background:rgba(201,162,39,.6);border-radius:4px;"></div>
          </div>
          <div style="width:120px;flex-shrink:0;font-family:'JetBrains Mono',monospace;font-size:.78rem;color:#e8c050;">${fmtEur(val)} € (${pct}%)</div>
        </div>`;
      });
      html += "</div>";
      sectorDist.innerHTML = html;
    }

    // ── MONTH EXPAND ──
    window.calToggleMonth = function(idx) {
      // Highlight selected month in heatmap
      const cells = document.querySelectorAll("#cal-heatmap > div");
      cells.forEach((c,i)=>{ c.style.outline = i===idx ? "2px solid #e8c050" : ""; });
    };

  } catch(e) {
    console.error("[Calendar]", e);
    const h = document.getElementById("cal-heatmap");
    if(h) h.innerHTML = `<p style="color:#ef4444;">Error loading calendar: ${e.message}</p>`;
  }
};

})();
