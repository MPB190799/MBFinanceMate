// tabs.js – Tab switching + page loader
// Function map:
//   portfolio  → window.loadAndRender        (portfolio.js)
//   news       → window.loadNews             (news.js)
//   cycles     → window.loadMarketCycles     (cycles.js) + loadInventoriesFreight
//   dividends  → window.loadDividends        (dividends.js)
//   sector     → window.loadSectorRotation   (sector.js)
//   analyse    → window.loadAnalyse          (analyse.js)
//   charts     → window.initCharts           (charts.js)
//   calendar   → window.loadCalendar         (calendar.js)

async function loadPage(page) {
  const content = document.getElementById("content");
  if (!content) return;

  try {
    const res = await fetch(`/pages/${page}.html`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    content.innerHTML = html;

    // Tabcontent sichtbar machen
    const sec = content.querySelector(".tabcontent");
    if (sec) sec.classList.add("active");

    // Richtige Funktion pro Tab aufrufen
    switch (page) {
      case "portfolio":
        window.loadAndRender && window.loadAndRender();
        break;
      case "news":
        window.loadNews && window.loadNews();
        break;
      case "cycles":
        window.loadMarketCycles      && window.loadMarketCycles();
        window.loadInventoriesFreight && window.loadInventoriesFreight();
        break;
      case "dividends":
        window.loadDividends && window.loadDividends();
        break;
      case "sector":
        window.loadSectorRotation && window.loadSectorRotation();
        break;
      case "analyse":
        window.loadAnalyse && window.loadAnalyse();
        break;
      case "charts":
        window.initCharts && window.initCharts();
        break;
      case "calendar":
        window.loadCalendar && window.loadCalendar();
        break;
    }
  } catch (e) {
    content.innerHTML = `<div class="info-box">Fehler beim Laden der Seite <strong>${page}</strong>: ${e.message || e}</div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".tabbtn");

  buttons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const tabId = btn.dataset.tab;
      if (!tabId) return;
      buttons.forEach((b) => b.classList.toggle("active", b === btn));
      loadPage(tabId);
    });
  });

  // Initial: Portfolio laden
  loadPage("portfolio");
});