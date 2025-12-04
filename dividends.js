// dividends.js – Dividendenkalender + 4-Jahres-Forecast

(function () {
  async function ensureChartJs() {
    if (window.Chart) return;
    await new Promise((resolve) => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/chart.js";
      s.onload = resolve;
      document.body.appendChild(s);
    });
  }

  function formatEuro(v) {
    const n = Number(v || 0);
    if (!isFinite(n)) return "0.00 €";
    return n.toFixed(2).replace(".", ",") + " €";
  }

  window.loadDividends = async function () {
    const host = document.getElementById("dividendOverview");
    const avgEl = document.getElementById("avgMonthly");
    const bar = document.getElementById("progressBar");
    const chartCanvas = document.getElementById("dividendChart");

    if (!host) return;

    host.innerHTML = "<p>Lade Dividenden…</p>";
    if (avgEl) avgEl.textContent = "0.00 €";
    if (bar) {
      bar.style.width = "0%";
      bar.textContent = "0%";
    }

    try {
      // 1) Portfolio laden (für Shares + TTM-Dividende)
      const rp = await fetch("/api/portfolio");
      const pj = await rp.json();
      const portfolio = Array.isArray(pj?.portfolio) ? pj.portfolio : [];

      if (!portfolio.length) {
        host.innerHTML = "<p>Kein Portfolio gefunden – bitte zuerst Positionen hinzufügen.</p>";
        return;
      }

      const tickers = [...new Set(portfolio.map(p => p.ticker).filter(Boolean))];
      if (!tickers.length) {
        host.innerHTML = "<p>Keine Ticker im Portfolio vorhanden.</p>";
        return;
      }

      // 2) Kommende Dividenden laden
      const rc = await fetch(
        "/api/dividend-calendar?tickers=" +
        encodeURIComponent(tickers.join(",")) +
        "&futureOnly=true"
      );
      const cal = await rc.json();
      const items = Array.isArray(cal?.items) ? cal.items : [];

      let html = "";

      html += "<h4>Kommende Dividenden (Ex-Termine)</h4>";
      if (!items.length) {
        html += "<p>Aktuell keine kommenden Dividenden im Kalender.</p>";
      } else {
        html += '<div class="table-wrap"><table class="portfolio-table">';
        html += "<thead><tr><th>Ticker</th><th>Ex-Date</th><th>Pay-Date</th><th>Betrag je Aktie</th></tr></thead><tbody>";
        for (const d of items) {
          html += `
            <tr>
              <td>${d.ticker || ""}</td>
              <td>${d.exDate || ""}</td>
              <td>${d.payDate || ""}</td>
              <td class="num">${d.amount != null ? Number(d.amount).toFixed(2) : ""}</td>
            </tr>
          `;
        }
        html += "</tbody></table></div>";
      }

      // 3) Forecast (4 Jahre) zur Anzeige berechnen
      const holdings = portfolio
        .map(p => ({
          ticker: p.ticker,
          isin: p.isin,
          shares: Number(p.shares || 0),
          dps_ttm: Number(p.dividendPerShareTTM || 0)
        }))
        .filter(h => (h.ticker || h.isin) && h.shares > 0);

      let totals4 = [];
      if (holdings.length) {
        const rf = await fetch("/api/forecast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            holdings,
            default_growth_pct: 3
          })
        });

        if (rf.ok) {
          const fj = await rf.json();
          const totals = Array.isArray(fj?.totals) ? fj.totals : [];
          totals4 = totals.filter(t => t.year >= 1 && t.year <= 4);

          if (totals4.length) {
            html += '<h4 class="mt-md">Forecast (4 Jahre – auf Basis TTM, ca. 3% Wachstum)</h4>';
            html += '<div class="table-wrap"><table class="portfolio-table">';
            html += "<thead><tr><th>Jahr</th><th>Prognose Dividende (pro Jahr)</th></tr></thead><tbody>";
            for (const row of totals4) {
              html += `
                <tr>
                  <td>${row.year}</td>
                  <td class="num">${formatEuro(row.income)}</td>
                </tr>
              `;
            }
            html += "</tbody></table></div>";

            // Ø Monatsdividende aus Jahr 1
            const y1 = totals4.find(t => t.year === 1);
            if (y1 && avgEl) {
              const avg = (Number(y1.income || 0) / 12) || 0;
              avgEl.textContent = formatEuro(avg).replace(" €", "");
            }

            // Fortschrittsbalken – 4J Wachstum vs Jahr 1
            if (bar && totals4.length >= 2) {
              const base = Number(totals4[0].income || 0);
              const last = Number(totals4[totals4.length - 1].income || 0);
              if (base > 0) {
                const growthPct = ((last / base) - 1) * 100;
                const label = (growthPct >= 0 ? "+" : "") + growthPct.toFixed(1) + " %";
                bar.style.width = "100%";
                bar.textContent = "4J Wachstum: " + label;
              } else {
                bar.style.width = "0%";
                bar.textContent = "Keine Basisdaten";
              }
            }

            // Chart
            if (chartCanvas && totals4.length) {
              await ensureChartJs();

              const ctx = chartCanvas.getContext("2d");
              if (window._divChart) {
                window._divChart.destroy();
              }

              window._divChart = new Chart(ctx, {
                type: "bar",
                data: {
                  labels: totals4.map(t => "Jahr " + t.year),
                  datasets: [{
                    label: "Prognose Dividende (€/Jahr)",
                    data: totals4.map(t => Number(t.income || 0))
                  }]
                },
                options: {
                  responsive: true,
                  maintainAspectRatio: false
                }
              });
            }
          }
        }
      }

      host.innerHTML = html;

    } catch (e) {
      host.innerHTML = `<p>Fehler: ${e.message || e}</p>`;
    }
  };
})();
