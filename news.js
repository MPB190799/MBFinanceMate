// news.js – Premium News-Modul mit Highlights & Bulletpoints

(function () {

  // === Zahlen & Fakten extrahieren ===
  function extractKeyFacts(text) {
    if (!text) return [];

    const points = [];

    // Zahlen, Prozentwerte, Dollarbeträge
    const numberRegex = /([+-]?\d+(\.\d+)?%|\$\d+(\.\d+)?|\d+(\.\d+)?\s?(B|M|billion|million))/gi;
    const nums = text.match(numberRegex);
    if (nums) {
      points.push("Wichtige Zahlen: " + nums.join(", "));
    }

    // Dividenden / Yield
    if (/dividend|distribution|payout|yield/i.test(text)) {
      points.push("Dividenden relevant");
    }

    // Earnings
    if (/eps|revenue|earnings|forecast|beat|miss|quarter/i.test(text)) {
      points.push("Earnings / Ausblick");
    }

    // Risiken
    if (/risk|lawsuit|regulation|investigation|sec|warns/i.test(text)) {
      points.push("⚠ Risiken / Warnungen");
    }

    return points.slice(0, 3);
  }

  // === Zahlen farblich hervorheben ===
  function highlightNumbers(text) {
    if (!text) return text;

    return text
      .replace(/(\+\d+(\.\d+)?%)/g, '<span class="pos">$1</span>')
      .replace(/(-\d+(\.\d+)?%)/g, '<span class="neg">$1</span>')
      .replace(/(\$\d+(\.\d+)?)/g, '<span class="num">$1</span>');
  }

  // === News-Card Renderer ===
  function renderNewsCard(n) {
    const card = document.createElement("div");
    card.className = "news-card";

    const fullText = `${n.title || ""} ${n.description || n.summary || ""}`;

    // Badges
    const badges = [];
    if (/(dividend|distribution|sonderdividende)/i.test(fullText)) badges.push("div");
    if (/(earnings|eps|revenue|results|quarter|q[1-4])/i.test(fullText)) badges.push("earn");
    if (/(merger|acquisition|spin[- ]?off|buyout)/i.test(fullText)) badges.push("ma");

    // Extract & highlight
    const facts = extractKeyFacts(fullText);
    const highlightedDesc = highlightNumbers(n.description || n.summary || "");

    const bulletHTML = facts.length
      ? `
      <ul class="news-bullets">
        ${facts.map(f => `<li>${f}</li>`).join("")}
      </ul>`
      : "";

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

      ${bulletHTML}

      <div class="news-body">
        <p>${highlightedDesc}</p>
        ${n.article_url ? `<a class="link-icon" href="${n.article_url}" target="_blank" rel="noopener">🔗 Quelle</a>` : ""}
      </div>

      <div class="news-actions">
        <button class="expand-btn" type="button">Mehr anzeigen</button>
      </div>
    `;

    const body = card.querySelector(".news-body");
    const btn = card.querySelector(".expand-btn");

    // Default collapsed
    body.classList.remove("open");
    body.style.display = "none";

    btn.addEventListener("click", () => {
      const open = body.classList.toggle("open");
      body.style.display = open ? "block" : "none";
      btn.textContent = open ? "Weniger anzeigen" : "Mehr anzeigen";
    });

    return card;
  }

  // === Load News ===
  window.loadNews = async function () {
    const cont = document.getElementById("news-container");
    if (!cont) return;

    cont.innerHTML = "<p>Lade News…</p>";

    try {
      const res = await fetch("/api/news/portfolio");
      const j = await res.json();
      const items = j?.items || j || [];

      if (!items.length) {
        cont.innerHTML = "<p>Keine News gefunden.</p>";
        return;
      }

      cont.innerHTML = "";
      items.slice(0, 60).forEach(n => cont.appendChild(renderNewsCard(n)));

    } catch (e) {
      cont.innerHTML = `<div class="info-box">News Fehler: ${e.message || e}</div>`;
    }
  };

})();
