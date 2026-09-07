/**
 * Options Chain Table & Heatmap Renderer.
 */

function renderOptionsChainTable(containerId, optionsData) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const chain = optionsData.chain_table || [];
    const spot = optionsData.underlying_price || 0;
    const maxPain = optionsData.max_pain ? optionsData.max_pain.strike : 0;

    if (!chain.length) {
        container.innerHTML = `<div class="p-8 text-center text-[#86868b] text-xs">No option contracts available for this expiry.</div>`;
        return;
    }

    // Find max open interest for proportional heatmap bar widths
    const maxCallOi = Math.max(...chain.map(r => r.ce_oi), 1);
    const maxPutOi = Math.max(...chain.map(r => r.pe_oi), 1);

    let rowsHtml = "";
    chain.forEach(row => {
        const isATM = Math.abs(row.strike - spot) < 50;
        const isMaxPain = row.strike === maxPain;
        const callWidth = Math.min((row.ce_oi / maxCallOi) * 100, 100);
        const putWidth = Math.min((row.pe_oi / maxPutOi) * 100, 100);

        rowsHtml += `
            <tr class="border-b border-[rgba(0,0,0,0.06)] hover:bg-[#f5f5f7] transition-colors text-xs ${isATM ? 'bg-[#eef5fd]/70' : ''}">
                <!-- CALLS -->
                <td class="py-2.5 px-2 text-right relative text-[#1c1c1e] font-medium">
                    <div class="oi-bar oi-bar-call" style="width: ${callWidth}%"></div>
                    ${formatVolume(row.ce_oi)}
                </td>
                <td class="py-2.5 px-2 text-right text-[#6e6e73] hidden sm:table-cell">${row.ce_change_oi > 0 ? '+' : ''}${formatVolume(row.ce_change_oi)}</td>
                <td class="py-2.5 px-2 text-right text-[#6e6e73] hidden md:table-cell">${row.ce_iv}%</td>
                <td class="py-2.5 px-2 text-right text-[#1e7e34] hidden lg:table-cell">${row.ce_delta}</td>
                <td class="py-2.5 px-3 text-right text-[#1e7e34] font-semibold mono">₹${row.ce_ltp}</td>

                <!-- STRIKE -->
                <td class="py-2.5 px-3 text-center font-bold bg-[#f8f8fa] border-x border-[rgba(0,0,0,0.08)] mono ${isATM ? 'text-[#007aff] bg-[#eef5fd]' : 'text-[#1c1c1e]'}">
                    ${row.strike}
                    ${isMaxPain ? '<span class="block text-[9px] text-[#8a4500] font-medium">MAX PAIN</span>' : ''}
                    ${isATM ? '<span class="block text-[9px] text-[#007aff] font-medium">ATM</span>' : ''}
                </td>

                <!-- PUTS -->
                <td class="py-2.5 px-3 text-left text-[#b32020] font-semibold mono">₹${row.pe_ltp}</td>
                <td class="py-2.5 px-2 text-left text-[#b32020] hidden lg:table-cell">${row.pe_delta}</td>
                <td class="py-2.5 px-2 text-left text-[#6e6e73] hidden md:table-cell">${row.pe_iv}%</td>
                <td class="py-2.5 px-2 text-left text-[#6e6e73] hidden sm:table-cell">${row.pe_change_oi > 0 ? '+' : ''}${formatVolume(row.pe_change_oi)}</td>
                <td class="py-2.5 px-2 text-left relative text-[#1c1c1e] font-medium">
                    <div class="oi-bar oi-bar-put" style="width: ${putWidth}%"></div>
                    ${formatVolume(row.pe_oi)}
                </td>
            </tr>
        `;
    });

    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse">
                <thead>
                    <tr class="text-[11px] uppercase tracking-wider border-b border-[rgba(0,0,0,0.08)]">
                        <th colspan="5" class="py-2 px-3 text-center bg-[#edf7ee] text-[#1e7e34] border-r border-[rgba(0,0,0,0.08)] font-semibold">CALL OPTIONS (BULLS)</th>
                        <th class="py-2 px-3 text-center bg-[#f5f5f7] text-[#007aff] font-bold">STRIKE</th>
                        <th colspan="5" class="py-2 px-3 text-center bg-[#fdf0f0] text-[#b32020] border-l border-[rgba(0,0,0,0.08)] font-semibold">PUT OPTIONS (BEARS)</th>
                    </tr>
                    <tr class="bg-[#f8f8fa] text-[10px] text-[#6e6e73] border-b border-[rgba(0,0,0,0.08)]">
                        <th class="py-2 px-2 text-right">OI</th>
                        <th class="py-2 px-2 text-right hidden sm:table-cell">Chg OI</th>
                        <th class="py-2 px-2 text-right hidden md:table-cell">IV</th>
                        <th class="py-2 px-2 text-right hidden lg:table-cell">Delta</th>
                        <th class="py-2 px-3 text-right text-[#1e7e34]">LTP</th>
                        <th class="py-2 px-3 text-center bg-[#f5f5f7] border-x border-[rgba(0,0,0,0.08)]">PRICE</th>
                        <th class="py-2 px-3 text-left text-[#b32020]">LTP</th>
                        <th class="py-2 px-2 text-left hidden lg:table-cell">Delta</th>
                        <th class="py-2 px-2 text-left hidden md:table-cell">IV</th>
                        <th class="py-2 px-2 text-left hidden sm:table-cell">Chg OI</th>
                        <th class="py-2 px-2 text-left">OI</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

/**
 * Multi-Leg Options Strategy Payoff Visualizer & IV Engine
 */
let optionsPayoffChartInstance = null;
let currentPayoffSymbol = "NIFTY";
let currentPayoffStrategy = "bull_call_spread";
let currentPayoffLotSize = 25;

async function loadOptionsPayoff(strategy, lotSize) {
    if (strategy) currentPayoffStrategy = strategy;
    if (lotSize) currentPayoffLotSize = parseInt(lotSize);

    // Update active button state
    document.querySelectorAll(".payoff-strat-btn").forEach(btn => {
        if (btn.dataset.strategy === currentPayoffStrategy) {
            btn.classList.add("active");
        } else {
            btn.classList.remove("active");
        }
    });

    const symbolParam = currentPayoffSymbol === "NIFTY" ? "^NSEI" : (currentPayoffSymbol === "BANKNIFTY" ? "^NSEBANK" : `${currentPayoffSymbol}.NS`);

    try {
        const res = await fetch(`/api/options/${encodeURIComponent(symbolParam)}/payoff?strategy=${currentPayoffStrategy}&lot_size=${currentPayoffLotSize}`);
        const data = await res.json();

        if (data.status !== "success") return;

        // Populate metrics
        const maxProfitEl = document.getElementById("payoffMaxProfit");
        const maxLossEl = document.getElementById("payoffMaxLoss");
        const breakevenEl = document.getElementById("payoffBreakeven");
        const rrEl = document.getElementById("payoffRiskReward");
        const titleEl = document.getElementById("payoffTitle");
        const summaryEl = document.getElementById("payoffSummary");
        const legsEl = document.getElementById("payoffLegsList");

        if (maxProfitEl) maxProfitEl.textContent = `₹${(data.max_profit || 0).toLocaleString("en-IN")}`;
        if (maxLossEl) maxLossEl.textContent = `₹${(data.max_loss || 0).toLocaleString("en-IN")}`;
        if (breakevenEl) breakevenEl.textContent = typeof data.breakeven === "number" ? `₹${data.breakeven.toLocaleString("en-IN")}` : data.breakeven;
        if (rrEl) rrEl.textContent = data.risk_reward || "--";
        if (titleEl) titleEl.textContent = data.title || "Options Strategy Payoff";
        if (summaryEl) summaryEl.textContent = data.summary || "";

        // Render multi-leg items
        if (legsEl && data.legs) {
            legsEl.innerHTML = data.legs.map(leg => {
                const isBuy = leg.action === "BUY";
                return `
                <div class="px-2.5 py-1.5 rounded-lg border ${isBuy ? 'bg-[#edf7ee] border-[#c6e8cc] text-[#1e7e34]' : 'bg-[#fdf0f0] border-[#f7c8c8] text-[#b32020]'} text-xs font-semibold flex items-center justify-between">
                    <span>${leg.action} ${leg.strike} ${leg.type}</span>
                    <span class="mono">₹${leg.premium}</span>
                </div>
                `;
            }).join("");
        }

        // Render IV analysis
        if (data.iv_analysis) {
            const ivRankEl = document.getElementById("payoffIvRank");
            const ivBadgeEl = document.getElementById("payoffIvBadge");
            const ivRuleEl = document.getElementById("payoffIvRule");

            if (ivRankEl) ivRankEl.textContent = `${data.iv_analysis.iv_percentile}%`;
            if (ivBadgeEl) {
                ivBadgeEl.textContent = data.iv_analysis.regime;
                ivBadgeEl.style.color = data.iv_analysis.regime_color;
            }
            if (ivRuleEl) ivRuleEl.textContent = data.iv_analysis.tactical_rule;
        }

        // Render Chart
        renderPayoffChart(data.payoff_curve, data.spot_price);
    } catch (err) {
        console.error("Error loading options payoff:", err);
    }
}

function renderPayoffChart(curve, spotPrice) {
    const canvas = document.getElementById("optionsPayoffChartCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (optionsPayoffChartInstance) {
        optionsPayoffChartInstance.destroy();
    }

    const labels = curve.map(pt => pt.price);
    const pnlData = curve.map(pt => pt.pnl);

    optionsPayoffChartInstance = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Expiry P&L (₹)",
                data: pnlData,
                borderColor: "#007aff",
                borderWidth: 2.5,
                fill: {
                    target: { value: 0 },
                    above: "rgba(16, 185, 129, 0.12)",
                    below: "rgba(239, 68, 68, 0.12)"
                },
                tension: 0.15,
                pointRadius: 2,
                pointHoverRadius: 5
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        title: ctx => `Underlying Price: ₹${ctx[0].label}`,
                        label: ctx => `P&L: ${ctx.raw >= 0 ? '+' : ''}₹${ctx.raw.toLocaleString("en-IN")}`
                    }
                }
            },
            scales: {
                x: {
                    grid: { color: "rgba(0,0,0,0.03)" },
                    ticks: {
                        font: { size: 10 },
                        color: "#8e8e93",
                        callback: v => `₹${labels[v] || v}`
                    }
                },
                y: {
                    grid: { color: "rgba(0,0,0,0.04)" },
                    ticks: {
                        font: { size: 10 },
                        color: "#8e8e93",
                        callback: v => `₹${v.toLocaleString("en-IN")}`
                    }
                }
            }
        }
    });
}

