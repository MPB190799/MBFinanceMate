(async () => {
  const ctx = document.getElementById("chart1");

  async function ensureChartJs() {
    if (window.Chart) return;
    await new Promise(res => {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/chart.js";
      s.onload = res;
      document.body.appendChild(s);
    });
  }

  async function loadChart() {
    await ensureChartJs();

    const res = await fetch('/api/market-cycles?tickers=SPY');
    const data = (await res.json()).data.SPY;
    if (!data) return;

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['1D', '30D', '90D'],
        datasets: [{
          label: 'Performance',
          data: [data.d1, data.d30, data.d90]
        }]
      },
      options: { responsive: true }
    });
  }

  loadChart();
})();
