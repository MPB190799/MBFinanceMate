// analyse.js – Makro-Dashboard mit Trendpfeilen & Interpretation

(function () {

  function setVal(id, value, noteId, noteText, cssClass = "", trend = "") {
    const el = document.getElementById(id);
    const note = document.getElementById(noteId);

    if (el) el.innerHTML = `${value} ${trend}`;
    if (note) note.textContent = noteText;

    if (el) {
      el.classList.remove("macro-pos", "macro-neg", "macro-neutral");
      if (cssClass) el.classList.add(cssClass);
    }
  }

  async function loadVIXYahoo() {
    try {
      const r = await fetch("https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX");
      const j = await r.json();
      const result = j?.chart?.result?.[0];
      const price = result?.indicators?.quote?.[0]?.close?.slice(-1)[0];

      if (!price || isNaN(price)) return "–";
      return price.toFixed(2);
    } catch {
      return "–";
    }
  }

  function trendArrow(current, thresholdUp = null, thresholdDown = null) {
    if (current === "–" || current === null) return `<span class="macro-trend macro-flat">→</span>`;

    const val = Number(current);

    if (thresholdUp !== null && val > thresholdUp) {
      return `<span class="macro-trend macro-up">↑</span>`;
    }
    if (thresholdDown !== null && val < thresholdDown) {
      return `<span class="macro-trend macro-down">↓</span>`;
    }
    return `<span class="macro-trend macro-flat">→</span>`;
  }

  function generateInterpretation(cpi, m2, spread, vix) {
    let lines = [];

    // Inflation
    if (cpi > 3) lines.push("• Inflation bleibt erhöht – restriktive FED-Politik wahrscheinlich.");
    else if (cpi < 2.5) lines.push("• Inflation fällt – potenzieller Rückenwind für Risikoassets.");

    // M2
    if (m2 < 0) lines.push("• Geldmenge schrumpft – Liquidität bleibt angespannt.");
    else lines.push("• Geldmenge expandiert – Liquidität verbessert sich leicht.");

    // Yield Curve
    if (spread < 0) lines.push("• Zinskurve invers – Rezessionsrisiko bleibt erhöht.");
    else lines.push("• Zinskurve normalisiert sich – Wirtschaftliche Erholung möglich.");

    // VIX
    if (vix > 20) lines.push("• VIX hoch – Markt zeigt Risikoaversion.");
    else if (vix < 15) lines.push("• VIX niedrig – Markt in ruhiger Phase.");

    return lines.join("\n");
  }

  window.loadAnalyse = async function () {
    const cont = document.getElementById("analyse-container");
    if (!cont) return;

    cont.innerHTML = "<p>Lade Analyse…</p>";

    try {
      const r = await fetch("/api/macro/summary");
      const j = await r.json();

      const cpi = Number(j?.cpi?.yoy ?? "–");
      const m2 = Number(j?.m2?.yoy ?? "–");
      const spread = Number(j?.treasury?.spread ?? "–");
      const vix = await loadVIXYahoo();

      // Trendpfeile
      const cpiTrend = trendArrow(cpi, 3.0, 2.5);
      const m2Trend = trendArrow(m2, 0, 0);
      const spreadTrend = trendArrow(spread, 0, 0);
      const vixTrend = trendArrow(vix, 20, 15);

      // Farben bestimmen
      const cpiClass = cpi > 3 ? "macro-neg" : "macro-pos";
      const m2Class = m2 < 0 ? "macro-neg" : "macro-pos";
      const spreadClass = spread < 0 ? "macro-neg" : "macro-pos";
      const vixClass = vix > 20 ? "macro-neg" : "macro-neutral";

      // Karten befüllen
      setVal("macro-cpi-val", `${cpi}%`, "macro-cpi-note", "Inflation YoY", cpiClass, cpiTrend);
      setVal("macro-m2-val", `${m2}%`, "macro-m2-note", "Geldmengen-Wachstum", m2Class, m2Trend);
      setVal("macro-yc-val", `${spread}%`, "macro-yc-note", "Zinskurve (2Y–10Y)", spreadClass, spreadTrend);
      setVal("macro-vix-val", vix, "macro-vix-note", "Volatilitätsindex", vixClass, vixTrend);

      // Interpretation
      const interp = generateInterpretation(cpi, m2, spread, Number(vix));

      cont.innerHTML = `
        <h4>🧭 Einschätzung</h4>
        <div id="macro-interpretation">${interp.replace(/\n/g, "<br>")}</div>
      `;

    } catch (e) {
      cont.innerHTML = `<p>Analyse Fehler: ${e.message || e}</p>`;
    }
  };

})();
