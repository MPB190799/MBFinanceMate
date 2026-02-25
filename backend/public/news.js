// news.js – MBFinanceMate PREMIUM News Engine 5.0
// OPTIMIERT für 280 Positionen + Dividenden-Fokus
// Features: Portfolio-Filter, Priority-Scoring, Special-Div-Alerts, Action-Required

(function () {

  /* =============================================================
     CONFIGURATION
  ============================================================= */

  const CONFIG = {
    // Zeitfilter
    maxDays: 30,
    
    // Sonderdividenden-Keywords
    specialDivKeywords: [
      'special dividend',
      'sonderdividende',
      'extra dividend',
      'bonus dividend',
      'return of capital',
      'special distribution'
    ],
    
    // Kritische Events (brauchen Action)
    criticalKeywords: [
      'dividend cut',
      'suspend dividend',
      'dividend suspension',
      'bankruptcy',
      'chapter 11',
      'delisting',
      'fraud',
      'investigation'
    ],
    
    // Max News pro Kategorie
    maxNewsPerCategory: 20
  };

  const CUTOFF_TS = Date.now() - CONFIG.maxDays * 24 * 60 * 60 * 1000;

  /* =============================================================
     WHITELIST & BLACKLIST (wie vorher, verbessert)
  ============================================================= */

  const HARD_WHITELIST = [
    // Earnings
    /earnings|results|quarter|q[1-4]|eps|revenue|guidance|beat|miss/i,
    
    // Dividenden (erweitert)
    /dividend|distribution|payout|declares|raises|cuts|suspend|special dividend|ex-date|record date/i,
    
    // SEC / Insider / Kapital
    /form 4|sec filing|10-k|10-q|8-k|insider|buyback|share repurchase/i,
    
    // M&A / Struktur
    /acquisition|merger|buyout|m&a|spin-off|asset sale|takeover/i,
    
    // Cashflow / Bilanz
    /free cash flow|cashflow|capex|investment|debt|deleveraging|balance sheet/i,
    
    // Öl & Gas Makro
    /opec|inventory|eia|api|barrel|production|rig count|supply|demand/i,
    
    // Shipping / Frachtraten
    /shipping|freight|bdi|rates|charter|orderbook|scrapping|utilization/i,
    
    // Edelmetalle & Mining (NEU!)
    /gold|silver|platinum|palladium|precious metals|comex|mining|miners|gdx|sil|metal price/i,
    
    // Arbeitsmarkt (NEU!)
    /unemployment|jobless claims|non-farm payroll|nfp|employment|labor market|jobs report/i,
    
    // Zinspolitik / Zentralbanken (NEU!)
    /fed|federal reserve|interest rate|rate decision|rate cut|rate hike|monetary policy|ecb|boe|central bank|fomc|powell|lagarde/i,
    
    // Sektoren allgemein (NEU!)
    /sector rotation|sector performance|cyclical|defensive|value|growth|financials sector|energy sector|materials sector/i,
    
    // Risiko-Events
    /bankruptcy|chapter 11|delisting|investigation|fraud|lawsuit/i
  ];

  const HARD_BLACKLIST = [
    // Analysten & Promo
    /analyst|price target|rating|upgrade|downgrade/i,
    /marketing|promotion|sponsored|advertorial/i,
    /market research|industry analysis/i,
    
    // Clickbait Headlines
    /should you (buy|sell|own)/i,
    /\btop\b.*\bstocks?\b/i,
    /\bbest\b.*\bstocks?\b/i,
    /\bmy\b.*\b(favorite|favourites)\b/i,
    /could .* hit /i,
    /is .* a buy/i,
    /stocks? to (buy|sell)/i,
    /\bwhy i\b|\bhow i\b|\bmy portfolio\b/i,
    
    // SEO-Listen
    /\btop \d+\b/i,
    /\b\d+\s*(stocks?|dividend stocks?)\b/i,
    /\$ ?1,?000/i,
    /\bforecast\b.*\b203\d\b/i
  ];

  /* =============================================================
     NEUE FUNKTION: Portfolio-Ticker extrahieren
  ============================================================= */

  let PORTFOLIO_TICKERS = [];

  async function loadPortfolioTickers() {
    try {
      const res = await fetch('/api/portfolio');
      const data = await res.json();
      const portfolio = Array.isArray(data?.portfolio) ? data.portfolio : [];
      
      PORTFOLIO_TICKERS = portfolio
        .map(p => p.ticker)
        .filter(Boolean)
        .map(t => t.toUpperCase());
      
      console.log(`📊 Portfolio geladen: ${PORTFOLIO_TICKERS.length} Ticker`);
    } catch (e) {
      console.error("❌ Portfolio-Ticker laden fehlgeschlagen:", e);
      PORTFOLIO_TICKERS = [];
    }
  }

  /* =============================================================
     NEUE FUNKTION: Ist News für mein Portfolio relevant?
  ============================================================= */

  function isPortfolioRelevant(n) {
    if (!PORTFOLIO_TICKERS.length) return true; // Fallback: zeige alles
    
    const text = `${n.title || ""} ${n.description || ""}`.toUpperCase();
    
    // Prüfe ob einer meiner Ticker in der News vorkommt
    return PORTFOLIO_TICKERS.some(ticker => {
      // Exakte Matches (z.B. "TORM" aber nicht "STORM")
      const regex = new RegExp(`\\b${ticker}\\b`, 'i');
      return regex.test(text);
    });
  }

  /* =============================================================
     NEUE FUNKTION: Priority Scoring
  ============================================================= */

  function calculatePriority(n) {
    const text = `${n.title || ""} ${n.description || ""}`.toLowerCase();
    let score = 0;
    let category = 'info';
    let actionRequired = false;

    // KRITISCH: Dividenden-Cuts, Suspensions, Bankruptcy
    if (CONFIG.criticalKeywords.some(kw => text.includes(kw))) {
      score = 100;
      category = 'critical';
      actionRequired = true;
    }
    // WICHTIG: Dividenden-Raises, Special Divs
    else if (/raises dividend|special dividend|bonus dividend/i.test(text)) {
      score = 80;
      category = 'important';
    }
    // WICHTIG: Earnings Beats/Misses
    else if (/earnings.*beat|earnings.*miss/i.test(text)) {
      score = 70;
      category = 'important';
    }
    // WICHTIG: M&A
    else if (/acquisition|merger|takeover/i.test(text)) {
      score = 75;
      category = 'important';
    }
    // NORMAL: Regular Dividenden
    else if (/dividend|distribution/i.test(text)) {
      score = 50;
      category = 'normal';
    }
    // NORMAL: Earnings ohne Beat/Miss
    else if (/earnings|results|quarter/i.test(text)) {
      score = 40;
      category = 'normal';
    }
    // INFO: Rest
    else {
      score = 20;
      category = 'info';
    }

    return { score, category, actionRequired };
  }

  /* =============================================================
     NEUE FUNKTION: News kategorisieren
  ============================================================= */

  function categorizeNews(n) {
    const text = `${n.title || ""} ${n.description || ""}`.toLowerCase();

    // Sonderdividenden
    if (CONFIG.specialDivKeywords.some(kw => text.includes(kw))) {
      return 'special-dividend';
    }
    
    // Dividenden (allgemein)
    if (/dividend|distribution|payout/i.test(text)) {
      return 'dividend';
    }
    
    // Earnings
    if (/earnings|results|quarter|eps|revenue/i.test(text)) {
      return 'earnings';
    }
    
    // M&A
    if (/acquisition|merger|buyout|takeover/i.test(text)) {
      return 'ma';
    }
    
    // Risiko
    if (/bankruptcy|lawsuit|investigation|delisting/i.test(text)) {
      return 'risk';
    }
    
    // Makro - Edelmetalle (NEU!)
    if (/gold|silver|platinum|palladium|precious metals|comex|mining/i.test(text)) {
      return 'macro-metals';
    }
    
    // Makro - Arbeitsmarkt (NEU!)
    if (/unemployment|jobless claims|non-farm payroll|nfp|employment|labor market/i.test(text)) {
      return 'macro-employment';
    }
    
    // Makro - Zinspolitik (NEU!)
    if (/fed|interest rate|rate decision|monetary policy|ecb|central bank|fomc/i.test(text)) {
      return 'macro-rates';
    }
    
    // Makro - Öl & Shipping
    if (/opec|eia|freight|bdi|shipping rates/i.test(text)) {
      return 'macro';
    }
    
    return 'other';
  }

  /* =============================================================
     FILTER-FUNKTION (verbessert)
  ============================================================= */

  function isRecent(n) {
    if (!n.published_utc) return false;
    return new Date(n.published_utc).getTime() >= CUTOFF_TS;
  }

  function isRelevantNews(n) {
    const title = (n.title || "").trim();
    const desc  = (n.description || n.summary || "").trim();
    const text  = `${title} ${desc}`.toLowerCase();

    // ❌ Hard Blacklist
    if (HARD_BLACKLIST.some(r => r.test(text))) return false;

    // ✅ Muss Whitelist treffen
    if (!HARD_WHITELIST.some(r => r.test(text))) return false;

    // ❌ Zu kurze Clickbait-Teaser
    if ((title + desc).length < 80) return false;

    // ❌ „Dividend" ohne echte Aktion
    if (
      /\bdividend\b/i.test(text) &&
      !/declare|raises|cuts|suspend|special|distribution|payout|ex-date/i.test(text)
    ) return false;

    return true;
  }

  /* =============================================================
     RENDERING FUNCTIONS (verbessert)
  ============================================================= */

  function generateSummary(text) {
    const t = text.toLowerCase();

    // Kritisch
    if (/cuts dividend|suspend dividend/.test(t))
      return "🚨 KRITISCH: Dividende gekürzt/suspendiert – Position prüfen!";

    if (/bankruptcy|chapter 11/.test(t))
      return "🚨 KRITISCH: Insolvenz-Risiko – sofort handeln!";

    // Positiv
    if (/special dividend|bonus dividend/.test(t))
      return "🎰 SONDERDIVIDENDE angekündigt – ggf. halten bis Pay-Date!";

    if (/raises dividend/.test(t))
      return "💰 Dividende erhöht – positives Signal für Cashflow.";

    if (/beat|record earnings|strong quarter/.test(t))
      return "📈 Starkes Quartal – operative Stärke bestätigt.";

    // Neutral/Negativ
    if (/miss|weak quarter|lower guidance/.test(t))
      return "📉 Schwächeres Quartal – Erwartungen verfehlt.";

    if (/acquisition|merger/.test(t))
      return "🤝 M&A-Aktivität – Auswirkungen auf Position prüfen.";

    if (/capex|investment/.test(t))
      return "🏗 Investitionen – kurzfristig Cashflow-Druck.";

    // Makro - Öl & Shipping
    if (/opec|inventory|rig count/.test(t))
      return "🛢 Makro-Signal (Öl/Gas) – relevant für Energy-Positionen.";

    if (/freight|bdi|charter rates/.test(t))
      return "🚢 Shipping-Zyklus-Signal – relevant für Maritime-Positionen.";

    // Makro - Edelmetalle (NEU!)
    if (/gold.*price|silver.*price|gold.*rally|silver.*rally/.test(t))
      return "⚜️ Edelmetall-Bewegung – relevant für Mining/Gold-Positionen.";

    if (/comex|gold.*inventory|silver.*holdings/.test(t))
      return "📦 Edelmetall-Lagerbestände – Angebot/Nachfrage-Signal.";

    // Makro - Arbeitsmarkt (NEU!)
    if (/unemployment.*rise|jobless claims.*increase/.test(t))
      return "📉 Arbeitsmarkt schwächt sich ab – Rezessions-Risiko steigt.";

    if (/unemployment.*fall|strong.*jobs|non-farm payroll.*beat/.test(t))
      return "📈 Starker Arbeitsmarkt – Wirtschaft robust.";

    // Makro - Zinspolitik (NEU!)
    if (/rate.*cut|fed.*cuts|interest rate.*lower/.test(t))
      return "💰 Zinssenkung – positiv für Dividenden-Aktien & REITs!";

    if (/rate.*hike|fed.*raises|interest rate.*increase/.test(t))
      return "📉 Zinserhöhung – Druck auf Bewertungen, besonders REITs.";

    if (/fed.*holds|rate.*unchanged|pause/.test(t))
      return "⏸ Zinsen unverändert – abwartende Haltung der Zentralbank.";

    if (/powell|lagarde|fed.*meeting|ecb.*meeting/.test(t))
      return "🎤 Zentralbank-Kommunikation – Hinweise auf Zinspolitik.";

    return "ℹ Unternehmens-Update";
  }

  function extractKeyFacts(text) {
    const points = [];

    const nums = text.match(/([+-]?\d+(\.\d+)?%|\$?\d+(\.\d+)?\s?(B|M|bn|million|billion))/gi);
    if (nums) points.push("📊 " + nums.slice(0, 3).join(", "));

    if (/dividend|distribution/i.test(text))
      points.push("💰 Dividenden-Impact");

    if (/earnings|eps|revenue/i.test(text))
      points.push("📈 Earnings");

    if (/insider|form 4/i.test(text))
      points.push("🧠 Insider-Activity");

    if (/risk|lawsuit|investigation/i.test(text))
      points.push("⚠ Risiko");

    return points.slice(0, 4);
  }

  function getSentiment(text) {
    if (/beat|raises|record|strong|buyback|special dividend/i.test(text)) 
      return "Bullish 🟩";
    if (/miss|cuts|suspend|lawsuit|lower guidance|bankruptcy/i.test(text)) 
      return "Bearish 🟥";
    return "Neutral 🟨";
  }

  function renderNewsCard(n, priority) {
    const full = `${n.title || ""} ${n.description || n.summary || ""}`;
    const summary = generateSummary(full);
    const facts = extractKeyFacts(full);
    const sentiment = getSentiment(full);

    const card = document.createElement("div");
    card.className = `news-card priority-${priority.category}`;
    
    // Action Required Badge
    const actionBadge = priority.actionRequired 
      ? '<span class="action-badge">⚠️ ACTION REQUIRED</span>' 
      : '';

    card.innerHTML = `
      <div class="news-header">
        <h4>${n.title}</h4>
        ${actionBadge}
      </div>
      <div class="news-meta">
        <small>${new Date(n.published_utc).toLocaleString('de-DE')}</small>
        <span class="sentiment">${sentiment}</span>
      </div>
      <div class="news-summary">${summary}</div>
      ${facts.length ? `<ul class="news-facts">${facts.map(f => `<li>${f}</li>`).join("")}</ul>` : ""}
      <p class="news-description">${n.description || n.summary || ""}</p>
      <a href="${n.article_url}" target="_blank" class="news-link">🔗 Quelle lesen</a>
    `;

    return card;
  }

  /* =============================================================
     NEUE FUNKTION: Gruppierte News rendern
  ============================================================= */

  function renderGroupedNews(categorized) {
    const container = document.getElementById("news-container");
    container.innerHTML = "";

    const categories = [
      { 
        key: 'special-dividend', 
        title: '🎰 Sonderdividenden', 
        icon: '🎰',
        empty: 'Keine Sonderdividenden angekündigt.'
      },
      { 
        key: 'dividend', 
        title: '💰 Dividenden-News', 
        icon: '💰',
        empty: 'Keine Dividenden-Updates.'
      },
      { 
        key: 'earnings', 
        title: '📈 Earnings & Results', 
        icon: '📈',
        empty: 'Keine Earnings-Reports.'
      },
      { 
        key: 'ma', 
        title: '🤝 M&A & Corporate Actions', 
        icon: '🤝',
        empty: 'Keine M&A-Aktivitäten.'
      },
      { 
        key: 'risk', 
        title: '⚠️ Risiko-Events', 
        icon: '⚠️',
        empty: 'Keine Risiko-Meldungen.'
      },
      { 
        key: 'macro-rates', 
        title: '💰 Zinspolitik & Zentralbanken', 
        icon: '💰',
        empty: 'Keine Zinsentscheidungen.'
      },
      { 
        key: 'macro-employment', 
        title: '👔 Arbeitsmarkt-Daten', 
        icon: '👔',
        empty: 'Keine Arbeitsmarkt-Updates.'
      },
      { 
        key: 'macro-metals', 
        title: '⚜️ Edelmetalle & Mining', 
        icon: '⚜️',
        empty: 'Keine Edelmetall-News.'
      },
      { 
        key: 'macro', 
        title: '🌍 Makro-Signale (Öl, Shipping)', 
        icon: '🌍',
        empty: 'Keine relevanten Makro-News.'
      }
    ];

    categories.forEach(cat => {
      const items = categorized[cat.key] || [];
      
      // Überspringe leere Kategorien (außer Special Divs - immer zeigen)
      if (!items.length && cat.key !== 'special-dividend') return;

      const section = document.createElement('div');
      section.className = 'news-section';
      
      const header = document.createElement('h3');
      header.className = 'news-section-title';
      header.innerHTML = `${cat.icon} ${cat.title} <span class="news-count">${items.length}</span>`;
      section.appendChild(header);

      if (!items.length) {
        const emptyMsg = document.createElement('p');
        emptyMsg.className = 'news-empty';
        emptyMsg.textContent = cat.empty;
        section.appendChild(emptyMsg);
      } else {
        items.forEach(item => section.appendChild(item.card));
      }

      container.appendChild(section);
    });
  }

  /* =============================================================
     MAIN LOAD FUNCTION
  ============================================================= */

  window.loadNews = async function () {
    const cont = document.getElementById("news-container");
    if (!cont) return;

    cont.innerHTML = "<div class='loading'>⏳ Lade Portfolio-News...</div>";

    try {
      // 1) Portfolio-Ticker laden
      await loadPortfolioTickers();

      // 2) News von API holen
      const res = await fetch("/api/news/portfolio");
      const j = await res.json();
      const all = j?.items || [];

      // 3) Filtern & Priorisieren
      const filtered = all
        .filter(isRecent)
        .filter(isRelevantNews)
        .filter(isPortfolioRelevant)  // NEU: Nur für meine Ticker!
        .map(n => ({
          news: n,
          priority: calculatePriority(n),
          category: categorizeNews(n)
        }))
        .sort((a, b) => b.priority.score - a.priority.score); // Höchste Prio zuerst

      if (!filtered.length) {
        cont.innerHTML = `
          <div class="info-box">
            <strong>📭 Keine relevanten News</strong><br>
            Für deine ${PORTFOLIO_TICKERS.length} Portfolio-Positionen wurden in den letzten ${CONFIG.maxDays} Tagen keine relevanten News gefunden.
          </div>
        `;
        return;
      }

      // 4) Kategorisieren für gruppierte Darstellung
      const categorized = {};
      
      filtered.forEach(item => {
        if (!categorized[item.category]) categorized[item.category] = [];
        
        if (categorized[item.category].length < CONFIG.maxNewsPerCategory) {
          categorized[item.category].push({
            card: renderNewsCard(item.news, item.priority),
            priority: item.priority
          });
        }
      });

      // 5) Render gruppiert
      renderGroupedNews(categorized);

      // 6) Stats in Header
      const stats = document.getElementById("news-stats");
      if (stats) {
        const critical = filtered.filter(f => f.priority.category === 'critical').length;
        const actionRequired = filtered.filter(f => f.priority.actionRequired).length;
        
        stats.innerHTML = `
          <div class="news-stat">
            <strong>${filtered.length}</strong> Relevante News
          </div>
          ${actionRequired > 0 ? `
            <div class="news-stat critical">
              <strong>${actionRequired}</strong> Benötigen Action
            </div>
          ` : ''}
        `;
      }

    } catch (e) {
      console.error("News Fehler:", e);
      cont.innerHTML = `
        <div class="info-box" style="border-color: #ef4444;">
          <strong>❌ Fehler beim Laden</strong><br>
          ${e.message}
        </div>
      `;
    }
  };

})();