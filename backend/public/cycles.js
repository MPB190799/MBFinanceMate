"use strict";

// cycles.js – OPTIMIZED v3.0
// NEU: Frachtraten-Schätzer (BDI, BDTI, SCFI Proxy)
//      Saisonalität (wann sind Raten historisch hoch/niedrig?)
//      Dividenden-Timing (wann Sonderdividenden wahrscheinlich?)
//      Edelmetall-Zyklus | Zins-Overlay | Portfolio-Einschätzung

(function () {

  /* =============================================================
     HELPERS
  ============================================================= */

  const num = v => (typeof v === "number" && isFinite(v)) ? v : null;
  const trendArrow = v => v == null ? "→" : v > 0 ? "↑" : v < 0 ? "↓" : "→";
  const pct  = v => v == null ? "–" : `${v.toFixed(2)}%`;
  const sign = v => v == null ? "–" : `${v > 0 ? "+" : ""}${v.toFixed(2)}%`;

  const colorize = v => {
    if (v == null) return "–";
    if (v > 0) return `<span class="mc-up">+${v.toFixed(2)}%</span>`;
    if (v < 0) return `<span class="mc-down">${v.toFixed(2)}%</span>`;
    return `<span class="mc-flat">0.00%</span>`;
  };

  const badge = s => {
    if (s >= 2)  return `<span class="mc-badge mc-bull">Bullish</span>`;
    if (s <= -2) return `<span class="mc-badge mc-bear">Bearish</span>`;
    return `<span class="mc-badge mc-mixed">Mixed</span>`;
  };

  const safeHTML = (id, html) => { const el = document.getElementById(id); if (el) el.innerHTML = html; };
  const safeText = (id, txt)  => { const el = document.getElementById(id); if (el) el.innerText  = txt;  };

  const coerceReturns = row => {
    const price = num(row?.price);
    let d1  = num(row?.d1);
    let d30 = num(row?.d30);
    let d90 = num(row?.d90);
    if (price != null) {
      const c1  = num(row?.close1d);
      const c30 = num(row?.close30d);
      const c90 = num(row?.close90d);
      if (d1  == null && c1  != null && c1  !== 0) d1  = ((price / c1)  - 1) * 100;
      if (d30 == null && c30 != null && c30 !== 0) d30 = ((price / c30) - 1) * 100;
      if (d90 == null && c90 != null && c90 !== 0) d90 = ((price / c90) - 1) * 100;
    }
    return { price, d1, d30, d90 };
  };

  function scoreFromReturns(d30, d90) {
    let s = 0;
    if (d30 != null) {
      if (d30 > 0)   s += 1;
      if (d30 > 10)  s += 1;
      if (d30 < 0)   s -= 1;
      if (d30 < -10) s -= 1;
    }
    if (d90 != null) {
      if (d90 > 0)   s += 1;
      if (d90 > 15)  s += 1;
      if (d90 < 0)   s -= 1;
      if (d90 < -15) s -= 1;
    }
    return s;
  }

  function cycleLabel(score) {
    if (score >= 5)  return { icon: "🟢", phase: "Boom",      action: "Gewinne teilweise sichern",       color: "#4ade80" };
    if (score >= 2)  return { icon: "🟡", phase: "Erholung",  action: "Halten / Nachkaufen bei Dips",    color: "#fbbf24" };
    if (score >= -1) return { icon: "🟡", phase: "Übergang",  action: "Selektiv – Stock-Picking",        color: "#fbbf24" };
    if (score >= -4) return { icon: "🔴", phase: "Abschwung", action: "Vorsicht – Cashflow prüfen",      color: "#f97316" };
    return             { icon: "🔵", phase: "Boden",     action: "Akkumulieren für nächsten Zyklus", color: "#60a5fa" };
  }

  /* =============================================================
     NEU: FRACHTRATEN-SCHÄTZER
     Da BDI/BDTI/SCFI keine freien APIs haben, nutzen wir:
     1) Proxy-Ticker Momentum (BDRY, ZIM, GOGL, TORM, FLNG)
     2) Saisonalität (historische Muster)
     3) EIA Exports als Tanker-Indikator
     4) Makro-Kontext (Welthandel, USD-Stärke)

     Ergebnis: geschätztes Raten-Niveau + Handlungsempfehlung
  ============================================================= */

  // Saisonalitätsmuster (historische Muster, kein Garantie)
  // Quelle: jahrzehntelange BDI/BDTI Studien
  const SEASONALITY = {
    // Dry Bulk (BDI): Q4 + Q1 oft stark (Getreideernte Südamerika, Kohle)
    //                 Q2/Q3 oft schwächer
    dryBulk: [
    // Jan  Feb  Mrz  Apr  Mai  Jun  Jul  Aug  Sep  Okt  Nov  Dez
       +1,  +1,  +2,  0,   -1,  -1,  0,   +1,  +2,  +2,  +1,  +1
    ],
    // Tanker (BDTI/BCTI): Sommer oft schwächer (Raffinerie-Wartung)
    //                     Winter oft stärker (Heizöl-Nachfrage)
    tanker: [
    // Jan  Feb  Mrz  Apr  Mai  Jun  Jul  Aug  Sep  Okt  Nov  Dez
       +2,  +1,  0,   -1,  -1,  -2,  -1,  0,   +1,  +2,  +2,  +2
    ],
    // LNG: Winter klar besser (Heizung Europa/Asien)
    lng: [
    // Jan  Feb  Mrz  Apr  Mai  Jun  Jul  Aug  Sep  Okt  Nov  Dez
       +3,  +2,  +1,  0,   -1,  -2,  -2,  -1,  +1,  +2,  +3,  +3
    ],
    // Container (SCFI): Q1 schwach nach CNY, Q3/Q4 stark (Weihnachts-Voraus)
    container: [
    // Jan  Feb  Mrz  Apr  Mai  Jun  Jul  Aug  Sep  Okt  Nov  Dez
       -2,  -2,  0,   +1,  +1,  +2,  +2,  +3,  +3,  +2,  +1,  -1
    ]
  };

  function getSeasonalScore(type) {
    const month = new Date().getMonth(); // 0 = Januar
    return SEASONALITY[type]?.[month] ?? 0;
  }

  function getSeasonalNote(type, score) {
    const monthNames = ["Jan","Feb","Mrz","Apr","Mai","Jun","Jul","Aug","Sep","Okt","Nov","Dez"];
    const month = monthNames[new Date().getMonth()];

    if (score >= 2) return `📅 ${month} historisch stark für ${type}-Raten`;
    if (score <= -2) return `📅 ${month} historisch schwach für ${type}-Raten`;
    return `📅 ${month} saisonal neutral für ${type}-Raten`;
  }

  // Schätzt das aktuelle Frachtratenniveau aus Proxy-Momentum + Saisonalität
  function estimateFreightLevel(proxyScore, seasonalScore, sectorName) {
    const combined = proxyScore + seasonalScore;

    if (combined >= 5)  return { level: "HOCH",      icon: "🔴", note: `${sectorName}-Raten geschätzt über Durchschnitt → Cashflows stark, Sonderdividenden wahrscheinlicher`, divSignal: "bullish" };
    if (combined >= 2)  return { level: "ERHÖHT",    icon: "🟠", note: `${sectorName}-Raten über Durchschnitt → solide Cashflows`, divSignal: "bullish" };
    if (combined >= -1) return { level: "NORMAL",    icon: "🟡", note: `${sectorName}-Raten im normalen Bereich → stabile Dividenden`, divSignal: "neutral" };
    if (combined >= -4) return { level: "NIEDRIG",   icon: "🔵", note: `${sectorName}-Raten unter Durchschnitt → Cashflow-Druck, reguläre Dividenden gefährdet`, divSignal: "bearish" };
    return                     { level: "SEHR TIEF", icon: "⚫", note: `${sectorName}-Raten sehr niedrig → Sonderdividenden unwahrscheinlich, Kürzungsrisiko`, divSignal: "bearish" };
  }

  /* =============================================================
     NEU: DIVIDENDEN-TIMING SCHÄTZER
     Wann werden Sonderdividenden für Shipping ausgeschüttet?
     Basiert auf historischen Mustern der Top-Zahler
  ============================================================= */

  // Historische Sonderdividenden-Muster (GOGL, TORM, ZIM, BW LPG)
  const SPECIAL_DIV_HISTORY = {
    // Typischerweise nach Q2 und Q4 Earnings (März/August/November)
    // Shipping: oft März (Q4 Report), August (Q2 Report)
    peakMonths: [2, 7, 10], // März=2, August=7, November=10 (0-indexed)
    // Monate wo Ankündigungen häufig: 1-2 Monate vor Ausschüttung
    announceMonths: [1, 6, 9], // Feb, Jul, Okt
  };

  function getSpecialDivTiming() {
    const month = new Date().getMonth();
    const isPeakMonth     = SPECIAL_DIV_HISTORY.peakMonths.includes(month);
    const isAnnounceMonth = SPECIAL_DIV_HISTORY.announceMonths.includes(month);

    if (isPeakMonth) {
      return {
        icon:  "🎰",
        alert: "AUSSCHÜTTUNGSMONAT",
        note:  "Historisch häufiger Monat für Sonderdividenden-Ausschüttungen (GOGL, TORM, ZIM, BW LPG). Ex-Div-Daten beobachten!",
        color: "#4ade80"
      };
    }
    if (isAnnounceMonth) {
      return {
        icon:  "📢",
        alert: "ANKÜNDIGUNGSMONAT",
        note:  "Häufiger Monat für Sonderdividenden-Ankündigungen. Earnings-Calls und IR-Seiten beobachten!",
        color: "#fbbf24"
      };
    }
    return {
      icon:  "📅",
      alert: "NORMALER MONAT",
      note:  "Kein typischer Sonderdividenden-Monat. Nächste Fenster: Feb/Jul/Okt (Ankündigung) · Mrz/Aug/Nov (Ausschüttung).",
      color: "#9aa6c0"
    };
  }

  /* =============================================================
     1) SHIPPING BLOCK (komplett neu mit Frachtraten-Schätzer)
  ============================================================= */

  const SHIPPING_SECTORS = [
    {
      name:        "Dry Bulk",
      seasonType:  "dryBulk",
      tickers:     ["BDRY", "GOGL"],
      rateIndex:   "Baltic Dry Index (BDI)",
      positions:   "GOGL, SBLK, SALT",
      divNote:     "GOGL & SBLK zahlen variable Dividenden direkt proportional zu BDI"
    },
    {
      name:        "Crude Tanker",
      seasonType:  "tanker",
      tickers:     ["TORM", "FRO"],
      rateIndex:   "Baltic Dirty Tanker Index (BDTI)",
      positions:   "TORM, FRO, STNG, INSW",
      divNote:     "TORM & FRO: Dividenden folgen Frachtraten mit ~1 Quartal Verzögerung"
    },
    {
      name:        "LNG Shipping",
      seasonType:  "lng",
      tickers:     ["FLNG"],
      rateIndex:   "LNG Spot Rate ($/Tag)",
      positions:   "FLNG, GLNG, COOL",
      divNote:     "FLNG: Langfristverträge stabilisieren Dividenden, aber Spot-Exposure vorhanden"
    },
    {
      name:        "Container",
      seasonType:  "container",
      tickers:     ["ZIM"],
      rateIndex:   "Shanghai Container Freight Index (SCFI)",
      positions:   "ZIM",
      divNote:     "ZIM: Sonderdividenden extrem volatil – direkte SCFI-Abhängigkeit"
    },
    {
      name:        "Global Proxy",
      seasonType:  "dryBulk", // Mix
      tickers:     ["SEA"],
      rateIndex:   "Diversifizierter Index",
      positions:   "SEA ETF",
      divNote:     "Diversifizierter Shipping-ETF als Gesamtmarkt-Signal"
    }
  ];

  function buildShippingBlock(data, oilScore) {
    let html = "";

    // ---- Dividenden-Timing ----
    const divTiming = getSpecialDivTiming();
    html += `
      <div style="margin-bottom:16px; padding:12px 14px; border-left:4px solid ${divTiming.color}; background:rgba(255,255,255,0.02); border-radius:4px;">
        <strong>${divTiming.icon} Sonderdividenden-Timing: ${divTiming.alert}</strong><br>
        <span class="mc-note">${divTiming.note}</span>
      </div>
    `;

    html += `<strong>🚢 Shipping-Zyklus & Frachtraten-Schätzer</strong><br>`;
    html += `<span class="mc-note">Proxy-Momentum + historische Saisonalität → geschätztes Raten-Niveau</span><br><br>`;

    let totalProxyScore = 0;
    let totalDivSignals = { bullish: 0, neutral: 0, bearish: 0 };

    for (const sector of SHIPPING_SECTORS) {
      let bucketScore = 0;
      const details = [];

      for (const t of sector.tickers) {
        const row = coerceReturns(data[t] || data[t.toLowerCase()] || {});
        const s   = scoreFromReturns(row.d30, row.d90);
        bucketScore += s;
        details.push(`${t}: 1M ${pct(row.d30)} · 3M ${pct(row.d90)}`);
      }

      totalProxyScore += bucketScore;

      // Saisonalität
      const seasonScore = getSeasonalScore(sector.seasonType);
      const seasonNote  = getSeasonalNote(sector.seasonType, seasonScore);

      // Frachtraten-Einschätzung
      const freight = estimateFreightLevel(bucketScore, seasonScore, sector.name);
      totalDivSignals[freight.divSignal]++;

      html += `
        <div style="margin-bottom:14px; padding:10px 12px; background:rgba(255,255,255,0.02); border-left:3px solid ${
          freight.divSignal === "bullish" ? "#4ade80" : freight.divSignal === "bearish" ? "#ef4444" : "#fbbf24"
        }; border-radius:4px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <strong>${sector.name}</strong>
            <span style="font-size:0.85rem; font-weight:700;">${freight.icon} ${freight.level}</span>
          </div>
          <div style="font-size:0.8rem; color:#9aa6c0; margin-bottom:4px;">
            📊 Index: ${sector.rateIndex}
          </div>
          <div style="font-size:0.8rem; color:#cfd6e6; margin-bottom:4px;">
            ${freight.note}
          </div>
          <div style="font-size:0.78rem; color:#9aa6c0; margin-bottom:4px;">
            ${seasonNote}
          </div>
          <div style="font-size:0.78rem; color:#6b7280; margin-bottom:4px;">
            Proxy: ${details.join(" | ")}
          </div>
          <div style="font-size:0.78rem; color:#d4af37;">
            💡 ${sector.divNote}
          </div>
        </div>
      `;
    }

    // Öl-Overlay für Tanker
    if (oilScore >= 2) {
      totalProxyScore += 2;
      html += `<div class="mc-note">🛢️ EIA: Lager knapp → Rückenwind für Crude-Tanker-Cashflows</div><br>`;
    } else if (oilScore <= -2) {
      totalProxyScore -= 2;
      html += `<div class="mc-note">🛢️ EIA: Lager hoch → Gegenwind für Energy/Tanker</div><br>`;
    }

    // Gesamt-Fazit Shipping
    const finalLbl = cycleLabel(totalProxyScore);
    const divMajority = totalDivSignals.bullish > totalDivSignals.bearish ? "bullish" :
                        totalDivSignals.bearish > totalDivSignals.bullish ? "bearish" : "neutral";

    html += `
      <div style="margin-top:8px; padding:12px 14px; background:rgba(212,175,55,0.05); border:1px solid rgba(212,175,55,0.2); border-radius:4px;">
        <strong>🎯 Gesamt-Fazit Shipping:</strong> ${finalLbl.icon} <strong>${finalLbl.phase}</strong><br>
        <span class="mc-note">→ ${finalLbl.action}</span><br>
        <span class="mc-note">Sonderdividenden-Klima: ${
          divMajority === "bullish" ? "✅ Günstig – mehrere Sektoren mit positiven Cashflow-Signalen" :
          divMajority === "bearish" ? "⚠️ Ungünstig – Cashflow-Druck überwiegt" :
          "⚖️ Gemischt – selektiv nach Einzelwert entscheiden"
        }</span>
      </div>
    `;

    return html;
  }

  /* =============================================================
     2) EIA INVENTORIES
  ============================================================= */

  async function loadInventoriesBlock() {
    try {
      const inv = await fetch("/api/eia/inventories").then(r => r.json()).catch(() => null);
      if (!inv) return { html: "⚠️ EIA Lagerdaten nicht verfügbar.", oilScore: 0 };

      let html = `<strong>🛢️ Öl & Gas Lagerbestände (vs. 5Y-Durchschnitt)</strong><br><br>`;
      let oilScore = 0;

      const rows = [
        ["Crude Oil",    inv.crude_total],
        ["Crude ex SPR", inv.crude_ex_spr],
        ["Gasoline",     inv.gasoline],
        ["Distillate",   inv.distillate],
        ["NatGas",       inv.ng_storage]
      ];

      for (const [label, r] of rows) {
        if (!r) continue;
        const vs5y = num(r.vs5y_pct);
        let signal = "⚖️ normal";
        if (vs5y != null) {
          if (vs5y < -5)  { signal = "🔺 knapp";  oilScore++; }
          else if (vs5y > 5)  { signal = "🔻 hoch"; oilScore--; }
        }
        html += `${label}: <strong>${vs5y != null ? vs5y.toFixed(1) + "%" : "–"}</strong> → ${signal}<br>`;
      }

      html += `<br><strong>📦 Fazit:</strong> `;
      if (oilScore >= 2)       html += "🔺 Lager knapp → Angebotsknappheit → Ölpreis tendenziell ↑";
      else if (oilScore <= -2) html += "🔻 Lager hoch → Angebotsüberhang → Ölpreis tendenziell ↓";
      else                     html += "⚖️ Lager normal → neutraler Einfluss auf Ölpreis";

      return { html, oilScore };
    } catch {
      return { html: "⚠️ Fehler beim Laden der Lagerdaten.", oilScore: 0 };
    }
  }

  /* =============================================================
     3) EDELMETALL-ZYKLUS
  ============================================================= */

  function buildPreciousMetalsBlock(data) {
    const metals = [
      { name: "Gold (GLD)",        key: "GLD",  emoji: "⚜️" },
      { name: "Silber (SLV)",      key: "SLV",  emoji: "🥈" },
      { name: "Gold Miners (GDX)", key: "GDX",  emoji: "⛏️" },
      { name: "Kupfer (CPER)",     key: "CPER", emoji: "🔶" }
    ];

    let html = `<strong>⚜️ Edelmetall-Zyklus</strong><br>`;
    html += `<span class="mc-note">Relevant für: Barrick, Anglogold, Newmont, Fresnillo, Thungela</span><br><br>`;

    let totalScore = 0;
    let hasData    = false;

    for (const m of metals) {
      const row = coerceReturns(data[m.key] || data[m.key.toLowerCase()] || {});
      const s   = scoreFromReturns(row.d30, row.d90);
      totalScore += s;
      if (row.d30 != null || row.d90 != null) hasData = true;

      html += `${m.emoji} <strong>${m.name}:</strong> 1M ${colorize(row.d30)} · 3M ${colorize(row.d90)}<br>`;
    }

    html += `<br><strong>📊 Edelmetall-Fazit:</strong> `;
    const lbl = cycleLabel(totalScore);
    html += `${lbl.icon} ${lbl.phase}<br>`;

    if (totalScore >= 3) {
      html += `<span class="mc-note">✅ Goldpreis stark → Mining-Aktien profitieren. Dividenden-Potenzial erhöht.</span>`;
    } else if (totalScore <= -3) {
      html += `<span class="mc-note">⚠️ Goldpreis schwach → Mining unter Druck. Dividenden-Risiko bei schwächeren Minern.</span>`;
    } else {
      html += `<span class="mc-note">⚖️ Konsolidierung. Qualitäts-Miner mit niedrigen AISC bevorzugen.</span>`;
    }

    if (!hasData) html += `<br><span class="mc-note">⚠️ Keine Marktdaten verfügbar</span>`;

    return html;
  }

  /* =============================================================
     4) ZINS- & MAKRO-OVERLAY
  ============================================================= */

  function buildMacroBlock(data) {
    const tlt = coerceReturns(data["TLT"] || {});
    const iyr = coerceReturns(data["IYR"] || {});
    const xlf = coerceReturns(data["XLF"] || {});
    const xlu = coerceReturns(data["XLU"] || {});

    let html = `<strong>💰 Zins- & Makro-Overlay</strong><br>`;
    html += `<span class="mc-note">Auswirkungen auf REITs, Pipelines & BDCs</span><br><br>`;

    const tltScore = scoreFromReturns(tlt.d30, tlt.d90);
    let zinsSignal, zinsNote;

    if (tltScore >= 3)       { zinsSignal = "📉 Zinsen FALLEN";    zinsNote = "✅ Positiv für: Realty Income (O), ENB, MPW, Arbor"; }
    else if (tltScore <= -3) { zinsSignal = "📈 Zinsen STEIGEN";   zinsNote = "⚠️ Druck auf: REITs (MPW, O), Pipelines (ENB), BDCs"; }
    else                     { zinsSignal = "⚖️ Zinsen SEITWÄRTS"; zinsNote = "Neutrales Umfeld – Dividenden-Qualität entscheidend"; }

    html += `<strong>Zins-Signal (TLT):</strong> ${zinsSignal}<br>`;
    html += `<span class="mc-note">${zinsNote}</span><br><br>`;

    html += `<strong>🏠 REIT-Sektor (IYR):</strong> 1M ${colorize(iyr.d30)} · 3M ${colorize(iyr.d90)}<br>`;
    html += `<strong>⚡ Utilities (XLU):</strong> 1M ${colorize(xlu.d30)} · 3M ${colorize(xlu.d90)}<br>`;
    html += `<strong>🏦 Financials (XLF):</strong> 1M ${colorize(xlf.d30)} · 3M ${colorize(xlf.d90)}<br>`;

    const reitLbl = cycleLabel(scoreFromReturns(iyr.d30, iyr.d90) + tltScore);
    html += `<br><strong>📊 Fazit REIT/Pipeline-Positionen:</strong><br>`;
    html += `${reitLbl.icon} ${reitLbl.phase} → <span class="mc-note">${reitLbl.action}</span>`;

    return html;
  }

  /* =============================================================
     5) PORTFOLIO-EINSCHÄTZUNG
  ============================================================= */

  function buildPortfolioSummary(data, oilScore) {
    const get = t => coerceReturns(data[t] || {});

    const shippingScore =
      scoreFromReturns(get("TORM").d30, get("TORM").d90) +
      scoreFromReturns(get("FLNG").d30, get("FLNG").d90) +
      scoreFromReturns(get("ZIM").d30,  get("ZIM").d90);

    const miningScore =
      scoreFromReturns(get("GLD").d30,  get("GLD").d90) +
      scoreFromReturns(get("GDX").d30,  get("GDX").d90) +
      scoreFromReturns(get("CPER").d30, get("CPER").d90);

    const energyScore = oilScore * 2;

    const reitScore =
      scoreFromReturns(get("IYR").d30, get("IYR").d90) +
      scoreFromReturns(get("TLT").d30, get("TLT").d90);

    const sektoren = [
      { name: "🚢 Shipping",         score: shippingScore, positionen: "TORM, FLNG, ZIM, Dorian, BW LPG, GOGL" },
      { name: "⛏️ Mining / Rohstoffe",score: miningScore,  positionen: "Thungela, Vale, Rio Tinto, Barrick, Anglogold" },
      { name: "🛢️ Energy",            score: energyScore,  positionen: "Ecopetrol, Petrobras, Equinor, BP, Shell" },
      { name: "🏠 REITs / Pipelines", score: reitScore,    positionen: "MPW, Realty Income, Arbor, Enbridge" }
    ];

    let html = `<strong>🎯 Dein Portfolio – Sektor-Einschätzung</strong><br>`;
    html += `<span class="mc-note">Direkte Einschätzung für deine wichtigsten Positionen</span><br><br>`;

    for (const s of sektoren) {
      const lbl = cycleLabel(s.score);
      html += `
        <div style="margin-bottom:12px; padding:10px; background:rgba(255,255,255,0.02); border-left:3px solid ${lbl.color}; border-radius:4px;">
          <strong>${s.name}:</strong> ${lbl.icon} <strong>${lbl.phase}</strong><br>
          <span class="mc-note">→ ${lbl.action}</span><br>
          <span class="mc-note" style="color:#6b7280;">Betrifft: ${s.positionen}</span>
        </div>
      `;
    }

    return html;
  }

  /* =============================================================
     MAIN LOADER
  ============================================================= */

  window.loadMarketCycles = async function () {

    safeHTML("mc-rotation-note",        "⏳ Lade Marktrotation…");
    safeHTML("inventories-freight-box", "⏳ Lade Zyklus-Indikatoren…");
    safeHTML("portfolio-cycle-summary", "⏳ Lade Portfolio-Einschätzung…");

    const commodities = ["USO","BNO","DBC","GLD","CPER","SLV"];
    const shipping    = ["BDRY","SEA","FLNG","GOGL","ZIM","TORM","FRO"];
    const sectors     = ["XLK","XLE","XLF","XLI","XLB","XLP","XLY","XLV","XLU","IYR"];
    const metals      = ["GDX","SLV","GLD","CPER"];
    const macro       = ["TLT","IYR","XLU"];

    const allTickers = [...new Set([...commodities, ...shipping, ...sectors, ...metals, ...macro])];

    let data = {};
    try {
      const res = await fetch("/api/market-cycles?tickers=" + allTickers.join(","));
      const j   = await res.json();
      data = j?.data || j || {};
    } catch {
      data = {};
    }

    /* --- Commodities --- */
    for (const t of commodities) {
      const k = t.toLowerCase();
      const r = coerceReturns(data[t] || data[k] || {});
      safeText(`mc-${k}-now`, r.price ?? "–");
      safeHTML(`mc-${k}-d1`,  colorize(r.d1)  + " " + trendArrow(r.d1));
      safeHTML(`mc-${k}-d30`, colorize(r.d30) + " " + trendArrow(r.d30));
      safeHTML(`mc-${k}-d90`, colorize(r.d90) + " " + trendArrow(r.d90));
    }

    /* --- Shipping Top-Box --- */
    for (const t of ["BDRY","SEA","FLNG","GOGL","ZIM"]) {
      const k = t.toLowerCase();
      const r = coerceReturns(data[t] || data[k] || {});
      safeText(`mc-${k}-now`, r.price ?? "–");
      safeHTML(`mc-${k}-d1`,  colorize(r.d1)  + " " + trendArrow(r.d1));
      safeHTML(`mc-${k}-d30`, colorize(r.d30) + " " + trendArrow(r.d30));
      safeHTML(`mc-${k}-d90`, colorize(r.d90) + " " + trendArrow(r.d90));
    }

    /* --- Sektoren + Rotation --- */
    let bull = 0, bear = 0;
    for (const t of sectors) {
      const r = coerceReturns(data[t] || data[t.toLowerCase()] || {});
      safeText(`mc-${t}-now`, r.price ?? "–");
      safeHTML(`mc-${t}-d1`,  colorize(r.d1));
      safeHTML(`mc-${t}-d30`, colorize(r.d30));
      safeHTML(`mc-${t}-d90`, colorize(r.d90));

      let s = 0;
      if (r.d1  != null) s += r.d1  > 0 ? 1 : r.d1  < 0 ? -1 : 0;
      if (r.d30 != null) s += r.d30 > 0 ? 1 : r.d30 < 0 ? -1 : 0;
      if (r.d90 != null) s += r.d90 > 0 ? 1 : r.d90 < 0 ? -1 : 0;

      safeHTML(`mc-${t}-view`, badge(s));
      if (s >= 1) bull++;
      if (s <= -1) bear++;
    }

    let rotation = "⚖️ Mixed – Übergangsphase";
    if (bull >= 6 && bull > bear) rotation = "📈 Risk-On – breite Marktstärke";
    if (bear >= 6 && bear > bull) rotation = "📉 Risk-Off – defensiv ausrichten";
    safeHTML("mc-rotation-note", rotation);

    /* --- Alle Blöcke bauen --- */
    const inv            = await loadInventoriesBlock();
    const shippingBlock  = buildShippingBlock(data, inv.oilScore);
    const metalsBlock    = buildPreciousMetalsBlock(data);
    const macroBlock     = buildMacroBlock(data);
    const portfolioBlock = buildPortfolioSummary(data, inv.oilScore);

    const divider = "<hr style='border-color:rgba(255,255,255,0.08); margin:16px 0;'>";

    safeHTML("inventories-freight-box",
      inv.html           + divider +
      shippingBlock      + divider +
      metalsBlock        + divider +
      macroBlock
    );

    safeHTML("portfolio-cycle-summary", portfolioBlock);
  };

})();