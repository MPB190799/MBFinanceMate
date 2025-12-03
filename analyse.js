// analyse.js – Makro-Zusammenfassung

(function () {
  window.loadAnalyse = async function () {
    const cont = document.getElementById("analyse-container");
    if (!cont) return;

    cont.innerHTML = "<p>Lade Analyse…</p>";

    try {
      const r = await fetch("/api/macro/summary");
      const j = await r.json();

      let txt = "";
      txt += `📉 Treasury 2y/10y Spread: ${j?.treasury?.spread ?? "–"}%\n`;
      txt += `💸 Inflation (CPI YoY): ${j?.cpi?.yoy ?? "–"}%\n`;
      txt += `💵 M2 YoY: ${j?.m2?.yoy ?? "–"}%\n`;
      txt += `📊 VIX: ${j?.vix?.value ?? "–"}\n`;
      txt += `🧭 Bewertung: ${j?.recessionRisk || "–"}`;

      cont.innerHTML = `<pre>${txt}</pre>`;
    } catch (e) {
      cont.innerHTML = `<p>Analyse Fehler: ${e.message || e}</p>`;
    }
  };
})();
