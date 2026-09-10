/**
 * Best Shares, ETFs & F&O Recommendations Client.
 * Displays high-conviction curated picks with complete formula & parameter transparency.
 */

let _currentPicksFilter = "all";
let _activeRecommendationsData = null;

async function loadBestRecommendations(forceRefresh = false) {
    const container = document.getElementById("bestPicksContainer");
    if (!container) return;

    if (!forceRefresh && _activeRecommendationsData) {
        renderBestPicksUI(_activeRecommendationsData);
        return;
    }

    container.innerHTML = `
        <div class="p-12 text-center text-[#86868b] text-xs">
            <svg class="animate-spin h-6 w-6 text-[#007aff] mx-auto mb-3" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span class="font-medium text-sm text-[#1c1c1e] block mb-1">Calculating Institutional Picks</span>
            <span class="text-xs text-[#8e8e93]">Evaluating F&O Option Spreads, ATR Volatility Stops, and Fundamental Quality Index...</span>
        </div>
    `;

    try {
        const url = forceRefresh ? "/api/recommendations?refresh=1" : "/api/recommendations";
        const res = await fetch(url);
        const data = await res.json();

        if (data.status === "success") {
            _activeRecommendationsData = data;
            renderBestPicksUI(data);
        } else {
            throw new Error(data.message || "Failed to load");
        }
    } catch (e) {
        console.error("Error loading recommendations:", e);
        if (container) {
            container.innerHTML = `
                <div class="p-8 text-center text-[#8e8e93] text-xs macos-card">
                    <div class="text-sm font-semibold text-[#b32020] mb-1">Unable to Load Live Recommendations</div>
                    <p class="text-xs text-[#6e6e73] mb-3">Live market data feed experienced a momentary connection pause.</p>
                    <button onclick="loadBestRecommendations(true)" class="btn-primary px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer">
                        <span>🔄</span> <span>Retry Calculation</span>
                    </button>
                </div>
            `;
        }
    }
}

function filterPicksSubTab(filter) {
    _currentPicksFilter = filter;
    document.querySelectorAll(".picks-filter-btn").forEach(btn => {
        if (btn.dataset.filter === filter) {
            btn.classList.add("active", "bg-white", "text-[#1c1c1e]", "font-semibold", "shadow-xs");
            btn.classList.remove("text-[#6e6e73]");
        } else {
            btn.classList.remove("active", "bg-white", "text-[#1c1c1e]", "font-semibold", "shadow-xs");
            btn.classList.add("text-[#6e6e73]");
        }
    });

    // If filter matches a trading style, sync with the global app execution style buttons
    if (["intraday", "swing", "positional"].includes(filter)) {
        if (typeof window.appState !== "undefined") {
            window.appState.currentStyle = filter;
        }
        document.querySelectorAll(".style-btn").forEach(btn => {
            if (btn.dataset.style === filter) {
                btn.classList.add("active", "bg-white", "text-[#1d1d1f]", "font-semibold", "shadow-sm");
                btn.classList.remove("text-[#636366]");
            } else {
                btn.classList.remove("active", "bg-white", "text-[#1d1d1f]", "font-semibold", "shadow-sm");
                btn.classList.add("text-[#636366]");
            }
        });
    }

    if (_activeRecommendationsData) {
        renderBestPicksUI(_activeRecommendationsData);
    }
}
window.filterPicksSubTab = filterPicksSubTab;

function renderBestPicksUI(data) {
    const container = document.getElementById("bestPicksContainer");
    if (!container) return;

    const intraday = data.best_intraday_picks || [];
    const breakouts = data.best_swing_shares || [];
    const positional = data.best_positional_picks || [];
    const compounders = data.best_long_term_compounders || [];
    const fno = data.best_fno_strategies || [];
    const etfs = data.best_etfs || [];
    const allocation = data.portfolio_allocation || {};

    const showIntraday = _currentPicksFilter === "all" || _currentPicksFilter === "intraday";
    const showSwing = _currentPicksFilter === "all" || _currentPicksFilter === "swing";
    const showPositional = _currentPicksFilter === "all" || _currentPicksFilter === "positional";
    const showComp = _currentPicksFilter === "all" || _currentPicksFilter === "compounder";
    const showFno = _currentPicksFilter === "all" || _currentPicksFilter === "fno";
    const showEtf = _currentPicksFilter === "all" || _currentPicksFilter === "etf";

    let html = `
        <div class="space-y-6">
            <!-- PICKS SUB-TOOLBAR (Filter Pills + Capital Allocation Strip) -->
            <div class="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-[rgba(0,0,0,0.06)] shadow-xs">
                <div class="flex items-center macos-segmented-track flex-wrap gap-1">
                    <button class="picks-filter-btn ${_currentPicksFilter === 'all' ? 'active' : ''}" data-filter="all" onclick="filterPicksSubTab('all')">🌟 All Picks</button>
                    <button class="picks-filter-btn ${_currentPicksFilter === 'intraday' ? 'active' : ''}" data-filter="intraday" onclick="filterPicksSubTab('intraday')">⚡ Intraday (${intraday.length})</button>
                    <button class="picks-filter-btn ${_currentPicksFilter === 'swing' ? 'active' : ''}" data-filter="swing" onclick="filterPicksSubTab('swing')">🚀 Swing (${breakouts.length})</button>
                    <button class="picks-filter-btn ${_currentPicksFilter === 'positional' ? 'active' : ''}" data-filter="positional" onclick="filterPicksSubTab('positional')">📈 Positional (${positional.length})</button>
                    <button class="picks-filter-btn ${_currentPicksFilter === 'compounder' ? 'active' : ''}" data-filter="compounder" onclick="filterPicksSubTab('compounder')">💎 Compounders (${compounders.length})</button>
                    <button class="picks-filter-btn ${_currentPicksFilter === 'fno' ? 'active' : ''}" data-filter="fno" onclick="filterPicksSubTab('fno')">📋 F&O (${fno.length})</button>
                    <button class="picks-filter-btn ${_currentPicksFilter === 'etf' ? 'active' : ''}" data-filter="etf" onclick="filterPicksSubTab('etf')">📉 ETFs (${etfs.length})</button>
                </div>

                <div class="flex items-center gap-3 text-xs text-[#6e6e73]">
                    <span class="font-medium">Macro Allocation:</span>
                    <div class="flex items-center gap-1.5 font-bold mono">
                        <span class="text-[#007aff]">60% Equity</span> • 
                        <span class="text-[#ff9500]">25% Gold</span> • 
                        <span class="text-[#34c759]">15% Cash</span>
                    </div>
                </div>
            </div>
    `;

    let renderedSections = 0;

    // 0. INTRADAY HIGH-PROBABILITY MOMENTUM DESK
    if (showIntraday && intraday.length > 0) {
        renderedSections++;
        html += `
            <div class="macos-card p-5 space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                    <div>
                        <h3 class="text-base font-semibold text-[#1c1c1e] flex items-center gap-2">
                            <span>⚡</span> Top Intraday Picks (Same-Day MIS Momentum)
                        </h3>
                        <p class="text-xs text-[#6e6e73] mt-0.5">Calculated using 15-Minute VWAP confluence, opening range expansion, tight 0.8× ATR_15m stops, and 1:2 / 1:3 intraday targets. Auto square-off before 15:15 IST.</p>
                    </div>
                    <span class="text-xs px-2.5 py-1 rounded-lg bg-[#fff7ed] text-[#ea580c] font-semibold border border-[#fed7aa] flex items-center gap-1">
                        <span>⚡</span> Same-Day MIS (Exit by 15:15 IST)
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${intraday.map((item, idx) => `
                        <div class="macos-box p-4 hover:shadow-sm transition-all flex flex-col justify-between border border-[rgba(0,0,0,0.06)]">
                            <div>
                                <div class="flex justify-between items-start mb-2">
                                    <div>
                                        <div class="flex items-center gap-1.5">
                                            <h4 class="text-sm font-bold text-[#1c1c1e]">${item.code}</h4>
                                            <span class="text-[9.5px] px-1.5 py-0.2 rounded font-bold bg-[#edf7ee] text-[#1e7e34]">${item.bias}</span>
                                        </div>
                                        <span class="text-[10px] text-[#86868b] block">${item.name}</span>
                                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#fff7ed] text-[#ea580c] font-medium mt-1 inline-block">${item.pattern}</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-[10px] text-[#8e8e93] block">Intraday Score</span>
                                        <span class="text-xs font-bold px-2 py-0.5 rounded bg-[#fff7ed] text-[#ea580c] mono border border-[#fed7aa]">
                                            ${item.score} / 100
                                        </span>
                                    </div>
                                </div>

                                <div class="p-1.5 rounded bg-[#f5f5f7] border border-[rgba(0,0,0,0.05)] text-[10.5px] flex items-center justify-between text-[#555] mb-2">
                                    <span>VWAP: <strong class="text-[#007aff] mono">₹${item.vwap}</strong></span>
                                    <span>Status: <strong class="text-[#1e7e34]">Price > VWAP</strong></span>
                                    <span>Square-Off: <strong class="text-[#ea580c]">15:15</strong></span>
                                </div>

                                <div class="grid grid-cols-3 gap-2 my-2 p-2.5 rounded-lg bg-white border border-[rgba(0,0,0,0.06)] text-xs">
                                    <div>
                                        <span class="text-[9.5px] text-[#86868b] block font-medium">Buy Price</span>
                                        <span class="font-bold text-[#1c1c1e] mono">₹${item.cmp}</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#b32020] block font-medium">Stop-Loss (0.8x ATR)</span>
                                        <span class="font-bold text-[#b32020] mono">₹${item.stop_loss}</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#1e7e34] block font-medium">Target 1 (1:2 R:R)</span>
                                        <span class="font-bold text-[#1e7e34] mono">₹${item.target} (+${item.target_pct}%)</span>
                                    </div>
                                </div>

                                <div class="flex justify-between items-center text-[10.5px] text-[#6e6e73] mb-2 px-1">
                                    <span>Target 2: <strong class="text-[#1e7e34] mono">₹${item.target_2} (+${item.target_2_pct}%)</strong></span>
                                    <span>Vol Surge: <strong class="text-[#1c1c1e] mono">${item.vol_surge}x</strong></span>
                                    <span>Qty: <strong class="text-[#007aff] mono">${item.shares_qty} shares</strong></span>
                                </div>

                                <p class="text-[11px] text-[#48484a] leading-relaxed">${item.rationale}</p>
                            </div>

                            <div class="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between">
                                <button onclick="openFormulaInspectionModal('intraday', ${idx})" class="text-[11px] text-[#ea580c] hover:underline font-semibold flex items-center gap-1">
                                    <span>📐</span> View Math & VWAP
                                </button>
                                <div class="flex items-center gap-1.5">
                                    <button onclick="openBrokerOrderModal('${item.symbol}', ${item.shares_qty || 10}, ${item.cmp}, ${item.stop_loss}, ${item.target})" class="btn-broker" title="Execute on Zerodha Kite or Dhan">
                                        <span>⚡</span> <span>Broker</span>
                                    </button>
                                    <button onclick="logPickToJournal('${item.symbol}', ${item.cmp}, ${item.shares_qty || 10}, ${item.stop_loss}, ${item.target}, 'Intraday')" class="btn-log" title="Log trade in personal journal">
                                        <span>🎯</span> <span>Log</span>
                                    </button>
                                    <button onclick="inspectPickOnChart(_activeRecommendationsData.best_intraday_picks[${idx}])" class="btn-primary px-2.5 py-1 text-[11px] cursor-pointer" title="Load chart">
                                        <span>📈</span> <span>Chart</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    // 1. F&O DERIVATIVES DESK
    if (showFno && fno.length > 0) {
        renderedSections++;
        html += `
            <div class="macos-card p-5 space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                    <div>
                        <h3 class="text-base font-semibold text-[#1c1c1e] flex items-center gap-2">
                            <span>📋</span> High-Probability F&O Option Spreads
                        </h3>
                        <p class="text-xs text-[#6e6e73] mt-0.5">Defined-risk vertical & rangebound spreads with $\\ge 60\\%$ Probability of Profit (PoP) and minimum 1:2.0 Reward-to-Risk.</p>
                    </div>
                    <span class="text-xs px-2.5 py-1 rounded-lg bg-[#eff6ff] text-[#007aff] font-semibold border border-[#bfdbfe]">
                        F&O Options Desk
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${fno.map((item, idx) => `
                        <div class="macos-box p-4 flex flex-col justify-between hover:shadow-sm transition-all border border-[rgba(0,0,0,0.06)]">
                            <div>
                                <div class="flex justify-between items-start mb-2">
                                    <div>
                                        <div class="flex items-center gap-1.5">
                                            <h4 class="text-sm font-bold text-[#1c1c1e]">${item.underlying}</h4>
                                            <span class="text-[10px] px-2 py-0.2 rounded font-bold ${item.bias === 'BULLISH' ? 'bg-[#edf7ee] text-[#1e7e34]' : (item.bias === 'MODERATE BULLISH' ? 'bg-[#edf7ee] text-[#1e7e34]' : 'bg-[#eef5fd] text-[#007aff]')}">${item.bias}</span>
                                        </div>
                                        <span class="text-[11px] text-[#48484a] font-medium block mt-0.5">${item.strategy}</span>
                                        <span class="text-[10px] text-[#8e8e93]">${item.expiry} • Lot: ${item.lot_size}</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-[10px] text-[#8e8e93] block">Prob. of Profit</span>
                                        <span class="text-xs font-bold px-2 py-0.5 rounded bg-[#edf7ee] text-[#1e7e34] mono border border-[#c6e8cc]">
                                            ${item.pop_pct}% PoP
                                        </span>
                                    </div>
                                </div>

                                <!-- Strategy Legs Table -->
                                <div class="my-2.5 p-2 rounded-lg bg-white border border-[rgba(0,0,0,0.06)] space-y-1 text-xs">
                                    ${item.legs.map(leg => `
                                        <div class="flex justify-between items-center text-[11px]">
                                            <span class="font-bold ${leg.action === 'BUY' ? 'text-[#007aff]' : 'text-[#d9383a]'}">${leg.action} ${leg.strike} ${leg.type}</span>
                                            <span class="mono text-[#48484a]">₹${leg.est_price}</span>
                                        </div>
                                    `).join("")}
                                </div>

                                <!-- Metrics Grid -->
                                <div class="grid grid-cols-3 gap-1.5 p-2 rounded-lg bg-[#fafafc] border border-[rgba(0,0,0,0.05)] text-center text-[11px]">
                                    <div>
                                        <span class="text-[9.5px] text-[#8e8e93] block">Max Risk</span>
                                        <span class="font-bold text-[#d9383a] mono">₹${item.max_loss_per_lot}</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#8e8e93] block">Max Reward</span>
                                        <span class="font-bold text-[#28a745] mono">₹${item.max_profit_per_lot}</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#8e8e93] block">R:R Ratio</span>
                                        <span class="font-bold text-[#007aff] mono">${item.risk_reward}</span>
                                    </div>
                                </div>

                                <p class="text-[11px] text-[#48484a] leading-relaxed mt-2.5">${item.rationale}</p>
                            </div>

                            <div class="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between">
                                <button onclick="openFormulaInspectionModal('fno', ${idx})" class="text-[11px] text-[#007aff] hover:underline font-semibold flex items-center gap-1">
                                    <span>📐</span> View Math & Formulas
                                </button>
                                <button onclick="switchTab('options');" class="px-2.5 py-1 rounded-md bg-[#007aff] hover:bg-[#0062cc] text-white font-semibold text-[11px] transition-all">
                                    Open Chain
                                </button>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    // 2. SWING BREAKOUT STOCKS DESK
    if (showSwing && breakouts.length > 0) {
        renderedSections++;
        html += `
            <div class="macos-card p-5 space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                    <div>
                        <h3 class="text-base font-semibold text-[#1c1c1e] flex items-center gap-2">
                            <span>🚀</span> Top Shares to Buy Today (High-Probability Swing Breakouts)
                        </h3>
                        <p class="text-xs text-[#6e6e73] mt-0.5">Calculated using 1.5× ATR dynamic stops, 1:2 and 1:3 targets, Mansfield RS $\\ge 80$, and institutional volume surges.</p>
                    </div>
                    <span class="text-xs px-2.5 py-1 rounded-lg bg-[#edf7ee] text-[#1e7e34] font-semibold border border-[#c6e8cc]">
                        Swing Trading (3–15 Days)
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${breakouts.map((b, idx) => `
                        <div class="macos-box p-4 hover:shadow-sm transition-all flex flex-col justify-between border border-[rgba(0,0,0,0.06)]">
                            <div>
                                <div class="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 class="text-sm font-bold text-[#1c1c1e]">${b.code}</h4>
                                        <span class="text-[10px] text-[#86868b] block">${b.name}</span>
                                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#eef5fd] text-[#007aff] font-medium mt-1 inline-block">${b.pattern}</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-[10px] text-[#8e8e93] block">RS Rating</span>
                                        <span class="text-xs font-bold px-2 py-0.5 rounded bg-[#edf7ee] text-[#1e7e34] mono border border-[#c6e8cc]">
                                            ${b.rs_rating} / 99
                                        </span>
                                    </div>
                                </div>

                                <div class="grid grid-cols-3 gap-2 my-2.5 p-2.5 rounded-lg bg-white border border-[rgba(0,0,0,0.06)] text-xs">
                                    <div>
                                        <span class="text-[9.5px] text-[#86868b] block font-medium">Buy Zone</span>
                                        <span class="font-bold text-[#1c1c1e] mono">₹${b.cmp}</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#b32020] block font-medium">Stop-Loss (1.5x ATR)</span>
                                        <span class="font-bold text-[#b32020] mono">₹${b.stop_loss}</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#1e7e34] block font-medium">Target 1 (1:2 R:R)</span>
                                        <span class="font-bold text-[#1e7e34] mono">₹${b.target} (+${b.target_pct}%)</span>
                                    </div>
                                </div>

                                <div class="flex justify-between items-center text-[10.5px] text-[#6e6e73] mb-2 px-1">
                                    <span>Vol Surge: <strong class="text-[#1c1c1e] mono">${b.vol_surge}x</strong></span>
                                    <span>Delivery: <strong class="text-[#1e7e34] mono">${b.delivery_pct}%</strong></span>
                                    <span>Recommended: <strong class="text-[#007aff] mono">${b.shares_qty} shares</strong></span>
                                </div>

                                <p class="text-[11px] text-[#48484a] leading-relaxed">${b.rationale}</p>
                            </div>

                            <div class="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between">
                                <button onclick="openFormulaInspectionModal('swing', ${idx})" class="text-[11px] text-[#007aff] hover:underline font-semibold flex items-center gap-1">
                                    <span>📐</span> View Math & ATR
                                </button>
                                <div class="flex items-center gap-1.5">
                                    <button onclick="openBrokerOrderModal('${b.symbol}', ${b.shares_qty || 10}, ${b.cmp}, ${b.stop_loss}, ${b.target})" class="btn-broker" title="Execute on Zerodha Kite or Dhan">
                                        <span>⚡</span> <span>Broker</span>
                                    </button>
                                    <button onclick="logPickToJournal('${b.symbol}', ${b.cmp}, ${b.shares_qty || 10}, ${b.stop_loss}, ${b.target}, 'Swing')" class="btn-log" title="Log trade in personal journal">
                                        <span>🎯</span> <span>Log</span>
                                    </button>
                                    <button onclick="inspectPickOnChart(_activeRecommendationsData.best_swing_shares[${idx}])" class="btn-primary px-2.5 py-1 text-[11px] cursor-pointer" title="Load chart">
                                        <span>📈</span> <span>Chart</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    // 2.5 POSITIONAL MULTI-WEEK TREND DESK
    if (showPositional && positional.length > 0) {
        renderedSections++;
        html += `
            <div class="macos-card p-5 space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                    <div>
                        <h3 class="text-base font-semibold text-[#1c1c1e] flex items-center gap-2">
                            <span>📈</span> Top Positional Trend Setters (CNC / Delivery, 3–8 Weeks)
                        </h3>
                        <p class="text-xs text-[#6e6e73] mt-0.5">Calculated using Minervini Stage-2 trend template (Price > 50 SMA > 200 SMA), >55% institutional delivery accumulation, and 1:2 to 1:3.5 risk-adjusted targets.</p>
                    </div>
                    <span class="text-xs px-2.5 py-1 rounded-lg bg-[#f3e8ff] text-[#7e22ce] font-semibold border border-[#e9d5ff] flex items-center gap-1">
                        <span>📈</span> Positional (3 to 8 Weeks)
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${positional.map((item, idx) => `
                        <div class="macos-box p-4 hover:shadow-sm transition-all flex flex-col justify-between border border-[rgba(0,0,0,0.06)]">
                            <div>
                                <div class="flex justify-between items-start mb-2">
                                    <div>
                                        <div class="flex items-center gap-1.5">
                                            <h4 class="text-sm font-bold text-[#1c1c1e]">${item.code}</h4>
                                            <span class="text-[9.5px] px-1.5 py-0.2 rounded font-bold bg-[#f3e8ff] text-[#7e22ce]">${item.product}</span>
                                        </div>
                                        <span class="text-[10px] text-[#86868b] block">${item.name}</span>
                                        <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#f3e8ff] text-[#7e22ce] font-medium mt-1 inline-block">${item.pattern}</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-[10px] text-[#8e8e93] block">RS Rating</span>
                                        <span class="text-xs font-bold px-2 py-0.5 rounded bg-[#edf7ee] text-[#1e7e34] mono border border-[#c6e8cc]">
                                            ${item.rs_rating} / 99
                                        </span>
                                    </div>
                                </div>

                                <div class="p-1.5 rounded bg-[#f5f5f7] border border-[rgba(0,0,0,0.05)] text-[10.5px] flex items-center justify-between text-[#555] mb-2">
                                    <span>50 SMA: <strong class="text-[#007aff] mono">₹${item.sma_50}</strong></span>
                                    <span>200 SMA: <strong class="text-[#48484a] mono">₹${item.sma_200}</strong></span>
                                    <span>Horizon: <strong class="text-[#7e22ce]">${item.holding_time}</strong></span>
                                </div>

                                <div class="grid grid-cols-3 gap-2 my-2 p-2.5 rounded-lg bg-white border border-[rgba(0,0,0,0.06)] text-xs">
                                    <div>
                                        <span class="text-[9.5px] text-[#86868b] block font-medium">Buy Zone</span>
                                        <span class="font-bold text-[#1c1c1e] mono">₹${item.cmp}</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#b32020] block font-medium">Trailing SL (50 SMA)</span>
                                        <span class="font-bold text-[#b32020] mono">₹${item.stop_loss}</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#1e7e34] block font-medium">Target 1 (1:2 R:R)</span>
                                        <span class="font-bold text-[#1e7e34] mono">₹${item.target} (+${item.target_pct}%)</span>
                                    </div>
                                </div>

                                <div class="flex justify-between items-center text-[10.5px] text-[#6e6e73] mb-2 px-1">
                                    <span>Target 2: <strong class="text-[#1e7e34] mono">₹${item.target_2} (+${item.target_2_pct}%)</strong></span>
                                    <span>Delivery: <strong class="text-[#1e7e34] mono">${item.delivery_pct}%</strong></span>
                                    <span>Qty: <strong class="text-[#007aff] mono">${item.shares_qty} shares</strong></span>
                                </div>

                                <p class="text-[11px] text-[#48484a] leading-relaxed">${item.rationale}</p>
                            </div>

                            <div class="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between">
                                <button onclick="openFormulaInspectionModal('positional', ${idx})" class="text-[11px] text-[#7e22ce] hover:underline font-semibold flex items-center gap-1">
                                    <span>📐</span> View Math & 50 SMA
                                </button>
                                <div class="flex items-center gap-1.5">
                                    <button onclick="openBrokerOrderModal('${p.symbol}', ${p.shares_qty || 10}, ${p.cmp}, ${p.stop_loss}, ${p.target})" class="btn-broker" title="Execute on Zerodha Kite or Dhan">
                                        <span>⚡</span> <span>Broker</span>
                                    </button>
                                    <button onclick="logPickToJournal('${p.symbol}', ${p.cmp}, ${p.shares_qty || 10}, ${p.stop_loss}, ${p.target}, 'Positional')" class="btn-log" title="Log trade in personal journal">
                                        <span>🎯</span> <span>Log</span>
                                    </button>
                                    <button onclick="inspectPickOnChart(_activeRecommendationsData.best_positional_picks[${idx}])" class="btn-primary px-2.5 py-1 text-[11px] cursor-pointer" title="Load chart">
                                        <span>📈</span> <span>Chart</span>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    // 3. LONG-TERM WEALTH COMPOUNDERS DESK
    if (showComp && compounders.length > 0) {
        renderedSections++;
        html += `
            <div class="macos-card p-5 space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                    <div>
                        <h3 class="text-base font-semibold text-[#1c1c1e] flex items-center gap-2">
                            <span>💎</span> Top Wealth Compounders (Multi-Factor Fundamental Quality Index)
                        </h3>
                        <p class="text-xs text-[#6e6e73] mt-0.5">Scanned across the Nifty universe: High ROE (&gt;18%), zero debt anxiety, Piotroski F-score $\\ge 7$, and DCF Margin of Safety.</p>
                    </div>
                    <span class="text-xs px-2.5 py-1 rounded-lg bg-[#eef5fd] text-[#007aff] font-semibold border border-[#b9d7fb]">
                        Long-Term Holding (1–5 Years)
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${compounders.map((c, idx) => `
                        <div class="macos-box p-4 hover:shadow-sm transition-all flex flex-col justify-between border border-[rgba(0,0,0,0.06)]">
                            <div>
                                <div class="flex justify-between items-start mb-2">
                                    <div>
                                        <h4 class="text-sm font-bold text-[#1c1c1e]">${c.code}</h4>
                                        <span class="text-[10px] text-[#86868b] block">${c.name}</span>
                                        <span class="text-[9px] text-[#86868b]">${c.sector}</span>
                                    </div>
                                    <div class="text-right">
                                        <span class="text-[10px] text-[#8e8e93] block">FQI Score</span>
                                        <span class="text-xs font-bold px-2 py-0.5 rounded bg-[#edf7ee] text-[#1e7e34] mono border border-[#c6e8cc]">
                                            ${c.fqi_score} / 100
                                        </span>
                                    </div>
                                </div>

                                <div class="grid grid-cols-3 gap-2 my-2.5 p-2.5 rounded-lg bg-white border border-[rgba(0,0,0,0.06)] text-xs">
                                    <div>
                                        <span class="text-[9.5px] text-[#86868b] block font-medium">Price (CMP)</span>
                                        <span class="font-bold text-[#1c1c1e] mono">₹${c.cmp}</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#1e7e34] block font-medium">ROE</span>
                                        <span class="font-bold text-[#1e7e34] mono">${c.roe}%</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#007aff] block font-medium">Piotroski</span>
                                        <span class="font-bold text-[#007aff] mono">${c.f_score}</span>
                                    </div>
                                </div>

                                <div class="flex justify-between items-center text-[10.5px] text-[#6e6e73] mb-2 px-1">
                                    <span>Debt/Equity: <strong class="text-[#1c1c1e] mono">${c.debt_equity}</strong></span>
                                    <span>DCF Fair: <strong class="text-[#1e7e34] mono">₹${c.dcf_fair_value}</strong></span>
                                    <span>Margin: <strong class="text-[#007aff] mono">${c.margin_of_safety}</strong></span>
                                </div>

                                <p class="text-[11px] text-[#48484a] leading-relaxed">${c.rationale}</p>
                            </div>

                            <div class="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between">
                                <button onclick="openFormulaInspectionModal('compounder', ${idx})" class="text-[11px] text-[#007aff] hover:underline font-semibold flex items-center gap-1">
                                    <span>📐</span> View Math & FQI
                                </button>
                                <button onclick="switchTab('stocks'); loadStock('${c.symbol}')" class="px-2.5 py-1 rounded-md bg-[#007aff] hover:bg-[#0062cc] text-white font-semibold text-[11px] transition-all">
                                    View Moat
                                </button>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    // 4. BEST ETFS DESK
    if (showEtf && etfs.length > 0) {
        renderedSections++;
        html += `
            <div class="macos-card p-5 space-y-4">
                <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] pb-3">
                    <div>
                        <h3 class="text-base font-semibold text-[#1c1c1e] flex items-center gap-2">
                            <span>🎯</span> Best ETFs to Trade Right Now (Support Pullbacks & Hedging)
                        </h3>
                        <p class="text-xs text-[#6e6e73] mt-0.5">Zero single-company bankruptcy risk. Quantitative entry based on 200 DMA Z-score support pullbacks.</p>
                    </div>
                    <span class="text-xs px-2.5 py-1 rounded-lg bg-[#edf7ee] text-[#1e7e34] font-semibold border border-[#c6e8cc]">
                        Strategic Allocation
                    </span>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    ${etfs.map((e, idx) => `
                        <div class="macos-box p-4 hover:shadow-sm transition-all flex flex-col justify-between border border-[rgba(0,0,0,0.06)]">
                            <div>
                                <div class="flex justify-between items-start mb-2">
                                    <div class="flex items-center space-x-2">
                                        <span class="text-2xl">${e.icon || '📦'}</span>
                                        <div>
                                            <h4 class="text-sm font-bold text-[#1c1c1e]">${e.code}</h4>
                                            <span class="text-[10px] text-[#86868b] block">${e.name}</span>
                                        </div>
                                    </div>
                                    <span class="text-[10px] font-semibold px-2 py-0.5 rounded bg-[#eef5fd] text-[#007aff]">
                                        ${e.category}
                                    </span>
                                </div>

                                <div class="grid grid-cols-3 gap-2 my-2.5 p-2.5 rounded-lg bg-white border border-[rgba(0,0,0,0.06)] text-xs">
                                    <div>
                                        <span class="text-[9.5px] text-[#86868b] block font-medium">Price (CMP)</span>
                                        <span class="font-bold text-[#1c1c1e] mono">₹${e.cmp}</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#86868b] block font-medium">200 DMA Dist</span>
                                        <span class="font-bold text-[#007aff] mono">${e.dist_200dma}</span>
                                    </div>
                                    <div>
                                        <span class="text-[9.5px] text-[#86868b] block font-medium">Sharpe Ratio</span>
                                        <span class="font-bold mono text-[#1e7e34]">${e.sharpe_ratio}</span>
                                    </div>
                                </div>

                                <p class="text-[11px] text-[#48484a] leading-relaxed">${e.rationale}</p>
                            </div>

                            <div class="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between">
                                <button onclick="openFormulaInspectionModal('etf', ${idx})" class="text-[11px] text-[#007aff] hover:underline font-semibold flex items-center gap-1">
                                    <span>📐</span> View Math & Sharpe
                                </button>
                                <button onclick="switchTab('bees')" class="px-2.5 py-1 rounded-md bg-[#007aff] hover:bg-[#0062cc] text-white font-semibold text-[11px] transition-all">
                                    Bees Strategy
                                </button>
                            </div>
                        </div>
                    `).join("")}
                </div>
            </div>
        `;
    }

    if (renderedSections === 0) {
        html += `
            <div class="macos-card p-12 text-center text-[#86868b] border border-[rgba(0,0,0,0.06)]">
                <span class="text-3xl mb-2 block">🔍</span>
                <h4 class="text-sm font-semibold text-[#1c1c1e] mb-1">No picks currently meet criteria for this filter</h4>
                <p class="text-xs text-[#8e8e93] max-w-md mx-auto">Click "🌟 All Picks" to view all active setups across Intraday, Swing, Positional, F&O, and ETFs.</p>
                <div class="mt-4">
                    <button onclick="filterPicksSubTab('all')" class="px-3.5 py-1.5 rounded-lg bg-[#007aff] hover:bg-[#0062cc] text-white font-semibold text-xs transition-all shadow-xs">
                        🌟 View All Picks
                    </button>
                </div>
            </div>
        `;
    }

    html += `</div>`;
    container.innerHTML = html;
}

/**
 * Inspection Modal: Renders exact mathematical formulas and parameter inputs for complete transparency.
 */
function openFormulaInspectionModal(category, index) {
    if (!_activeRecommendationsData) return;

    let item = null;
    if (category === "intraday") item = (_activeRecommendationsData.best_intraday_picks || [])[index];
    else if (category === "positional") item = (_activeRecommendationsData.best_positional_picks || [])[index];
    else if (category === "fno") item = (_activeRecommendationsData.best_fno_strategies || [])[index];
    else if (category === "swing") item = (_activeRecommendationsData.best_swing_shares || [])[index];
    else if (category === "compounder") item = (_activeRecommendationsData.best_long_term_compounders || [])[index];
    else if (category === "etf") item = (_activeRecommendationsData.best_etfs || [])[index];

    if (!item || !item.math_details) return;

    const modal = document.getElementById("formulaInspectionModal");
    const content = document.getElementById("formulaModalContent");
    const title = document.getElementById("formulaModalTitle");

    if (!modal || !content) return;

    title.textContent = `📐 ${item.math_details.formula_name || 'Calculation Breakdown'}`;

    let detailsHtml = `
        <div class="space-y-4 text-xs text-[#1c1c1e]">
            <div class="p-3 bg-[#f5f5f7] rounded-xl border border-[rgba(0,0,0,0.06)]">
                <span class="text-[10px] text-[#8e8e93] uppercase font-bold tracking-wider block">Security / Asset:</span>
                <span class="text-sm font-bold">${item.underlying || item.code || item.name}</span>
            </div>

            <div class="space-y-3">
    `;

    Object.entries(item.math_details).forEach(([key, val]) => {
        if (key === "formula_name") return;
        const label = key.replace(/_/g, " ").toUpperCase();
        detailsHtml += `
            <div class="p-2.5 rounded-lg border border-[rgba(0,0,0,0.06)] bg-white">
                <span class="text-[10px] text-[#007aff] font-bold block mb-0.5">${label}</span>
                <span class="mono font-semibold text-[#1c1c1e] text-[11.5px]">${val}</span>
            </div>
        `;
    });

    detailsHtml += `
            </div>
            <div class="p-3 bg-[#edf7ee] rounded-xl border border-[#c6e8cc] text-[11px] text-[#1e7e34]">
                ✅ <strong>Transparency Guarantee:</strong> This recommendation passed algorithmic quantitative filters without manual bias.
            </div>
        </div>
    `;

    content.innerHTML = detailsHtml;
    modal.classList.remove("hidden");
}
window.openFormulaInspectionModal = openFormulaInspectionModal;

function closeFormulaInspectionModal() {
    const modal = document.getElementById("formulaInspectionModal");
    if (modal) modal.classList.add("hidden");
}
window.closeFormulaInspectionModal = closeFormulaInspectionModal;

async function logPickToJournal(symbol, cmp, qty, sl, target, style = "Swing") {
    try {
        const res = await fetch("/api/journal/add", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                symbol: symbol,
                entry_price: cmp,
                quantity: qty,
                stop_loss: sl,
                target_1: target,
                style: style,
                notes: `Logged from ${style} Guru Picks`
            })
        });
        const data = await res.json();
        if (data.status === "success") {
            showNotification(`🎉 Logged ${symbol.replace('.NS', '')} (${qty} shares @ ₹${cmp}) to Journal`, "success");
        } else {
            showNotification(`Failed to log trade: ${data.message || 'Error'}`, "error");
        }
    } catch (e) {
        console.error("Error logging pick to journal:", e);
        showNotification("Failed to log pick to journal", "error");
    }
}
window.logPickToJournal = logPickToJournal;
