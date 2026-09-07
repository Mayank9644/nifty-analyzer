/**
 * Best Shares & ETFs Recommendations Client.
 */

async function loadBestRecommendations() {
    const container = document.getElementById("bestPicksContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="p-8 text-center text-[#86868b] text-xs">
            <svg class="animate-spin h-5 w-5 text-[#007aff] mx-auto mb-2" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
            Generating high-confluence best shares and ETF recommendations...
        </div>
    `;

    try {
        const res = await fetch("/api/recommendations");
        const data = await res.json();

        if (data.status === "success") {
            renderBestPicksUI(data);
        }
    } catch (e) {
        console.error("Error loading recommendations:", e);
    }
}

function renderBestPicksUI(data) {
    const container = document.getElementById("bestPicksContainer");
    if (!container) return;

    const breakouts = data.best_swing_shares || [];
    const compounders = data.best_long_term_compounders || [];
    const etfs = data.best_etfs || [];

    container.innerHTML = `
        <div class="space-y-6">
            <!-- SECTION 1: TOP SWING BREAKOUT SHARES -->
            <div class="macos-card p-5 space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                    <div>
                        <h3 class="text-base font-semibold text-[#1c1c1e] flex items-center gap-2">
                            <span>🚀</span> Top Shares to Buy Today (High-Probability Swing Breakouts)
                        </h3>
                        <p class="text-xs text-[#6e6e73] mt-0.5">Selected using Minervini SEPA V4: Stacked moving averages, low volatility coil, and volume surge.</p>
                    </div>
                    <span class="text-xs px-2.5 py-1 rounded-lg bg-[#edf7ee] text-[#1e7e34] font-semibold border border-[#c3e6cb]">
                        Swing Trading (3-15 Days)
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${breakouts.map(b => `
                        <div class="macos-box p-4 hover:shadow-sm transition-all flex flex-col justify-between">
                            <div>
                                <div class="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 class="text-sm font-semibold text-[#1c1c1e]">${b.code}</h4>
                                        <span class="text-[10px] text-[#86868b] block">${b.name}</span>
                                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#eef5fd] text-[#007aff] font-medium mt-1 inline-block">${b.pattern}</span>
                                    </div>
                                    <span class="text-xs font-bold px-2 py-0.5 rounded bg-[#edf7ee] text-[#1e7e34] mono border border-[#c3e6cb]">
                                        Score: ${b.score}
                                    </span>
                                </div>

                                <div class="grid grid-cols-3 gap-2 my-3 p-2.5 rounded-lg bg-white border border-[rgba(0,0,0,0.06)] text-xs">
                                    <div>
                                        <span class="text-[10px] text-[#86868b] block font-medium">Buy Zone</span>
                                        <span class="font-bold text-[#1c1c1e] mono">₹${b.cmp}</span>
                                    </div>
                                    <div>
                                        <span class="text-[10px] text-[#b32020] block font-medium">Stop-Loss</span>
                                        <span class="font-bold text-[#b32020] mono">₹${b.stop_loss}</span>
                                    </div>
                                    <div>
                                        <span class="text-[10px] text-[#1e7e34] block font-medium">Target 1</span>
                                        <span class="font-bold text-[#1e7e34] mono">₹${b.target} (+${b.target_pct}%)</span>
                                    </div>
                                </div>

                                <p class="text-[11px] text-[#48484a] leading-relaxed">${b.rationale}</p>
                            </div>

                            <div class="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between">
                                <button onclick="switchTab('stocks'); loadStock('${b.symbol}')" class="text-xs text-[#007aff] hover:underline font-semibold">
                                    Inspect Full Chart →
                                </button>
                                <button onclick="takeTradeFromScanner('${b.symbol}', ${b.cmp}, ${b.shares_qty}, ${b.stop_loss}, ${b.target}, ${b.target * 1.05})" class="px-2.5 py-1 rounded-md bg-[#007aff] hover:bg-[#0062cc] text-white font-semibold text-[11px] transition-all">
                                    Take Trade
                                </button>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>

            <!-- SECTION 2: TOP LONG-TERM WEALTH COMPOUNDERS -->
            <div class="macos-card p-5 space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                    <div>
                        <h3 class="text-base font-semibold text-[#1c1c1e] flex items-center gap-2">
                            <span>💎</span> Top Wealth Compounders (Warren Buffett & Jhunjhunwala Grade A+)
                        </h3>
                        <p class="text-xs text-[#6e6e73] mt-0.5">High ROE (&gt;18%), zero debt anxiety, enduring economic moats, and dominant market leadership.</p>
                    </div>
                    <span class="text-xs px-2.5 py-1 rounded-lg bg-[#eef5fd] text-[#007aff] font-semibold border border-[#b9d7fb]">
                        Long-Term Holding (1-5 Years)
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${compounders.map(c => `
                        <div class="macos-box p-4 hover:shadow-sm transition-all flex flex-col justify-between">
                            <div>
                                <div class="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 class="text-sm font-semibold text-[#1c1c1e]">${c.code}</h4>
                                        <span class="text-[10px] text-[#86868b] block">${c.name}</span>
                                        <span class="text-[9px] text-[#86868b]">${c.sector}</span>
                                    </div>
                                    <span class="text-xs font-bold px-2 py-0.5 rounded bg-[#edf7ee] text-[#1e7e34] border border-[#c3e6cb]">
                                        Grade ${c.grade}
                                    </span>
                                </div>

                                <div class="grid grid-cols-3 gap-2 my-3 p-2.5 rounded-lg bg-white border border-[rgba(0,0,0,0.06)] text-xs">
                                    <div>
                                        <span class="text-[10px] text-[#86868b] block font-medium">Price (CMP)</span>
                                        <span class="font-bold text-[#1c1c1e] mono">₹${c.cmp}</span>
                                    </div>
                                    <div>
                                        <span class="text-[10px] text-[#1e7e34] block font-medium">ROE</span>
                                        <span class="font-bold text-[#1e7e34] mono">${c.roe}%</span>
                                    </div>
                                    <div>
                                        <span class="text-[10px] text-[#007aff] block font-medium">Debt / Equity</span>
                                        <span class="font-bold text-[#007aff] mono">${c.debt_equity}</span>
                                    </div>
                                </div>

                                <p class="text-[11px] text-[#48484a] leading-relaxed">${c.rationale}</p>
                            </div>

                            <div class="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)]">
                                <button onclick="switchTab('stocks'); loadStock('${c.symbol}')" class="w-full py-1.5 rounded-lg bg-[#e3e3e8] hover:bg-[#d1d1d6] text-[#1c1c1e] text-xs font-semibold transition-all">
                                    View Fundamentals & Moat
                                </button>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>

            <!-- SECTION 3: BEST ETFS TO TRADE RIGHT NOW -->
            <div class="macos-card p-5 space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                    <div>
                        <h3 class="text-base font-semibold text-[#1c1c1e] flex items-center gap-2">
                            <span>🎯</span> Best ETFs to Trade Right Now (Pullbacks to Support)
                        </h3>
                        <p class="text-xs text-[#6e6e73] mt-0.5">Zero company-specific default risk. Systematic entry on technical pullbacks.</p>
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${etfs.map(e => `
                        <div class="macos-box p-4 hover:shadow-sm transition-all flex flex-col justify-between">
                            <div>
                                <div class="flex justify-between items-start mb-2">
                                    <div class="flex items-center space-x-2">
                                        <span class="text-2xl">${e.icon || '📦'}</span>
                                        <div>
                                            <h4 class="text-sm font-semibold text-[#1c1c1e]">${e.code}</h4>
                                            <span class="text-[10px] text-[#86868b] block">${e.name}</span>
                                        </div>
                                    </div>
                                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#eef5fd] text-[#007aff]">
                                        ${e.category}
                                    </span>
                                </div>

                                <div class="grid grid-cols-2 gap-2 my-3 p-2.5 rounded-lg bg-white border border-[rgba(0,0,0,0.06)] text-xs">
                                    <div>
                                        <span class="text-[10px] text-[#86868b] block font-medium">Current Price</span>
                                        <span class="font-bold text-[#1c1c1e] mono">₹${e.cmp}</span>
                                    </div>
                                    <div>
                                        <span class="text-[10px] text-[#86868b] block font-medium">RSI Momentum</span>
                                        <span class="font-bold mono ${e.rsi < 45 ? 'text-[#1e7e34]' : 'text-[#1c1c1e]'}">${e.rsi}</span>
                                    </div>
                                </div>

                                <p class="text-[11px] text-[#48484a] leading-relaxed">${e.rationale}</p>
                            </div>

                            <div class="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)]">
                                <span class="text-[11px] font-semibold text-[#1e7e34] block text-center">${e.action}</span>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        </div>
    `;
}
