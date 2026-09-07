/**
 * Strategy Backtesting Client Engine.
 */

async function runBacktest() {
    const symbolInput = document.getElementById("backtestSymbolSelect");
    const periodInput = document.getElementById("backtestPeriodSelect");
    const container = document.getElementById("backtestResultsContainer");

    const symbol = symbolInput ? symbolInput.value : "RELIANCE.NS";
    const period = periodInput ? periodInput.value : "3y";

    if (!container) return;
    container.innerHTML = `<div class="p-8 text-center text-[#86868b] text-xs">Running SEPA Trend Breakout backtest on ${symbol} over ${period}...</div>`;

    try {
        const res = await fetch(`/api/backtest?symbol=${symbol}&period=${period}`);
        const data = await res.json();

        if (data.status === "success") {
            renderBacktestResults(data);
        } else {
            container.innerHTML = `<div class="p-8 text-center text-[#b32020] text-xs">${data.message || 'Backtest failed.'}</div>`;
        }
    } catch (e) {
        console.error("Backtest error:", e);
    }
}

function renderBacktestResults(data) {
    const container = document.getElementById("backtestResultsContainer");
    if (!container) return;

    const trades = data.trades || [];

    container.innerHTML = `
        <div class="space-y-4">
            <!-- Stat Cards -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                <div class="macos-card p-3.5 text-center">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-medium">Win Rate</span>
                    <span class="text-xl font-bold mono text-[#1e7e34]">${data.win_rate}%</span>
                    <span class="text-[10px] text-[#86868b] block mt-0.5">${data.total_trades} Trades</span>
                </div>
                <div class="macos-card p-3.5 text-center">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-medium">Profit Factor</span>
                    <span class="text-xl font-bold mono text-[#007aff]">${data.profit_factor}</span>
                    <span class="text-[10px] text-[#86868b] block mt-0.5">Gross Win/Loss</span>
                </div>
                <div class="macos-card p-3.5 text-center">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-medium">Total Return</span>
                    <span class="text-xl font-bold mono ${data.total_return_pct >= 0 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">${data.total_return_pct > 0 ? '+' : ''}${data.total_return_pct}%</span>
                    <span class="text-[10px] text-[#86868b] block mt-0.5">Unleveraged</span>
                </div>
                <div class="macos-card p-3.5 text-center">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-medium">Avg Win / Loss</span>
                    <span class="text-sm font-bold mono text-[#1e7e34]">+${data.avg_win_pct}%</span>
                    <span class="text-[11px] font-bold mono text-[#b32020] block">${data.avg_loss_pct}%</span>
                </div>
            </div>

            <!-- Historical Trade Log -->
            <div class="macos-card p-4">
                <h4 class="text-xs font-semibold text-[#1c1c1e] uppercase tracking-wider mb-2.5">Simulated Trade History:</h4>
                <div class="overflow-x-auto">
                    <table class="w-full text-left border-collapse text-xs">
                        <thead>
                            <tr class="bg-[#f5f5f7] text-[#6e6e73] text-[10px] uppercase font-semibold border-b border-[rgba(0,0,0,0.08)]">
                                <th class="py-2.5 px-3">Entry Date</th>
                                <th class="py-2.5 px-3">Exit Date</th>
                                <th class="py-2.5 px-3">Entry ₹</th>
                                <th class="py-2.5 px-3">Exit ₹</th>
                                <th class="py-2.5 px-3">Return %</th>
                                <th class="py-2.5 px-3">Exit Reason</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${trades.map(t => `
                                <tr class="border-b border-[rgba(0,0,0,0.06)] hover:bg-[#f5f5f7] transition-colors">
                                    <td class="py-2.5 px-3 text-[#1c1c1e] mono">${t.entry_date}</td>
                                    <td class="py-2.5 px-3 text-[#1c1c1e] mono">${t.exit_date}</td>
                                    <td class="py-2.5 px-3 text-[#1c1c1e] mono">₹${t.entry_price}</td>
                                    <td class="py-2.5 px-3 text-[#1c1c1e] mono">₹${t.exit_price}</td>
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
}
