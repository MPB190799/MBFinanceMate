// cycles.js – Premium Market Cycles (Trend, Bewertung, Fazit)

(function () {

  // Trendpfeil generieren
  function trendArrow(v) {
    const n = Number(v);
    if (!isFinite(n)) return `<span class="mc-trend mc-flat">→</span>`;
    if (n > 0) return `<span class="mc-trend mc-up">↑</span>`;
    if (n < 0) return `<span class="mc-trend mc-down">↓</span>`;
    return `<span class="mc-trend mc-flat">→</span>`;
  }

  // Zahl einfärben
  function colorize(v) {
    const n = Number(v);
    if (!isFinite(n)) return `<span class="mc-flat">–</span>`;
    if (n > 0) return `<span class="mc-up">${n.toFixed(2)}%</span>`;
    if (n < 0) return `<span class="mc-down">${n.toFixed(2)}%</span>`;
    return `<span class="mc-flat">${n.toFixed(2)}%</span>`;
  }

  // Bewertung Bull/Bear
  function assessCategory(values) {
    let score = 0;
    values.forEach(v => {
      const n = Number(v);
      if (!isFinite(n)) return;
      if (n > 0) score++;
      if (n < 0) score--;
    });
    if (score >= 2) return `<span class="mc-badge mc-bull">Bullish</span>`;
    if (score <= -2) return `<span class="mc-badge mc-bear">Bearish</span>`;
    return `<span class="mc-badge mc-mixed">Mixed</span>`;
  }

  // Fazit generieren
  function finalSummary(riskScore) {
    if (riskScore >= 2)
      return "<strong>📈 Marktregime: Risk-On – Liquidität verbessert sich, Cyclicals stabil.</strong>";

    if (riskScore <= -2)
      return "<strong>📉 Marktregime: Risk-Off – Defensive Sektoren bevorzugt, Makro fragil.</strong>";

    return "<strong>⚖️ Marktregime: Mixed – Übergangsphase, selektives Stock-Picking.</strong>";
  }

  // Hauptfunktion: Market Cycles laden
  window.loadMarketCycles = async function () {
    try {
      const r = await fetch("/api/market-cycles");
      const j = await r.json();

      let riskScore = 0; // Für späteres globales Fazit

      /* ================================
         MAKRO
      ================================== */

      const cpi = j?.macro?.cpi;
      const m2 = j?.macro?.m2;
      const ust2 = j?.macro?.ust2y;
      const ust10 = j?.macro?.ust10y;
      const spread = j?.macro?.spread;

      document.getElementById("macro-cpi").innerHTML = colorize(cpi) + trendArrow(cpi);
      document.getElementById("macro-m2").innerHTML = colorize(m2) + trendArrow(m2);
      document.getElementById("macro-ust2y").innerHTML = ust2 ?? "–";
      document.getElementById("macro-ust10y").innerHTML = ust10 ?? "–";
      document.getElementById("macro-spread").innerHTML = colorize(spread) + trendArrow(spread);

      let macroEval = assessCategory([m2, -Math.abs(spread)]); // invertierte Kurve = Risiko
      document.getElementById("macro-note").innerHTML = "Makro-Signal: " + macroEval;

      if (spread < 0) riskScore -= 1;
      if (m2 < 0) riskScore -= 1;
      if (cpi < 3) riskScore += 1;

      /* ================================
         ROHSTOFFE
      ================================== */

      const commodities = [
        ["uso", "WTI"],
        ["bno", "Brent"],
        ["dbc", "Rohstoffe"],
        ["gld", "Gold"],
        ["cper", "Kupfer"]
      ];

      for (const [key] of commodities) {
        ["d1", "d30", "d90"].forEach(period => {
          const el = document.getElementById(`mc-${key}-${period}`);
          const val = j?.commodities?.[key]?.[period];
          if (el) el.innerHTML = colorize(val) + trendArrow(val);
        });

        const nowEl = document.getElementById(`mc-${key}-now`);
        if (nowEl) nowEl.innerHTML = j?.commodities?.[key]?.now ?? "–";
      }

      // Rohstoffe bewerten
      const commVals = [
        j?.commodities?.uso?.d30,
        j?.commodities?.dbc?.d30,
        j?.commodities?.gld?.d30,
        j?.commodities?.cper?.d30
      ];

      const commEval = assessCategory(commVals);

      const commBox = document.createElement("div");
      commBox.innerHTML = "Rohstoff-Signal: " + commEval;
      document.querySelectorAll(".section")[1].appendChild(commBox);

      if (commVals.filter(v => v > 0).length >= 2) riskScore += 1;
      if (commVals.filter(v => v < 0).length >= 2) riskScore -= 1;

      /* ================================
         SHIPPING
      ================================== */

      const ship = ["bdry", "sea", "flng", "gogl", "zim"];

      ship.forEach(key => {
        ["d1", "d30", "d90"].forEach(period => {
          const el = document.getElementById(`mc-${key}-${period}`);
          const val = j?.shipping?.[key]?.[period];
          if (el) el.innerHTML = colorize(val) + trendArrow(val);
        });

        const nowEl = document.getElementById(`mc-${key}-now`);
        if (nowEl) nowEl.innerHTML = j?.shipping?.[key]?.now ?? "–";
      });

      const ship30 = ship.map(s => j?.shipping?.[s]?.d30);
      const shipEval = assessCategory(ship30);

      const shipBox = document.createElement("div");
      shipBox.innerHTML = "Shipping-Signal: " + shipEval;
      document.querySelectorAll(".section")[2].appendChild(shipBox);

      if (ship30.filter(v => v > 0).length >= 3) riskScore += 1;
      if (ship30.filter(v => v < 0).length >= 3) riskScore -= 1;

      /* ================================
         SPDR SECTORS
      ================================== */

      const sectors = j?.sectors || {};
      for (const key in sectors) {
        const s = sectors[key];
        if (!s) continue;

        const viewEl = document.getElementById(`mc-${key}-view`);
        if (!viewEl) continue;

        const score =
          (s.d1 > 0 ? 1 : s.d1 < 0 ? -1 : 0) +
          (s.d30 > 0 ? 1 : s.d30 < 0 ? -1 : 0) +
          (s.d90 > 0 ? 1 : s.d90 < 0 ? -1 : 0);

        if (score >= 2) viewEl.innerHTML = `<span class="mc-badge mc-bull">Bullish</span>`;
        else if (score <= -2) viewEl.innerHTML = `<span class="mc-badge mc-bear">Bearish</span>`;
        else viewEl.innerHTML = `<span class="mc-badge mc-mixed">Mixed</span>`;
      }

      /* ================================
         GLOBAL FAZIT
      ================================== */

      const summary = document.createElement("div");
      summary.id = "mc-summary-box";
      summary.innerHTML = finalSummary(riskScore);

      document.getElementById("cycles").appendChild(summary);

    } catch (e) {
      console.error("Cycles Fehler:", e);
    }
  };

})();
