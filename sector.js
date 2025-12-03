(async () => {
  const wrap = document.getElementById("sector-container");

  async function loadSector() {
    wrap.innerHTML = `<div class="skel" style="height:18px"></div>`;

    try {
      const inv = await fetch('/api/energy/inventories').then(r => r.json());
      const gas = await fetch('/api/gas-storage').then(r => r.json());

      wrap.innerHTML = `
        <div class="sector-grid">
          <div class="sector-box">
            <h3>Crude (gesamt)</h3>
            <p>Wert: ${inv.crude_total.value ?? '—'} kbbl</p>
            <p>vs 5Y: <span class="${inv.crude_total.vs5y_pct >= 0 ? 'neg' : 'pos'}">${inv.crude_total.vs5y_pct ?? '—'}%</span></p>
          </div>

          <div class="sector-box">
            <h3>Gasoline</h3>
            <p>Wert: ${inv.gasoline.value ?? '—'} kbbl</p>
            <p>vs 5Y: <span class="${inv.gasoline.vs5y_pct >= 0 ? 'neg' : 'pos'}">${inv.gasoline.vs5y_pct ?? '—'}%</span></p>
          </div>

          <div class="sector-box">
            <h3>Distillate</h3>
            <p>Wert: ${inv.distillate.value ?? '—'} kbbl</p>
            <p>vs 5Y: <span class="${inv.distillate.vs5y_pct >= 0 ? 'neg' : 'pos'}">${inv.distillate.vs5y_pct ?? '—'}%</span></p>
          </div>

          <div class="sector-box">
            <h3>Natural Gas Storage</h3>
            <p>Wert: ${gas.value ?? '—'} Bcf</p>
            <p>vs 5Y: <span class="${gas.vs5y_pct >= 0 ? 'neg' : 'pos'}">${gas.vs5y_pct ?? '—'}%</span></p>
          </div>
        </div>
      `;
    } catch (e) {
      wrap.innerHTML = `<div class="muted">Fehler beim Laden.</div>`;
      console.warn(e);
    }
  }

  loadSector();
})();
