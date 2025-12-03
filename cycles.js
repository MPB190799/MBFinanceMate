// cycles.js – Market Cycles + Inventories & Freight

(function () {
  // kleine Helper
  const setTxt = (id, v) => {
    const el = document.getElementById(id);
    if (el) el.textContent = String(v);
  };

  // ================= MARKET CYCLES =================

  window.loadMarketCycles = async function () {
    const note = document.getElementById("mc-rotation-note");
    if (note) note.textContent = "Lade Market Cycles…";

    try {
      const r = await fetch("/api/cycles");
      const j = await r.json();

      // Rohstoffe / Proxys
      const map = {
        USO: "uso",
        BNO: "bno",
        DBC: "dbc",
        GLD: "gld",
        CPER: "cper",
        BDRY: "bdry",
        SEA: "sea",
        FLNG: "flng",
        GOGL: "gogl",
        ZIM: "zim",
      };

      for (const [group, tickers] of Object.entries(j || {})) {
        if (!tickers || typeof tickers !== "object") continue;
        for (const [t, obj] of Object.entries(tickers)) {
          const key = map[t];
          if (!key || !obj) continue;
          setTxt(`mc-${key}-now`, obj.price ?? "–");
          setTxt(`mc-${key}-d1`, obj["1T"] ?? "–");
          setTxt(`mc-${key}-d30`, obj["1M"] ?? "–");
          setTxt(`mc-${key}-d90`, obj["3M"] ?? "–");
        }
      }

      // SPDR-Sektoren (liegen meist unter j.sectors)
      if (j.sectors) {
        for (const [t, obj] of Object.entries(j.sectors)) {
          setTxt(`mc-${t}-now`, obj.price ?? "–");
          setTxt(`mc-${t}-d1`, obj["1T"] ?? "–");
          setTxt(`mc-${t}-d30`, obj["1M"] ?? "–");
          setTxt(`mc-${t}-d90`, obj["3M"] ?? "–");
          setTxt(`mc-${t}-view`, obj.trend ?? "–");
        }
      }

      // Makro-Daten direkt aus summary ziehen (gleiches Endpoint wie Analyse)
      try {
        const mRes = await fetch("/api/macro/summary");
        const m = await mRes.json();
        setTxt("macro-cpi", `${m?.cpi?.yoy ?? "–"}%`);
        setTxt("macro-m2", `${m?.m2?.yoy ?? "–"}%`);
        setTxt("macro-ust2y", `${m?.treasury?.ust2y ?? "–"}%`);
        setTxt("macro-ust10y", `${m?.treasury?.ust10y ?? "–"}%`);
        setTxt("macro-spread", `${m?.treasury?.spread ?? "–"}%`);
        const noteEl = document.getElementById("macro-note");
        if (noteEl) noteEl.textContent = m?.macroComment || "Makrodaten geladen.";
      } catch {
        /* Makro optional – kein harter Fehler */
      }

      if (note) note.textContent = "Market Cycles aktualisiert.";
    } catch (e) {
      if (note) note.textContent = "Fehler beim Laden der Market Cycles.";
    }
  };

  // ===============  INVENTORIES & FREIGHT  =============

  window.loadInventoriesFreight = async function () {
    const box = document.getElementById("inventories-freight-box");
    if (!box) return;

    box.textContent = "Lade Bestände & Frachtraten…";

    const INVENTORY_LABELS = {
      wti: "WTI",
      brent: "Brent",
      crudeProd: "Crude Oil Produktion",
      crudeStocks: "Crude Oil Lager",
      gasolineStocks: "Gasoline Lager",
      distillateStocks: "Destillate Lager",
      natGasStorage: "Erdgas Lager",
      henryHub: "Henry Hub Gaspreis",
    };

    try {
      const r = await fetch("/api/market-dashboard?tickers=BDRY,SEA,FLNG,ZIM");
      const j = await r.json();

      let html = `
        <table class="portfolio-table">
          <thead>
            <tr>
              <th>Typ</th>
              <th>Aktuell</th>
              <th>Δ Vorwoche</th>
              <th>Ø 5J</th>
              <th>Abw. ggü. 5J</th>
            </tr>
          </thead>
          <tbody>
      `;

      for (const [k, v] of Object.entries(j.inventories || {})) {
        const val = v?.value != null ? `${v.value} ${v.unit || ""}` : "—";
        const chg = v?.change != null ? `${v.change > 0 ? "+" : ""}${v.change} ${v.unit || ""}` : "—";
        const avg = v?.avg5y != null ? `${v.avg5y} ${v.unit || ""}` : "—";
        const vs5y =
          v?.vs5y_pct != null
            ? `<span class="${v.vs5y_pct > 0 ? "neg" : "pos"}">${v.vs5y_pct}%</span>`
            : "—";

        html += `
          <tr>
            <td>${INVENTORY_LABELS[k] || k}</td>
            <td><strong>${val}</strong></td>
            <td>${chg}</td>
            <td>${avg}</td>
            <td>${vs5y}</td>
          </tr>
        `;
      }

      for (const [t, data] of Object.entries(j.tickers || {})) {
        if (!data?.price) continue;
        html += `
          <tr>
            <td>🚢 ${t}</td>
            <td colspan="4"><strong>${data.price}</strong> USD</td>
          </tr>
        `;
      }

      html += "</tbody></table>";
      box.innerHTML = html;
    } catch (e) {
      box.textContent = "❌ Fehler bei Lager & Fracht: " + (e.message || e);
    }
  };
})();
