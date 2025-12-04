// charts.js – einfache Ticker-Analyse mit Preis & Intraday-Range
(function () {
  let priceChart = null;

  function $(id) {
    return document.getElementById(id);
  }

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

  function updateRating(data) {
    const badge = $("stock-rating-badge");
    const text  = $("stock-rating-text");
    if (!badge || !text) return;

    const close = Number(data.close);
    const high  = Number(data.high);
    const low   = Number(data.low);

    let label = "NEUTRAL";
    let cls   = "rating-neutral";
    let msg   = "Noch wenig Intraday-Daten – reine Preisübersicht.";

    if (Number.isFinite(close) && Number.isFinite(high) && Number.isFinite(low) && high > low) {
      const pos = (close - low) / (high - low);
      if (pos <= 0.25) {
        label = "Günstig (Tagestief-Nähe)";
        cls   = "rating-bull";
        msg   = "Kurs notiert nahe Tagestief – kurzfristig eher günstige Zone.";
      } else if (pos >= 0.75) {
        label = "Teuer (Tageshoch-Nähe)";
        cls   = "rating-bear";
        msg   = "Kurs notiert nahe Tageshoch – eher keine aggressiven Käufe.";
      } else {
        label = "Neutral";
        cls   = "rating-neutral";
        msg   = "Kurs liegt im mittleren Bereich der Intraday-Spanne.";
      }
    }

    badge.textContent = label;
    badge.className   = "rating-badge " + cls;
    text.textContent  = msg;
  }

  async function renderChart(data) {
    const ctx = $("priceChart");
    if (!ctx) return;
    await ensureChartJs();

    const close = Number(data.close);
    const high  = Number(data.high);
    const low   = Number(data.low);

    const labels = ["Tagestief", "Schlusskurs", "Tageshoch"];
    const values = [
      Number.isFinite(low)   ? low   : null,
      Number.isFinite(close) ? close : null,
      Number.isFinite(high)  ? high  : null
    ];

    if (priceChart) {
      priceChart.destroy();
    }

    priceChart = new Chart(ctx, {
      type: "bar",
      data: {
        labels,
        datasets: [
          {
            label: data.ticker || "Kurs",
            data: values
          }
        ]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          title: {
            display: true,
            text: "Intraday-Spanne"
          }
        }
      }
    });
  }

  async function loadStock(tickerRaw) {
    const outError = $("stock-error");
    if (outError) outError.textContent = "";

    const t = String(tickerRaw || "").trim().toUpperCase();
    if (!t) {
      if (outError) outError.textContent = "Bitte Ticker eingeben.";
      return;
    }

    const btn = $("chart-run");
    if (btn) {
      btn.disabled = true;
      btn.textContent = "Lade…";
    }

    try {
      const res = await fetch(`/api/quote/${encodeURIComponent(t)}`);
      if (!res.ok) {
        throw new Error("Quote-Request fehlgeschlagen");
      }
      const data = await res.json();
      if (!data || data.close == null) {
        throw new Error("Keine Kursdaten gefunden");
      }

      if ($("stock-ticker")) $("stock-ticker").textContent = data.ticker || t;
      if ($("stock-name"))   $("stock-name").textContent   = data.ticker || t;
      if ($("stock-price"))  $("stock-price").textContent  = fmtNum(data.close, 2);

      if ($("stock-volume")) $("stock-volume").textContent = fmtBig(data.volume);
      if ($("stock-vw"))     $("stock-vw").textContent     = fmtNum(data.vw, 2);

      if ($("stock-day-range")) {
        const lo = Number.isFinite(Number(data.low)) ? fmtNum(data.low, 2) : "–";
        const hi = Number.isFinite(Number(data.high)) ? fmtNum(data.high, 2) : "–";
        $("stock-day-range").textContent = `${lo} – ${hi}`;
      }

      updateRating(data);
      await renderChart(data);
    } catch (e) {
      if (outError) outError.textContent = e.message || String(e);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "Analysieren";
      }
    }
  }

  document.addEventListener("DOMContentLoaded", () => {
    const form  = document.getElementById("chart-form");
    const input = document.getElementById("chart-ticker");

    if (form && input) {
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        loadStock(input.value);
      });
    }

    // Optional: ?ticker=AAPL in der URL autoloaden
    const params  = new URLSearchParams(window.location.search);
    const qTicker = params.get("ticker");
    if (qTicker && input) {
      input.value = qTicker.toUpperCase();
      loadStock(qTicker);
    }
  });
})();
