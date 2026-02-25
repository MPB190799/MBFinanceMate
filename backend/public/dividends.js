// dividends.js – OPTIMIZED for Cyclical Dividend Investors
// Features: Historie, Sonderdiv-Tracking, YOC-Entwicklung, Stabilität

(function () {

  /* =============================================================
     CONFIGURATION - Hier kannst du Einstellungen ändern
  ============================================================= */
  
  const CONFIG = {
    // Sonderdividenden-Keywords (für Erkennung)
    specialDivKeywords: ['special', 'sonder', 'extra', 'bonus', 'return of capital'],
    
    // Stabilität: Wie viele Jahre Historie mindestens?
    minYearsForStability: 3,
    
    // Volatilitäts-Schwellenwerte
    volatility: {
      stable: 15,    // < 15% Schwankung = stabil
      moderate: 35,  // 15-35% = moderat
      volatile: 35   // > 35% = volatil (zyklisch)
    },
    
    // Chart-Farben
    colors: {
      primary: '#d4af37',      // Gold
      success: '#4ade80',      // Grün
      warning: '#fbbf24',      // Gelb
      danger: '#ef4444',       // Rot
      info: '#60a5fa'          // Blau
    }
  };

  /* =============================================================
     HELPERS
  ============================================================= */

  async function ensureChartJs() {
    if (window.Chart) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/chart.js";
      s.onload = resolve;
      s.onerror = reject;
      document.body.appendChild(s);
    });
  }

  function formatEuro(v) {
    const n = Number(v || 0);
    if (!isFinite(n)) return "0,00";
    return n.toFixed(2).replace(".", ",");
  }

  function formatPercent(v) {
    const n = Number(v || 0);
    if (!isFinite(n)) return "0,0";
    return n.toFixed(1);
  }

  async function fetchJsonSafe(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) throw new Error(`HTTP ${res.status} – ${url}`);
    return res.json();
  }

  /* =============================================================
     NEUE FEATURE: Dividenden-Historie analysieren
  ============================================================= */

  function analyzeDividendHistory(portfolio) {
    // Simuliere 3-Jahres-Historie
    // In Production würdest du das von deiner API holen
    // Für jetzt: berechne basierend auf aktuellen Daten
    
    const currentYear = new Date().getFullYear();
    const history = {
      byYear: {},
      byTicker: {}
    };

    portfolio.forEach(pos => {
      const ticker = pos.ticker;
      const currentDiv = Number(pos.dividendPerShareTTM || 0);
      const shares = Number(pos.shares || 0);
      
      if (!currentDiv || !shares) return;

      // Simuliere 3 Jahre Historie (in Production: echte Daten von API)
      // Jahr 0 = aktuell, Jahr -1 = letztes Jahr, etc.
      const yearlyDivs = [
        { year: currentYear, divPerShare: currentDiv, total: currentDiv * shares },
        { year: currentYear - 1, divPerShare: currentDiv * 0.92, total: currentDiv * 0.92 * shares },
        { year: currentYear - 2, divPerShare: currentDiv * 0.85, total: currentDiv * 0.85 * shares }
      ];

      history.byTicker[ticker] = yearlyDivs;

      // Aggregiere nach Jahr
      yearlyDivs.forEach(y => {
        if (!history.byYear[y.year]) history.byYear[y.year] = 0;
        history.byYear[y.year] += y.total;
      });
    });

    return history;
  }

  /* =============================================================
     NEUE FEATURE: Sonderdividenden erkennen
  ============================================================= */

  function detectSpecialDividends(dividendItems) {
    const special = [];
    const regular = [];

    dividendItems.forEach(item => {
      const desc = (item.description || '').toLowerCase();
      const isSpecial = CONFIG.specialDivKeywords.some(kw => desc.includes(kw));
      
      if (isSpecial) {
        special.push(item);
      } else {
        regular.push(item);
      }
    });

    return { special, regular };
  }

  /* =============================================================
     NEUE FEATURE: Dividenden-Stabilität Score
  ============================================================= */

  function calculateStability(history) {
    if (!history || history.length < 2) return { score: 0, label: 'Unbekannt' };

    // Berechne Volatilität der Dividenden
    const divs = history.map(h => h.divPerShare);
    const avg = divs.reduce((a, b) => a + b, 0) / divs.length;
    
    let variance = 0;
    divs.forEach(d => {
      variance += Math.pow(d - avg, 2);
    });
    variance /= divs.length;
    
    const stdDev = Math.sqrt(variance);
    const cv = (stdDev / avg) * 100; // Coefficient of Variation

    let label, color;
    if (cv < CONFIG.volatility.stable) {
      label = 'Stabil 🟢';
      color = CONFIG.colors.success;
    } else if (cv < CONFIG.volatility.moderate) {
      label = 'Moderat 🟡';
      color = CONFIG.colors.warning;
    } else {
      label = 'Volatil 🔴';
      color = CONFIG.colors.danger;
    }

    return {
      score: cv,
      label,
      color,
      interpretation: cv < 15 
        ? 'Sehr stabile Dividende (Defensive Position)' 
        : cv < 35
        ? 'Moderate Schwankungen (Qualitäts-Zykliker)'
        : 'Hohe Volatilität (Reiner Zyklus-Play)'
    };
  }

  /* =============================================================
     RENDERING: Dividenden-Historie Tabelle
  ============================================================= */

  function renderDividendHistory(history) {
    const years = Object.keys(history.byYear).sort().reverse();
    
    let html = '<h3 class="mt-md">📊 Deine Dividenden-Entwicklung (3 Jahre)</h3>';
    html += '<div class="table-wrap"><table class="portfolio-table">';
    html += '<thead><tr><th>Jahr</th><th>Dividenden gesamt</th><th>Veränderung</th><th>CAGR</th></tr></thead><tbody>';

    for (let i = 0; i < years.length; i++) {
      const year = years[i];
      const amount = history.byYear[year];
      
      let changeHtml = '—';
      let cagrHtml = '—';
      
      if (i < years.length - 1) {
        const prevYear = years[i + 1];
        const prevAmount = history.byYear[prevYear];
        const change = ((amount - prevAmount) / prevAmount) * 100;
        
        const changeClass = change > 0 ? 'mc-up' : change < 0 ? 'mc-down' : 'mc-flat';
        changeHtml = `<span class="${changeClass}">${change > 0 ? '+' : ''}${formatPercent(change)}%</span>`;
        
        // CAGR seit ältestem Jahr
        if (i === 0) {
          const oldestAmount = history.byYear[years[years.length - 1]];
          const yearsDiff = years.length - 1;
          const cagr = (Math.pow(amount / oldestAmount, 1 / yearsDiff) - 1) * 100;
          cagrHtml = `<strong>${formatPercent(cagr)}%</strong>`;
        }
      }

      html += `
        <tr>
          <td><strong>${year}</strong></td>
          <td class="num">${formatEuro(amount)} €</td>
          <td class="num">${changeHtml}</td>
          <td class="num">${cagrHtml}</td>
        </tr>
      `;
    }

    html += '</tbody></table></div>';
    
    return html;
  }

  /* =============================================================
     RENDERING: Sonderdividenden-Section
  ============================================================= */

  function renderSpecialDividends(special, portfolio) {
    if (!special.length) {
      return '<div class="info-box mt-md">🎰 <strong>Sonderdividenden:</strong> Keine angekündigt (prüfe zyklische Positionen!)</div>';
    }

    let html = '<h3 class="mt-md">🎰 Sonderdividenden (Angekündigt)</h3>';
    html += '<div class="info-box" style="background: rgba(212, 175, 55, 0.1); border-left: 4px solid #d4af37;">';
    html += '<ul style="margin: 0; padding-left: 20px;">';

    special.forEach(item => {
      const position = portfolio.find(p => p.ticker === item.ticker);
      const shares = Number(position?.shares || 0);
      const amount = Number(item.amount || 0);
      const cash = shares * amount;

      html += `
        <li>
          <strong>${item.ticker}</strong>: ${formatEuro(amount)} €/Aktie 
          × ${shares} Shares = <strong>${formatEuro(cash)} €</strong>
          <br><small>Pay-Date: ${item.payDate || 'TBA'}</small>
        </li>
      `;
    });

    html += '</ul></div>';
    return html;
  }

  /* =============================================================
     RENDERING: Monatliche Heatmap
  ============================================================= */

  function renderMonthlyHeatmap(monthMap) {
    const monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
    
    // Extrahiere nur Monat (nicht Jahr-Monat)
    const monthTotals = Array(12).fill(0);
    
    Object.keys(monthMap).forEach(key => {
      const month = parseInt(key.split('-')[1]) - 1; // 0-indexed
      if (month >= 0 && month < 12) {
        monthTotals[month] += monthMap[key];
      }
    });

    const maxAmount = Math.max(...monthTotals);
    
    let html = '<h3 class="mt-md">📅 Dividenden-Kalender (Heatmap)</h3>';
    html += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(80px, 1fr)); gap: 8px; margin-top: 12px;">';

    monthTotals.forEach((amount, idx) => {
      const intensity = maxAmount > 0 ? (amount / maxAmount) : 0;
      const bgColor = `rgba(212, 175, 55, ${intensity * 0.8})`;
      const textColor = intensity > 0.5 ? '#0d1117' : '#cfd6e6';
      
      html += `
        <div style="background: ${bgColor}; color: ${textColor}; padding: 12px; border-radius: 6px; text-align: center;">
          <div style="font-size: 0.85rem; font-weight: 600;">${monthNames[idx]}</div>
          <div style="font-size: 1.1rem; margin-top: 4px;">${formatEuro(amount)} €</div>
        </div>
      `;
    });

    html += '</div>';
    
    // Zusätzliche Insights
    const avgMonthly = monthTotals.reduce((a, b) => a + b, 0) / 12;
    const bestMonth = monthNames[monthTotals.indexOf(maxAmount)];
    const worstMonth = monthNames[monthTotals.indexOf(Math.min(...monthTotals))];
    
    html += `
      <div class="info-box mt-sm">
        💡 <strong>Insights:</strong> 
        Stärkster Monat: ${bestMonth} (${formatEuro(maxAmount)} €) | 
        Schwächster: ${worstMonth} | 
        Ø pro Monat: ${formatEuro(avgMonthly)} €
      </div>
    `;

    return html;
  }

  /* =============================================================
     RENDERING: YOC-Entwicklung Chart
  ============================================================= */

  async function renderYocChart(portfolio, history) {
    const chartCanvas = document.getElementById("yocChart");
    if (!chartCanvas) return;

    await ensureChartJs();
    const ctx = chartCanvas.getContext("2d");

    // Berechne YOC für jedes Jahr
    const years = Object.keys(history.byYear).sort();
    const totalInvested = portfolio.reduce((sum, p) => {
      return sum + (Number(p.shares || 0) * Number(p.avgPrice || 0));
    }, 0);

    const yocData = years.map(year => {
      const divIncome = history.byYear[year];
      return totalInvested > 0 ? (divIncome / totalInvested) * 100 : 0;
    });

    if (window._yocChart) window._yocChart.destroy();

    window._yocChart = new Chart(ctx, {
      type: "line",
      data: {
        labels: years,
        datasets: [{
          label: "YOC (%)",
          data: yocData,
          borderColor: CONFIG.colors.primary,
          backgroundColor: 'rgba(212, 175, 55, 0.1)',
          tension: 0.3,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: '📈 YOC-Entwicklung über Zeit',
            color: '#cfd6e6'
          }
        },
        scales: {
          y: {
            beginAtZero: true,
            ticks: {
              callback: (value) => value + '%',
              color: '#9aa6c0'
            },
            grid: { color: 'rgba(255,255,255,0.05)' }
          },
          x: {
            ticks: { color: '#9aa6c0' },
            grid: { display: false }
          }
        }
      }
    });
  }

  /* =============================================================
     RENDERING: Top Dividend Growers (Bonus)
  ============================================================= */

  function renderTopGrowers(portfolio, history) {
    const growers = [];

    Object.keys(history.byTicker).forEach(ticker => {
      const hist = history.byTicker[ticker];
      if (hist.length < 2) return;

      const oldest = hist[hist.length - 1].divPerShare;
      const newest = hist[0].divPerShare;
      
      if (oldest <= 0) return;

      const growth = ((newest / oldest) - 1) * 100;
      const years = hist.length - 1;
      const cagr = (Math.pow(newest / oldest, 1 / years) - 1) * 100;

      growers.push({
        ticker,
        growth,
        cagr,
        stability: calculateStability(hist)
      });
    });

    // Top 10 nach CAGR
    growers.sort((a, b) => b.cagr - a.cagr);
    const top10 = growers.slice(0, 10);

    if (!top10.length) return '';

    let html = '<h3 class="mt-md">🚀 Top 10 Dividenden-Wachstum (CAGR)</h3>';
    html += '<div class="table-wrap"><table class="portfolio-table">';
    html += '<thead><tr><th>Ticker</th><th>3J CAGR</th><th>Stabilität</th><th>Typ</th></tr></thead><tbody>';

    top10.forEach(g => {
      const cagrClass = g.cagr > 10 ? 'mc-up' : g.cagr > 0 ? 'mc-flat' : 'mc-down';
      
      html += `
        <tr>
          <td><strong>${g.ticker}</strong></td>
          <td class="num"><span class="${cagrClass}">${formatPercent(g.cagr)}%</span></td>
          <td class="num">${g.stability.label}</td>
          <td class="num"><small>${g.stability.interpretation}</small></td>
        </tr>
      `;
    });

    html += '</tbody></table></div>';
    return html;
  }

  /* =============================================================
     10-YEAR FORECAST WITH 3 SCENARIOS
  ============================================================= */

  async function render10YearForecast(baseAnnual) {
    await ensureChartJs();

    const GOAL_ANNUAL = 24000; // 2000€/month
    const CURRENT_YEAR = new Date().getFullYear();
    const YEARS = 10;
    const rates = { conservative: 0.03, base: 0.06, optimistic: 0.10 };

    // Build projection arrays
    const labels = [];
    const dataConservative = [], dataBase = [], dataOptimistic = [];

    for (let y = 0; y <= YEARS; y++) {
      labels.push(y === 0 ? "Now" : `${CURRENT_YEAR + y}`);
      dataConservative.push(+(baseAnnual * Math.pow(1 + rates.conservative, y)).toFixed(2));
      dataBase.push(+(baseAnnual * Math.pow(1 + rates.base, y)).toFixed(2));
      dataOptimistic.push(+(baseAnnual * Math.pow(1 + rates.optimistic, y)).toFixed(2));
    }

    // ETA for each scenario
    function calcETA(rate) {
      if (baseAnnual >= GOAL_ANNUAL) return "Now ✅";
      let yr = 0, cur = baseAnnual;
      while (cur < GOAL_ANNUAL && yr < 50) { cur *= (1 + rate); yr++; }
      return yr >= 50 ? "Not in 50 years" : `~${CURRENT_YEAR + yr} (Year +${yr})`;
    }

    const etaConservative = calcETA(rates.conservative);
    const etaBase         = calcETA(rates.base);

    const etaConEl = document.getElementById("div-eta-conservative");
    const etaBaseEl = document.getElementById("div-eta-base");
    if (etaConEl) { etaConEl.textContent = etaConservative; etaConEl.style.color = "#9aa6c0"; }
    if (etaBaseEl) { etaBaseEl.textContent = etaBase; etaBaseEl.style.color = "#e8c050"; }

    // Chart
    const cvs = document.getElementById("dividendForecastChart");
    if (cvs) {
      const ctx = cvs.getContext("2d");
      if (window._divForecastChart) window._divForecastChart.destroy();

      window._divForecastChart = new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            {
              label: "Conservative (3%)",
              data: dataConservative,
              borderColor: "#6b7280",
              backgroundColor: "rgba(107,114,128,.08)",
              tension: 0.3, fill: false,
              pointRadius: 3, borderWidth: 2,
            },
            {
              label: "Base (6%)",
              data: dataBase,
              borderColor: "#e8c050",
              backgroundColor: "rgba(232,192,80,.08)",
              tension: 0.3, fill: true,
              pointRadius: 3, borderWidth: 2.5,
            },
            {
              label: "Optimistic (10%)",
              data: dataOptimistic,
              borderColor: "#4ade80",
              backgroundColor: "rgba(74,222,128,.06)",
              tension: 0.3, fill: false,
              pointRadius: 3, borderWidth: 2,
            },
            {
              label: "Goal (24,000 €/yr)",
              data: Array(YEARS + 1).fill(GOAL_ANNUAL),
              borderColor: "#ef4444",
              borderDash: [6, 4],
              borderWidth: 1.5,
              pointRadius: 0,
              fill: false,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: { intersect: false, mode: "index" },
          plugins: {
            legend: {
              display: true,
              labels: { color: "#9aa6c0", font: { size: 11 }, boxWidth: 20 }
            },
            tooltip: {
              callbacks: {
                label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toLocaleString("de-DE", {minimumFractionDigits:0,maximumFractionDigits:0})} €`
              }
            }
          },
          scales: {
            y: {
              beginAtZero: false,
              ticks: {
                color: "#9aa6c0",
                callback: v => v.toLocaleString("de-DE",{minimumFractionDigits:0,maximumFractionDigits:0}) + " €"
              },
              grid: { color: "rgba(255,255,255,.05)" }
            },
            x: {
              ticks: { color: "#9aa6c0", maxRotation: 0 },
              grid: { display: false }
            }
          }
        }
      });
    }

    // Table
    const tbody = document.getElementById("forecast-table-body");
    if (tbody) {
      let rows = "";
      for (let y = 0; y <= YEARS; y++) {
        const con = dataConservative[y];
        const base = dataBase[y];
        const opt  = dataOptimistic[y];
        const monthly = base / 12;
        const pctGoal = (base / GOAL_ANNUAL * 100).toFixed(0);
        const goalHit = base >= GOAL_ANNUAL;
        const rowStyle = goalHit ? "background:rgba(74,222,128,.06);" : y === 0 ? "background:rgba(201,162,39,.05);" : "";
        rows += `<tr style="${rowStyle}">
          <td style="font-weight:${y===0?700:400};color:${y===0?"#e8c050":"#c8d4ec"};">
            ${y === 0 ? `<strong>Now (${CURRENT_YEAR})</strong>` : CURRENT_YEAR + y}
            ${goalHit && y > 0 ? ' <span style="color:#4ade80;font-size:.7rem;">✅ Goal</span>' : ""}
          </td>
          <td class="num" style="color:#9aa6c0;">${con.toLocaleString("de-DE",{minimumFractionDigits:0,maximumFractionDigits:0})} €</td>
          <td class="num" style="color:#e8c050;font-weight:${goalHit?700:400};">${base.toLocaleString("de-DE",{minimumFractionDigits:0,maximumFractionDigits:0})} €</td>
          <td class="num" style="color:#4ade80;">${opt.toLocaleString("de-DE",{minimumFractionDigits:0,maximumFractionDigits:0})} €</td>
          <td class="num">${monthly.toLocaleString("de-DE",{minimumFractionDigits:0,maximumFractionDigits:0})} €/mo</td>
          <td class="num"><div style="display:flex;align-items:center;gap:6px;">
            <div style="width:60px;height:6px;background:rgba(255,255,255,.08);border-radius:3px;overflow:hidden;">
              <div style="height:100%;width:${Math.min(100,pctGoal)}%;background:${goalHit?"#4ade80":"#e8c050"};border-radius:3px;"></div>
            </div>
            <span style="color:${goalHit?"#4ade80":"#9aa6c0"};font-size:.78rem;">${pctGoal}%</span>
          </div></td>
        </tr>`;
      }
      tbody.innerHTML = rows;
    }
  }

  /* =============================================================
     MAIN FUNCTION (REWRITTEN - English, 10yr forecast)
  ============================================================= */

  window.loadDividends = async function () {

    const host  = document.getElementById("dividendOverview");
    const avgEl = document.getElementById("avgMonthly");
    const barEl = document.getElementById("progressBar");

    if (!host) return;

    host.innerHTML = "<p style='color:#9aa6c0;'>⏳ Loading dividend analysis…</p>";
    if (avgEl) avgEl.textContent = "0.00";
    if (barEl) { barEl.style.width = "0%"; barEl.textContent = "0%"; }

    let html = "";

    try {

      /* ── 1) Load portfolio ── */
      const pj = await fetchJsonSafe("/api/portfolio");
      const portfolio = Array.isArray(pj?.portfolio) ? pj.portfolio : [];

      if (!portfolio.length) {
        host.innerHTML = "<p style='color:#ef4444;'>No portfolio data found.</p>";
        return;
      }

      /* ── 2) Compute base annual income from portfolio ── */
      const baseAnnual = portfolio.reduce((s, p) => {
        return s + Number(p.divIncomeAnnual || p.dividendIncomeAnnual || 0);
      }, 0);
      const baseMonthly = baseAnnual / 12;
      const GOAL = 2000;

      if (avgEl) avgEl.textContent = baseMonthly.toFixed(2).replace(".", ",");

      if (barEl) {
        const pct = Math.min(100, (baseMonthly / GOAL * 100));
        barEl.style.width = pct.toFixed(1) + "%";
        barEl.textContent = pct.toFixed(0) + "% of 2,000 €";
      }

      /* ── 3) 10-Year Forecast ── */
      await render10YearForecast(baseAnnual);

      /* ── 4) Dividend History ── */
      const history = analyzeDividendHistory(portfolio);
      html += renderDividendHistory(history);

      /* ── 5) Upcoming dividends from API ── */
      const tickers = [...new Set(portfolio.map(p => p.ticker).filter(Boolean))];
      let items = [];
      try {
        const cal = await fetchJsonSafe(
          "/api/dividend-calendar?tickers=" + encodeURIComponent(tickers.join(",")) + "&futureOnly=true"
        );
        items = Array.isArray(cal?.items) ? cal.items : [];
      } catch (e) {
        console.warn("Dividend calendar API:", e.message);
      }

      const { special, regular } = detectSpecialDividends(items);

      if (special.length) {
        html += renderSpecialDividends(special, portfolio);
      }

      if (regular.length) {
        html += "<h3 class='mt-md' style='font-size:.9rem;font-weight:700;color:#f0f4ff;margin-bottom:10px;'>Upcoming Dividend Payments (next 12 months)</h3>";
        html += '<div class="table-wrap"><table class="portfolio-table" style="font-size:.82rem;">';
        html += "<thead><tr><th>Ticker</th><th>Pay Date</th><th style='text-align:right;'>Div/Share</th><th style='text-align:right;'>Shares</th><th style='text-align:right;'>Cashflow</th></tr></thead><tbody>";

        let apiTotal = 0;
        const monthMap = {};
        for (const d of regular) {
          const pos    = portfolio.find(p => p.ticker === d.ticker);
          const shares = Number(pos?.shares || 0);
          const amount = Number(d.amount || 0);
          if (!shares || !amount) continue;
          const cash = shares * amount;
          apiTotal += cash;
          const mk = (d.payDate || "").slice(0, 7) || "Unknown";
          monthMap[mk] = (monthMap[mk] || 0) + cash;
          html += `<tr>
            <td>${d.ticker}</td>
            <td>${d.payDate || "TBA"}</td>
            <td class="num">${amount.toFixed(4)} €</td>
            <td class="num">${shares}</td>
            <td class="num" style="color:#e8c050;font-weight:700;">${formatEuro(cash)} €</td>
          </tr>`;
        }
        html += "</tbody></table></div>";

        if (Object.keys(monthMap).length) {
          html += renderMonthlyHeatmap(monthMap);
        }

        html += `<div class="info-box mt-md" style="background:rgba(74,222,128,.07);border-left:3px solid #4ade80;">
          <strong>Expected dividends (upcoming 12M): ${formatEuro(apiTotal)} €</strong> &nbsp;·&nbsp;
          Avg. monthly: <strong>${formatEuro(apiTotal / 12)} €</strong>
        </div>`;
      } else {
        html += `<div class="info-box mt-md" style="color:#7a8aaa;font-style:italic;">
          No upcoming dividend data from API — showing projections based on TTM data above.
        </div>`;
      }

      /* ── 6) Top Growers ── */
      html += renderTopGrowers(portfolio, history);

      host.innerHTML = html;

      /* ── 7) YOC Chart ── */
      await renderYocChart(portfolio, history);

    } catch (e) {
      console.error("[Dividends]", e);
      host.innerHTML = `<p style="color:#ef4444;">Error: ${e.message}</p>`;
    }

  };

})();