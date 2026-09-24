/**
 * Trade Journal & Performance Client.
 */

let _lastActiveTrades = [];
let _activePortfolioSummary = null;
let _activeFilter = "all"; // 'all', 'gainers', 'losers', 'etfs', 'stocks'
let _activeSortCol = "pnl";
let _activeSortAsc = false;
let _journalEquityChart = null;

async function loadTradeJournal() {
    try {
        const [activeRes, analyticsRes, riskRes, etfStatusRes, statsRes, diagRes] = await Promise.all([
            fetch("/api/journal/active").then(r => r.json()).catch(() => null),
            fetch("/api/journal/analytics").then(r => r.json()).catch(() => null),
            fetch("/api/portfolio/risk").then(r => r.json()).catch(() => null),
            fetch("/api/etf/journal-status").then(r => r.json()).catch(() => null),
            fetch("/api/journal/stats").then(r => r.json()).catch(() => null),
            fetch("/api/journal/diagnostics").then(r => r.json()).catch(() => null)
        ]);

        if (activeRes && activeRes.status === "success") {
            _lastActiveTrades = activeRes.trades || [];
            _activePortfolioSummary = activeRes.portfolio_summary || null;
            renderActiveTrades(_lastActiveTrades, _activePortfolioSummary);
        } else {
            renderActiveTrades([], null);
        }

        if (analyticsRes && analyticsRes.status === "success") {
            renderJournalAnalytics(analyticsRes);
        }

        if (riskRes && riskRes.status === "success") {
            renderPortfolioRiskRadar(riskRes);
        }

        if (diagRes && diagRes.status === "success") {
            renderTraderDiagnostics(diagRes);
        }

        if (etfStatusRes && etfStatusRes.status === "success") {
            renderJournalEtfRebalance(etfStatusRes);
        }

        if (statsRes && statsRes.status === "success" && statsRes.stats) {
            renderClosedTrades(statsRes.stats.closed_history || []);
        } else {
            renderClosedTrades([]);
        }
    } catch (e) {
        console.error("Error loading journal:", e);
    }
}

function renderPortfolioRiskRadar(risk) {
    if (!risk) return;

    const badge = document.getElementById("portfolioRiskRatingBadge");
    const investedEl = document.getElementById("riskTotalInvested");
    const riskEl = document.getElementById("riskTotalOpenRisk");
    const warnContainer = document.getElementById("portfolioRiskWarningsContainer");
    const sectorContainer = document.getElementById("riskSectorBarsContainer");
    const stockContainer = document.getElementById("riskStockBarsContainer");
    const macroHedgeDetails = document.getElementById("macroHedgeDetails");
    const macroHedgeTargetVal = document.getElementById("macroHedgeTargetVal");

    if (badge) {
        badge.textContent = risk.risk_badge || risk.risk_rating;
        badge.style.backgroundColor = `${risk.risk_color}18`;
        badge.style.color = risk.risk_color;
        badge.style.borderColor = `${risk.risk_color}40`;
    }

    if (investedEl) investedEl.textContent = `₹${(risk.total_invested || 0).toLocaleString("en-IN")}`;
    if (riskEl) riskEl.textContent = `₹${(risk.total_open_risk || 0).toLocaleString("en-IN")} (${risk.portfolio_risk_pct}%)`;

    // Warnings
    if (warnContainer) {
        if (risk.warnings && risk.warnings.length > 0) {
            warnContainer.classList.remove("hidden");
            warnContainer.innerHTML = risk.warnings.map(w => `
                <div class="p-2.5 rounded-xl border ${w.severity === 'high' ? 'bg-rose-50/70 border-rose-200 text-rose-800' : 'bg-amber-50/70 border-amber-200 text-amber-800'} text-xs flex items-center gap-2">
                    <span class="text-sm">${w.severity === 'high' ? '🚨' : '⚠️'}</span>
                    <span class="font-medium">${w.message}</span>
                </div>
            `).join("");
        } else {
            warnContainer.classList.add("hidden");
            warnContainer.innerHTML = "";
        }
    }

    // Sector breakdown
    if (sectorContainer) {
        if (!risk.sector_breakdown || risk.sector_breakdown.length === 0) {
            sectorContainer.innerHTML = `<div class="text-[11px] text-[#8e8e93]">No active positions.</div>`;
        } else {
            sectorContainer.innerHTML = risk.sector_breakdown.map(s => {
                const isOver = s.percentage > 25.0;
                return `
                    <div class="space-y-1">
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-[#1c1c1e] font-semibold">${s.sector}</span>
                            <span class="mono font-bold ${isOver ? 'text-rose-600' : 'text-[#007aff]'}">
                                ${s.percentage}% (₹${s.market_value.toLocaleString('en-IN')})
                            </span>
                        </div>
                        <div class="w-full bg-[#e5e5ea] rounded-full h-1.5 overflow-hidden">
                            <div class="h-1.5 rounded-full ${isOver ? 'bg-rose-500' : 'bg-[#007aff]'}" style="width: ${Math.min(100, s.percentage)}%"></div>
                        </div>
                    </div>
                `;
            }).join("");
        }
    }

    // Stock allocation
    if (stockContainer) {
        if (!risk.stock_allocations || risk.stock_allocations.length === 0) {
            stockContainer.innerHTML = `<div class="text-[11px] text-[#8e8e93]">No active positions.</div>`;
        } else {
            stockContainer.innerHTML = risk.stock_allocations.map(st => {
                const isOver = st.allocation_pct > 15.0;
                return `
                    <div class="space-y-1">
                        <div class="flex justify-between items-center text-xs">
                            <span class="text-[#1c1c1e] font-semibold">${st.code}</span>
                            <span class="mono font-bold ${isOver ? 'text-rose-600' : 'text-emerald-700'}">
                                ${st.allocation_pct}% (₹${st.market_value.toLocaleString('en-IN')})
                            </span>
                        </div>
                        <div class="w-full bg-[#e5e5ea] rounded-full h-1.5 overflow-hidden">
                            <div class="h-1.5 rounded-full ${isOver ? 'bg-rose-500' : 'bg-emerald-500'}" style="width: ${Math.min(100, st.allocation_pct)}%"></div>
                        </div>
                    </div>
                `;
            }).join("");
        }
    }

    // Macro Precious Metals Hedge
    if (macroHedgeDetails && risk.macro_hedge) {
        const mh = risk.macro_hedge;
        if (macroHedgeTargetVal) {
            const totHedge = (mh.gold_hedge_value_inr || 0) + (mh.silver_hedge_value_inr || 0);
            macroHedgeTargetVal.textContent = `₹${Math.round(totHedge).toLocaleString('en-IN')} Total Protective Allocation`;
        }
        macroHedgeDetails.innerHTML = `
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <div class="macos-box p-2.5 flex items-center justify-between">
                    <div>
                        <div class="font-bold text-[#1c1c1e] text-xs">🟡 GOLDBEES.NS (Gold ETF)</div>
                        <div class="text-[10px] text-[#6e6e73]">Allocation: ₹${Math.round(mh.gold_hedge_value_inr || 0).toLocaleString('en-IN')}</div>
                    </div>
                    <div class="text-right">
                        <span class="mono text-xs font-bold text-amber-700 dark:text-amber-400">${mh.suggested_goldbees_units || 0} Units</span>
                        <span class="text-[9.5px] text-[#8e8e93] block">~15% of Equity</span>
                    </div>
                </div>
                <div class="macos-box p-2.5 flex items-center justify-between">
                    <div>
                        <div class="font-bold text-[#1c1c1e] text-xs">⚪ SILVERBEES.NS (Silver ETF)</div>
                        <div class="text-[10px] text-[#6e6e73]">Allocation: ₹${Math.round(mh.silver_hedge_value_inr || 0).toLocaleString('en-IN')}</div>
                    </div>
                    <div class="text-right">
                        <span class="mono text-xs font-bold text-slate-700 dark:text-slate-300">${mh.suggested_silverbees_units || 0} Units</span>
                        <span class="text-[9.5px] text-[#8e8e93] block">~5% of Equity</span>
                    </div>
                </div>
            </div>
            <p class="text-[10.5px] text-[#6e6e73] mt-2 italic">${mh.hedge_rationale || ''}</p>
        `;
    }
}

function renderTraderDiagnostics(diag) {
    const card = document.getElementById("traderDiagnosticsCard");
    const container = document.getElementById("traderDiagnosticsContent");
    const badge = document.getElementById("dispositionBadge");
    if (!card || !container || !diag) return;

    const winHold = diag.avg_winner_hold_days || 0;
    const loseHold = diag.avg_loser_hold_days || 0;
    const activeHold = diag.avg_active_hold_days || 0;
    const exitEff = diag.avg_exit_efficiency_pct !== undefined ? diag.avg_exit_efficiency_pct : 100;
    
    // Disposition Effect check
    let dispositionStatus = "Surveillance Active";
    let badgeClass = "bg-blue-50 text-blue-700 border-blue-200";
    if (winHold > 0 && loseHold > winHold * 1.5) {
        dispositionStatus = "⚠️ Disposition Risk (Holding Losers Too Long)";
        badgeClass = "bg-rose-50 text-rose-700 border-rose-200";
    } else if (winHold > 0 && loseHold > 0 && loseHold <= winHold) {
        dispositionStatus = "✅ Healthy Execution (Cutting Losers Faster)";
        badgeClass = "bg-emerald-50 text-emerald-700 border-emerald-200";
    }

    if (badge) {
        badge.textContent = dispositionStatus;
        badge.className = `px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${badgeClass}`;
    }

    const nudgesHtml = (diag.behavioral_nudges || []).map(n => `
        <div class="p-3 rounded-xl border ${n.type === 'warning' ? 'bg-amber-50/70 border-amber-200 text-amber-900' : 'bg-blue-50/70 border-blue-200 text-blue-900'} text-xs flex items-start gap-2.5">
            <span class="text-base flex-shrink-0 mt-0.5">${n.icon || '💡'}</span>
            <div>
                <span class="font-bold block">${n.title}</span>
                <span class="text-[11px] opacity-90 leading-relaxed mt-0.5 block">${n.message}</span>
            </div>
        </div>
    `).join("");

    container.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div class="macos-box p-3">
                <span class="text-[10.5px] text-[#6e6e73] font-medium block">Avg Hold (Winners)</span>
                <span class="mono text-base font-bold text-emerald-700 block mt-0.5">${winHold > 0 ? winHold + ' Days' : '—'}</span>
                <span class="text-[9.5px] text-[#8e8e93]">Letting winners run</span>
            </div>
            <div class="macos-box p-3">
                <span class="text-[10.5px] text-[#6e6e73] font-medium block">Avg Hold (Losers)</span>
                <span class="mono text-base font-bold ${loseHold > winHold && winHold > 0 ? 'text-rose-600' : 'text-[#1c1c1e]'} block mt-0.5">${loseHold > 0 ? loseHold + ' Days' : '—'}</span>
                <span class="text-[9.5px] text-[#8e8e93]">Cutting losses quickly</span>
            </div>
            <div class="macos-box p-3">
                <span class="text-[10.5px] text-[#6e6e73] font-medium block">Active Portfolio Age</span>
                <span class="mono text-base font-bold text-[#007aff] block mt-0.5">${activeHold} Days</span>
                <span class="text-[9.5px] text-[#8e8e93]">${diag.total_active_trades || 0} active positions</span>
            </div>
            <div class="macos-box p-3">
                <span class="text-[10.5px] text-[#6e6e73] font-medium block">Exit Target Efficiency</span>
                <span class="mono text-base font-bold text-[#1c1c1e] block mt-0.5">${exitEff}%</span>
                <span class="text-[9.5px] text-[#8e8e93]">Captured vs Target 1</span>
            </div>
        </div>

        ${nudgesHtml ? `<div class="space-y-2 pt-1">${nudgesHtml}</div>` : ''}
    `;
}

function renderJournalEtfRebalance(status) {
    const container = document.getElementById("journalEtfRebalanceContainer");
    if (!container || !status) return;

    const actual = status.actual_allocation || {};
    const target = status.target_allocation || {};
    const shift = status.shift_recommendation || {};
    const regime = status.market_regime || {};

    let shiftActionHtml = "";
    if (shift.can_shift) {
        shiftActionHtml = `
            <button onclick="executeJournalEtfShift('${shift.from_symbol}', '${shift.action_symbol}', ${shift.suggested_price})"
                class="btn-primary px-3.5 py-1.5 text-xs flex items-center gap-1.5 shadow-sm whitespace-nowrap cursor-pointer">
                <span>🔄</span> <span>${shift.action_text}</span>
            </button>
        `;
    } else if (shift.signal === "NO_ETF_HOLDINGS") {
        shiftActionHtml = `
            <div class="flex items-center gap-2">
                <button onclick="takeTradeFromScanner('NIFTYBEES.NS', ${regime.nifty_price || 272}, 50, ${((regime.nifty_price || 272) * 0.94).toFixed(2)}, ${((regime.nifty_price || 272) * 1.15).toFixed(2)})"
                    class="px-2.5 py-1 rounded-lg bg-[#28a745] hover:bg-[#1e7e34] text-white text-[11px] font-semibold cursor-pointer">
                    + Log NIFTYBEES
                </button>
                <button onclick="takeTradeFromScanner('GOLDBEES.NS', ${regime.gold_price || 126}, 100, ${((regime.gold_price || 126) * 0.94).toFixed(2)}, ${((regime.gold_price || 126) * 1.15).toFixed(2)})"
                    class="px-2.5 py-1 rounded-lg bg-[#b35900] hover:bg-[#8a4500] text-white text-[11px] font-semibold cursor-pointer">
                    + Log GOLDBEES
                </button>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="macos-card p-4 space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[rgba(0,0,0,0.06)] pb-2.5">
                <div class="flex items-center gap-2">
                    <span class="text-base">⚖️</span>
                    <h3 class="text-xs font-bold text-[#1c1c1e] uppercase tracking-wider">My Journal ETF Allocation & Shift Advisor</h3>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[10px] px-2 py-0.5 rounded font-bold" style="background-color: ${shift.badge_color}18; color: ${shift.badge_color}; border: 1px solid ${shift.badge_color}40;">
                        ${shift.badge || 'Regime Tracker'}
                    </span>
                    <button onclick="switchTab('bees')" class="text-[11px] text-[#007aff] font-semibold hover:underline flex items-center gap-0.5">
                        <span>Bees Strategy Desk</span> <span>→</span>
                    </button>
                </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-12 gap-3 text-xs">
                <!-- Current ETF Breakdown -->
                <div class="md:col-span-6 p-3 rounded-xl bg-[#f8f8fa] border border-[rgba(0,0,0,0.04)] space-y-2">
                    <div class="flex justify-between items-center text-[11px]">
                        <span class="font-bold text-[#48484a]">Journal ETF Portfolio Value:</span>
                        <span class="font-bold mono text-[#1c1c1e]">${formatINR(status.total_etf_value || 0)}</span>
                    </div>

                    <!-- Progress Multi-bar -->
                    <div class="w-full bg-[#e5e5ea] rounded-full h-2.5 overflow-hidden flex">
                        <div class="bg-[#007aff] h-full transition-all" style="width: ${actual.equity_pct || 0}%" title="Equity ETFs: ${actual.equity_pct}%"></div>
                        <div class="bg-[#ff9500] h-full transition-all" style="width: ${actual.gold_pct || 0}%" title="Gold ETFs: ${actual.gold_pct}%"></div>
                        <div class="bg-[#34c759] h-full transition-all" style="width: ${actual.liquid_pct || 0}%" title="Liquid ETFs: ${actual.liquid_pct}%"></div>
                    </div>

                    <div class="flex justify-between items-center text-[10.5px] mono pt-0.5">
                        <span class="text-[#007aff] font-semibold">📈 Equity: ${actual.equity_pct || 0}% (${formatINR(actual.equity_val || 0)})</span>
                        <span class="text-[#ff9500] font-semibold">🥇 Gold: ${actual.gold_pct || 0}% (${formatINR(actual.gold_val || 0)})</span>
                        <span class="text-[#34c759] font-semibold">🛡️ Cash: ${actual.liquid_pct || 0}%</span>
                    </div>
                </div>

                <!-- Shift Guidance & Action -->
                <div class="md:col-span-6 p-3 rounded-xl ${shift.can_shift ? 'bg-[#edf7ee] border border-[#c3e6cb]' : 'bg-[#f8f8fa] border border-[rgba(0,0,0,0.04)]'} flex flex-col justify-between">
                    <div>
                        <div class="font-bold text-[11.5px] text-[#1c1c1e]">${shift.title || 'Optimal Allocation'}</div>
                        <p class="text-[11px] text-[#6e6e73] mt-1 leading-relaxed">${shift.description || 'Your ETF allocation is monitored against live market regimes.'}</p>
                    </div>
                    <div class="mt-2.5 flex justify-end">
                        ${shiftActionHtml}
                    </div>
                </div>
            </div>
        </div>
    `;
}

function setJournalFilter(filter) {
    _activeFilter = filter;
    renderActiveTrades(_lastActiveTrades, _activePortfolioSummary);
}
window.setJournalFilter = setJournalFilter;

function toggleJournalSort(col) {
    if (_activeSortCol === col) {
        _activeSortAsc = !_activeSortAsc;
    } else {
        _activeSortCol = col;
        _activeSortAsc = false;
    }
    renderActiveTrades(_lastActiveTrades, _activePortfolioSummary);
}
window.toggleJournalSort = toggleJournalSort;

function renderActiveTrades(trades, summary) {
    const container = document.getElementById("activeTradesTableContainer");
    if (!container) return;

    if (!trades || !trades.length) {
        container.innerHTML = `
            <div class="p-8 text-center text-[#86868b] text-xs space-y-3">
                <p>No active open positions in the journal. Take a trade from the Scanner or Stock Analysis!</p>
                <div class="flex items-center justify-center gap-2">
                    <button onclick="openManualTradeModal()" class="btn-primary text-xs px-3.5 py-1.5 cursor-pointer">
                        + Add Position Manually
                    </button>
                    <button onclick="openImportTradesModal()" class="btn-secondary text-xs px-3.5 py-1.5 cursor-pointer">
                        📥 Import Trades from CSV / Excel
                    </button>
                </div>
            </div>`;
        return;
    }

    // Fallback summary if not passed from API
    if (!summary) {
        let inv = 0, cur = 0, slRisk = 0;
        let gainers = 0, losers = 0, etfs = 0, stocks = 0;
        trades.forEach(t => {
            const cost = (t.entry_price || 0) * (t.quantity || 1);
            const val = (t.current_price || t.entry_price || 0) * (t.quantity || 1);
            inv += cost;
            cur += val;
            if (t.stop_loss && t.stop_loss > 0 && t.stop_loss < t.current_price) {
                slRisk += (t.current_price - t.stop_loss) * t.quantity;
            }
            if ((t.pnl || 0) > 0) gainers++; else losers++;
            if (t.style === 'ETF' || (t.code && (t.code.includes('BEES') || t.code.includes('ETF')))) etfs++; else stocks++;
        });
        const unPnl = cur - inv;
        summary = {
            total_invested: inv,
            total_current_value: cur,
            total_unrealized_pnl: unPnl,
            unrealized_pnl_pct: inv > 0 ? (unPnl / inv) * 100 : 0,
            total_open_risk: slRisk,
            gainers_count: gainers,
            losers_count: losers,
            etf_count: etfs,
            stock_count: stocks
        };
    }

    const totalInvested = summary.total_invested || 0;
    const currentVal = summary.total_current_value || 0;
    const unrealizedPnl = summary.total_unrealized_pnl || 0;
    const unrealizedPct = (summary.unrealized_pnl_pct !== undefined ? summary.unrealized_pnl_pct : (totalInvested > 0 ? (unrealizedPnl / totalInvested) * 100 : 0)).toFixed(2);
    const isProfit = unrealizedPnl >= 0;
    const pnlSign = isProfit ? '+' : '';
    const pnlBg = isProfit ? 'bg-[#edf7ee] border-[#c3e6cb]' : 'bg-[#fdf0f0] border-[#f5c6cb]';
    const pnlTextColor = isProfit ? 'text-[#1e7e34]' : 'text-[#b32020]';
    const pnlLabelColor = isProfit ? 'text-[#1e7e34]' : 'text-[#b32020]';

    // Counts for filter pills
    const allCount = trades.length;
    const gainersCount = trades.filter(t => (t.pnl || 0) > 0).length;
    const losersCount = trades.filter(t => (t.pnl || 0) <= 0).length;
    const etfCount = trades.filter(t => (t.style === 'ETF' || (t.code && (t.code.includes('BEES') || t.code.includes('ETF'))))).length;
    const stockCount = allCount - etfCount;

    // Filter
    let filtered = [...trades];
    if (_activeFilter === 'gainers') filtered = filtered.filter(t => (t.pnl || 0) > 0);
    else if (_activeFilter === 'losers') filtered = filtered.filter(t => (t.pnl || 0) <= 0);
    else if (_activeFilter === 'etfs') filtered = filtered.filter(t => (t.style === 'ETF' || (t.code && (t.code.includes('BEES') || t.code.includes('ETF')))));
    else if (_activeFilter === 'stocks') filtered = filtered.filter(t => !(t.style === 'ETF' || (t.code && (t.code.includes('BEES') || t.code.includes('ETF')))));

    // Sort
    filtered.sort((a, b) => {
        let valA = a[_activeSortCol] !== undefined ? a[_activeSortCol] : '';
        let valB = b[_activeSortCol] !== undefined ? b[_activeSortCol] : '';
        if (typeof valA === 'string') return _activeSortAsc ? valA.localeCompare(valB) : valB.localeCompare(valA);
        return _activeSortAsc ? (Number(valA) - Number(valB)) : (Number(valB) - Number(valA));
    });

    const sortIcon = (col) => _activeSortCol === col ? (_activeSortAsc ? ' <span class="text-[#007aff]">▲</span>' : ' <span class="text-[#007aff]">▼</span>') : ' <span class="text-[#c7c7cc] opacity-60">⇅</span>';

    const rowsHtml = filtered.map(t => {
        const rowProfit = (t.pnl || 0) >= 0;
        const rowPnlColor = rowProfit ? "text-[#1e7e34]" : "text-[#b32020]";
        const rowPnlBg    = rowProfit ? "bg-[#edf7ee] border-[#c3e6cb]" : "bg-[#fdf0f0] border-[#f5c6cb]";
        const manualBadge = t.is_manual ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-[#eef5fd] text-[#007aff] border border-[#b9d7fb] ml-1">Manual</span>` : "";
        const styleBadge = t.style === "ETF" ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-[#fef6ed] text-[#8a4500] border border-[#fed7aa] ml-1">ETF</span>` : "";
        const slDisplay = (t.stop_loss && t.stop_loss > 0) ? `₹${formatINR(t.stop_loss)}` : `<span class="text-[#8e8e93] italic">Not Set</span>`;
        const t1Display = (t.target_1 && t.target_1 > 0) ? `₹${formatINR(t.target_1)}` : `<span class="text-[#8e8e93] italic">Not Set</span>`;

        return `
            <tr class="border-b border-[rgba(0,0,0,0.06)] hover:bg-[#f5f5f7] transition-colors text-xs">
                <td class="py-3 px-3 text-col">
                    <div class="font-bold text-[#1c1c1e] flex items-center">${t.code}${styleBadge}${manualBadge}</div>
                    <span class="text-[10px] text-[#86868b]">${t.entry_date || '—'}</span>
                </td>
                <td class="py-3 px-3 num-col text-[#6e6e73]">₹${formatINR(t.entry_price || 0)}</td>
                <td class="py-3 px-3 num-col font-semibold text-[#1c1c1e]">₹${formatINR(t.current_price || 0)}</td>
                <td class="py-3 px-3 num-col text-[#6e6e73] font-semibold">${t.quantity}</td>
                <td class="py-3 px-3 num-col text-[#b32020] font-medium">${slDisplay}</td>
                <td class="py-3 px-3 num-col text-[#1e7e34] font-medium">${t1Display}</td>
                <td class="py-3 px-3 num-col font-bold">
                    <span class="inline-block px-2 py-1 rounded-lg border text-xs ${rowPnlBg} ${rowPnlColor}">
                        ${t.pnl > 0 ? '+' : ''}₹${formatINR(t.pnl || 0)}
                        <span class="text-[10px] block font-normal">(${t.pnl_pct > 0 ? '+' : ''}${t.pnl_pct}%)</span>
                    </span>
                </td>
                <td class="py-3 px-3 badge-col">
                    <div class="flex items-center gap-1.5 justify-center flex-wrap">
                        <button onclick="selectSearchedStock('${t.symbol}')" class="btn-chart" title="Analyze chart">
                            <span>📈</span> <span>Chart</span>
                        </button>
                        <button onclick="getPositionAdvice('${t.id}', '${t.symbol}', ${t.entry_price}, ${t.quantity}, ${t.current_price})"
                            class="px-2 py-1 rounded-md bg-[#eef5fd] text-[#007aff] border border-[#b9d7fb] hover:bg-[#007aff] hover:text-white transition-all text-[10.5px] font-semibold whitespace-nowrap cursor-pointer" title="AI Positioning Advice">
                            🧠 Advice
                        </button>
                        <button onclick="openEditTradeModal('${t.id}')"
                            class="px-2 py-1 rounded-md bg-[#f5f5f7] text-[#1c1c1e] border border-[rgba(0,0,0,0.12)] hover:bg-[#e5e5ea] transition-all text-[10.5px] font-semibold whitespace-nowrap cursor-pointer" title="Edit Entry, SL, Target, Notes">
                            ✏️ Edit
                        </button>
                        <button onclick="openCloseTradeModal('${t.id}', ${t.current_price})"
                            class="px-2 py-1 rounded-md bg-[#fdf0f0] text-[#b32020] border border-[#f5c6cb] hover:bg-[#b32020] hover:text-white transition-all text-[10.5px] font-semibold whitespace-nowrap cursor-pointer" title="Close or Partial Scale-Out">
                            Close
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");

    container.innerHTML = `
        <div class="space-y-4">
            <!-- 1. ACTIVE PORTFOLIO OVERVIEW KPI BANNER -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div class="p-3.5 rounded-xl bg-white border border-[rgba(0,0,0,0.08)] text-center shadow-xs">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-semibold">Total Invested</span>
                    <span class="text-xl font-bold mono text-[#1c1c1e] block mt-0.5">₹${formatNumber(totalInvested, 2)}</span>
                    <span class="text-[10.5px] text-[#6e6e73] font-medium">${trades.length} Active Positions</span>
                </div>
                <div class="p-3.5 rounded-xl bg-white border border-[rgba(0,0,0,0.08)] text-center shadow-xs">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-semibold">Current Market Value</span>
                    <span class="text-xl font-bold mono text-[#007aff] block mt-0.5">₹${formatNumber(currentVal, 2)}</span>
                    <span class="text-[10.5px] text-[#6e6e73] font-medium">Real-Time MTM Value</span>
                </div>
                <div class="p-3.5 rounded-xl border ${pnlBg} text-center shadow-xs">
                    <span class="text-[10px] ${pnlLabelColor} uppercase tracking-wider block font-semibold">Net Unrealized P&amp;L</span>
                    <span class="text-xl font-bold mono ${pnlTextColor} block mt-0.5">${pnlSign}₹${formatNumber(unrealizedPnl, 2)}</span>
                    <span class="text-[10.5px] font-bold ${pnlTextColor}">${pnlSign}${unrealizedPct}% Total Return</span>
                </div>
                <div class="p-3.5 rounded-xl bg-white border border-[rgba(0,0,0,0.08)] text-center shadow-xs">
                    <span class="text-[10px] text-[#86868b] uppercase tracking-wider block font-semibold">Open Capital at Risk (SL)</span>
                    <span class="text-xl font-bold mono text-[#b32020] block mt-0.5">₹${formatNumber(summary.total_open_risk || 0, 2)}</span>
                    <span class="text-[10.5px] text-[#6e6e73] font-medium">Exposed to Stop Loss</span>
                </div>
            </div>

            <!-- 2. QUICK FILTERS & TOOLBAR -->
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] pb-3">
                <!-- Filter Pills -->
                <div class="flex items-center gap-1.5 flex-wrap text-xs">
                    <button onclick="setJournalFilter('all')" class="px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${_activeFilter === 'all' ? 'bg-[#007aff] text-white shadow-sm' : 'bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#48484a]'}">
                        All (${allCount})
                    </button>
                    <button onclick="setJournalFilter('gainers')" class="px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${_activeFilter === 'gainers' ? 'bg-[#1e7e34] text-white shadow-sm' : 'bg-[#edf7ee] hover:bg-[#d4edda] text-[#1e7e34]'}">
                        🟢 Gainers (${gainersCount})
                    </button>
                    <button onclick="setJournalFilter('losers')" class="px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${_activeFilter === 'losers' ? 'bg-[#b32020] text-white shadow-sm' : 'bg-[#fdf0f0] hover:bg-[#f8d7da] text-[#b32020]'}">
                        🔴 Drawdown (${losersCount})
                    </button>
                    <button onclick="setJournalFilter('etfs')" class="px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${_activeFilter === 'etfs' ? 'bg-[#f59e0b] text-white shadow-sm' : 'bg-[#fef6ed] hover:bg-[#fed7aa] text-[#8a4500]'}">
                        ⚖️ ETFs (${etfCount})
                    </button>
                    <button onclick="setJournalFilter('stocks')" class="px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${_activeFilter === 'stocks' ? 'bg-[#5856d6] text-white shadow-sm' : 'bg-[#f3f0fc] hover:bg-[#e3dcf7] text-[#5856d6]'}">
                        📈 Equities (${stockCount})
                    </button>
                </div>

                <!-- Action Toolbar -->
                <div class="flex items-center gap-2 flex-wrap text-xs">
                    <button onclick="triggerAutoRiskShield()" title="Automatically compute and set ATR/Technical Stop Loss and Targets for open positions" class="px-3 py-1.5 rounded-lg font-semibold bg-[#eef5fd] hover:bg-[#007aff] hover:text-white text-[#007aff] border border-[#b9d7fb] transition-all flex items-center gap-1 cursor-pointer">
                        <span>🛡️</span> <span>Auto-Risk Shield</span>
                    </button>
                    <button onclick="openImportTradesModal()" title="Import trades from Excel or CSV" class="px-3 py-1.5 rounded-lg font-semibold bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#48484a] border border-[rgba(0,0,0,0.08)] transition-all flex items-center gap-1 cursor-pointer">
                        <span>📥</span> <span>Import</span>
                    </button>
                    <button onclick="exportJournalToCSV()" title="Download tax-compliant CSV" class="px-3 py-1.5 rounded-lg font-semibold bg-[#f5f5f7] hover:bg-[#e5e5ea] text-[#48484a] border border-[rgba(0,0,0,0.08)] transition-all flex items-center gap-1 cursor-pointer">
                        <span>📤</span> <span>Export CSV</span>
                    </button>
                </div>
            </div>

            <!-- 3. SORTABLE ACTIVE POSITIONS TABLE -->
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr class="bg-[#f5f5f7] text-[#6e6e73] text-[11px] uppercase font-semibold tracking-wider border-b border-[rgba(0,0,0,0.08)] select-none">
                            <th onclick="toggleJournalSort('code')" class="py-2.5 px-3 text-col cursor-pointer hover:bg-[#e5e5ea] transition-all" title="Click to sort by Stock">Stock${sortIcon('code')}</th>
                            <th onclick="toggleJournalSort('entry_price')" class="py-2.5 px-3 num-col cursor-pointer hover:bg-[#e5e5ea] transition-all" title="Click to sort by Entry Price">Entry Price${sortIcon('entry_price')}</th>
                            <th onclick="toggleJournalSort('current_price')" class="py-2.5 px-3 num-col cursor-pointer hover:bg-[#e5e5ea] transition-all" title="Click to sort by Current Price">Current Price${sortIcon('current_price')}</th>
                            <th onclick="toggleJournalSort('quantity')" class="py-2.5 px-3 num-col cursor-pointer hover:bg-[#e5e5ea] transition-all" title="Click to sort by Quantity">Qty${sortIcon('quantity')}</th>
                            <th onclick="toggleJournalSort('stop_loss')" class="py-2.5 px-3 num-col cursor-pointer hover:bg-[#e5e5ea] transition-all" title="Click to sort by Stop Loss">Stop Loss${sortIcon('stop_loss')}</th>
                            <th onclick="toggleJournalSort('target_1')" class="py-2.5 px-3 num-col cursor-pointer hover:bg-[#e5e5ea] transition-all" title="Click to sort by Target 1">Target 1${sortIcon('target_1')}</th>
                            <th onclick="toggleJournalSort('pnl')" class="py-2.5 px-3 num-col cursor-pointer hover:bg-[#e5e5ea] transition-all" title="Click to sort by Live P&L">Live P&amp;L${sortIcon('pnl')}</th>
                            <th class="py-2.5 px-3 badge-col text-center">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml || '<tr><td colspan="8" class="p-4 text-center text-[#8e8e93]">No positions match the selected filter.</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>
    `;
}

function renderJournalAnalytics(analytics) {
    if (!analytics || !analytics.summary) return;
    const s = analytics.summary;

    if (document.getElementById("statsWinRate")) document.getElementById("statsWinRate").innerText = `${s.win_rate}%`;
    if (document.getElementById("statsProfitFactor")) document.getElementById("statsProfitFactor").innerText = s.profit_factor;
    if (document.getElementById("statsTotalTrades")) document.getElementById("statsTotalTrades").innerText = s.total_trades;
    
    const netPnlEl = document.getElementById("statsNetPnl");
    if (netPnlEl) {
        netPnlEl.innerText = `${s.net_pnl_inr > 0 ? '+' : ''}₹${formatNumber(s.net_pnl_inr, 2)}`;
        netPnlEl.className = `text-xl font-bold mono ${s.net_pnl_inr >= 0 ? 'text-[#1e7e34]' : 'text-[#b32020]'}`;
    }

    if (document.getElementById("statsExpectancy")) {
        document.getElementById("statsExpectancy").innerText = `${s.expectancy_inr > 0 ? '+' : ''}₹${formatNumber(s.expectancy_inr, 0)}/tr`;
    }
    if (document.getElementById("statsMaxDrawdown")) {
        document.getElementById("statsMaxDrawdown").innerText = `-₹${formatNumber(s.max_drawdown_inr, 0)}`;
    }

    // Render Equity Curve
    renderJournalEquityCurve(analytics.equity_curve);

    // Render Calendar Heatmap
    renderJournalCalendarHeatmap(analytics.daily_calendar);

    // Render Discipline Tags
    renderJournalDisciplineTags(analytics.tag_breakdown);
}

function renderJournalEquityCurve(curveData) {
    const canvas = document.getElementById("journalEquityCurveCanvas");
    if (!canvas) return;

    if (_journalEquityChart) {
        try { _journalEquityChart.destroy(); } catch (e) {}
        _journalEquityChart = null;
    }

    if (!curveData || curveData.length === 0) {
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        return;
    }

    const labels = curveData.map(d => d.date);
    const dataPoints = curveData.map(d => d.cum_pnl);

    const ctx = canvas.getContext("2d");
    _journalEquityChart = new Chart(ctx, {
        type: "line",
        data: {
            labels: labels,
            datasets: [{
                label: "Cumulative Realized P&L (₹)",
                data: dataPoints,
                borderColor: "#10b981",
                backgroundColor: "rgba(16, 185, 129, 0.08)",
                fill: true,
                tension: 0.15,
                pointRadius: 3,
                pointBackgroundColor: "#10b981"
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` Cumulative P&L: ₹${formatNumber(ctx.raw, 2)}`
                    }
                }
            },
            scales: {
                x: { grid: { display: false }, ticks: { maxTicksLimit: 6, font: { size: 10 } } },
                y: { grid: { color: "#f2f2f7" }, ticks: { font: { size: 10 }, callback: (v) => `₹${formatNumber(v, 0)}` } }
            }
        }
    });
}

function renderJournalCalendarHeatmap(calendar) {
    const container = document.getElementById("journalCalendarHeatmap");
    if (!container) return;

    if (!calendar || Object.keys(calendar).length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-[#86868b] text-xs">No closed trades recorded yet. Close a position to see your daily P&L calendar heatmap!</div>`;
        return;
    }

    const dates = Object.keys(calendar).sort();
    if (dates.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-[#86868b] text-xs">No closed trades recorded yet. Close a position to see your daily P&L calendar heatmap!</div>`;
        return;
    }

    container.innerHTML = `
        <div class="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-2">
            ${dates.slice(-24).map(d => {
                const day = calendar[d];
                const isWin = day.pnl >= 0;
                const bg = isWin ? "bg-[#edf7ee] border-[#c3e6cb]" : "bg-[#fdf0f0] border-[#f5c6cb]";
                const text = isWin ? "text-[#1e7e34]" : "text-[#b32020]";

                return `
                    <div class="p-2.5 rounded-xl border ${bg} text-center space-y-0.5">
                        <span class="text-[10px] text-[#86868b] block font-medium">${d.slice(5)}</span>
                        <span class="font-bold text-xs mono ${text} block">
                            ${isWin ? '+' : ''}₹${formatNumber(day.pnl, 0)}
                        </span>
                        <span class="text-[9px] text-[#6e6e73] block">${day.trades} trade${day.trades > 1 ? 's' : ''}</span>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function renderJournalDisciplineTags(tags) {
    const container = document.getElementById("journalDisciplineTags");
    if (!container) return;

    if (!tags || tags.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-[#86868b] text-xs">No discipline tags logged yet. Close trades with tags to see behavioral analytics!</div>`;
        return;
    }

    container.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            ${tags.map(t => {
                const isPos = t.pnl >= 0;
                return `
                    <div class="p-2.5 rounded-xl macos-box flex justify-between items-center text-xs">
                        <div>
                            <span class="font-semibold text-[#1c1c1e]">${t.tag}</span>
                            <span class="text-[10px] text-[#86868b] block">${t.trades} trades · ${t.win_rate}% win</span>
                        </div>
                        <span class="font-bold mono ${isPos ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                            ${isPos ? '+' : ''}₹${formatNumber(t.pnl, 0)}
                        </span>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function renderClosedTrades(trades) {
    const container = document.getElementById("closedTradesHistoryContainer");
    if (!container) return;

    if (!trades || trades.length === 0) {
        container.innerHTML = `<div class="p-8 text-center text-[#86868b] text-xs">No closed trades recorded. Once you exit a position, your realized P&L and execution history will appear here.</div>`;
        return;
    }

    let rowsHtml = trades.map(t => {
        const pnl = parseFloat(t.pnl || 0);
        const pnlPct = parseFloat(t.pnl_pct || 0);
        const isProfit = pnl >= 0;
        const pnlColor = isProfit ? "text-[#1e7e34]" : "text-[#b32020]";
        const pnlBg = isProfit ? "bg-[#edf7ee] border-[#c3e6cb]" : "bg-[#fdf0f0] border-[#f5c6cb]";
        return `
            <tr class="border-b border-[rgba(0,0,0,0.06)] hover:bg-[#f5f5f7] transition-colors text-xs">
                <td class="py-3 px-3 text-col">
                    <div class="font-bold text-[#1c1c1e]">${t.code || t.symbol}</div>
                    <span class="text-[10px] text-[#86868b]">${t.entry_date || ''} ➔ ${t.exit_date || ''}</span>
                </td>
                <td class="py-3 px-3 num-col text-[#6e6e73]">${formatINR(t.entry_price || 0)}</td>
                <td class="py-3 px-3 num-col font-semibold text-[#1c1c1e]">${formatINR(t.exit_price || 0)}</td>
                <td class="py-3 px-3 num-col text-[#6e6e73]">${t.quantity} Qty</td>
                <td class="py-3 px-3 num-col font-bold">
                    <span class="inline-block px-2 py-1 rounded-lg border text-xs ${pnlBg} ${pnlColor}">
                        ${pnl > 0 ? '+' : ''}${formatINR(pnl)}
                        <span class="text-[10px] block font-normal">(${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(2)}%)</span>
                    </span>
                </td>
                <td class="py-3 px-3 text-col">
                    <span class="text-[10px] px-2 py-0.5 rounded-full bg-[#f2f2f7] text-[#48484a] font-medium border border-[rgba(0,0,0,0.06)]">
                        ${t.tags || t.exit_reason || 'Closed'}
                    </span>
                </td>
            </tr>
        `;
    }).join("");

    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="bg-[#f5f5f7] text-[#6e6e73] text-[11px] uppercase font-semibold tracking-wider border-b border-[rgba(0,0,0,0.08)]">
                        <th class="py-2.5 px-3 text-col">Symbol</th>
                        <th class="py-2.5 px-3 num-col">Entry</th>
                        <th class="py-2.5 px-3 num-col">Exit</th>
                        <th class="py-2.5 px-3 num-col">Qty</th>
                        <th class="py-2.5 px-3 num-col">Realized P&amp;L</th>
                        <th class="py-2.5 px-3 text-col">Exit Note / Tag</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

// ===== CLOSE / PARTIAL SCALE-OUT MODAL =====

function openCloseTradeModal(tradeId, currentPrice) {
    const trade = _lastActiveTrades.find(t => String(t.id) === String(tradeId)) || {
        id: tradeId,
        symbol: "TRADE",
        code: "TRADE",
        entry_price: currentPrice || 0,
        current_price: currentPrice || 0,
        quantity: 1
    };

    const existing = document.getElementById("closeTradeModal");
    if (existing) existing.remove();

    const curPrice = parseFloat(currentPrice || trade.current_price || trade.entry_price || 0);
    const entryPrice = parseFloat(trade.entry_price || 0);
    const totalQty = parseInt(trade.quantity || 1);

    const modal = document.createElement("div");
    modal.id = "closeTradeModal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto";
    modal.innerHTML = `
        <div class="bg-white dark:bg-[#1c1c1e] border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-lg p-6 text-[#1c1c1e] dark:text-[#f2f2f7] my-auto" onclick="event.stopPropagation()">
            <!-- Header -->
            <div class="flex justify-between items-start mb-4 border-b border-[rgba(0,0,0,0.06)] dark:border-white/10 pb-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 flex items-center justify-center text-xl font-bold">
                        ✂️
                    </div>
                    <div>
                        <h3 class="text-base font-bold text-[#1c1c1e] dark:text-white flex items-center gap-2">
                            Exit Position: <span class="text-[#007aff]">${trade.code || trade.symbol}</span>
                        </h3>
                        <p class="text-xs text-[#6e6e73] dark:text-[#8e8e93]">Full position close or partial scale-out with net P&amp;L preview</p>
                    </div>
                </div>
                <button onclick="closeCloseTradeModal()" class="text-[#86868b] hover:text-[#1c1c1e] dark:hover:text-white text-xl font-bold px-2 py-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all">✕</button>
            </div>

            <div class="space-y-4">
                <!-- Holding Summary Strip -->
                <div class="grid grid-cols-3 gap-2 p-3 rounded-xl bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.06)] dark:border-white/10 text-center text-xs">
                    <div>
                        <span class="text-[10px] text-[#86868b] uppercase block font-semibold">Entry Price</span>
                        <span class="font-bold mono text-[#1c1c1e] dark:text-white">₹${formatNumber(entryPrice, 2)}</span>
                    </div>
                    <div>
                        <span class="text-[10px] text-[#86868b] uppercase block font-semibold">Live Market Price</span>
                        <span class="font-bold mono text-[#007aff]">₹${formatNumber(curPrice, 2)}</span>
                    </div>
                    <div>
                        <span class="text-[10px] text-[#86868b] uppercase block font-semibold">Total Holding</span>
                        <span class="font-bold mono text-[#1c1c1e] dark:text-white">${totalQty} units</span>
                    </div>
                </div>

                <!-- Scale-Out Preset Selector -->
                <div>
                    <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Scale-Out Quantity Preset</label>
                    <div class="grid grid-cols-4 gap-2">
                        <button type="button" onclick="setClosePreset(${totalQty}, 0.25)" class="py-1.5 px-2 rounded-lg text-xs font-semibold bg-[#f5f5f7] hover:bg-[#e5e5ea] dark:bg-white/10 dark:hover:bg-white/15 text-[#1c1c1e] dark:text-white transition-all cursor-pointer">
                            25% (${Math.max(1, Math.round(totalQty * 0.25))})
                        </button>
                        <button type="button" onclick="setClosePreset(${totalQty}, 0.50)" class="py-1.5 px-2 rounded-lg text-xs font-semibold bg-[#f5f5f7] hover:bg-[#e5e5ea] dark:bg-white/10 dark:hover:bg-white/15 text-[#1c1c1e] dark:text-white transition-all cursor-pointer">
                            50% (${Math.max(1, Math.round(totalQty * 0.50))})
                        </button>
                        <button type="button" onclick="setClosePreset(${totalQty}, 0.75)" class="py-1.5 px-2 rounded-lg text-xs font-semibold bg-[#f5f5f7] hover:bg-[#e5e5ea] dark:bg-white/10 dark:hover:bg-white/15 text-[#1c1c1e] dark:text-white transition-all cursor-pointer">
                            75% (${Math.max(1, Math.round(totalQty * 0.75))})
                        </button>
                        <button type="button" onclick="setClosePreset(${totalQty}, 1.0)" class="py-1.5 px-2 rounded-lg text-xs font-bold bg-[#007aff] hover:bg-[#0062cc] text-white transition-all cursor-pointer">
                            100% Full (${totalQty})
                        </button>
                    </div>
                </div>

                <!-- Inputs: Exit Qty & Exit Price -->
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Quantity to Exit *</label>
                        <input id="ctm_qty" type="number" min="1" max="${totalQty}" value="${totalQty}"
                            oninput="updateCloseModalPreview(${entryPrice}, ${totalQty})"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-sm font-semibold mono text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all" />
                        <span class="text-[9.5px] text-[#86868b] mt-0.5 block">Max holding: ${totalQty} units</span>
                    </div>
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Exit Price (₹) *</label>
                        <input id="ctm_price" type="number" step="0.01" value="${curPrice.toFixed(2)}"
                            oninput="updateCloseModalPreview(${entryPrice}, ${totalQty})"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-sm font-semibold mono text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all" />
                        <span class="text-[9.5px] text-[#86868b] mt-0.5 block">Default: Current Market Price</span>
                    </div>
                </div>

                <!-- Live Realized P&L & Friction Card -->
                <div id="ctm_preview_box" class="p-3.5 rounded-xl border transition-all text-xs space-y-2">
                    <!-- Populated dynamically by updateCloseModalPreview -->
                </div>

                <!-- Exit Discipline & Tags -->
                <div class="space-y-2">
                    <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block font-semibold">Exit Tag / Discipline Reason *</label>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <select id="ctm_tag_select" onchange="document.getElementById('ctm_tag').value = this.value"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff]">
                            <option value="Followed Plan">Followed Plan</option>
                            <option value="Target 1 Hit (+11%)">Target 1 Hit (+11%)</option>
                            <option value="Target 2 Hit (+20%)">Target 2 Hit (+20%)</option>
                            <option value="Partial Profit Booking">Partial Profit Booking</option>
                            <option value="Trailing Stop Loss Hit">Trailing Stop Loss Hit</option>
                            <option value="Stop Loss Hit">Stop Loss Hit</option>
                            <option value="Risk Reduction / Capital Defense">Risk Reduction / Defense</option>
                            <option value="Discretionary Exit">Discretionary Exit</option>
                        </select>
                        <input id="ctm_tag" type="text" value="Followed Plan" placeholder="Custom reason or discipline note"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff]" />
                    </div>
                </div>
            </div>

            <!-- Footer Buttons -->
            <div class="flex items-center justify-end gap-2.5 pt-4 mt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-white/10">
                <button type="button" onclick="closeCloseTradeModal()" class="px-4 py-2 rounded-xl text-xs font-semibold bg-[#e5e5ea] hover:bg-[#d1d1d6] dark:bg-white/10 dark:hover:bg-white/15 text-[#1c1c1e] dark:text-white transition-all cursor-pointer">
                    Cancel
                </button>
                <button type="button" onclick="submitCloseTrade('${trade.id}', ${totalQty})" class="px-4 py-2 rounded-xl text-xs font-semibold bg-[#b32020] hover:bg-[#8a1818] text-white shadow-sm transition-all cursor-pointer flex items-center gap-1.5">
                    <span>✂️ Confirm Exit</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    updateCloseModalPreview(entryPrice, totalQty);
}
window.openCloseTradeModal = openCloseTradeModal;
window.closeJournalTradePrompt = openCloseTradeModal;

function closeCloseTradeModal() {
    const el = document.getElementById("closeTradeModal");
    if (el) el.remove();
}
window.closeCloseTradeModal = closeCloseTradeModal;

function setClosePreset(totalQty, pct) {
    const qtyInput = document.getElementById("ctm_qty");
    if (!qtyInput) return;
    const targetQty = pct >= 1.0 ? totalQty : Math.max(1, Math.round(totalQty * pct));
    qtyInput.value = targetQty;
    qtyInput.dispatchEvent(new Event("input"));
}
window.setClosePreset = setClosePreset;

function updateCloseModalPreview(entryPrice, totalQty) {
    const box = document.getElementById("ctm_preview_box");
    const qtyInput = document.getElementById("ctm_qty");
    const priceInput = document.getElementById("ctm_price");
    if (!box || !qtyInput || !priceInput) return;

    const exitQty = Math.max(1, Math.min(totalQty, parseInt(qtyInput.value) || 1));
    const exitPrice = parseFloat(priceInput.value) || 0;
    const remainingQty = totalQty - exitQty;

    const grossExitVal = exitPrice * exitQty;
    const grossCostVal = entryPrice * exitQty;
    const grossPnl = grossExitVal - grossCostVal;
    const grossPnlPct = grossCostVal > 0 ? (grossPnl / grossCostVal) * 100 : 0;

    // Statutory Indian Frictions: STT (10 bps = 0.1%), Exch turnover (3.25 bps), Brokerage ₹20
    const stt = grossExitVal * 0.0010;
    const exch = grossExitVal * 0.0000325;
    const brokerage = 20.0;
    const totalFriction = stt + exch + brokerage;
    const netPnl = grossPnl - totalFriction;
    const netPnlPct = grossCostVal > 0 ? (netPnl / grossCostVal) * 100 : 0;

    const isProfit = netPnl >= 0;
    const sign = isProfit ? "+" : "";
    box.className = `p-3.5 rounded-xl border text-xs space-y-2 ${isProfit ? 'bg-[#edf7ee] border-[#c3e6cb] dark:bg-[#1e7e34]/10 dark:border-[#1e7e34]/30' : 'bg-[#fdf0f0] border-[#f5c6cb] dark:bg-[#b32020]/10 dark:border-[#b32020]/30'}`;

    box.innerHTML = `
        <div class="flex justify-between items-center pb-2 border-b ${isProfit ? 'border-[#c3e6cb] dark:border-[#1e7e34]/30' : 'border-[#f5c6cb] dark:border-[#b32020]/30'}">
            <span class="font-bold ${isProfit ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                ${remainingQty === 0 ? 'Full 100% Exit' : `Partial Scale-Out (${exitQty} of ${totalQty} units)`}
            </span>
            <span class="font-bold mono ${isProfit ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                Net Realized: ${sign}₹${formatNumber(netPnl, 2)} (${sign}${netPnlPct.toFixed(2)}%)
            </span>
        </div>
        <div class="grid grid-cols-2 gap-2 text-[11px] text-[#48484a] dark:text-[#a1a1a6]">
            <div>• Exited Turnover: <span class="font-semibold text-[#1c1c1e] dark:text-white">₹${formatNumber(grossExitVal, 2)}</span></div>
            <div>• Remaining Open: <span class="font-semibold text-[#1c1c1e] dark:text-white">${remainingQty} units</span></div>
            <div>• Gross P&amp;L: <span class="font-semibold ${grossPnl >= 0 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">${grossPnl >= 0 ? '+' : ''}₹${formatNumber(grossPnl, 2)}</span></div>
            <div>• Statutory Frictions: <span class="font-semibold text-[#86868b]">-₹${formatNumber(totalFriction, 2)} (STT, Exch, Brok)</span></div>
        </div>
    `;
}
window.updateCloseModalPreview = updateCloseModalPreview;

async function submitCloseTrade(tradeId, totalQty) {
    const qtyInput = document.getElementById("ctm_qty");
    const priceInput = document.getElementById("ctm_price");
    const tagInput = document.getElementById("ctm_tag");
    if (!qtyInput || !priceInput) return;

    const exitQty = parseInt(qtyInput.value) || 1;
    const exitPrice = parseFloat(priceInput.value) || 0;
    const tag = (tagInput ? tagInput.value : "").trim() || "Followed Plan";

    if (exitPrice <= 0) {
        showNotification("Please enter a valid exit price.", "warning");
        return;
    }
    if (exitQty <= 0) {
        showNotification("Quantity to exit must be at least 1.", "warning");
        return;
    }

    try {
        let endpoint = "";
        let body = {};
        if (exitQty >= totalQty) {
            endpoint = `/api/journal/close/${tradeId}`;
            body = { exit_price: exitPrice, reason: tag, exit_tags: tag };
        } else {
            endpoint = `/api/journal/partial-exit/${tradeId}`;
            body = { exit_qty: exitQty, exit_price: exitPrice, exit_tags: tag, reason: tag };
        }

        showNotification("Recording trade exit...", "info");
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await res.json();
        if (data.status === "success") {
            const pnlStr = data.realized_pnl !== undefined ? `₹${formatNumber(data.realized_pnl, 2)}` : "";
            showNotification(`Exit recorded! Realized Net P&L: ${pnlStr}`, "success");
            closeCloseTradeModal();
            loadTradeJournal();
        } else {
            showNotification("Failed to close position: " + (data.message || "Unknown error"), "error");
        }
    } catch (e) {
        console.error("Close trade error:", e);
        showNotification("Network error while recording trade exit.", "error");
    }
}
window.submitCloseTrade = submitCloseTrade;


// ===== EDIT TRADE MODAL =====

function openEditTradeModal(tradeId) {
    const trade = _lastActiveTrades.find(t => String(t.id) === String(tradeId));
    if (!trade) {
        showNotification("Position not found. Please refresh the journal.", "error");
        return;
    }

    const existing = document.getElementById("editTradeModal");
    if (existing) existing.remove();

    const entryPrice = parseFloat(trade.entry_price || 0);
    const curPrice = parseFloat(trade.current_price || entryPrice);
    const qty = parseInt(trade.quantity || 1);
    const sl = parseFloat(trade.stop_loss || 0);
    const t1 = parseFloat(trade.target_1 || 0);
    const t2 = parseFloat(trade.target_2 || 0);

    const modal = document.createElement("div");
    modal.id = "editTradeModal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto";
    modal.innerHTML = `
        <div class="bg-white dark:bg-[#1c1c1e] border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-xl p-6 text-[#1c1c1e] dark:text-[#f2f2f7] my-auto" onclick="event.stopPropagation()">
            <!-- Header -->
            <div class="flex justify-between items-start mb-4 border-b border-[rgba(0,0,0,0.06)] dark:border-white/10 pb-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#007aff] flex items-center justify-center text-xl font-bold">
                        ✏️
                    </div>
                    <div>
                        <h3 class="text-base font-bold text-[#1c1c1e] dark:text-white flex items-center gap-2">
                            Edit Position: <span class="text-[#007aff]">${trade.code || trade.symbol}</span>
                        </h3>
                        <p class="text-xs text-[#6e6e73] dark:text-[#8e8e93]">Update entry price, quantity, stop loss, targets, and notes</p>
                    </div>
                </div>
                <button onclick="closeEditTradeModal()" class="text-[#86868b] hover:text-[#1c1c1e] dark:hover:text-white text-xl font-bold px-2 py-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all">✕</button>
            </div>

            <div class="space-y-4">
                <!-- Info Banner -->
                <div class="flex items-center justify-between p-3 rounded-xl bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.06)] dark:border-white/10 text-xs">
                    <div>
                        <span class="text-[#86868b]">Current Market Price (CMP):</span>
                        <span class="font-bold mono text-[#007aff] ml-1">₹${formatNumber(curPrice, 2)}</span>
                    </div>
                    <button type="button" onclick="applyAutoRiskInEditModal('${trade.style || 'Swing'}', '${trade.code || trade.symbol}')"
                        class="px-2.5 py-1 rounded-lg bg-[#eef5fd] hover:bg-[#007aff] hover:text-white text-[#007aff] border border-[#b9d7fb] transition-all font-semibold cursor-pointer text-[11px] flex items-center gap-1">
                        <span>🛡️ Auto-Calculate 1:2 R:R</span>
                    </button>
                </div>

                <!-- Date & Style -->
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Entry Date</label>
                        <input id="etm_date" type="date" value="${trade.entry_date || ''}"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-xs text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Trade Style</label>
                        <select id="etm_style" class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-xs text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] transition-all">
                            <option value="Swing" ${trade.style === 'Swing' ? 'selected' : ''}>Swing Trade</option>
                            <option value="Positional" ${trade.style === 'Positional' ? 'selected' : ''}>Positional</option>
                            <option value="Intraday" ${trade.style === 'Intraday' ? 'selected' : ''}>Intraday</option>
                            <option value="ETF" ${trade.style === 'ETF' ? 'selected' : ''}>ETF / All-Weather</option>
                            <option value="Investment" ${trade.style === 'Investment' ? 'selected' : ''}>Long-Term Investment</option>
                            <option value="Manual" ${trade.style === 'Manual' ? 'selected' : ''}>Manual</option>
                        </select>
                    </div>
                </div>

                <!-- Price & Qty -->
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Entry Price (₹) *</label>
                        <input id="etm_price" type="number" step="0.01" value="${entryPrice.toFixed(2)}"
                            oninput="calcEditTradeMetrics(${curPrice})"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-sm font-semibold mono text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Quantity *</label>
                        <input id="etm_qty" type="number" step="1" min="1" value="${qty}"
                            oninput="calcEditTradeMetrics(${curPrice})"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-sm font-semibold mono text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] transition-all" />
                    </div>
                </div>

                <!-- Stop Loss & Targets -->
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <label class="text-[10px] text-[#b32020] uppercase tracking-wider block mb-1 font-semibold">Stop Loss (₹)</label>
                        <input id="etm_sl" type="number" step="0.01" value="${sl > 0 ? sl.toFixed(2) : ''}" placeholder="e.g. 295.00"
                            oninput="calcEditTradeMetrics(${curPrice})"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[#f5c6cb] dark:border-rose-900/40 rounded-lg px-3 py-2 text-xs font-semibold mono text-[#b32020] dark:text-rose-400 outline-none focus:border-[#b32020] transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#1e7e34] uppercase tracking-wider block mb-1 font-semibold">Target 1 (₹)</label>
                        <input id="etm_t1" type="number" step="0.01" value="${t1 > 0 ? t1.toFixed(2) : ''}" placeholder="e.g. 345.00"
                            oninput="calcEditTradeMetrics(${curPrice})"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[#c3e6cb] dark:border-emerald-900/40 rounded-lg px-3 py-2 text-xs font-semibold mono text-[#1e7e34] dark:text-emerald-400 outline-none focus:border-[#1e7e34] transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#1e7e34] uppercase tracking-wider block mb-1 font-semibold">Target 2 (₹)</label>
                        <input id="etm_t2" type="number" step="0.01" value="${t2 > 0 ? t2.toFixed(2) : ''}" placeholder="e.g. 380.00"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[#c3e6cb] dark:border-emerald-900/40 rounded-lg px-3 py-2 text-xs font-semibold mono text-[#1e7e34] dark:text-emerald-400 outline-none focus:border-[#1e7e34] transition-all" />
                    </div>
                </div>

                <!-- Dynamic Live Risk / Reward Calculation Box -->
                <div id="etm_metrics_box" class="p-3 rounded-xl bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.06)] dark:border-white/10 text-xs">
                    <!-- Populated dynamically -->
                </div>

                <!-- Tags & Notes -->
                <div class="space-y-3">
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Tags</label>
                        <input id="etm_tags" type="text" value="${trade.tags || ''}" placeholder="e.g. Breakout, 200 EMA, High Volume"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-xs text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Trade Notes / Strategy</label>
                        <textarea id="etm_notes" rows="2" placeholder="Rationale, catalyst, exit plan..."
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-xs text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] transition-all">${trade.notes || ''}</textarea>
                    </div>
                </div>
            </div>

            <!-- Footer Buttons -->
            <div class="flex items-center justify-end gap-2.5 pt-4 mt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-white/10">
                <button type="button" onclick="closeEditTradeModal()" class="px-4 py-2 rounded-xl text-xs font-semibold bg-[#e5e5ea] hover:bg-[#d1d1d6] dark:bg-white/10 dark:hover:bg-white/15 text-[#1c1c1e] dark:text-white transition-all cursor-pointer">
                    Cancel
                </button>
                <button type="button" onclick="submitEditTrade('${trade.id}')" class="px-4 py-2 rounded-xl text-xs font-semibold bg-[#007aff] hover:bg-[#0062cc] text-white shadow-sm transition-all cursor-pointer flex items-center gap-1.5">
                    <span>💾 Save Changes</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
    calcEditTradeMetrics(curPrice);
}
window.openEditTradeModal = openEditTradeModal;

function closeEditTradeModal() {
    const el = document.getElementById("editTradeModal");
    if (el) el.remove();
}
window.closeEditTradeModal = closeEditTradeModal;

function calcEditTradeMetrics(cmp) {
    const box = document.getElementById("etm_metrics_box");
    const pInput = document.getElementById("etm_price");
    const qInput = document.getElementById("etm_qty");
    const slInput = document.getElementById("etm_sl");
    const t1Input = document.getElementById("etm_t1");
    if (!box || !pInput || !qInput) return;

    const price = parseFloat(pInput.value) || 0;
    const qty = parseInt(qInput.value) || 1;
    const sl = parseFloat(slInput ? slInput.value : 0) || 0;
    const t1 = parseFloat(t1Input ? t1Input.value : 0) || 0;

    const invested = price * qty;
    let slText = "Not Set";
    let riskINR = 0;
    if (sl > 0 && price > 0) {
        const riskPerShare = price - sl;
        riskINR = Math.max(0, riskPerShare * qty);
        const slPct = ((riskPerShare / price) * 100).toFixed(1);
        slText = `₹${formatNumber(riskINR, 2)} (-${slPct}%)`;
    }

    let t1Text = "Not Set";
    let rewardINR = 0;
    if (t1 > 0 && price > 0) {
        const rewardPerShare = t1 - price;
        rewardINR = Math.max(0, rewardPerShare * qty);
        const t1Pct = ((rewardPerShare / price) * 100).toFixed(1);
        t1Text = `₹${formatNumber(rewardINR, 2)} (+${t1Pct}%)`;
    }

    let rrRatio = "—";
    if (riskINR > 0 && rewardINR > 0) {
        rrRatio = `1 : ${(rewardINR / riskINR).toFixed(2)}`;
    }

    box.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
            <div>
                <span class="text-[10px] text-[#86868b] uppercase block">Total Invested</span>
                <span class="font-bold mono text-[#1c1c1e] dark:text-white">₹${formatNumber(invested, 2)}</span>
            </div>
            <div>
                <span class="text-[10px] text-[#b32020] uppercase block">Capital at Risk (SL)</span>
                <span class="font-bold mono text-[#b32020]">${slText}</span>
            </div>
            <div>
                <span class="text-[10px] text-[#1e7e34] uppercase block">Target 1 Upside</span>
                <span class="font-bold mono text-[#1e7e34]">${t1Text}</span>
            </div>
            <div>
                <span class="text-[10px] text-[#007aff] uppercase block">Risk : Reward</span>
                <span class="font-bold mono text-[#007aff]">${rrRatio}</span>
            </div>
        </div>
    `;
}
window.calcEditTradeMetrics = calcEditTradeMetrics;

function applyAutoRiskInEditModal(style, symbol) {
    const pInput = document.getElementById("etm_price");
    const slInput = document.getElementById("etm_sl");
    const t1Input = document.getElementById("etm_t1");
    const t2Input = document.getElementById("etm_t2");
    if (!pInput || !slInput || !t1Input) return;

    const price = parseFloat(pInput.value) || 0;
    if (price <= 0) {
        showNotification("Please enter a valid entry price first.", "warning");
        return;
    }

    const isEtf = style === "ETF" || (symbol && (symbol.includes("BEES") || symbol.includes("ETF")));
    const slPct = isEtf ? 0.045 : 0.055;
    const t1Pct = isEtf ? 0.08 : 0.11;
    const t2Pct = isEtf ? 0.15 : 0.20;

    slInput.value = (price * (1 - slPct)).toFixed(2);
    t1Input.value = (price * (1 + t1Pct)).toFixed(2);
    if (t2Input) t2Input.value = (price * (1 + t2Pct)).toFixed(2);

    calcEditTradeMetrics(price);
    showNotification(`Auto-set SL (${(slPct*100).toFixed(1)}%) & Targets with 1:2 R:R`, "info");
}
window.applyAutoRiskInEditModal = applyAutoRiskInEditModal;

async function submitEditTrade(tradeId) {
    const dateInput = document.getElementById("etm_date");
    const styleInput = document.getElementById("etm_style");
    const pInput = document.getElementById("etm_price");
    const qInput = document.getElementById("etm_qty");
    const slInput = document.getElementById("etm_sl");
    const t1Input = document.getElementById("etm_t1");
    const t2Input = document.getElementById("etm_t2");
    const tagsInput = document.getElementById("etm_tags");
    const notesInput = document.getElementById("etm_notes");

    const entryPrice = parseFloat(pInput.value) || 0;
    const quantity = parseInt(qInput.value) || 0;

    if (entryPrice <= 0) {
        showNotification("Entry price must be greater than 0.", "warning");
        return;
    }
    if (quantity <= 0) {
        showNotification("Quantity must be at least 1.", "warning");
        return;
    }

    const payload = {
        entry_price: entryPrice,
        quantity: quantity,
        stop_loss: parseFloat(slInput ? slInput.value : 0) || 0,
        target_1: parseFloat(t1Input ? t1Input.value : 0) || 0,
        target_2: parseFloat(t2Input ? t2Input.value : 0) || 0,
        style: styleInput ? styleInput.value : "Swing",
        entry_date: dateInput ? dateInput.value : "",
        tags: tagsInput ? tagsInput.value.trim() : "",
        notes: notesInput ? notesInput.value.trim() : ""
    };

    try {
        showNotification("Saving position updates...", "info");
        const res = await fetch(`/api/journal/edit/${tradeId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if (data.status === "success") {
            showNotification("Position updated successfully!", "success");
            closeEditTradeModal();
            loadTradeJournal();
        } else {
            showNotification("Failed to update position: " + (data.message || "Unknown error"), "error");
        }
    } catch (e) {
        console.error("Edit trade error:", e);
        showNotification("Network error while updating trade.", "error");
    }
}
window.submitEditTrade = submitEditTrade;


// ===== 1-CLICK AUTO-RISK SHIELD =====

async function triggerAutoRiskShield() {
    if (!confirm("🛡️ Activate Auto-Risk Shield across all open positions?\n\nThis will compute technical Stop Losses (-5.5% for stocks, -4.5% for ETFs) and 1:2 R:R targets for open positions that do not have protection set.")) {
        return;
    }

    showNotification("Calculating technical stop losses and targets...", "info");
    try {
        const res = await fetch("/api/journal/auto-risk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({})
        });
        const data = await res.json();
        if (data.status === "success") {
            showNotification(`🛡️ Auto-Risk Shield active! ${data.updated_count || 0} position(s) updated with SL & Targets.`, "success");
            loadTradeJournal();
        } else {
            showNotification("Failed to apply risk shield: " + (data.message || "Unknown error"), "error");
        }
    } catch (e) {
        console.error("Auto risk error:", e);
        showNotification("Failed to apply auto risk shield.", "error");
    }
}
window.triggerAutoRiskShield = triggerAutoRiskShield;


// ===== EXCEL / CSV BULK IMPORT MODAL =====

function openImportTradesModal() {
    const existing = document.getElementById("importTradesModal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "importTradesModal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto";
    modal.innerHTML = `
        <div class="bg-white dark:bg-[#1c1c1e] border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-xl p-6 text-[#1c1c1e] dark:text-[#f2f2f7] my-auto" onclick="event.stopPropagation()">
            <!-- Header -->
            <div class="flex justify-between items-start mb-4 border-b border-[rgba(0,0,0,0.06)] dark:border-white/10 pb-3">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-[#1e7e34] dark:text-emerald-400 flex items-center justify-center text-xl font-bold">
                        📥
                    </div>
                    <div>
                        <h3 class="text-base font-bold text-[#1c1c1e] dark:text-white flex items-center gap-2">
                            Bulk Import Trades (CSV / Excel)
                        </h3>
                        <p class="text-xs text-[#6e6e73] dark:text-[#8e8e93]">Paste tabular data or upload tradebook file from Excel, Zerodha, or Groww</p>
                    </div>
                </div>
                <button onclick="closeImportTradesModal()" class="text-[#86868b] hover:text-[#1c1c1e] dark:hover:text-white text-xl font-bold px-2 py-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all">✕</button>
            </div>

            <div class="space-y-4">
                <!-- Helper Guide Snippet -->
                <div class="p-3 rounded-xl bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.06)] dark:border-white/10 text-xs space-y-1.5">
                    <div class="font-semibold text-[#1c1c1e] dark:text-white flex items-center justify-between">
                        <span>Recognized Columns:</span>
                        <button type="button" onclick="fillSampleImportCsv()" class="text-[11px] text-[#007aff] hover:underline font-semibold cursor-pointer">
                            📋 Fill Sample Template
                        </button>
                    </div>
                    <p class="text-[11px] text-[#6e6e73] dark:text-[#8e8e93]">
                        <code class="text-[#007aff]">Symbol</code>, <code class="text-[#007aff]">Entry Price</code>, <code class="text-[#007aff]">Quantity</code>, <code class="text-[#007aff]">Stop Loss</code>, <code class="text-[#007aff]">Target</code>, <code class="text-[#007aff]">Date</code>, <code class="text-[#007aff]">Style</code>
                    </p>
                </div>

                <!-- Textarea for copy-paste -->
                <div>
                    <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Paste Excel or CSV Data</label>
                    <textarea id="itm_csv_text" rows="6" placeholder="Symbol,Entry Price,Quantity,Stop Loss,Target,Date&#10;TCS.NS,3950.00,25,3800.00,4300.00,2025-01-10&#10;INFY.NS,1850.50,50,1780.00,2020.00,2025-01-12"
                        class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg p-3 text-xs mono text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] transition-all"></textarea>
                </div>

                <!-- Or File Picker -->
                <div>
                    <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Or Upload CSV File (.csv)</label>
                    <input id="itm_csv_file" type="file" accept=".csv,text/csv,text/plain"
                        class="w-full text-xs text-[#6e6e73] dark:text-[#8e8e93] file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-[#eef5fd] file:text-[#007aff] hover:file:bg-[#007aff] hover:file:text-white cursor-pointer" />
                </div>
            </div>

            <!-- Footer Buttons -->
            <div class="flex items-center justify-end gap-2.5 pt-4 mt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-white/10">
                <button type="button" onclick="closeImportTradesModal()" class="px-4 py-2 rounded-xl text-xs font-semibold bg-[#e5e5ea] hover:bg-[#d1d1d6] dark:bg-white/10 dark:hover:bg-white/15 text-[#1c1c1e] dark:text-white transition-all cursor-pointer">
                    Cancel
                </button>
                <button type="button" onclick="submitImportTrades()" class="px-4 py-2 rounded-xl text-xs font-semibold bg-[#1e7e34] hover:bg-[#155d27] text-white shadow-sm transition-all cursor-pointer flex items-center gap-1.5">
                    <span>📥 Import Positions</span>
                </button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}
window.openImportTradesModal = openImportTradesModal;

function closeImportTradesModal() {
    const el = document.getElementById("importTradesModal");
    if (el) el.remove();
}
window.closeImportTradesModal = closeImportTradesModal;

function fillSampleImportCsv() {
    const ta = document.getElementById("itm_csv_text");
    if (!ta) return;
    ta.value = `Symbol,Entry Price,Quantity,Stop Loss,Target,Date,Style\nRELIANCE.NS,2950.00,30,2800.00,3250.00,2025-01-15,Swing\nTCS.NS,3920.00,20,3750.00,4300.00,2025-01-16,Positional\nNIFTYBEES.NS,272.50,150,259.00,300.00,2025-01-18,ETF`;
}
window.fillSampleImportCsv = fillSampleImportCsv;

async function submitImportTrades() {
    const ta = document.getElementById("itm_csv_text");
    const fileInput = document.getElementById("itm_csv_file");

    let csvContent = "";

    if (fileInput && fileInput.files && fileInput.files.length > 0) {
        const file = fileInput.files[0];
        try {
            csvContent = await file.text();
        } catch (e) {
            showNotification("Failed to read CSV file: " + e.message, "error");
            return;
        }
    } else if (ta && ta.value.trim()) {
        csvContent = ta.value.trim();
    } else {
        showNotification("Please paste CSV data or choose a CSV file to import.", "warning");
        return;
    }

    try {
        showNotification("Importing trades...", "info");
        const res = await fetch("/api/journal/import", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ csv_text: csvContent })
        });
        const data = await res.json();
        if (data.status === "success") {
            showNotification(`Successfully imported ${data.imported_count || 0} trade(s)!`, "success");
            closeImportTradesModal();
            loadTradeJournal();
        } else {
            showNotification("Import error: " + (data.message || "Unknown error"), "error");
        }
    } catch (e) {
        console.error("Import error:", e);
        showNotification("Network error while importing trades.", "error");
    }
}
window.submitImportTrades = submitImportTrades;

// ===== RESET JOURNAL & P&L WORKFLOW =====

function promptResetJournal() {
    const existing = document.getElementById("resetJournalModal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "resetJournalModal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4";
    modal.innerHTML = `
        <div class="bg-white dark:bg-[#1c1c1e] border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-md p-6 text-[#1c1c1e] dark:text-[#f2f2f7]" onclick="event.stopPropagation()">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 flex items-center justify-center text-xl font-bold">
                    🗑️
                </div>
                <div>
                    <h3 class="text-base font-bold text-[#1c1c1e] dark:text-white">Reset Journal &amp; P&amp;L</h3>
                    <p class="text-xs text-[#6e6e73] dark:text-[#8e8e93]">Clear trades and reset your performance dashboard</p>
                </div>
            </div>

            <div class="space-y-3.5 my-4">
                <div class="p-3 bg-rose-50/70 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2">
                    <span class="text-base">⚠️</span>
                    <span>This action is permanent and cannot be undone. Select which records you wish to reset below:</span>
                </div>

                <div class="space-y-2">
                    <label class="flex items-start gap-3 p-3 rounded-xl border border-[#007aff]/30 bg-[#f0f7ff] dark:bg-[#007aff]/10 cursor-pointer hover:border-[#007aff] transition-all">
                        <input type="radio" name="journalResetScope" value="all" checked class="mt-0.5 accent-[#007aff]" />
                        <div>
                            <div class="text-xs font-bold text-[#1c1c1e] dark:text-white">Reset Everything (Active + Closed Trades)</div>
                            <div class="text-[11px] text-[#6e6e73] dark:text-[#8e8e93] mt-0.5">Wipes all trades, resets Realized Net P&amp;L to ₹0.00, clears win rate &amp; exposure.</div>
                        </div>
                    </label>

                    <label class="flex items-start gap-3 p-3 rounded-xl border border-[rgba(0,0,0,0.08)] dark:border-white/10 hover:border-[#007aff]/50 cursor-pointer transition-all">
                        <input type="radio" name="journalResetScope" value="closed" class="mt-0.5 accent-[#007aff]" />
                        <div>
                            <div class="text-xs font-bold text-[#1c1c1e] dark:text-white">Reset Realized P&amp;L Only (Closed Trades)</div>
                            <div class="text-[11px] text-[#6e6e73] dark:text-[#8e8e93] mt-0.5">Clears closed trade history and resets Realized P&amp;L to ₹0.00, keeping active open positions.</div>
                        </div>
                    </label>

                    <label class="flex items-start gap-3 p-3 rounded-xl border border-[rgba(0,0,0,0.08)] dark:border-white/10 hover:border-[#007aff]/50 cursor-pointer transition-all">
                        <input type="radio" name="journalResetScope" value="active" class="mt-0.5 accent-[#007aff]" />
                        <div>
                            <div class="text-xs font-bold text-[#1c1c1e] dark:text-white">Clear Active Positions Only</div>
                            <div class="text-[11px] text-[#6e6e73] dark:text-[#8e8e93] mt-0.5">Clears active open trades while preserving closed trade history and cumulative P&amp;L.</div>
                        </div>
                    </label>
                </div>
            </div>

            <div class="flex items-center justify-end gap-2.5 pt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-white/10">
                <button type="button" onclick="closeResetJournalModal()" class="px-4 py-2 rounded-xl text-xs font-semibold bg-[#e5e5ea] hover:bg-[#d1d1d6] dark:bg-white/10 dark:hover:bg-white/15 text-[#1c1c1e] dark:text-white transition-all cursor-pointer">
                    Cancel
                </button>
                <button type="button" id="btnConfirmResetJournal" onclick="executeJournalReset()" class="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-700 text-white shadow-sm transition-all cursor-pointer flex items-center gap-1.5">
                    <span>🗑️ Confirm Reset</span>
                </button>
            </div>
        </div>
    `;

    modal.addEventListener("click", (e) => {
        if (e.target === modal) closeResetJournalModal();
    });
    document.body.appendChild(modal);
}
window.promptResetJournal = promptResetJournal;

function closeResetJournalModal() {
    const modal = document.getElementById("resetJournalModal");
    if (modal) modal.remove();
}
window.closeResetJournalModal = closeResetJournalModal;

async function executeJournalReset() {
    const btn = document.getElementById("btnConfirmResetJournal");
    const selectedScope = document.querySelector('input[name="journalResetScope"]:checked')?.value || "all";

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin text-sm">🔄</span> Resetting...`;
    }

    try {
        const res = await fetch("/api/journal/reset", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scope: selectedScope })
        });
        const data = await res.json();
        if (data.status === "success") {
            closeResetJournalModal();
            showNotification(`Journal reset complete! ${data.message || 'P&L and metrics have been reset.'}`, "success");
            await loadTradeJournal();
            if (typeof loadBeesStrategy === "function") loadBeesStrategy();
        } else {
            alert("Failed to reset journal: " + (data.message || "Unknown error"));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<span>🗑️ Confirm Reset</span>`;
            }
        }
    } catch (e) {
        console.error("Reset error:", e);
        alert("Connection error during journal reset.");
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>🗑️ Confirm Reset</span>`;
        }
    }
}
window.executeJournalReset = executeJournalReset;


// ===== SEARCH & AUTO-SUGGESTIONS FOR MANUAL TRADE ENTRY =====

let _manualSearchDebounce = null;
let _manualHighlightedIndex = -1;
let _currentManualSearchResults = [];

function openManualTradeModal() {
    const today = new Date().toISOString().split("T")[0];
    const existing = document.getElementById("manualTradeModal");
    if (existing) existing.remove();

    const modal = document.createElement("div");
    modal.id = "manualTradeModal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto";
    modal.innerHTML = `
        <div class="bg-white dark:bg-[#1c1c1e] border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-2xl shadow-2xl w-full max-w-xl p-6 text-[#1c1c1e] dark:text-[#f2f2f7] my-auto" onclick="event.stopPropagation()">
            <!-- Header -->
            <div class="flex justify-between items-start mb-4 border-b border-[rgba(0,0,0,0.06)] dark:border-white/10 pb-3">
                <div>
                    <h3 class="text-base font-bold text-[#1c1c1e] dark:text-white flex items-center gap-2">
                        <span>✏️</span> Add Stock / ETF Trade to Journal
                    </h3>
                    <p class="text-xs text-[#6e6e73] dark:text-[#8e8e93] mt-0.5">Search and select any Stock or ETF symbol to auto-load live quote, optimal SL &amp; targets</p>
                </div>
                <button onclick="closeManualModal()" class="text-[#86868b] hover:text-[#1c1c1e] dark:hover:text-white text-xl font-bold px-2 py-0.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-all">✕</button>
            </div>

            <div class="space-y-4">
                <!-- Symbol Search Input with Real-time Dropdown -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div class="relative">
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold flex items-center justify-between">
                            <span>Search Stock / ETF Symbol *</span>
                            <span id="mt_search_status" class="text-[9.5px] text-[#007aff] font-normal hidden">Searching...</span>
                        </label>
                        <div class="relative">
                            <input id="mt_symbol" type="text" placeholder="Type stock or ETF name (e.g. NIFTYBEES, RELIANCE)..." autocomplete="off"
                                class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 pr-9 text-sm text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all font-medium uppercase placeholder:normal-case placeholder:text-xs"
                                oninput="handleManualSymbolSearch(this.value)"
                                onkeydown="handleManualSearchKeydown(event)"
                                onfocus="handleManualSymbolSearch(this.value)"
                                onchange="onManualSymbolChanged()" />
                            <div class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#8e8e93] pointer-events-none text-xs">
                                🔍
                            </div>
                        </div>

                        <!-- Real-time Search Dropdown -->
                        <div id="mt_suggestions" class="absolute left-0 right-0 top-full mt-1.5 bg-white dark:bg-[#1c1c1e] border border-[rgba(0,0,0,0.12)] dark:border-white/15 rounded-xl shadow-2xl z-30 hidden max-h-60 overflow-y-auto divide-y divide-[rgba(0,0,0,0.05)] dark:divide-white/5">
                        </div>
                        <span class="text-[9px] text-[#86868b] mt-1 block">Type 1 or more characters to search full NSE/BSE stock &amp; ETF universe</span>
                    </div>

                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Trade Entry Date *</label>
                        <input id="mt_date" type="date" value="${today}"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-sm text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all" />
                        <span class="text-[9px] text-[#86868b] mt-1 block">Position opening date</span>
                    </div>
                </div>

                <!-- Recommendation Banner (Dynamic) -->
                <div id="mt_rec_badge" class="hidden p-3 rounded-xl border text-xs transition-all"></div>

                <!-- Price & Qty & Trade Type -->
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Buy Price (₹) *</label>
                        <input id="mt_entry" type="number" step="0.01" placeholder="e.g. 272.50"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-sm font-semibold mono text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Quantity *</label>
                        <input id="mt_qty" type="number" placeholder="e.g. 100"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-sm font-semibold mono text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Trade Type</label>
                        <select id="mt_style" class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-sm text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all">
                            <option value="ETF">ETF / All-Weather</option>
                            <option value="Swing">Swing Trade</option>
                            <option value="Positional">Positional</option>
                            <option value="Intraday">Intraday</option>
                            <option value="Manual">Manual</option>
                        </select>
                    </div>
                </div>

                <!-- Stop Loss & Targets -->
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <label class="text-[10px] text-[#b32020] uppercase tracking-wider block mb-1 font-semibold">Stop Loss (₹)</label>
                        <input id="mt_sl" type="number" step="0.01" placeholder="e.g. 260.25"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[#f5c6cb] dark:border-rose-900/40 rounded-lg px-3 py-2 text-sm font-semibold mono text-[#b32020] dark:text-rose-400 outline-none focus:border-[#b32020] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#1e7e34] uppercase tracking-wider block mb-1 font-semibold">Target 1 (₹)</label>
                        <input id="mt_t1" type="number" step="0.01" placeholder="e.g. 294.30"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[#c3e6cb] dark:border-emerald-900/40 rounded-lg px-3 py-2 text-sm font-semibold mono text-[#1e7e34] dark:text-emerald-400 outline-none focus:border-[#1e7e34] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#007aff] uppercase tracking-wider block mb-1 font-semibold">Target 2 (₹)</label>
                        <input id="mt_t2" type="number" step="0.01" placeholder="e.g. 313.40"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[#b9d7fb] dark:border-blue-900/40 rounded-lg px-3 py-2 text-sm font-semibold mono text-[#007aff] dark:text-blue-400 outline-none focus:border-[#007aff] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all" />
                    </div>
                </div>

                <!-- Discipline Tag & Notes -->
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Discipline / Setup Tag</label>
                        <select id="mt_tags" class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-sm text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all">
                            <option value="Followed Plan">Followed Plan</option>
                            <option value="ETF Allocation">ETF Allocation</option>
                            <option value="Breakout Entry">Breakout Entry</option>
                            <option value="Pullback Entry">Pullback Entry</option>
                            <option value="FOMO Entry">FOMO Entry</option>
                            <option value="Chased Breakout">Chased Breakout</option>
                            <option value="Revenge Trade">Revenge Trade</option>
                            <option value="Hesitation">Hesitation</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[10px] text-[#6e6e73] dark:text-[#8e8e93] uppercase tracking-wider block mb-1 font-semibold">Notes / Rationale</label>
                        <input id="mt_notes" type="text" placeholder="e.g. All-Weather Allocation or Breakout"
                            class="w-full bg-[#f8f8fa] dark:bg-white/5 border border-[rgba(0,0,0,0.12)] dark:border-white/10 rounded-lg px-3 py-2 text-sm text-[#1c1c1e] dark:text-white outline-none focus:border-[#007aff] focus:bg-white dark:focus:bg-[#1c1f2e] transition-all" />
                    </div>
                </div>
            </div>

            <!-- Actions Footer -->
            <div class="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-[rgba(0,0,0,0.06)] dark:border-white/10">
                <button type="button" onclick="clearManualTradeFields()" class="text-xs text-[#86868b] hover:text-[#1c1c1e] dark:hover:text-white underline cursor-pointer">
                    Clear Form
                </button>
                <div class="flex items-center gap-2">
                    <button type="button" onclick="closeManualModal()" class="px-4 py-2.5 rounded-xl bg-[#e3e3e8] hover:bg-[#d1d1d6] dark:bg-white/10 dark:hover:bg-white/15 text-[#1c1c1e] dark:text-white font-semibold text-xs transition-all cursor-pointer">
                        Cancel
                    </button>
                    <button type="button" id="btnSubmitManualTrade" onclick="submitManualTrade()" class="btn-primary px-5 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all flex items-center gap-1.5 cursor-pointer">
                        <span>✅</span> <span>Add to Journal</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    modal.addEventListener("click", (e) => {
        if (e.target === modal) {
            closeManualModal();
        } else {
            const sug = document.getElementById("mt_suggestions");
            const symInput = document.getElementById("mt_symbol");
            if (sug && !sug.contains(e.target) && e.target !== symInput) {
                sug.classList.add("hidden");
            }
        }
    });
    document.body.appendChild(modal);
}
window.openManualTradeModal = openManualTradeModal;

function closeManualModal() {
    const modal = document.getElementById("manualTradeModal");
    if (modal) modal.remove();
}
window.closeManualModal = closeManualModal;
window.closeManualTradeModal = closeManualModal;

function handleManualSymbolSearch(val) {
    const sug = document.getElementById("mt_suggestions");
    const statusEl = document.getElementById("mt_search_status");
    if (!sug) return;

    const query = (val || "").trim();
    if (query.length < 1) {
        sug.classList.add("hidden");
        sug.innerHTML = "";
        if (statusEl) statusEl.classList.add("hidden");
        _currentManualSearchResults = [];
        _manualHighlightedIndex = -1;
        return;
    }

    if (_manualSearchDebounce) {
        clearTimeout(_manualSearchDebounce);
    }

    // 1. Instant local search from appState if available
    let localMatches = [];
    const pool = (window.appState && (window.appState.allAssets || window.appState.stocksList)) || [];
    if (pool.length > 0) {
        const qLower = query.toLowerCase();
        localMatches = pool.filter(s => {
            const sym = (s.symbol || "").toLowerCase();
            const code = (s.code || "").toLowerCase();
            const name = (s.name || "").toLowerCase();
            const sector = (s.sector || "").toLowerCase();
            return sym.includes(qLower) || code.includes(qLower) || name.includes(qLower) || sector.includes(qLower);
        }).slice(0, 10);
    }

    if (localMatches.length > 0) {
        renderManualSearchResults(localMatches, query);
    }

    // 2. Query remote API for full universe
    if (statusEl) statusEl.classList.remove("hidden");
    _manualSearchDebounce = setTimeout(async () => {
        try {
            const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
            const data = await res.json();
            const results = data.results || [];
            if (statusEl) statusEl.classList.add("hidden");
            if (results.length > 0) {
                renderManualSearchResults(results, query);
            } else if (localMatches.length === 0) {
                renderManualSearchResults([], query);
            }
        } catch (e) {
            console.error("Manual search error:", e);
            if (statusEl) statusEl.classList.add("hidden");
        }
    }, 150);
}
window.handleManualSymbolSearch = handleManualSymbolSearch;

function renderManualSearchResults(items, query) {
    const sug = document.getElementById("mt_suggestions");
    if (!sug) return;

    if (!items || items.length === 0) {
        sug.innerHTML = `<div class="p-4 text-xs text-[#86868b] text-center">No Stocks or ETFs found matching "${query}"</div>`;
        sug.classList.remove("hidden");
        _currentManualSearchResults = [];
        _manualHighlightedIndex = -1;
        return;
    }

    // Deduplicate by symbol / code
    const unique = [];
    const seen = new Set();
    for (const it of items) {
        const key = (it.code || it.symbol || "").toUpperCase();
        if (!seen.has(key)) {
            seen.add(key);
            unique.push(it);
        }
    }

    _currentManualSearchResults = unique.slice(0, 10);
    _manualHighlightedIndex = -1;

    sug.innerHTML = _currentManualSearchResults.map((s, idx) => {
        const symbol = s.symbol || `${s.code}.NS`;
        const code = s.code || symbol.replace(".NS", "").replace(".BO", "");
        const name = s.name || code;
        const cat = s.category || ((code.includes("BEES") || (name && name.toLowerCase().includes("etf"))) ? "ETF" : "Stock");
        const sector = s.sector || (cat === "ETF" ? "Exchange Traded Fund" : "NSE Listed");
        const isEtf = cat === "ETF";

        let badgeClass = isEtf 
            ? "bg-[#007aff]/15 text-[#007aff] border border-[#007aff]/30" 
            : "bg-purple-100 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800/40";

        return `
            <div id="manual_sug_${idx}"
                 onclick="selectSearchedTradeSymbol('${symbol}')"
                 class="p-2.5 px-3 hover:bg-[#007aff]/10 dark:hover:bg-white/10 cursor-pointer flex items-center justify-between transition-colors text-xs manual-search-row">
                <div class="flex-1 min-w-0 pr-3">
                    <div class="flex items-center gap-2">
                        <span class="font-bold text-[#1c1c1e] dark:text-white tracking-tight">${symbol}</span>
                        <span class="text-[9.5px] px-1.5 py-0.5 rounded font-bold uppercase ${badgeClass}">
                            ${isEtf ? '📊 ' + cat : '⚡ ' + cat}
                        </span>
                    </div>
                    <div class="text-[11px] text-[#6e6e73] dark:text-[#8e8e93] truncate mt-0.5">
                        ${name}
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-[10px] text-[#86868b] dark:text-[#8e8e93] font-medium whitespace-nowrap block">
                        ${sector}
                    </span>
                    <span class="text-[9.5px] text-[#007aff] font-semibold block mt-0.5">
                        Select &amp; Recommend ➔
                    </span>
                </div>
            </div>
        `;
    }).join("");

    sug.classList.remove("hidden");
}
window.renderManualSearchResults = renderManualSearchResults;

function handleManualSearchKeydown(event) {
    const sug = document.getElementById("mt_suggestions");
    if (!sug || sug.classList.contains("hidden") || !_currentManualSearchResults.length) {
        if (event.key === "Enter") {
            onManualSymbolChanged();
        }
        return;
    }

    if (event.key === "ArrowDown") {
        event.preventDefault();
        _manualHighlightedIndex = Math.min(_manualHighlightedIndex + 1, _currentManualSearchResults.length - 1);
        updateManualHighlight();
    } else if (event.key === "ArrowUp") {
        event.preventDefault();
        _manualHighlightedIndex = Math.max(_manualHighlightedIndex - 1, 0);
        updateManualHighlight();
    } else if (event.key === "Enter") {
        event.preventDefault();
        if (_manualHighlightedIndex >= 0 && _manualHighlightedIndex < _currentManualSearchResults.length) {
            const selected = _currentManualSearchResults[_manualHighlightedIndex];
            selectSearchedTradeSymbol(selected.symbol || `${selected.code}.NS`);
        } else {
            onManualSymbolChanged();
        }
    } else if (event.key === "Escape") {
        sug.classList.add("hidden");
    }
}
window.handleManualSearchKeydown = handleManualSearchKeydown;

function updateManualHighlight() {
    _currentManualSearchResults.forEach((_, idx) => {
        const el = document.getElementById(`manual_sug_${idx}`);
        if (el) {
            if (idx === _manualHighlightedIndex) {
                el.classList.add("bg-[#007aff]/15", "dark:bg-white/15");
                el.scrollIntoView({ block: "nearest" });
            } else {
                el.classList.remove("bg-[#007aff]/15", "dark:bg-white/15");
            }
        }
    });
}

function selectSearchedTradeSymbol(symbol) {
    const symInput = document.getElementById("mt_symbol");
    if (symInput) {
        symInput.value = symbol;
    }
    const sug = document.getElementById("mt_suggestions");
    if (sug) sug.classList.add("hidden");
    _currentManualSearchResults = [];
    _manualHighlightedIndex = -1;
    fetchAndApplyManualRecommendation(symbol);
}
window.selectSearchedTradeSymbol = selectSearchedTradeSymbol;
window.selectQuickSymbol = selectSearchedTradeSymbol; // backward compatibility

function onManualSymbolChanged() {
    const symInput = document.getElementById("mt_symbol");
    if (!symInput) return;
    const sym = symInput.value.trim().toUpperCase();
    if (sym.length >= 2) {
        fetchAndApplyManualRecommendation(sym);
    }
}
window.onManualSymbolChanged = onManualSymbolChanged;

async function fetchAndApplyManualRecommendation(rawSymbol) {
    const badge = document.getElementById("mt_rec_badge");
    const fetchBtn = document.getElementById("btnFetchRec");
    if (!rawSymbol) return;

    let symbol = rawSymbol.trim().toUpperCase();
    if (!symbol.includes(".") && !symbol.startsWith("^")) {
        symbol = `${symbol}.NS`;
    }

    if (fetchBtn) {
        fetchBtn.disabled = true;
        fetchBtn.innerHTML = `<span class="animate-spin">🔄</span> <span>Fetching...</span>`;
    }

    if (badge) {
        badge.classList.remove("hidden");
        badge.className = "p-2.5 rounded-xl border bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-900/40 text-blue-700 dark:text-blue-300 text-xs flex items-center gap-2";
        badge.innerHTML = `<span class="animate-spin text-sm">🔄</span> <span>Fetching live quote and computing trade parameters for <strong>${symbol}</strong>...</span>`;
    }

    try {
        const res = await fetch(`/api/journal/recommendation?symbol=${encodeURIComponent(symbol)}`);
        const data = await res.json();

        if (data.status === "success" && data.recommended) {
            const rec = data.recommended;

            const entryEl = document.getElementById("mt_entry");
            const qtyEl = document.getElementById("mt_qty");
            const styleEl = document.getElementById("mt_style");
            const slEl = document.getElementById("mt_sl");
            const t1El = document.getElementById("mt_t1");
            const t2El = document.getElementById("mt_t2");
            const notesEl = document.getElementById("mt_notes");
            const tagsEl = document.getElementById("mt_tags");

            if (entryEl) entryEl.value = Number(rec.entry_price).toFixed(2);
            if (qtyEl) qtyEl.value = rec.quantity;
            if (styleEl && rec.style) styleEl.value = rec.style;
            if (slEl) slEl.value = Number(rec.stop_loss).toFixed(2);
            if (t1El) t1El.value = Number(rec.target_1).toFixed(2);
            if (t2El) t2El.value = Number(rec.target_2).toFixed(2);
            if (notesEl && !notesEl.value) notesEl.value = rec.notes;
            if (tagsEl && data.is_etf) tagsEl.value = "ETF Allocation";

            if (badge) {
                const slPct = (((data.cmp - rec.stop_loss) / data.cmp) * 100).toFixed(1);
                const t1Pct = (((rec.target_1 - data.cmp) / data.cmp) * 100).toFixed(1);
                const t2Pct = (((rec.target_2 - data.cmp) / data.cmp) * 100).toFixed(1);

                badge.className = "p-3 rounded-xl border bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800/40 text-emerald-900 dark:text-emerald-200 text-xs space-y-1.5 shadow-sm";
                badge.innerHTML = `
                    <div class="flex items-center justify-between font-bold">
                        <span class="flex items-center gap-1.5">
                            <span>⚡</span> <span>Optimal Parameters Loaded: <strong>${data.name}</strong></span>
                        </span>
                        <span class="mono px-2 py-0.5 rounded bg-emerald-200/60 dark:bg-emerald-800/40 text-emerald-800 dark:text-emerald-200 text-[11px]">
                            CMP: ₹${data.cmp.toFixed(2)} (${data.change_pct >= 0 ? '+' : ''}${data.change_pct.toFixed(2)}%)
                        </span>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-1 text-[11px] mono">
                        <div><span class="text-[#6e6e73] dark:text-[#8e8e93] block text-[9.5px]">STOP LOSS</span> ₹${rec.stop_loss.toFixed(2)} (-${slPct}%)</div>
                        <div><span class="text-[#6e6e73] dark:text-[#8e8e93] block text-[9.5px]">TARGET 1</span> ₹${rec.target_1.toFixed(2)} (+${t1Pct}%)</div>
                        <div><span class="text-[#6e6e73] dark:text-[#8e8e93] block text-[9.5px]">TARGET 2</span> ₹${rec.target_2.toFixed(2)} (+${t2Pct}%)</div>
                        <div><span class="text-[#6e6e73] dark:text-[#8e8e93] block text-[9.5px]">RISK / REWARD</span> ${rec.rr_ratio}</div>
                    </div>
                    <div class="text-[10px] text-emerald-700 dark:text-emerald-400 italic pt-0.5">
                        ${rec.notes}
                    </div>
                `;
            }
        } else {
            if (badge) {
                badge.className = "p-2.5 rounded-xl border bg-amber-50/70 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2";
                badge.innerHTML = `<span>⚠️</span> <span>${data.message || 'Could not fetch live recommendations. You can enter details manually.'}</span>`;
            }
        }
    } catch (e) {
        console.error("Failed to fetch recommendation:", e);
        if (badge) {
            badge.className = "p-2.5 rounded-xl border bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/40 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2";
            badge.innerHTML = `<span>⚠️</span> <span>Live quote service unavailable. You can enter parameters manually.</span>`;
        }
    } finally {
        if (fetchBtn) {
            fetchBtn.disabled = false;
            fetchBtn.innerHTML = `<span>⚡</span> <span>Auto-Fill</span>`;
        }
    }
}
window.fetchAndApplyManualRecommendation = fetchAndApplyManualRecommendation;

function clearManualTradeFields() {
    const fields = ["mt_symbol", "mt_entry", "mt_qty", "mt_sl", "mt_t1", "mt_t2", "mt_notes"];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = "";
    });
    const badge = document.getElementById("mt_rec_badge");
    if (badge) {
        badge.classList.add("hidden");
        badge.innerHTML = "";
    }
    const sug = document.getElementById("mt_suggestions");
    if (sug) sug.classList.add("hidden");
}
window.clearManualTradeFields = clearManualTradeFields;

async function submitManualTrade() {
    const symbol = document.getElementById("mt_symbol")?.value.trim().toUpperCase();
    const entry_price = parseFloat(document.getElementById("mt_entry")?.value);
    const quantity = parseInt(document.getElementById("mt_qty")?.value);
    const stop_loss = parseFloat(document.getElementById("mt_sl")?.value) || 0;
    const target_1 = parseFloat(document.getElementById("mt_t1")?.value) || 0;
    const target_2 = parseFloat(document.getElementById("mt_t2")?.value) || 0;
    const style = document.getElementById("mt_style")?.value || "Manual";
    const notes = document.getElementById("mt_notes")?.value || "";
    const tags = document.getElementById("mt_tags")?.value || "Followed Plan";
    const entry_date = document.getElementById("mt_date")?.value || "";

    if (!symbol || isNaN(entry_price) || entry_price <= 0 || isNaN(quantity) || quantity <= 0) {
        alert("Please fill in a valid Symbol, Buy Price (> 0), and Quantity (> 0).");
        return;
    }

    let finalSymbol = symbol;
    if (!finalSymbol.includes(".") && !finalSymbol.startsWith("^")) {
        finalSymbol = finalSymbol + ".NS";
    }

    const btn = document.getElementById("btnSubmitManualTrade");
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="animate-spin">🔄</span> Adding...`;
    }

    try {
        const res = await fetch("/api/journal/manual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                symbol: finalSymbol,
                entry_price: parseFloat(entry_price.toFixed(2)),
                quantity,
                stop_loss: parseFloat(stop_loss.toFixed(2)),
                target_1: parseFloat(target_1.toFixed(2)),
                target_2: parseFloat(target_2.toFixed(2)),
                style,
                notes,
                tags,
                entry_date
            })
        });
        const data = await res.json();
        if (data.status === "success") {
            closeManualModal();
            await loadTradeJournal();
            if (typeof loadBeesStrategy === "function") loadBeesStrategy();
            showNotification(`Position for ${finalSymbol} added successfully!`, "success");
        } else {
            alert("Error: " + (data.message || "Could not add trade"));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<span>✅</span> <span>Add to Journal</span>`;
            }
        }
    } catch (e) {
        console.error("Error submitting manual trade:", e);
        alert("Connection error. Please ensure the server is running.");
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>✅</span> <span>Add to Journal</span>`;
        }
    }
}
window.submitManualTrade = submitManualTrade;


// Take Trade from scanner/analysis - opens modal pre-filled
function takeTradeFromScanner(symbol, entry, qty, sl, t1, t2) {
    openManualTradeModal();
    setTimeout(() => {
        const s = document.getElementById("mt_symbol");
        const e = document.getElementById("mt_entry");
        const q = document.getElementById("mt_qty");
        const slEl = document.getElementById("mt_sl");
        const t1El = document.getElementById("mt_t1");
        const t2El = document.getElementById("mt_t2");
        const noteEl = document.getElementById("mt_notes");
        if (s) s.value = symbol;
        if (e) e.value = entry;
        if (q) q.value = qty;
        if (slEl) slEl.value = sl;
        if (t1El) t1El.value = t1;
        if (t2El) t2El.value = t2;
        if (noteEl) noteEl.value = "Added from scanner / analysis";
    }, 50);
}


// ===== POSITION ADVISOR — SMART BUY MORE / HOLD / SELL =====

async function getPositionAdvice(tradeId, symbol, entryPrice, quantity, currentPrice) {
    // Show the modal with loading state first
    showAdviceModal(tradeId, symbol, entryPrice, quantity, currentPrice, null);

    try {
        const res = await fetch(`/api/journal/${tradeId}/advice`);
        const data = await res.json();
        if (data.status === "success") {
            showAdviceModal(tradeId, symbol, entryPrice, quantity, currentPrice, data);
        } else {
            document.getElementById("adviceModalContent").innerHTML =
                `<div class="p-6 text-rose-600 text-sm">Error: ${data.message}</div>`;
        }
    } catch (e) {
        console.error("Advice error:", e);
        document.getElementById("adviceModalContent").innerHTML =
            `<div class="p-6 text-rose-600 text-sm">Connection error. Is the server running?</div>`;
    }
}

function showAdviceModal(tradeId, symbol, entryPrice, quantity, currentPrice, data) {
    // Remove any existing modal
    const existing = document.getElementById("positionAdviceModal");
    if (existing) existing.remove();

    const pnl = ((currentPrice - entryPrice) / entryPrice * 100).toFixed(2);
    const pnlAmt = ((currentPrice - entryPrice) * quantity).toFixed(0);
    const isProfit = parseFloat(pnl) >= 0;

    const modal = document.createElement("div");
    modal.id = "positionAdviceModal";
    modal.className = "fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm";

    const loadingContent = `
        <div class="flex flex-col items-center justify-center py-16 gap-4">
            <div class="w-10 h-10 rounded-full border-3 border-[#007aff]/20 border-t-[#007aff] animate-spin"></div>
            <p class="text-[#1c1c1e] text-sm font-medium">Running deep analysis on ${symbol}...</p>
            <p class="text-[#86868b] text-xs">Fetching live price, RSI, MACD, fundamentals, promoter data...</p>
        </div>
    `;

    const verdictContent = data ? buildAdviceContent(data) : loadingContent;

    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto border border-[rgba(0,0,0,0.12)] text-[#1c1c1e]" onclick="event.stopPropagation()">
            <!-- Header -->
            <div class="flex items-start justify-between p-5 border-b border-[rgba(0,0,0,0.06)] sticky top-0 bg-white/95 backdrop-blur-md z-10">
                <div class="flex-1">
                    <div class="flex items-center gap-3 flex-wrap">
                        <h3 class="text-base font-semibold text-[#1c1c1e]">🧠 Smart Position Advice</h3>
                        <span class="text-xs bg-[#e5e5ea] text-[#1c1c1e] px-2.5 py-0.5 rounded-lg font-mono font-semibold">${symbol}</span>
                        <span class="text-xs px-2.5 py-0.5 rounded-lg font-semibold ${isProfit ? 'bg-[#edf7ee] text-[#1e7e34] border border-[#c3e6cb]' : 'bg-[#fdf0f0] text-[#b32020] border border-[#f5c6cb]'}">
                            Entry ₹${entryPrice} → CMP ₹${currentPrice} &nbsp; ${isProfit ? '▲' : '▼'} ${pnl}% (₹${isProfit ? '+' : ''}${pnlAmt})
                        </span>
                    </div>
                    <p class="text-xs text-[#86868b] mt-1">${quantity} units × ₹${entryPrice} = ₹${(quantity * entryPrice).toLocaleString('en-IN')} invested</p>
                </div>
                <button onclick="document.getElementById('positionAdviceModal').remove()" 
                    class="text-[#86868b] hover:text-[#1c1c1e] text-xl font-bold ml-4 flex-shrink-0">✕</button>
            </div>

            <!-- Content -->
            <div id="adviceModalContent" class="p-5">
                ${verdictContent}
            </div>
        </div>
    `;

    modal.addEventListener("click", () => modal.remove());
    document.body.appendChild(modal);
}

function buildAdviceContent(d) {
    const verdictColors = {
        "BUY MORE":      { bg: "#edf7ee", border: "#c3e6cb", text: "#1e7e34" },
        "HOLD":          { bg: "#fef6ed", border: "#fed7aa", text: "#8a4500" },
        "PARTIAL EXIT":  { bg: "#fff7ed", border: "#ffedd5", text: "#c2410c" },
        "EXIT / SELL":   { bg: "#fdf0f0", border: "#f5c6cb", text: "#b32020" }
    };
    const vc = verdictColors[d.verdict] || { bg: "#f5f5f7", border: "rgba(0,0,0,0.08)", text: "#1c1c1e" };

    const scoreBreakdownHtml = d.score_breakdown.map(s => {
        const pct = ((s.score + s.max) / (s.max * 2)) * 100;
        const barColor = s.score > 0 ? "#1e7e34" : s.score < 0 ? "#b32020" : "#86868b";
        return `
            <div class="flex items-center gap-3">
                <div class="text-xs text-[#48484a] w-36 flex-shrink-0 font-medium">${s.name}</div>
                <div class="flex-1 bg-[#e5e5ea] rounded-full h-1.5 overflow-hidden">
                    <div class="h-1.5 rounded-full" style="width:${pct}%; background:${barColor};"></div>
                </div>
                <span class="text-xs font-bold mono w-10 text-right" style="color:${barColor}">
                    ${s.score > 0 ? '+' : ''}${s.score}
                </span>
            </div>
        `;
    }).join("");

    const detailsHtml = d.details.map(det => `
        <div class="flex items-start gap-3 py-2.5 border-b border-[rgba(0,0,0,0.04)]">
            <span class="text-base flex-shrink-0">${det.icon}</span>
            <div class="flex-1">
                <div class="text-xs font-semibold text-[#1c1c1e]">${det.factor}</div>
                <div class="text-xs text-[#6e6e73] mt-0.5 leading-relaxed">${det.value}</div>
            </div>
        </div>
    `).join("");

    const actionStepsHtml = d.action_steps.map((step, i) => `
        <div class="flex items-start gap-3 py-2.5 ${i < d.action_steps.length - 1 ? 'border-b border-dashed border-[rgba(0,0,0,0.06)]' : ''}">
            <div class="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 mt-0.5"
                 style="background:${vc.bg}; color:${vc.text}; border: 1px solid ${vc.border};">
                ${i + 1}
            </div>
            <span class="text-sm text-[#1c1c1e] leading-relaxed">${step}</span>
        </div>
    `).join("");

    return `
        <div class="space-y-5">

            <!-- VERDICT BANNER -->
            <div class="p-5 rounded-2xl flex items-start gap-4" 
                 style="background:${vc.bg}; border: 1.5px solid ${vc.border};">
                <div class="text-4xl leading-none">${d.verdict_icon}</div>
                <div class="flex-1">
                    <div class="flex items-center gap-3 flex-wrap mb-1">
                        <span class="text-2xl font-bold" style="color:${vc.text}">${d.verdict}</span>
                        <span class="text-xs px-2.5 py-0.5 rounded-full font-semibold text-white"
                              style="background:${vc.text}">
                            ${d.confidence}% Confidence
                        </span>
                        <span class="text-xs text-[#6e6e73]">Score: ${d.total_score}/${d.max_score}</span>
                    </div>
                    <p class="text-sm leading-relaxed" style="color:${vc.text}">${d.explanation}</p>
                </div>
            </div>

            <!-- KEY METRICS STRIP -->
            <div class="grid grid-cols-3 gap-3">
                <div class="macos-box p-3 text-center">
                    <div class="text-[10px] text-[#86868b] uppercase tracking-wider font-medium">Days Held</div>
                    <div class="text-lg font-bold text-[#1c1c1e] mono">${d.metrics.days_held}</div>
                </div>
                <div class="macos-box p-3 text-center">
                    <div class="text-[10px] text-[#86868b] uppercase tracking-wider font-medium">Upside Left</div>
                    <div class="text-lg font-bold mono text-[#1e7e34]">+${d.metrics.remaining_upside_pct}%</div>
                </div>
                <div class="macos-box p-3 text-center">
                    <div class="text-[10px] text-[#86868b] uppercase tracking-wider font-medium">R:R Remaining</div>
                    <div class="text-lg font-bold text-[#1c1c1e] mono">${d.metrics.rr_remaining}:1</div>
                </div>
            </div>

            <!-- ACTION STEPS -->
            <div class="macos-card overflow-hidden">
                <div class="px-4 py-3 flex items-center gap-2 border-b border-[rgba(0,0,0,0.06)]" style="background:${vc.bg};">
                    <span class="text-sm font-semibold" style="color:${vc.text}">📋 Exact Action Steps</span>
                </div>
                <div class="p-4 bg-white space-y-0">
                    ${actionStepsHtml}
                </div>
            </div>

            <!-- SCORE BREAKDOWN -->
            <div class="macos-card p-4">
                <div class="text-xs font-semibold text-[#1c1c1e] mb-3.5 flex items-center gap-2">
                    📊 Score Breakdown (${d.total_score}/${d.max_score} total)
                </div>
                <div class="space-y-2.5">${scoreBreakdownHtml}</div>
            </div>

            <!-- DETAILED ANALYSIS -->
            <div class="macos-card overflow-hidden">
                <div class="px-4 py-3 bg-[#f8f8fa] border-b border-[rgba(0,0,0,0.06)]">
                    <span class="text-xs font-semibold text-[#1c1c1e]">🔍 Full Factor Analysis</span>
                </div>
                <div class="px-4 divide-y divide-[rgba(0,0,0,0.04)]">${detailsHtml}</div>
            </div>

            <!-- Disclaimer -->
            <p class="text-[10px] text-[#86868b] text-center leading-relaxed">
                ⚠️ This analysis is algorithmic and for educational purposes only. Not SEBI-registered financial advice. 
                Always verify with your broker before taking action.
            </p>
        </div>
    `;
}

function exportJournalToCSV() {
    showNotification("Downloading tax-compliant Tradebook CSV spreadsheet...", "info");
    window.location.href = "/api/journal/export";
}

/**
 * Open print dialogue for a clean print summary of the journal.
 */
function printJournalSummary() {
    window.print();
}

/**
 * Executes a 1-click rotation between ETFs in the user's journal.
 * Closes the existing fromSymbol position(s) and creates a new toSymbol position.
 */
async function executeJournalEtfShift(fromSymbol, toSymbol, targetPrice) {
    if (!confirm(`Confirm ETF Portfolio Rebalance:\n\nRotate out of ${fromSymbol} and shift capital into ${toSymbol} @ ~₹${Number(targetPrice).toFixed(2)}?\n\nThis will record an exit for ${fromSymbol} in your journal and log an entry into ${toSymbol}.`)) {
        return;
    }
    showNotification(`Rebalancing ETF portfolio: ${fromSymbol} ➔ ${toSymbol}...`, "info");
    try {
        const res = await fetch("/api/journal/trades");
        const data = await res.json();
        const trades = data.trades || [];
        const normFrom = (fromSymbol || "").toUpperCase().replace(".NS", "").replace(".BO", "");
        
        const matchingTrades = trades.filter(t => {
            const s = (t.symbol || "").toUpperCase().replace(".NS", "").replace(".BO", "");
            return s === normFrom;
        });

        let capitalToReinvest = 0;
        for (const t of matchingTrades) {
            const curP = t.current_price || t.entry_price || targetPrice;
            capitalToReinvest += (t.quantity || 1) * curP;
            await fetch(`/api/journal/close/${t.id}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    exit_price: curP,
                    reason: `Systematic Rotation to ${toSymbol}`,
                    exit_tags: "ETF Rebalance"
                })
            });
        }

        if (capitalToReinvest <= 0) {
            capitalToReinvest = 50000;
        }

        const cleanPrice = parseFloat(Number(targetPrice).toFixed(2));
        const newUnits = Math.max(1, Math.floor(capitalToReinvest / cleanPrice));

        await fetch("/api/journal/manual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                symbol: toSymbol.includes(".") ? toSymbol : `${toSymbol}.NS`,
                entry_price: cleanPrice,
                quantity: newUnits,
                stop_loss: parseFloat((cleanPrice * 0.94).toFixed(2)),
                target_1: parseFloat((cleanPrice * 1.15).toFixed(2)),
                target_2: parseFloat((cleanPrice * 1.25).toFixed(2)),
                style: "ETF",
                notes: `Rotated from ${fromSymbol} via Systematic Shift Advisor`,
                tags: "ETF Rotation, Systematic"
            })
        });

        showNotification(`Successfully rebalanced into ${newUnits} units of ${toSymbol}!`, "success");
        if (typeof loadTradeJournal === "function") loadTradeJournal();
        if (typeof loadBeesStrategy === "function") loadBeesStrategy();
    } catch (e) {
        console.error("Shift error:", e);
        showNotification("Failed to execute ETF shift. Check console for details.", "error");
    }
}
window.executeJournalEtfShift = executeJournalEtfShift;

/**
 * 1-Click quick logging of an ETF position into the user's journal.
 */
async function quickLogEtfToJournal(symbol, cmp, qty = 50) {
    showNotification(`Logging ${symbol} to Trade Journal...`, "info");
    try {
        const cleanPrice = parseFloat(Number(cmp).toFixed(2));
        const res = await fetch("/api/journal/manual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                symbol: symbol.includes(".") ? symbol : `${symbol}.NS`,
                entry_price: cleanPrice,
                quantity: qty,
                stop_loss: parseFloat((cleanPrice * 0.94).toFixed(2)),
                target_1: parseFloat((cleanPrice * 1.15).toFixed(2)),
                target_2: parseFloat((cleanPrice * 1.25).toFixed(2)),
                style: "ETF",
                notes: "Logged from Single ETF Decision Hub",
                tags: "ETF Allocation"
            })
        });
        const d = await res.json();
        if (d.status === "success") {
            showNotification(`Added ${qty} units of ${symbol} @ ₹${cleanPrice.toFixed(2)} to Journal!`, "success");
            if (typeof loadTradeJournal === "function") loadTradeJournal();
            if (typeof loadBeesStrategy === "function") loadBeesStrategy();
        } else {
            showNotification(`Error: ${d.message}`, "error");
        }
    } catch (e) {
        console.error("Quick log error:", e);
        showNotification("Failed to log ETF to journal.", "error");
    }
}
window.quickLogEtfToJournal = quickLogEtfToJournal;

