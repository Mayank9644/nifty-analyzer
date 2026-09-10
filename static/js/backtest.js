let _backtestChart = null;

async function runBacktest() {
    const symbolInput = document.getElementById("backtestSymbolSelect");
    const periodInput = document.getElementById("backtestPeriodSelect");
    const strategyInput = document.getElementById("backtestStrategySelect");
    const capitalInput = document.getElementById("backtestCapitalInput");
    const container = document.getElementById("backtestResultsContainer");

    const symbol = symbolInput ? symbolInput.value : "RELIANCE.NS";
    const period = periodInput ? periodInput.value : "3y";
    const strategy = strategyInput ? strategyInput.value : "sepa";
    const capital = capitalInput ? parseFloat(capitalInput.value) || 100000 : 100000;

    if (!container) return;
    container.innerHTML = `
        <div class="p-12 text-center text-[#86868b] text-xs space-y-2">
            <div class="inline-block animate-spin text-xl">⏳</div>
            <div>Simulating <strong>${strategy.toUpperCase()}</strong> strategy on <strong>${symbol}</strong> over ${period}...</div>
            <div class="text-[11px] text-[#6e6e73]">Deducting STT (0.1%), ₹20 Brokerage, and 0.05% execution slippage...</div>
        </div>
    `;

    try {
        const res = await fetch(`/api/backtest?symbol=${symbol}&period=${period}&strategy=${strategy}&capital=${capital}`);
        const data = await res.json();

        if (data.status === "success") {
            renderBacktestResults(data);
        } else {
            container.innerHTML = `<div class="p-8 text-center text-[#b32020] text-xs">${data.message || 'Backtest failed.'}</div>`;
        }
    } catch (e) {
        console.error("Backtest error:", e);
        container.innerHTML = `<div class="p-8 text-center text-[#b32020] text-xs">Failed to connect to backtest engine.</div>`;
    }
}

function renderBacktestResults(data) {
    const container = document.getElementById("backtestResultsContainer");
    if (!container) return;

    const trades = data.trades || [];
    const isProfitable = data.total_return_pct >= 0;
    const isAlphaPositive = data.alpha_pct >= 0;

    container.innerHTML = `
        <div class="space-y-5">
            <!-- Strategy Header Banner -->
            <div class="p-4 rounded-2xl bg-[#eff6ff] border border-[#bfdbfe] flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                    <div class="font-bold text-[#1c1c1e] text-sm flex items-center gap-2">
                        <span>🧪</span> ${data.strategy_name}
                        <span class="text-[10px] px-2 py-0.5 rounded-full bg-white text-[#007aff] font-semibold border border-[#b9d7fb]">
                            ${data.symbol} (${data.period})
                        </span>
                    </div>
                    <div class="text-[11px] text-[#6e6e73] mt-1">
                        Frictions deducted: <span class="font-semibold text-[#1c1c1e]">${data.frictions_applied.stt_rate} STT</span> + 
                        <span class="font-semibold text-[#1c1c1e]">${data.frictions_applied.brokerage}</span> + 
                        <span class="font-semibold text-[#1c1c1e]">${data.frictions_applied.slippage}</span>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block">Alpha vs Buy &amp; Hold</span>
                    <span class="text-base font-bold mono ${isAlphaPositive ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                        ${isAlphaPositive ? '+' : ''}${data.alpha_pct}%
                    </span>
                </div>
            </div>

            <!-- 5-Grid Institutional Stat Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 text-center">
                <div class="macos-card p-3.5 text-center">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-medium">Net Return</span>
                    <span class="text-xl font-bold mono ${isProfitable ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                        ${isProfitable ? '+' : ''}${data.total_return_pct}%
                    </span>
                    <span class="text-[10px] text-[#86868b] block mt-0.5">${isProfitable ? '+' : ''}₹${formatNumber(data.net_profit_inr, 0)}</span>
                </div>
                <div class="macos-card p-3.5 text-center">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-medium">Win Rate</span>
                    <span class="text-xl font-bold mono text-[#1e7e34]">${data.win_rate}%</span>
                    <span class="text-[10px] text-[#86868b] block mt-0.5">${data.winning_trades}W / ${data.losing_trades}L (${data.total_trades} total)</span>
                </div>
                <div class="macos-card p-3.5 text-center">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-medium">Profit Factor</span>
                    <span class="text-xl font-bold mono text-[#007aff]">${data.profit_factor}</span>
                    <span class="text-[10px] text-[#86868b] block mt-0.5">Gross Win / Loss</span>
                </div>
                <div class="macos-card p-3.5 text-center">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-medium">Max Drawdown</span>
                    <span class="text-xl font-bold mono text-[#b32020]">-${data.max_drawdown_pct}%</span>
                    <span class="text-[10px] text-[#86868b] block mt-0.5">Peak-to-Trough</span>
                </div>
                <div class="macos-card p-3.5 text-center">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-medium">Stock Buy &amp; Hold</span>
                    <span class="text-xl font-bold mono ${data.benchmark_return_pct >= 0 ? 'text-[#48484a]' : 'text-[#b32020]'}">
                        ${data.benchmark_return_pct > 0 ? '+' : ''}${data.benchmark_return_pct}%
                    </span>
                    <span class="text-[10px] text-[#86868b] block mt-0.5">Passive Baseline</span>
                </div>
            </div>

            <!-- Equity Curve vs Benchmark Chart -->
            <div class="macos-card p-5 space-y-3">
                <div class="flex justify-between items-center">
                    <h4 class="text-xs font-semibold text-[#1c1c1e] uppercase tracking-wider flex items-center gap-1.5">
                        <span>📈</span> Cumulative Equity Curve vs Buy &amp; Hold Baseline
                    </h4>
                    <div class="flex items-center gap-3 text-[11px]">
                        <span class="flex items-center gap-1.5"><span class="w-3 h-0.5 bg-[#007aff] inline-block rounded"></span> Strategy Net Equity</span>
                        <span class="flex items-center gap-1.5 text-[#86868b]"><span class="w-3 h-0.5 bg-[#86868b] inline-block rounded"></span> Stock Buy &amp; Hold</span>
                    </div>
                </div>
                <div class="w-full h-[260px]">
                    <canvas id="backtestEquityCanvas"></canvas>
                </div>
            </div>

            <!-- Historical Trade Log with Frictions -->
            <div class="macos-card p-4 space-y-3">
                <div class="flex justify-between items-center">
                    <h4 class="text-xs font-semibold text-[#1c1c1e] uppercase tracking-wider">Simulated Execution Log (Last 20 Trades):</h4>
                    <span class="text-[10px] text-[#86868b]">All figures net of taxes &amp; commissions</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr class="bg-[#f5f5f7] text-[#6e6e73] text-[10px] uppercase font-semibold border-b border-[rgba(0,0,0,0.08)]">
                                <th class="py-2.5 px-3">Entry</th>
                                <th class="py-2.5 px-3">Exit</th>
                                <th class="py-2.5 px-3">Entry ₹</th>
                                <th class="py-2.5 px-3">Exit ₹</th>
                                <th class="py-2.5 px-3">Qty</th>
                                <th class="py-2.5 px-3">Friction Deducted</th>
                                <th class="py-2.5 px-3">Net P&amp;L</th>
                                <th class="py-2.5 px-3">Return %</th>
                                <th class="py-2.5 px-3">Exit Trigger</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${trades.map(t => `
                                <tr class="border-b border-[rgba(0,0,0,0.06)] hover:bg-[#f5f5f7] transition-colors">
                                    <td class="py-2.5 px-3 text-[#1c1c1e] mono">${t.entry_date}</td>
                                    <td class="py-2.5 px-3 text-[#1c1c1e] mono">${t.exit_date}</td>
                                    <td class="py-2.5 px-3 text-[#1c1c1e] mono">₹${t.entry_price}</td>
                                    <td class="py-2.5 px-3 text-[#1c1c1e] mono">₹${t.exit_price}</td>
                                    <td class="py-2.5 px-3 text-[#6e6e73] mono">${t.quantity || '-'}</td>
                                    <td class="py-2.5 px-3 text-[#86868b] mono">₹${t.friction_deducted || '0.00'}</td>
                                    <td class="py-2.5 px-3 font-bold mono ${t.is_win ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                                        ${t.net_pnl > 0 ? '+' : ''}₹${formatNumber(t.net_pnl || 0, 0)}
                                    </td>
                                    <td class="py-2.5 px-3 font-bold mono ${t.is_win ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                                        ${t.return_pct > 0 ? '+' : ''}${t.return_pct}%
                                    </td>
                                    <td class="py-2.5 px-3 text-[#6e6e73] text-[11px]">${t.reason}</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

    // Render Comparative Equity Curve via Chart.js
    renderBacktestEquityChart(data.equity_curve);
}

function renderBacktestEquityChart(curveData) {
    const canvas = document.getElementById("backtestEquityCanvas");
    if (!canvas || !curveData || curveData.length === 0) return;

    if (_backtestChart) {
        try { _backtestChart.destroy(); } catch (e) {}
        _backtestChart = null;
    }

    const labels = curveData.map(d => d.date);
    const equityPoints = curveData.map(d => d.equity);
    const benchmarkPoints = curveData.map(d => d.benchmark);

    const ctx = canvas.getContext("2d");
    _backtestChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "Strategy Net Equity (₹)",
                    data: equityPoints,
                    borderColor: "#007aff",
                    backgroundColor: "rgba(0, 122, 255, 0.08)",
                    fill: true,
                    tension: 0.1,
                    pointRadius: 0,
                    borderWidth: 2
                },
                {
                    label: "Stock Buy & Hold (₹)",
                    data: benchmarkPoints,
                    borderColor: "#86868b",
                    borderDash: [4, 4],
                    fill: false,
                    tension: 0.1,
                    pointRadius: 0,
                    borderWidth: 1.5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: "index", intersect: false },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` ${ctx.dataset.label}: ₹${formatNumber(ctx.raw, 0)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { maxTicksLimit: 8, font: { size: 10 } }
                },
                y: {
                    grid: { color: "#f2f2f7" },
                    ticks: {
                        font: { size: 10 },
                        callback: (v) => `₹${formatNumber(v, 0)}`
                    }
                }
            }
        }
    });
}
