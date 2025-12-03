// tabs.js – kümmert sich um Tab-Wechsel + Page-Loads

async function loadPage(page) {
  const content = document.getElementById("content");
  if (!content) return;

  try {
    const res = await fetch(`/pages/${page}.html`, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    content.innerHTML = html;

    // Tabcontent sichtbar machen (CSS nutzt .tabcontent.active)
    const sec = content.querySelector(".tabcontent");
    if (sec) sec.classList.add("active");

    // Nachladen der JS-Funktionen pro Tab
    switch (page) {
      case "portfolio":
        window.initPortfolio && window.initPortfolio();
        break;
      case "news":
        window.loadNews && window.loadNews();
        break;
      case "cycles":
        window.loadMarketCycles && window.loadMarketCycles();
        window.loadInventoriesFreight && window.loadInventoriesFreight();
        break;
      case "dividends":
        window.loadDividends && window.loadDividends();
        break;
      case "sector":
        window.loadSectorAnalysis && window.loadSectorAnalysis();
        break;
      case "analyse":
        window.loadAnalyse && window.loadAnalyse();
        break;
      case "charts":
        // später kannst du hier eigene Chart-Init-Funktionen reinhängen
        break;
    }
  } catch (e) {
    content.innerHTML = `<div class="info-box">Fehler beim Laden der Seite <strong>${page}</strong>: ${e.message || e}</div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  const buttons = document.querySelectorAll(".tabbtn");
  const defaultPage = "portfolio";

  buttons.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const tabId = btn.dataset.tab;
      if (!tabId) return;

      // Active-Status für Buttons
      buttons.forEach((b) => b.classList.toggle("active", b === btn));

      // Seite laden
      loadPage(tabId);
    });
  });

  // Initial: Portfolio laden
  loadPage(defaultPage);
});
