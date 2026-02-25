"use strict";

// charts.js – OPTIMIZED | Vollständige Aktien-Analyse
// Features: Zyklus-Position, Fundamentals, Momentum, Einschätzung, Sonderdiv-Score

(function () {
  let priceChart = null;

  /* =============================================================
     HELPERS
  ============================================================= */

  const $ = (id) => document.getElementById(id);

  function fmtNum(v, digits = 2) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "–";
    return n.toFixed(digits);
  }

  function fmtBig(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return "–";
    if (n >= 1e12) return (n / 1e12).toFixed(2) + " Bio";
    if (n >= 1e9)  return (n / 1e9).toFixed(2) + " Mrd";
    if (n >= 1e6)  return (n / 1e6).toFixed(2) + " Mio";
    return n.toFixed(0);
  }

  async function ensureChartJs() {
    if (window.Chart) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/chart.js";
      s.onload = resolve;
      s.onerror = () => reject(new Error("Chart.js Laden fehlgeschlagen"));
      document.body.appendChild(s);
    });
  }

  /* =============================================================
     HARD-ASSET MAPPING (wie vorher)
  ============================================================= */

  const HARD_ASSET_BUCKETS = {
    shipping:  ["ZIM","GOGL","SBLK","GNK","EGLE","STNG","TRMD","FLNG","FRO","EURN","DAC","CMRE","TORM","TNK","INSW"],
    pipelines: ["ENB","PBA","TRP","WMB","KMI","OKE","EPD","ET","MMP","AM","ENLC"],
    energy:    ["XOM","CVX","SHEL","BP","TTE","COP","OXY","CNQ","SU","CVE","APA","EOG"],
    mining:    ["RIO","BHP","VALE","GLEN","AAL","TECK","SCCO","FCX","NEM","GOLD","AG","PAAS","THUNGELA","TGA"],
    reit:      ["O","WPC","NNN","SPG","PLD","STAG","MPW","CARE","VICI","EPRT"],
    bdc:       ["ARCC","MAIN","HTGC","TPVG","TRIN","ORCC","BXSL","FSK","PSEC","GAIN"]
  };

  function classifyHardAsset(ticker) {
    const t = String(ticker || "").toUpperCase();
    for (const [bucket, list] of Object.entries(HARD_ASSET_BUCKETS)) {
      if (list.includes(t)) return bucket;
    }
    return null;
  }

  /* =============================================================
     NEU: ZYKLUS-POSITION BERECHNEN
     Basierend auf: 52W-Range + Momentum + Yield vs. Normal
  ============================================================= */

  function detectCyclePosition(data) {
    const close    = Number(data.close);
    const w52High  = Number(data.week52High);
    const w52Low   = Number(data.week52Low);
    const yield_   = Number(data.dividendYield);
    const d30      = Number(data.d30);
    const d90      = Number(data.d90);

    let score = 0; // Negativ = Boden, Positiv = Peak

    // 1) Position in der 52W-Range
    if (Number.isFinite(close) && Number.isFinite(w52High) && Number.isFinite(w52Low) && w52High > w52Low) {
      const rangePos = (close - w52Low) / (w52High - w52Low); // 0 = Tief, 1 = Hoch
      if (rangePos < 0.25)       score -= 2; // Nähe Jahrestief → Boden
      else if (rangePos < 0.45)  score -= 1; // Unteres Drittel → Erholung möglich
      else if (rangePos > 0.75)  score += 2; // Nähe Jahreshoch → Peak-Nähe
      else if (rangePos > 0.55)  score += 1; // Oberes Drittel → Boom
    }

    // 2) Momentum (30d, 90d)
    if (Number.isFinite(d30)) {
      if (d30 < -15) score -= 2;       // Starker Abverkauf → Boden-Nähe
      else if (d30 < -5) score -= 1;
      else if (d30 > 15) score += 2;   // Starker Anstieg → evtl. Peak
      else if (d30 > 5)  score += 1;
    }

    if (Number.isFinite(d90)) {
      if (d90 < -20) score -= 2;
      else if (d90 < -8) score -= 1;
      else if (d90 > 25) score += 2;
      else if (d90 > 10) score += 1;
    }

    // 3) Yield-Signal (für zyklische: hoher Yield oft = Boden, da Markt Div-Cut einpreist)
    const bucket = classifyHardAsset(data.ticker);
    const isCyclic = ["shipping","mining","energy"].includes(bucket);

    if (isCyclic && Number.isFinite(yield_)) {
      if (yield_ > 15) score -= 1; // Markt erwartet Div-Cut → möglicherweise Boden
      else if (yield_ < 3) score += 1; // Niedrige Yield oft = Aktie schon gut gelaufen
    }

    // Score → Zyklus-Phase
    if (score <= -4) return { phase: "BODEN",     icon: "🔵", color: "#60a5fa", action: "AKKUMULIEREN",    note: "Zyklus-Tief – Markt übertreibt nach unten. Beste Einstiegszone für geduldige Investoren." };
    if (score <= -1) return { phase: "ERHOLUNG",  icon: "🟢", color: "#4ade80", action: "KAUFEN",          note: "Anzeichen von Bodenbildung + erstes Momentum. Zyklus dreht möglicherweise nach oben." };
    if (score <=  2) return { phase: "NORMALISIERUNG", icon: "🟡", color: "#fbbf24", action: "HALTEN",     note: "Aktie im normalen Bewertungsbereich. Halten und Dividenden kassieren." };
    if (score <=  4) return { phase: "BOOM",      icon: "🟠", color: "#f97316", action: "TEILVERKAUF",     note: "Starkes Momentum, Bewertung steigt. Gewinne teilweise sichern, Rest laufen lassen." };
    return              { phase: "PEAK",      icon: "🔴", color: "#ef4444", action: "GEWINNE SICHERN", note: "Nähe Jahreshoch + starkes Momentum. Vorsicht – Zyklus könnte drehen. 50% sichern." };
  }

  /* =============================================================
     NEU: SONDERDIVIDENDEN-SCORE
  ============================================================= */

  function calcSpecialDivScore(data) {
    const bucket   = classifyHardAsset(data.ticker);
    const isCyclic = ["shipping","mining","energy"].includes(bucket);
    const yield_   = Number(data.dividendYield);
    const payout   = Number(data.payoutRatio);
    const d90      = Number(data.d90);

    if (!isCyclic) return null; // Nur für Zykliker relevant

    let score = 0;
    const signals = [];

    // 1) Hoher FCF / niedrige Payout Ratio → Kapital vorhanden
    if (Number.isFinite(payout)) {
      if (payout < 40) { score += 25; signals.push("✅ Niedrige Payout Ratio (" + payout.toFixed(0) + "%) → viel freier Cashflow"); }
      else if (payout < 70) { score += 10; signals.push("🟡 Moderate Payout Ratio (" + payout.toFixed(0) + "%)"); }
      else { signals.push("❌ Hohe Payout Ratio – wenig Spielraum"); }
    }

    // 2) Zyklus-Top: Aktie gelaufen → Cashflow-Peak oft = Special Div
    if (Number.isFinite(d90) && d90 > 20) { score += 25; signals.push("✅ Starkes 3M-Momentum (+"+d90.toFixed(0)+"%) → Cashflow-Peak möglich"); }
    else if (Number.isFinite(d90) && d90 > 5) { score += 10; signals.push("🟡 Positives Momentum – Cashflow erholt sich"); }

    // 3) Hoher Yield (Markt erwartet Special oder Div-Cut)
    if (Number.isFinite(yield_) && yield_ > 12) { score += 20; signals.push("✅ Hohe Yield (" + yield_.toFixed(1) + "%) → Special Div möglich oder Div-Cut Risiko"); }
    else if (Number.isFinite(yield_) && yield_ > 7) { score += 10; signals.push("🟡 Überdurchschnittliche Yield (" + yield_.toFixed(1) + "%)"); }

    // 4) Sektor-Bonus (Shipping hat die stärkste Special-Div-Kultur)
    if (bucket === "shipping") { score += 15; signals.push("✅ Shipping-Sektor: Hohe Special-Div-Kultur (GOGL, TORM, ZIM-Historie)"); }
    else if (bucket === "mining") { score += 10; signals.push("✅ Mining-Sektor: Special Divs bei Commodity-Boom üblich"); }
    else if (bucket === "energy") { score += 5; signals.push("🟡 Energy: Gelegentlich Special Divs bei hohem FCF"); }

    score = Math.min(score, 95); // Max 95%

    return { score, signals };
  }

  /* =============================================================
     NEU: FUNDAMENTALS AUFBEREITEN
  ============================================================= */

  function buildFundamentalsHTML(data) {
    const fields = [
      { label: "KGV (P/E)",          val: data.pe,                fmt: (v) => fmtNum(v, 1) + "x" },
      { label: "KBV (P/B)",          val: data.pb,                fmt: (v) => fmtNum(v, 2) + "x" },
      { label: "Dividenden-Yield",   val: data.dividendYield,     fmt: (v) => fmtNum(v, 2) + "%" },
      { label: "Payout Ratio",       val: data.payoutRatio,       fmt: (v) => fmtNum(v, 1) + "%" },
      { label: "EPS (TTM)",          val: data.eps,               fmt: (v) => fmtNum(v, 2) + " $" },
      { label: "Umsatz",             val: data.revenue,           fmt: fmtBig },
      { label: "Market Cap",         val: data.marketCap,         fmt: fmtBig },
      { label: "52W Hoch",           val: data.week52High,        fmt: (v) => fmtNum(v, 2) },
      { label: "52W Tief",           val: data.week52Low,         fmt: (v) => fmtNum(v, 2) },
      { label: "Ø Volumen (30T)",    val: data.avgVolume,         fmt: fmtBig },
      { label: "Beta",               val: data.beta,              fmt: (v) => fmtNum(v, 2) },
      { label: "30T Momentum",       val: data.d30,               fmt: (v) => (v >= 0 ? "+" : "") + fmtNum(v, 1) + "%" },
      { label: "90T Momentum",       val: data.d90,               fmt: (v) => (v >= 0 ? "+" : "") + fmtNum(v, 1) + "%" },
    ];

    let html = '<div class="fundamentals-grid">';

    for (const f of fields) {
      const val = Number(f.val);
      if (!Number.isFinite(val)) continue;

      const formatted = f.fmt(val);
      const isPositive = f.label.includes("Momentum") && val > 0;
      const isNegative = f.label.includes("Momentum") && val < 0;

      html += `
        <div class="fundamental-item">
          <span class="fund-label">${f.label}</span>
          <span class="fund-value ${isPositive ? 'mc-up' : isNegative ? 'mc-down' : ''}">${formatted}</span>
        </div>
      `;
    }

    html += '</div>';
    return html;
  }

  /* =============================================================
     NEU: GESAMTEINSCHÄTZUNG RENDERN
  ============================================================= */

  function renderAnalysis(data, cycle, specialDiv) {
    const analysisEl = $("stock-analysis");
    if (!analysisEl) return;

    const bucket = classifyHardAsset(data.ticker);
    const bucketLabels = {
      shipping:  "🚢 Shipping (Hochzyklisch)",
      pipelines: "🔧 Pipelines / Midstream",
      energy:    "🛢️ Energy / Öl & Gas",
      mining:    "⛏️ Mining / Rohstoffe",
      reit:      "🏠 REIT / Immobilien",
      bdc:       "💼 BDC / Kreditfonds"
    };

    // Momentum-Signal
    const d30 = Number(data.d30);
    const d90 = Number(data.d90);
    let momentumText = "Kein klares Momentum-Signal.";
    let momentumIcon = "→";

    if (Number.isFinite(d30) && Number.isFinite(d90)) {
      if (d30 > 5 && d90 > 10)  { momentumText = "Aufwärtstrend intakt – Aktie zieht an."; momentumIcon = "↑↑"; }
      else if (d30 > 0 && d90 > 0) { momentumText = "Leicht positives Momentum – Erholung läuft."; momentumIcon = "↑"; }
      else if (d30 < -5 && d90 < -10) { momentumText = "Abwärtstrend – Boden noch nicht bestätigt."; momentumIcon = "↓↓"; }
      else if (d30 < 0 && d90 < 0) { momentumText = "Schwaches Momentum – Konsolidierung."; momentumIcon = "↓"; }
      else if (d30 > 5 && d90 < 0) { momentumText = "Kurzfristige Erholung nach Abverkauf – Boden-Test?"; momentumIcon = "↑?"; }
    }

    // Special Div Block
    let specialDivHTML = "";
    if (specialDiv) {
      const scoreColor = specialDiv.score >= 60 ? "#4ade80" : specialDiv.score >= 35 ? "#fbbf24" : "#9aa6c0";
      specialDivHTML = `
        <div class="analysis-section">
          <h4>🎰 Sonderdividenden-Wahrscheinlichkeit</h4>
          <div class="special-div-score" style="color: ${scoreColor}; font-size: 2rem; font-weight: 700;">
            ${specialDiv.score}%
          </div>
          <ul class="analysis-signals">
            ${specialDiv.signals.map(s => `<li>${s}</li>`).join("")}
          </ul>
        </div>
      `;
    }

    analysisEl.innerHTML = `

      <!-- ZYKLUS-PHASE -->
      <div class="analysis-section cycle-box" style="border-left: 4px solid ${cycle.color};">
        <div class="cycle-header">
          <span class="cycle-icon">${cycle.icon}</span>
          <div>
            <div class="cycle-phase">${cycle.phase}</div>
            <div class="cycle-action" style="color: ${cycle.color};">→ ${cycle.action}</div>
          </div>
        </div>
        <p class="cycle-note">${cycle.note}</p>
      </div>

      <!-- SEKTOR-PROFIL -->
      ${bucket ? `
      <div class="analysis-section">
        <h4>📊 Sektor-Profil</h4>
        <strong>${bucketLabels[bucket] || bucket}</strong>
        <p class="analysis-note">${hardAssetLabel(bucket)}</p>
      </div>
      ` : ""}

      <!-- MOMENTUM -->
      <div class="analysis-section">
        <h4>📈 Momentum-Analyse</h4>
        <div class="momentum-row">
          <span class="momentum-arrow" style="font-size: 1.5rem;">${momentumIcon}</span>
          <span>${momentumText}</span>
        </div>
        <div class="momentum-details">
          ${Number.isFinite(d30) ? `<span class="${d30 >= 0 ? 'mc-up' : 'mc-down'}">1M: ${d30 >= 0 ? '+' : ''}${fmtNum(d30, 1)}%</span>` : ""}
          ${Number.isFinite(d90) ? `<span class="${d90 >= 0 ? 'mc-up' : 'mc-down'}">3M: ${d90 >= 0 ? '+' : ''}${fmtNum(d90, 1)}%</span>` : ""}
        </div>
      </div>

      <!-- SONDERDIVIDENDEN -->
      ${specialDivHTML}

      <!-- FUNDAMENTALS -->
      <div class="analysis-section">
        <h4>📋 Fundamental-Daten</h4>
        ${buildFundamentalsHTML(data)}
      </div>

    `;
  }

  /* =============================================================
     INTRADAY RATING (wie vorher, leicht verbessert)
  ============================================================= */

  function updateRating(data) {
    const badge = $("stock-rating-badge");
    const text  = $("stock-rating-text");
    if (!badge || !text) return;

    const close = Number(data.close);
    const high  = Number(data.high);
    const low   = Number(data.low);
    const prev  = Number(data.prev_close);

    let label = "NEUTRAL";
    let cls   = "rating-neutral";
    let msg   = "Noch wenig Intraday-Daten.";

    if (Number.isFinite(close) && Number.isFinite(high) && Number.isFinite(low) && high > low) {
      const pos = (close - low) / (high - low);

      if (pos <= 0.25) {
        label = "Günstig (Tagestief-Nähe)";
        cls   = "rating-bull";
        msg   = "Kurs nahe Tagestief – gute Zone für Nachkauf.";
      } else if (pos >= 0.75) {
        label = "Teuer (Tageshoch-Nähe)";
        cls   = "rating-bear";
        msg   = "Kurs nahe Tageshoch – keine FOMO, entspannt bleiben.";
      } else {
        label = "Neutral";
        cls   = "rating-neutral";
        msg   = "Kurs im mittleren Intraday-Bereich – kein extremes Setup.";
      }

      if (Number.isFinite(prev) && prev > 0) {
        const chgPct = ((close - prev) / prev) * 100;
        if (chgPct >= 3 && pos >= 0.7)  msg = "Starker Up-Move + Tageshoch – Momentum-Tag, kein Blindkauf.";
        if (chgPct <= -3 && pos <= 0.3) msg = "Starker Abverkauf + Tagestief – Panikzone, ideal für Watchlist.";
      }
    }

    badge.textContent = label;
    badge.className   = "rating-badge " + cls;
    text.textContent  = msg;
  }

  /* =============================================================
     CHART RENDERING (verbessert: 52W Range + Kurs)
  ============================================================= */

  async function renderChart(data) {
    const canvas = $("priceChart");
    if (!canvas) return;

    await ensureChartJs();

    const close   = Number(data.close);
    const high    = Number(data.high);
    const low     = Number(data.low);
    const w52High = Number(data.week52High);
    const w52Low  = Number(data.week52Low);

    if (priceChart) priceChart.destroy();

    const ctx = canvas.getContext("2d");

    // Zeige: 52W Tief | Tagestief | Kurs | Tageshoch | 52W Hoch
    const labels = ["52W Tief", "Tagestief", "Kurs", "Tageshoch", "52W Hoch"];
    const values = [
      Number.isFinite(w52Low)  ? w52Low  : null,
      Number.isFinite(low)     ? low     : null,
      Number.isFinite(close)   ? close   : null,
      Number.isFinite(high)    ? high    : null,
      Number.isFinite(w52High) ? w52High : null
    ];

    const colors = values.map((v, i) => {
      if (i === 2) return "#d4af37"; // Kurs = Gold
      if (i === 0 || i === 1) return "rgba(96, 165, 250, 0.6)"; // Tiefs = Blau
      return "rgba(239, 68, 68, 0.6)"; // Hochs = Rot
    });

    priceChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [{
          label: data.ticker || "Kurs",
          data: values,
          backgroundColor: colors,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: `${data.ticker || "–"} – Kurs-Kontext (Intraday + 52W)`,
            color: "#cfd6e6"
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: "#9aa6c0" } },
          y: {
            grid: { color: "rgba(255,255,255,0.05)" },
            ticks: { color: "#9aa6c0" }
          }
        }
      }
    });
  }

  /* =============================================================
     LOADER (Haupt-Funktion)
  ============================================================= */

  async function loadStock(tickerRaw) {
    const outError = $("stock-error");
    if (outError) outError.textContent = "";

    const t = String(tickerRaw || "").trim().toUpperCase();
    if (!t) {
      if (outError) outError.textContent = "Bitte Ticker eingeben.";
      return;
    }

    // Loading State
    const btn = $("chart-run");
    if (btn) { btn.disabled = true; btn.textContent = "Analysiere…"; }

    const analysisEl = $("stock-analysis");
    if (analysisEl) analysisEl.innerHTML = "<p style='color: #9aa6c0; padding: 20px; text-align: center;'>⏳ Lade Analyse…</p>";

    try {
      // 1) Quote + Fundamentals laden
      const res = await fetch(`/api/quote/${encodeURIComponent(t)}`);
      if (!res.ok) throw new Error("Quote-Request fehlgeschlagen");

      const data = await res.json();
      if (!data || data.close == null) throw new Error("Keine Kursdaten gefunden");

      // 2) Basic Infos
      if ($("stock-ticker"))    $("stock-ticker").textContent    = data.ticker || t;
      if ($("stock-name"))      $("stock-name").textContent      = data.name   || data.ticker || t;
      if ($("stock-price"))     $("stock-price").textContent     = fmtNum(data.close, 2);
      if ($("stock-volume"))    $("stock-volume").textContent    = fmtBig(data.volume);
      if ($("stock-vw"))        $("stock-vw").textContent        = fmtNum(data.vw, 2);
      if ($("stock-hard-asset")) $("stock-hard-asset").textContent = hardAssetLabel(classifyHardAsset(t));

      if ($("stock-day-range")) {
        const lo = Number.isFinite(Number(data.low))  ? fmtNum(data.low, 2) : "–";
        const hi = Number.isFinite(Number(data.high)) ? fmtNum(data.high, 2) : "–";
        $("stock-day-range").textContent = `${lo} – ${hi}`;
      }

      // 3) Change
      const changeEl    = $("stock-change");
      const changePctEl = $("stock-change-pct");
      const close = Number(data.close);
      const prev  = Number(data.prev_close);

      if (Number.isFinite(close) && Number.isFinite(prev) && prev !== 0) {
        const chg    = close - prev;
        const chgPct = (chg / prev) * 100;
        if (changeEl)    changeEl.textContent    = fmtNum(chg, 2);
        if (changePctEl) {
          changePctEl.textContent = fmtNum(chgPct, 2) + " %";
          changePctEl.className   = chgPct > 0 ? "mc-up" : chgPct < 0 ? "mc-down" : "mc-flat";
        }
      }

      // 4) Intraday Stats
      const rangeEl  = $("stock-range-pct");
      const rrEl     = $("stock-rr");
      const riskEl   = $("stock-risk-down");
      const rewardEl = $("stock-upside");
      const high_ = Number(data.high);
      const low_  = Number(data.low);

      if (Number.isFinite(close) && Number.isFinite(high_) && Number.isFinite(low_) && high_ > low_) {
        const rangePct = (high_ - low_) / close * 100;
        const riskDown = (close - low_) / close * 100;
        const upside   = (high_ - close) / close * 100;
        const rr       = riskDown > 0 ? upside / riskDown : null;

        if (rangeEl)  rangeEl.textContent  = fmtNum(rangePct, 2) + " %";
        if (riskEl)   riskEl.textContent   = fmtNum(riskDown, 2) + " %";
        if (rewardEl) rewardEl.textContent = fmtNum(upside, 2) + " %";
        if (rrEl)     rrEl.textContent     = rr != null ? fmtNum(rr, 2) + "x" : "–";
      }

      // 5) Intraday Rating
      updateRating(data);

      // 6) Chart
      await renderChart(data);

      // 7) NEU: Zyklus-Analyse
      const cycle = detectCyclePosition(data);

      // 8) NEU: Sonderdiv-Score
      const specialDiv = calcSpecialDivScore(data);

      // 9) NEU: Gesamtanalyse rendern
      renderAnalysis(data, cycle, specialDiv);

    } catch (e) {
      console.error("Analyse Fehler:", e);
      if (outError) outError.textContent = e.message || String(e);
      if (analysisEl) analysisEl.innerHTML = `<p style='color: #ef4444; padding: 20px;'>❌ ${e.message}</p>`;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = "Analysieren"; }
    }
  }

  function hardAssetLabel(bucket) {
    if (!bucket) return "Kein spezielles Hard-Asset-Profil erkannt.";
    const labels = {
      shipping:  "Shipping / Fracht – hochzyklisch, stark abhängig von Frachtraten.",
      pipelines: "Pipelines / Midstream – Cashflow-getrieben, oft hohe stabile Dividenden.",
      energy:    "Energy / Öl & Gas – zyklisch, profitiert von höherem Ölpreis.",
      mining:    "Mining / Rohstoffe – rohstoffpreisabhängig, volatile Dividenden.",
      reit:      "REIT / Immobilien – Mieteinnahmen & Zinsumfeld entscheidend.",
      bdc:       "BDC – Zinsniveau & Kreditrisiko zentral."
    };
    return labels[bucket] || "Kein spezielles Hard-Asset-Profil erkannt.";
  }

  /* =============================================================
     INIT
  ============================================================= */

  document.addEventListener("DOMContentLoaded", () => {
    const form  = $("chart-form");
    const input = $("chart-ticker");

    if (form && input) {
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        loadStock(input.value);
      });
    }

    // URL-Parameter: ?ticker=TORM → autoload
    const params  = new URLSearchParams(window.location.search);
    const qTicker = params.get("ticker");
    if (qTicker && input) {
      input.value = qTicker.toUpperCase();
      loadStock(qTicker);
    }
  });

})();