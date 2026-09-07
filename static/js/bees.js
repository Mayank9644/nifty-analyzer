/**
 * NiftyBees vs GoldBees — Single ETF Decision Engine UI
 * Rule: You invest 100% in ONE ETF at a time. 
 * This UI tells you WHICH one, WHEN to switch, and the EXACT calculations.
 */

let _beesCurrentHolding = "NONE";

async function loadBeesStrategy() {
    const container = document.getElementById("beesResultsContainer");
    const amountInput = document.getElementById("beesInvestmentInput");
    const holdingSelect = document.getElementById("beesCurrentHolding");
    const amount = parseFloat(amountInput ? amountInput.value : 100000) || 100000;
    _beesCurrentHolding = holdingSelect ? holdingSelect.value : "NONE";

    if (!container) return;
    container.innerHTML = `
        <div class="p-8 text-center text-[#86868b] space-y-2 text-xs">
            <svg class="animate-spin h-6 w-6 text-[#b35900] mx-auto" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            <p class="text-sm">Analyzing 2-year Nifty vs Gold momentum, 200 DMA regimes, RSI, and relative returns...</p>
        </div>
    `;

    try {
        const res = await fetch(`/api/bees?amount=${amount}&holding=${_beesCurrentHolding}`);
        const data = await res.json();
        if (data.status === "success") {
            renderBeesUI(data);
        } else {
            container.innerHTML = `<div class="p-6 text-rose-400 text-sm">${data.message || "Error loading data"}</div>`;
        }
    } catch (e) {
        console.error("Bees strategy error:", e);
        container.innerHTML = `<div class="p-6 text-rose-400 text-sm">Connection error. Is the server running?</div>`;
    }
}

function renderBeesUI(data) {
    const container = document.getElementById("beesResultsContainer");
    if (!container) return;

    const n = data.niftybees;
    const g = data.goldbees;
    const dep = data.deployment;
    const isNifty = data.recommended_etf === "NIFTYBEES";
    const etf = isNifty ? n : g;

    container.innerHTML = `
    <div class="space-y-6">


        <!-- SHIFT ALERT (if holding different ETF) -->
        ${data.shift_alert ? `
        <div class="p-4 rounded-xl border flex items-start gap-3" style="border-color: ${data.shift_alert.color}40; background: ${data.shift_alert.color}12;">
            <span class="text-2xl">${data.shift_alert.icon}</span>
            <div>
                <div class="font-bold text-sm" style="color: ${data.shift_alert.color}">${data.shift_alert.message}</div>
                <p class="text-xs text-[#48484a] mt-1">${data.shift_alert.reason}</p>
                <p class="text-xs font-semibold mt-1.5 text-[#1c1c1e]">${data.shift_alert.action}</p>
            </div>
        </div>
        ` : ""}

        <!-- MAIN VERDICT BANNER -->
        <div class="macos-card p-6">
            <div class="flex flex-wrap items-start justify-between gap-4">
                <div class="flex-1">
                    <div class="text-xs text-[#86868b] uppercase tracking-widest font-semibold mb-1">SINGLE ETF STRATEGY — TODAY'S VERDICT</div>
                    <h2 class="text-2xl lg:text-3xl font-bold flex items-center gap-3" style="color: ${data.action_color}">
                        <span>${data.action_icon}</span>
                        <span>${data.action}</span>
                    </h2>
                    <p class="text-sm text-[#48484a] mt-2.5 leading-relaxed max-w-2xl">${data.summary}</p>
                </div>

                <!-- Score Gauge -->
                <div class="macos-box p-4 text-center min-w-[160px]">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block mb-1 font-medium">Decision Score</span>
                    <span class="text-3xl font-bold block" style="color: ${data.action_color}">${data.score > 0 ? '+' : ''}${data.score}</span>
                    <span class="text-[10px] text-[#6e6e73] block mt-0.5 font-medium">${data.score_label}</span>
                    <div class="mt-2 h-1.5 rounded-full bg-[#e5e5ea] overflow-hidden">
                        <div class="h-full rounded-full transition-all" style="width: ${Math.min(100, Math.abs(data.score / data.max_score) * 100)}%; background: ${data.action_color};"></div>
                    </div>
                    <span class="text-[9px] text-[#86868b] block mt-1">Range: -10 (Gold) to +10 (Nifty)</span>
                </div>
            </div>
        </div>

        <!-- SIDE-BY-SIDE COMPARISON -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">

            <!-- NIFTYBEES -->
            <div class="macos-card p-5 transition-all ${isNifty ? 'ring-2 ring-[#28a745]/60 shadow-sm' : ''}">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">🇮🇳</span>
                        <div>
                            <div class="font-bold text-[#1c1c1e] text-base">${n.code}</div>
                            <div class="text-xs text-[#86868b]">${n.name}</div>
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        ${isNifty ? '<span class="text-[10px] px-2.5 py-0.5 rounded-full bg-[#edf7ee] text-[#1e7e34] font-bold border border-[#c3e6cb]">✓ HOLD THIS</span>' : ''}
                        <span class="text-[10px] px-2 py-0.5 rounded font-semibold ${n.is_above_200 ? 'bg-[#edf7ee] text-[#1e7e34]' : 'bg-[#fdf0f0] text-[#b32020]'}">${n.is_above_200 ? '▲ Above 200 DMA' : '▼ Below 200 DMA'}</span>
                    </div>
                </div>

                <div class="text-2xl font-bold text-[#1c1c1e] mb-3 mono">₹${n.price}</div>

                <div class="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div class="macos-box p-2">
                        <span class="text-[#86868b] block text-[10px] font-medium">50 DMA</span>
                        <span class="font-bold mono ${n.is_above_50 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">₹${n.sma50}</span>
                    </div>
                    <div class="macos-box p-2">
                        <span class="text-[#86868b] block text-[10px] font-medium">200 DMA</span>
                        <span class="font-bold mono ${n.is_above_200 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">₹${n.sma200}</span>
                    </div>
                    <div class="macos-box p-2">
                        <span class="text-[#86868b] block text-[10px] font-medium">RSI (14)</span>
                        <span class="font-bold mono ${n.rsi < 40 ? 'text-[#1e7e34]' : n.rsi > 65 ? 'text-[#b32020]' : 'text-[#8a4500]'}">${n.rsi}</span>
                    </div>
                    <div class="macos-box p-2">
                        <span class="text-[#86868b] block text-[10px] font-medium">Volatility</span>
                        <span class="font-bold mono text-[#1c1c1e]">${n.volatility}%</span>
                    </div>
                </div>

                <div class="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                    ${[['1M', n.ret_1m], ['3M', n.ret_3m], ['6M', n.ret_6m], ['1Y', n.ret_1y]].map(([label, val]) => `
                        <div class="macos-box p-1.5">
                            <span class="text-[#86868b] block font-medium">${label}</span>
                            <span class="font-bold mono ${val >= 0 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">${val > 0 ? '+' : ''}${val}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- GOLDBEES -->
            <div class="macos-card p-5 transition-all ${!isNifty ? 'ring-2 ring-[#b35900]/60 shadow-sm' : ''}">
                <div class="flex items-center justify-between mb-4">
                    <div class="flex items-center gap-3">
                        <span class="text-3xl">🥇</span>
                        <div>
                            <div class="font-bold text-[#1c1c1e] text-base">${g.code}</div>
                            <div class="text-xs text-[#86868b]">${g.name}</div>
                        </div>
                    </div>
                    <div class="flex flex-col items-end gap-1">
                        ${!isNifty ? '<span class="text-[10px] px-2.5 py-0.5 rounded-full bg-[#fef6ed] text-[#8a4500] font-bold border border-[#fed7aa]">✓ HOLD THIS</span>' : ''}
                        <span class="text-[10px] px-2 py-0.5 rounded font-semibold ${g.is_above_200 ? 'bg-[#edf7ee] text-[#1e7e34]' : 'bg-[#fdf0f0] text-[#b32020]'}">${g.is_above_200 ? '▲ Above 200 DMA' : '▼ Below 200 DMA'}</span>
                    </div>
                </div>

                <div class="text-2xl font-bold text-[#1c1c1e] mb-3 mono">₹${g.price}</div>

                <div class="grid grid-cols-2 gap-2 text-xs mb-3">
                    <div class="macos-box p-2">
                        <span class="text-[#86868b] block text-[10px] font-medium">50 DMA</span>
                        <span class="font-bold mono ${g.is_above_50 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">₹${g.sma50}</span>
                    </div>
                    <div class="macos-box p-2">
                        <span class="text-[#86868b] block text-[10px] font-medium">200 DMA</span>
                        <span class="font-bold mono ${g.is_above_200 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">₹${g.sma200}</span>
                    </div>
                    <div class="macos-box p-2">
                        <span class="text-[#86868b] block text-[10px] font-medium">RSI (14)</span>
                        <span class="font-bold mono ${g.rsi < 40 ? 'text-[#1e7e34]' : g.rsi > 65 ? 'text-[#b32020]' : 'text-[#8a4500]'}">${g.rsi}</span>
                    </div>
                    <div class="macos-box p-2">
                        <span class="text-[#86868b] block text-[10px] font-medium">Volatility</span>
                        <span class="font-bold mono text-[#1c1c1e]">${g.volatility}%</span>
                    </div>
                </div>

                <div class="grid grid-cols-4 gap-1.5 text-center text-[10px]">
                    ${[['1M', g.ret_1m], ['3M', g.ret_3m], ['6M', g.ret_6m], ['1Y', g.ret_1y]].map(([label, val]) => `
                        <div class="macos-box p-1.5">
                            <span class="text-[#86868b] block font-medium">${label}</span>
                            <span class="font-bold mono ${val >= 0 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">${val > 0 ? '+' : ''}${val}%</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        </div>

        <!-- SIGNALS BREAKDOWN (Why this recommendation) -->
        <div class="macos-card p-5 space-y-4">
            <h3 class="text-sm font-semibold text-[#1c1c1e] flex items-center gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                <span>🧮</span> Detailed Signal Calculation (Why ${data.recommended_etf}?)
            </h3>
            <div class="space-y-2">
                ${data.signals.map(s => `
                    <div class="flex items-start justify-between gap-3 py-2 border-b border-[rgba(0,0,0,0.04)]">
                        <div class="flex-1">
                            <span class="text-xs font-semibold text-[#1c1c1e]">${s.factor}</span>
                            <p class="text-[11px] text-[#6e6e73] mt-0.5">${s.verdict}</p>
                        </div>
                        <span class="text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap ${s.favors === 'NIFTYBEES' ? 'bg-[#edf7ee] text-[#1e7e34]' : 'bg-[#fef6ed] text-[#8a4500]'}">${s.points}</span>
                    </div>
                `).join('')}
            </div>
            <div class="mt-3 p-3 rounded-xl macos-box flex justify-between items-center">
                <span class="text-xs text-[#6e6e73] font-semibold">FINAL SCORE:</span>
                <span class="text-base font-bold mono" style="color: ${data.action_color}">${data.score > 0 ? '+' : ''}${data.score} / ${data.max_score} — ${data.score_label.split('→')[1]?.trim() || data.recommended_etf}</span>
            </div>
        </div>

        <!-- NIFTY/GOLD RATIO -->
        <div class="macos-card p-5 space-y-3">
            <h3 class="text-sm font-semibold text-[#1c1c1e] flex items-center gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                <span>📊</span> Nifty/Gold Price Ratio Analysis
            </h3>
            <div class="flex items-center gap-6 flex-wrap">
                <div class="text-center min-w-[120px]">
                    <span class="text-[10px] text-[#86868b] block uppercase tracking-wide font-medium">Current Ratio</span>
                    <span class="text-3xl font-bold text-[#8a4500] mono">${data.ratio.current}x</span>
                    <span class="text-[10px] text-[#86868b] block mt-0.5 mono">₹${data.ratio.nifty_price} ÷ ₹${data.ratio.gold_price}</span>
                </div>
                <div class="flex-1">
                    <p class="text-xs text-[#48484a] leading-relaxed">${data.ratio.interpretation}</p>
                    <div class="mt-2.5 flex gap-4 text-[10px]">
                        <span class="text-[#b32020] font-medium">▼ Below 2.5 = Gold expensive vs Nifty</span>
                        <span class="text-[#1e7e34] font-medium">▲ Above 4.0 = Nifty expensive vs Gold</span>
                    </div>
                </div>
            </div>
        </div>

        <!-- 20-BULLET DEPLOYMENT PLAN -->
        <div class="macos-card p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                <h3 class="text-sm font-semibold text-[#1c1c1e] flex items-center gap-2">
                    <span>🎯</span> 20-Bullet Systematic Entry Plan — ${dep.etf} at ₹${dep.cmp}
                </h3>
                <span class="text-xs text-[#007aff] font-semibold">₹${formatNumber(dep.bullet_size, 0)} per bullet × 20 = ₹${formatNumber(dep.total_capital, 0)}</span>
            </div>
            <div class="text-xs text-[#48484a] p-3 rounded-xl macos-box leading-relaxed">
                <strong class="text-[#1c1c1e] block mb-1">📌 How to Use:</strong> ${dep.rule}
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-5 gap-2">
                <div class="sm:col-span-5">
                    <div class="grid grid-cols-5 gap-2 text-[10px]">
                        ${dep.bullets.map(b => `
                            <div class="p-2.5 rounded-xl ${b.bullet === 1 ? 'bg-[#eef5fd] border border-[#b9d7fb]' : 'macos-box'} text-center">
                                <span class="text-[#86868b] block font-medium">Bullet ${b.bullet}</span>
                                <span class="font-bold text-[#1c1c1e] text-sm block mt-0.5 mono">₹${b.deploy_price}</span>
                                <span class="text-[#1e7e34] block font-semibold">${b.units} units</span>
                                <span class="text-[#86868b] block mt-0.5">${b.trigger}</span>
                            </div>
                        `).join('')}
                        <div class="p-2.5 rounded-xl macos-box text-center flex flex-col justify-center">
                            <span class="text-[#86868b] text-[9px] font-medium">Bullets 6-20</span>
                            <span class="text-[#86868b] text-[9px] mt-1">Continue -3% steps...</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Log Trade Button -->
            <div class="mt-4 flex gap-3">
                <button onclick="takeTradeFromScanner('${dep.etf}.NS', ${dep.cmp}, ${dep.units_at_cmp}, ${(dep.cmp * 0.92).toFixed(2)}, ${(dep.cmp * 1.20).toFixed(2)}, ${(dep.cmp * 1.30).toFixed(2)})"
                    class="px-4 py-2 rounded-xl font-semibold text-xs shadow-sm flex items-center gap-2 ${isNifty ? 'bg-[#28a745] hover:bg-[#1e7e34]' : 'bg-[#b35900] hover:bg-[#8a4500]'} text-white transition-all">
                    <span>📒</span> Log Bullet 1 — Buy ${dep.units_at_cmp} units @ ₹${dep.cmp}
                </button>
            </div>
        </div>

        <!-- SWITCH RULES -->
        <div class="macos-card p-5 space-y-4">
            <h3 class="text-sm font-semibold text-[#1c1c1e] flex items-center gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                <span>🔄</span> When to Switch ETFs — Your Decision Rules
            </h3>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="p-3.5 rounded-xl bg-[#edf7ee] border border-[#c3e6cb]">
                    <div class="text-xs font-bold text-[#1e7e34] mb-1">Switch TO NIFTYBEES when:</div>
                    <p class="text-[11px] text-[#48484a]">${data.shift_rules.switch_to_niftybees}</p>
                </div>
                <div class="p-3.5 rounded-xl bg-[#fef6ed] border border-[#fed7aa]">
                    <div class="text-xs font-bold text-[#8a4500] mb-1">Switch TO GOLDBEES when:</div>
                    <p class="text-[11px] text-[#48484a]">${data.shift_rules.switch_to_goldbees}</p>
                </div>
            </div>
            <div class="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div class="p-3.5 rounded-xl macos-box">
                    <div class="text-[10px] font-bold text-[#007aff] mb-1">📅 Review Frequency</div>
                    <p class="text-[11px] text-[#48484a]">${data.shift_rules.review_frequency}</p>
                </div>
                <div class="p-3.5 rounded-xl macos-box">
                    <div class="text-[10px] font-bold text-[#b32020] mb-1">💸 Cost of Switching</div>
                    <p class="text-[11px] text-[#48484a]">${data.shift_rules.cost_of_switching}</p>
                </div>
            </div>
        </div>

    </div>
    `;
}
