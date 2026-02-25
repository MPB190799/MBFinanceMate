"use strict";

// sector.js – FINAL CAPITAL FLOW VERSION
// Fokus: wohin fließt Kapital (3M vs SPY)
// alles andere bewusst entfernt

(function () {

  /* ===== Helpers ===== */
  const num = v => (typeof v === "number" && isFinite(v)) ? v : null;

  const fmt = v => {
    if (v == null) return "–";
    const cls = v > 0 ? "mc-up" : v < 0 ? "mc-down" : "mc-flat";
    return `<span class="${cls}">${v.toFixed(2)}%</span>`;
  };

  const flowBadge = diff => {
    if (diff > 1)  return `<span class="mc-badge mc-bull">🟢 IN</span>`;
    if (diff < -1) return `<span class="mc-badge mc-bear">🔴 OUT</span>`;
    return `<span class="mc-badge mc-mixed">⚪ Neutral</span>`;
  };

  const flowText = diff => {
    if (diff > 1)  return "Kapitalzufluss / Akkumulation";
    if (diff < -1) return "Kapitalabfluss / Distribution";
    return "Seitwärts / keine klare Rotation";
  };

  // Fallback: berechnet 3M Return aus Close-Werten
  const get3MReturn = (row) => {
    let d90 = num(row?.d90);
    if (d90 != null) return d90;

    const price = num(row?.price);
    const c90   = num(row?.close90d);
    if (price != null && c90 != null && c90 !== 0) {
      return ((price / c90) - 1) * 100;
    }
    return null;
  };

  /* ===== Main ===== */
  async function loadSectorRotation() {

    const sectors = [
      { name: "Tech", ticker: "XLK" },
      { name: "Energy", ticker: "XLE" },
      { name: "Financials", ticker: "XLF" },
      { name: "Industrials", ticker: "XLI" },
      { name: "Materials", ticker: "XLB" },
      { name: "Staples", ticker: "XLP" },
      { name: "Discretionary", ticker: "XLY" },
      { name: "Health", ticker: "XLV" },
      { name: "Utilities", ticker: "XLU" },
      { name: "REITs", ticker: "IYR" }
    ];

    try {
      const tickers = ["SPY", ...sectors.map(s => s.ticker)].join(",");
      const r = await fetch("/api/market-cycles?tickers=" + tickers);
      const j = await r.json();
      const data = j?.data || j || {};

      const spy3m = get3MReturn(data.SPY);
      if (spy3m == null) {
        document.getElementById("sector-note").innerText =
          "SPY 3M Daten fehlen – Kapitalfluss nicht berechenbar.";
        return;
      }

      let html = "";

      for (const s of sectors) {
        const row = data[s.ticker] || data[s.ticker.toLowerCase()] || {};
        const price = row.price ?? "–";
        const r3m = get3MReturn(row);
        const diff = (r3m != null) ? (r3m - spy3m) : null;

        html += `
          <tr>
            <td>${s.name} (${s.ticker})</td>
            <td>${price}</td>
            <td>${fmt(r3m)}</td>
            <td>${diff != null ? fmt(diff) : "–"}</td>
            <td>${diff != null ? flowBadge(diff) : "–"}</td>
            <td>${diff != null ? flowText(diff) : "Keine Daten"}</td>
          </tr>
        `;
      }

      document.getElementById("sector-body").innerHTML = html;
      document.getElementById("sector-note").innerText =
        "Kapitalfluss basiert auf 3M-Performance relativ zu SPY.";

    } catch (e) {
      console.error("Sector Fehler:", e);
      document.getElementById("sector-note").innerText =
        "Fehler beim Laden der Sektordaten.";
    }
  }

  window.loadSectorRotation = loadSectorRotation;
  loadSectorRotation();

})();
