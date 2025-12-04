// analyse.js – Makro-Zusammenfassung + Dashboard Cards

(function () {

  function setVal(id, value, noteId, noteText, cssClass = "") {
    const el = document.getElementById(id);
    const note = document.getElementById(noteId);

    if (el) el.textContent = value;
    if (note) note.textContent = noteText;

    // Reset Farbklassen
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

  window.loadAnalyse = async function () {
    const cont = document.getElementById("analyse-container");
    if (!cont) return;

    cont.innerHTML = "<p>Lade Analyse…</p>";

    try {
      // Backend-Daten
      const r = await fetch("/api/macro/summary");
      const j = await r.json();

      const cpi = j?.cpi?.yoy ?? "–";
      const m2 = j?.m2?.yoy ?? "–";
      const spread = j?.treasury?.spread ?? "–";

      // VIX holen wir clientseitig über Yahoo (server bleibt unberührt)
      const vix = await loadVIXYahoo();

      // Farblogik
      const spreadClass = spread < 0 ? "macro-neg" : "macro-pos";
      const cpiClass = cpi > 3 ? "macro-neg" : "macro-pos"; // Beispiel
      const m2Class = m2 < 0 ? "macro-neg" : "macro-pos";
      const vixClass = vix > 20 ? "macro-neg" : "macro-neutral";

      // Karten befüllen
      setVal("macro-cpi-val",        `${cpi}%`,  "macro-cpi-note",  "Inflation YoY",     cpiClass);
      setVal("macro-m2-val",         `${m2}%`,   "macro-m2-note",   "Geldmengen-Wachstum", m2Class);
      setVal("macro-yc-val",         `${spread}%`, "macro-yc-note", "Zinskurven-Differenz", spreadClass);
      setVal("macro-vix-val",        vix,        "macro-vix-note",  "Volatilitätsindex",  vixClass);

      // Textuelle Zusammenfassung
      let txt = "";
      txt += `📉 Treasury 2y/10y Spread: ${spread}%\n`;
      txt += `💸 Inflation (CPI YoY): ${cpi}%\n`;
      txt += `💵 M2 YoY: ${m2}%\n`;
      txt += `📊 VIX: ${vix}\n`;
      txt += `🧭 Bewertung: ${j?.recessionRisk || "–"}`;

      cont.innerHTML = `<pre>${txt}</pre>`;

    } catch (e) {
      cont.innerHTML = `<p>Analyse Fehler: ${e.message || e}</p>`;
    }
  };

})();
