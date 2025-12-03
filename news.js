// news.js – lädt Portfolio-News von deinem Backend

(function () {
  function renderNewsCard(n) {
    const card = document.createElement("div");
    card.className = "news-card";

    const text = `${n.title || ""} ${n.description || n.summary || ""}`;

    const badges = [];
    if (/(dividend|distribution|sonderdividende)/i.test(text)) badges.push("div");
    if (/(earnings|eps|revenue|results|quarter|q[1-4])/i.test(text)) badges.push("earn");
    if (/(merger|acquisition|spin[- ]?off|buyout)/i.test(text)) badges.push("ma");

    card.innerHTML = `
      <div class="news-header">
        <h4 class="news-title">${n.title || "—"}</h4>
        <div class="news-meta">
          <span>${n.published_utc ? new Date(n.published_utc).toLocaleString() : ""}</span>
        </div>
      </div>
      <div class="news-badges">
        ${badges.map(b => `<span class="badge ${b}">${b.toUpperCase()}</span>`).join("")}
      </div>
      <div class="news-body">
        <p>${n.description || n.summary || ""}</p>
        ${n.article_url ? `<a class="link-icon" href="${n.article_url}" target="_blank" rel="noopener">🔗 Quelle</a>` : ""}
      </div>
      <div class="news-actions">
        <button class="expand-btn" type="button">Mehr anzeigen</button>
      </div>
    `;

    const body = card.querySelector(".news-body");
    const btn = card.querySelector(".expand-btn");

    body.classList.remove("open");
    body.style.display = "none";

    btn.addEventListener("click", () => {
      const open = body.classList.toggle("open");
      body.style.display = open ? "block" : "none";
      btn.textContent = open ? "Weniger anzeigen" : "Mehr anzeigen";
    });

    return card;
  }

  window.loadNews = async function () {
    const cont = document.getElementById("news-container");
    if (!cont) return;

    cont.innerHTML = "<p>Lade News…</p>";

    try {
      // Standard: dein Backend liefert News aus Portfolio-Tickern
      const res = await fetch("/api/news/portfolio");
      const j = await res.json();
      const items = j?.items || j || [];

      if (!items.length) {
        cont.innerHTML = "<p>Keine News gefunden.</p>";
        return;
      }

      cont.innerHTML = "";
      items.slice(0, 50).forEach((n) => cont.appendChild(renderNewsCard(n)));
    } catch (e) {
      cont.innerHTML = `<div class="info-box">News Fehler: ${e.message || e}</div>`;
    }
  };
})();
