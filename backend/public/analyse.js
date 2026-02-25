"use strict";

// analyse.js – Makro-Dashboard OPTIMIZED
// Neu: Fear & Greed | Sektor-Einschätzung | Zins-Impact | Edelmetalle | Arbeitsmarkt
// Robust: alle null-checks, keine crashes bei fehlenden Elementen

(function () {

  /* =============================================================
     HELPERS
  ============================================================= */

  const $ = id => document.getElementById(id);
  const safeSet = (id, val) => { const el = $(id); if (el) el.textContent = val; };
  const safeHTML = (id, html) => { const el = $(id); if (el) el.innerHTML = html; };

  const fmt = (v, d = 2) => {
    const n = Number(v);
    return Number.isFinite(n) ? n.toFixed(d) : "–";
  };

  const arrow = v => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "→";
    return n > 0 ? "↑" : n < 0 ? "↓" : "→";
  };

  const colorVal = (v, invertColors = false) => {
    const n = Number(v);
    if (!Number.isFinite(n)) return "–";
    const isPositive = invertColors ? n < 0 : n > 0;
    const cls = isPositive ? "mc-up" : n === 0 ? "mc-flat" : "mc-down";
    const sign = n > 0 ? "+" : "";
    return `<span class="${cls}">${sign}${n.toFixed(2)}</span>`;
  };

  /* =============================================================
     DATA FETCH
  ============================================================= */

  async function fetchSummary() {
    try {
      const r = await fetch("/api/macro/summary");
      if (!r.ok) throw new Error("HTTP " + r.status);
      return await r.json();
    } catch (e) {
      console.error("Macro summary fetch failed:", e.message);
      return null;
    }
  }

  /* =============================================================
     SEKTOR-EINSCHÄTZUNG
     Basierend auf Makro-Signalen → direkt für deine Positionen
  ============================================================= */

  function buildSectorReadout(cpi, m2, treasury, vix, fearGreed) {
    // Scoring: positiv = bullish, negativ = bearish
    let liquidityScore = 0;  // M2, Zinsen
    let riskScore      = 0;  // VIX, Fear&Greed
    let inflationScore = 0;  // CPI

    if (m2?.yoy != null)          liquidityScore += m2.yoy > 0 ? 1 : -1;
    if (treasury?.spread != null) liquidityScore += treasury.spread > 0 ? 1 : -1;
    if (vix?.value != null)       riskScore      += vix.value < 20 ? 1 : vix.value > 25 ? -2 : -1;
    if (fearGreed?.value != null) riskScore      += fearGreed.value > 55 ? 1 : fearGreed.value < 35 ? -1 : 0;
    if (cpi?.yoy != null)         inflationScore += cpi.yoy > 4 ? -1 : cpi.yoy < 2 ? 1 : 0;

    const totalScore = liquidityScore + riskScore + inflationScore;

    // Sektoren mit Einschätzung
    const sektoren = [
      {
        name:      "🚢 Shipping",
        positionen: "TORM, FLNG, ZIM, Dorian, BW LPG",
        // Shipping mag: Liquidität hoch, kein Rezessions-Risk
        score:     liquidityScore + (riskScore >= 0 ? 1 : -1),
        bullNote:  "Liquidität vorhanden, kein Rezessions-Druck → Frachtraten stabil bis steigend.",
        bearNote:  "Rezessionsrisiko → Frachtnachfrage könnte fallen. Sonderdividenden prüfen.",
        neutNote:  "Gemischtes Signal – auf Frachtraten-Daten achten (EIA, BDI)."
      },
      {
        name:      "⛏️ Mining / Rohstoffe",
        positionen: "Thungela, Vale, Rio Tinto, Barrick, Anglogold",
        // Mining mag: Inflation hoch (Rohstoffpreise steigen), Liquidität ok
        score:     inflationScore + liquidityScore,
        bullNote:  "Hohe Inflation + Liquidität → Rohstoffpreise unter Aufwärtsdruck.",
        bearNote:  "Niedrige Inflation + Liquiditätsentzug → Rohstoffpreise unter Druck.",
        neutNote:  "Selektiv: Qualitäts-Miner mit niedrigen Produktionskosten bevorzugen."
      },
      {
        name:      "🛢️ Energy / Öl & Gas",
        positionen: "Ecopetrol, Petrobras, Equinor, BP, Shell",
        // Energy mag: Inflation hoch, Risk-On
        score:     inflationScore + riskScore,
        bullNote:  "Inflation + Risk-On → Ölpreis gestützt. Dividenden sicher.",
        bearNote:  "Rezessionsrisiko → Ölnachfrage könnte fallen.",
        neutNote:  "EIA Lagerbestände als Hauptindikator beobachten."
      },
      {
        name:      "🏠 REITs / Pipelines",
        positionen: "MPW, Realty Income, Arbor, Enbridge, ENB",
        // REITs mögen: fallende Zinsen, niedrige Inflation
        score:     (treasury?.spread > 0.5 ? -1 : 1) + (cpi?.yoy < 3 ? 1 : -1) + liquidityScore,
        bullNote:  "Zinsen fallen / niedrig → REITs & Pipelines profitieren direkt.",
        bearNote:  "Hohe Zinsen bleiben → Druck auf Bewertungen. Dividenden-Qualität prüfen.",
        neutNote:  "Dividenden-Kontinuität wichtiger als Kursgewinn in diesem Umfeld."
      },
      {
        name:      "💼 BDCs",
        positionen: "Arbor Realty, ARCC, MAIN, HTGC",
        // BDCs mögen: hohe Zinsen (Zinsmarge), gute Kreditqualität
        score:     (treasury?.y10 > 4 ? 1 : -1) + riskScore,
        bullNote:  "Hohe Zinsen → BDC-Margen steigen. Dividenden attraktiv.",
        bearNote:  "Rezessionsrisiko → Kreditausfälle möglich. Konservative BDCs bevorzugen.",
        neutNote:  "Qualitäts-BDCs (ARCC, MAIN) in Übergangsphase bevorzugen."
      }
    ];

    let html = "";

    for (const s of sektoren) {
      let icon, note, borderColor;
      if (s.score >= 1)      { icon = "🟢"; note = s.bullNote; borderColor = "#4ade80"; }
      else if (s.score <= -1) { icon = "🔴"; note = s.bearNote; borderColor = "#ef4444"; }
      else                    { icon = "🟡"; note = s.neutNote; borderColor = "#fbbf24"; }

      html += `
        <div style="margin-bottom:12px; padding:10px 12px; background:rgba(255,255,255,0.02); border-left:3px solid ${borderColor}; border-radius:4px;">
          <div style="font-weight:700; margin-bottom:4px;">${icon} ${s.name}</div>
          <div style="font-size:0.85rem; color:#cfd6e6; margin-bottom:4px;">${note}</div>
          <div style="font-size:0.75rem; color:#6b7280;">Betrifft: ${s.positionen}</div>
        </div>
      `;
    }

    return html;
  }

  /* =============================================================
     MARKTREGIME
  ============================================================= */

  function detectRegime(cpi, m2, treasury, vix, fearGreed) {
    let score = 0;

    if (m2?.yoy > 0)          score += 1;
    if (treasury?.spread > 0) score += 1;
    if (vix?.value < 20)      score += 1;
    if (fearGreed?.value > 50) score += 1;
    if (cpi?.yoy < 3)         score += 1;

    if (score >= 4) return {
      icon:  "🟢",
      label: "Risk-On – Zykliker bevorzugen",
      note:  "Liquidität vorhanden, Volatilität niedrig, Trend aufwärts. Energy, Shipping, Mining im Vorteil.",
      color: "#4ade80"
    };

    if (score <= 1) return {
      icon:  "🔴",
      label: "Risk-Off – defensiv ausrichten",
      note:  "Rezessionsrisiko, hohe Volatilität oder Liquiditätsentzug. Cashflow-Qualität priorisieren, Gewinne sichern.",
      color: "#ef4444"
    };

    return {
      icon:  "🟡",
      label: "Übergangsphase – selektiv",
      note:  "Gemischte Signale. Stock-Picking entscheidend: Qualitäts-Dividendenzahler mit niedrigem Schuldenstand bevorzugen.",
      color: "#fbbf24"
    };
  }

  /* =============================================================
     HAUPT-RENDER
  ============================================================= */

  async function load() {
    safeHTML("macro-interpretation", "<strong>⏳ Lade Makrodaten…</strong>");

    const data = await fetchSummary();
    if (!data) {
      safeHTML("macro-interpretation", "❌ Makrodaten nicht verfügbar. Server prüfen.");
      return;
    }

    const { cpi, m2, treasury, vix, fearGreed, fedRate, unemployment } = data;
    const bullets = [];

    /* ---------- CPI ---------- */
    if (cpi?.yoy != null) {
      safeSet("macro-cpi-value", fmt(cpi.yoy) + " %");
      safeSet("macro-cpi-trend", arrow(cpi.yoy));

      let cpiNote, cpiBullet;
      if (cpi.yoy >= 4) {
        cpiNote   = "Inflation deutlich über Ziel → restriktive Geldpolitik wahrscheinlich.";
        cpiBullet = "📈 Inflation hoch → Rohstoff-/Energy-Aktien profitieren, Wachstumswerte leiden.";
      } else if (cpi.yoy >= 2) {
        cpiNote   = "Inflation moderat – Übergangsphase, Fed abwartend.";
        cpiBullet = "⚖️ Inflation moderat → Übergangsphase, kein klares Signal.";
      } else {
        cpiNote   = "Inflation niedrig → Spielraum für Zinssenkungen.";
        cpiBullet = "💰 Niedrige Inflation → Rückenwind für REITs, Pipelines, Bonds.";
      }
      safeSet("macro-cpi-note", cpiNote);
      bullets.push(cpiBullet);
    }

    /* ---------- Fed Funds Rate ---------- */
    if (fedRate?.value != null) {
      safeSet("macro-fed-value", fmt(fedRate.value) + " %");
      safeSet("macro-fed-trend", fedRate.value > 4.5 ? "↑" : fedRate.value < 2 ? "↓" : "→");

      let fedNote, fedBullet;
      if (fedRate.value >= 5) {
        fedNote   = `Fed rate ${fmt(fedRate.value)}% — restrictive. REITs & pipelines under pressure. BDC margins elevated.`;
        fedBullet = `🏦 Fed rate ${fmt(fedRate.value)}% (high) → REITs/Pipelines pressured; BDC dividend income boosted.`;
      } else if (fedRate.value >= 4) {
        fedNote   = `Fed rate ${fmt(fedRate.value)}% — moderately high. Watch for rate cuts as tailwind for REITs.`;
        fedBullet = `🏦 Fed rate ${fmt(fedRate.value)}% — transition zone. Rate-cut expectations key for REIT re-rating.`;
      } else if (fedRate.value >= 2.5) {
        fedNote   = `Fed rate ${fmt(fedRate.value)}% — neutral. Balanced environment for income assets.`;
        fedBullet = `🏦 Fed rate ${fmt(fedRate.value)}% (neutral) → balanced for all sectors.`;
      } else {
        fedNote   = `Fed rate ${fmt(fedRate.value)}% — accommodative. Strong tailwind for REITs, Pipelines, BDCs.`;
        fedBullet = `🏦 Fed rate ${fmt(fedRate.value)}% (low) → strong tailwind for REITs, Pipelines, income stocks.`;
      }
      safeSet("macro-fed-note", fedNote);
      bullets.push(fedBullet);
    }

    /* ---------- Unemployment ---------- */
    if (unemployment?.value != null) {
      safeSet("macro-unemp-value", fmt(unemployment.value) + " %");
      safeSet("macro-unemp-trend", unemployment.value > 5 ? "↑" : unemployment.value < 4 ? "↓" : "→");

      let unempNote, unempBullet;
      if (unemployment.value < 4) {
        unempNote   = `Unemployment ${fmt(unemployment.value)}% — tight labor market. Wage inflation risk; shipping demand solid.`;
        unempBullet = `👷 Unemployment ${fmt(unemployment.value)}% (tight) → consumer spending strong → shipping/energy demand supported.`;
      } else if (unemployment.value < 5.5) {
        unempNote   = `Unemployment ${fmt(unemployment.value)}% — healthy labor market. No immediate recession signal.`;
        unempBullet = `👷 Unemployment ${fmt(unemployment.value)}% (healthy) → stable demand, no recession warning.`;
      } else {
        unempNote   = `Unemployment ${fmt(unemployment.value)}% — rising. Recession risk elevated. Freight demand may weaken.`;
        unempBullet = `👷 Unemployment ${fmt(unemployment.value)}% (rising) → demand slowdown risk → monitor shipping rates & dividend safety.`;
      }
      safeSet("macro-unemp-note", unempNote);
      bullets.push(unempBullet);
    }

    /* ---------- 10Y Treasury (standalone card) ---------- */
    if (treasury?.y10 != null) {
      safeSet("macro-10y-value", fmt(treasury.y10) + " %");
      const tenNote = treasury.y10 > 4.5
        ? `High 10Y yield (${fmt(treasury.y10)}%) → pressure on long-duration assets. Shipping/Energy less affected.`
        : treasury.y10 < 3.5
        ? `Low 10Y yield (${fmt(treasury.y10)}%) → tailwind for REITs, Pipelines, BDCs.`
        : `10Y yield ${fmt(treasury.y10)}% — moderate. Neutral for income stocks.`;
      safeSet("macro-10y-note", tenNote);
      safeSet("macro-10y-trend", treasury.y10 > 4.5 ? "↑" : treasury.y10 < 3.5 ? "↓" : "→");
    }

    /* ---------- M2 ---------- */
    if (m2?.yoy != null) {
      safeSet("macro-m2-value", fmt(m2.yoy) + " %");
      safeSet("macro-m2-trend", arrow(m2.yoy));

      let m2Note, m2Bullet;
      if (m2.yoy > 5) {
        m2Note   = "Starkes Geldmengenwachstum → erhöhte Liquidität in Märkten.";
        m2Bullet = "💧 M2 stark ↑ → Asset-Inflation möglich, Rohstoffe profitieren.";
      } else if (m2.yoy > 0) {
        m2Note   = "Geldmenge wächst moderat – Liquidität nimmt zu.";
        m2Bullet = "💧 M2 wächst → Liquidität unterstützt Märkte.";
      } else {
        m2Note   = "Geldmenge schrumpft → Liquiditätsentzug, Druck auf Risikoassets.";
        m2Bullet = "🚱 M2 schrumpft → Vorsicht bei Zykliker-Positionen.";
      }
      safeSet("macro-m2-note", m2Note);
      bullets.push(m2Bullet);
    }

    /* ---------- Yield Curve ---------- */
    if (treasury?.spread != null) {
      safeSet("macro-yc-value", fmt(treasury.spread) + " %");
      safeSet("macro-yc-trend", arrow(treasury.spread));

      let ycNote, ycBullet;
      if (treasury.spread < -0.3) {
        ycNote   = `Stark inverse Kurve (2Y: ${fmt(treasury.y2)}% / 10Y: ${fmt(treasury.y10)}%) → erhöhtes Rezessionsrisiko.`;
        ycBullet = "🔻 Inverse Zinskurve → defensives Umfeld. REITs & Pipelines unter Druck.";
      } else if (treasury.spread < 0) {
        ycNote   = `Leicht invers (2Y: ${fmt(treasury.y2)}% / 10Y: ${fmt(treasury.y10)}%) → Vorsicht geboten.`;
        ycBullet = "⚠️ Leicht inverse Kurve → selektiv bleiben.";
      } else if (treasury.spread > 1) {
        ycNote   = `Steil positiv (2Y: ${fmt(treasury.y2)}% / 10Y: ${fmt(treasury.y10)}%) → Wachstumserwartung.`;
        ycBullet = "✅ Steile Kurve → Wachstum erwartet, zyklische Aktien bevorzugen.";
      } else {
        ycNote   = `Normal (2Y: ${fmt(treasury.y2)}% / 10Y: ${fmt(treasury.y10)}%) → kein akutes Rezessionssignal.`;
        ycBullet = "✅ Normale Kurve → stabiles Umfeld.";
      }
      safeSet("macro-yc-note", ycNote);
      bullets.push(ycBullet);

      /* Zins-Impact für deine Positionen */
      let zinsImpact = "";
      if (treasury.y10 > 4.5) {
        zinsImpact = "⚠️ Hohe Zinsen (>4.5%) → Druck auf MPW, Realty Income, Arbor, ENB.";
      } else if (treasury.y10 < 3.5) {
        zinsImpact = "✅ Niedrige Zinsen (<3.5%) → MPW, O, ENB, Arbor profitieren direkt.";
      } else {
        zinsImpact = "⚖️ Zinsen moderat → zinssensitive Positionen stabil.";
      }
      safeSet("macro-zins-impact", zinsImpact);
    }

    /* ---------- VIX ---------- */
    if (vix?.value != null) {
      safeSet("macro-vix-value", fmt(vix.value));
      safeSet("macro-vix-trend", vix.value > 25 ? "↑" : vix.value < 15 ? "↓" : "→");

      let vixNote, vixBullet;
      if (vix.value > 30) {
        vixNote   = "Extremer Marktstress → Panik-Phase. Selektiv akkumulieren!";
        vixBullet = "🚨 VIX > 30 → Marktpanik. Beste Kaufgelegenheiten entstehen jetzt.";
      } else if (vix.value > 25) {
        vixNote   = "Hoher Stress – Risk-Off. Vorsicht bei Zykliker-Nachkäufen.";
        vixBullet = "⚠️ VIX hoch → Marktstress, Absicherung sinnvoll.";
      } else if (vix.value < 13) {
        vixNote   = "Sehr ruhiger Markt → Selbstgefälligkeit? Gewinne sichern!";
        vixBullet = "🔔 VIX sehr niedrig → Vorsicht: Märkte überhitzen möglicherweise.";
      } else if (vix.value < 18) {
        vixNote   = "Ruhiger Markt – Risk-On Umfeld.";
        vixBullet = "✅ VIX niedrig → Risk-On, zyklische Positionen halten.";
      } else {
        vixNote   = "Erhöhte Volatilität – selektiv vorgehen.";
        vixBullet = "⚖️ VIX erhöht → Volatilität beachten, keine großen Positionserweiterungen.";
      }
      safeSet("macro-vix-note", vixNote);
      bullets.push(vixBullet);
    }

    /* ---------- NEU: Fear & Greed ---------- */
    if (fearGreed?.value != null) {
      safeSet("macro-fg-value", fearGreed.value);
      safeSet("macro-fg-label", fearGreed.label || "");

      let fgNote, fgBullet, fgIcon;
      if (fearGreed.value >= 75) {
        fgIcon   = "😱";
        fgNote   = "Extreme Gier → Markt überhitzt. Gewinne sichern!";
        fgBullet = "😱 Extreme Gier → klassisches Warnsignal. Teilgewinne realisieren.";
      } else if (fearGreed.value >= 55) {
        fgIcon   = "😊";
        fgNote   = "Gier – positives Marktsentiment, aber wachsam bleiben.";
        fgBullet = "😊 Sentiment bullish → Trend intakt, aber Vorsicht bei Übertreibungen.";
      } else if (fearGreed.value >= 45) {
        fgIcon   = "😐";
        fgNote   = "Neutrales Sentiment – kein klares Signal.";
        fgBullet = "😐 Neutrales Sentiment – abwarten.";
      } else if (fearGreed.value >= 25) {
        fgIcon   = "😰";
        fgNote   = "Angst – selektive Kaufgelegenheiten entstehen.";
        fgBullet = "😰 Angst im Markt → selektiv Zykliker akkumulieren.";
      } else {
        fgIcon   = "🤑";
        fgNote   = "Extreme Angst → beste Kaufgelegenheiten für geduldige Investoren!";
        fgBullet = "🤑 Extreme Angst → Contrarian-Signal: hochqualitative Positionen aufbauen!";
      }

      safeSet("macro-fg-icon", fgIcon);
      safeSet("macro-fg-note", fgNote);
      bullets.push(fgBullet);
    }

    /* ---------- MARKTREGIME ---------- */
    const regime = detectRegime(cpi, m2, treasury, vix, fearGreed);

    /* ---------- SEKTOR-EINSCHÄTZUNG ---------- */
    const sektorHTML = buildSectorReadout(cpi, m2, treasury, vix, fearGreed);

    /* ---------- RENDER GESAMT ---------- */
    safeHTML("macro-interpretation", `

      <!-- Regime -->
      <div style="margin-bottom:20px; padding:14px; border-left:4px solid ${regime.color}; background:rgba(255,255,255,0.02); border-radius:4px;">
        <div style="font-size:1.2rem; font-weight:700; margin-bottom:6px;">
          ${regime.icon} ${regime.label}
        </div>
        <div style="font-size:0.9rem; color:#cfd6e6; line-height:1.5;">
          ${regime.note}
        </div>
      </div>

      <!-- Bullet Points -->
      <h4 style="margin:0 0 10px 0; color:#d4af37;">📊 Makro-Signale</h4>
      <ul style="margin:0 0 20px 0; padding-left:18px; line-height:1.8;">
        ${bullets.map(b => `<li style="font-size:0.9rem; color:#cfd6e6;">${b}</li>`).join("")}
      </ul>

      <!-- Sektor-Einschätzung -->
      <h4 style="margin:0 0 10px 0; color:#d4af37;">🎯 Dein Portfolio – Makro-Einschätzung</h4>
      ${sektorHTML}

    `);
  }

  // Expose für tabs.js – Initialisierung durch tabs.js → window.loadAnalyse()
  window.loadAnalyse = load;

})();