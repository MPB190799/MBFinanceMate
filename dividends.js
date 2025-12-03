// dividends.js – lädt Dividendencalendar

(function () {
  window.loadDividends = async function () {
    const host = document.getElementById("dividendOverview");
    if (!host) return;

    host.innerHTML = "<p>Lade Dividenden…</p>";

    try {
      const r = await fetch("/api/dividend-calendar");
      const j = await r.json();
      const items = j?.items || [];

      if (!items.length) {
        host.innerHTML = "<p>Keine kommenden Dividenden gefunden.</p>";
        return;
      }

      let html = `
        <table class="portfolio-table">
          <thead>
            <tr>
              <th>Ticker</th>
              <th>Ex-Date</th>
              <th>Pay-Date</th>
              <th>Betrag</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const d of items) {
        html += `
          <tr>
            <td>${d.ticker}</td>
            <td>${d.exDate}</td>
            <td>${d.payDate || ""}</td>
            <td>${d.amount || ""}</td>
          </tr>
        `;
      }

      html += "</tbody></table>";
      host.innerHTML = html;
    } catch (e) {
      host.innerHTML = `<p>Fehler: ${e.message || e}</p>`;
    }
  };
})();
