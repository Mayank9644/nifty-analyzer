/**
 * Trade Journal & Performance Client.
 */

let _lastActiveTrades = [];

async function loadTradeJournal() {
    try {
        const [activeRes, statsRes] = await Promise.all([
            fetch("/api/journal/active"),
            fetch("/api/journal/stats")
        ]);

        const activeData = await activeRes.json();
        const statsData = await statsRes.json();

        if (activeData.status === "success") {
            _lastActiveTrades = activeData.trades || [];
            renderActiveTrades(_lastActiveTrades);
        }

        if (statsData.status === "success") {
            renderJournalStats(statsData.stats);
        }
    } catch (e) {
        console.error("Error loading journal:", e);
    }
}

function renderActiveTrades(trades) {
    const container = document.getElementById("activeTradesTableContainer");
    if (!container) return;

    if (!trades.length) {
        container.innerHTML = `<div class="p-8 text-center text-[#86868b] text-xs">No active open positions in the journal. Take a trade from the Scanner or Stock Analysis!</div>`;
        return;
    }

    let rowsHtml = trades.map(t => {
        const pnlColor = t.is_profit ? "text-[#1e7e34]" : "text-[#b32020]";
        const pnlBg    = t.is_profit ? "bg-[#edf7ee] border-[#c3e6cb]" : "bg-[#fdf0f0] border-[#f5c6cb]";
        const manualBadge = t.is_manual ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-[#eef5fd] text-[#007aff] border border-[#b9d7fb] ml-1">Manual</span>` : "";
        return `
            <tr class="border-b border-[rgba(0,0,0,0.06)] hover:bg-[#f5f5f7] transition-colors text-xs">
                <td class="py-3 px-3">
                    <div class="font-semibold text-[#1c1c1e]">${t.code}${manualBadge}</div>
                    <span class="text-[10px] text-[#86868b]">Entry: ${t.entry_date}</span>
                </td>
                <td class="py-3 px-3 text-[#6e6e73] mono">₹${t.entry_price}</td>
                <td class="py-3 px-3 font-semibold text-[#1c1c1e] mono">₹${t.current_price}</td>
                <td class="py-3 px-3 text-[#6e6e73] mono">${t.quantity} Qty</td>
                <td class="py-3 px-3 text-[#b32020] mono">₹${t.stop_loss}</td>
                <td class="py-3 px-3 text-[#1e7e34] mono">₹${t.target_1}</td>
                <td class="py-3 px-3 font-bold mono">
                    <span class="px-2 py-1 rounded-lg border text-xs ${pnlBg} ${pnlColor}">
                        ${t.pnl > 0 ? '+' : ''}₹${formatNumber(t.pnl, 0)}
                        <span class="text-[10px] block font-normal">(${t.pnl_pct > 0 ? '+' : ''}${t.pnl_pct}%)</span>
                    </span>
                </td>
                <td class="py-3 px-3 text-center">
                    <div class="flex items-center gap-1.5 justify-center flex-wrap">
                        <button onclick="getPositionAdvice('${t.id}', '${t.symbol}', ${t.entry_price}, ${t.quantity}, ${t.current_price})"
                            class="px-2.5 py-1.5 rounded-lg bg-[#eef5fd] text-[#007aff] border border-[#b9d7fb] hover:bg-[#007aff] hover:text-white transition-all text-[11px] font-semibold whitespace-nowrap">
                            🧠 Advice
                        </button>
                        <button onclick="closeJournalTrade('${t.id}', ${t.current_price})"
                            class="px-2.5 py-1.5 rounded-lg bg-[#fdf0f0] text-[#b32020] border border-[#f5c6cb] hover:bg-[#b32020] hover:text-white transition-all text-[11px] font-semibold whitespace-nowrap">
                            Close
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");


    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="bg-[#f5f5f7] text-[#6e6e73] text-[11px] uppercase font-semibold tracking-wider border-b border-[rgba(0,0,0,0.08)]">
                        <th class="py-2.5 px-3">Stock</th>
                        <th class="py-2.5 px-3">Entry Price</th>
                        <th class="py-2.5 px-3">Current Price</th>
                        <th class="py-2.5 px-3">Qty</th>
                        <th class="py-2.5 px-3">Stop Loss</th>
                        <th class="py-2.5 px-3">Target 1</th>
                        <th class="py-2.5 px-3">Live P&amp;L</th>
                        <th class="py-2.5 px-3 text-center">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

function renderJournalStats(stats) {
    if (!stats) return;

    document.getElementById("statsWinRate").innerText = `${stats.win_rate}%`;
    document.getElementById("statsProfitFactor").innerText = stats.profit_factor;
    document.getElementById("statsTotalTrades").innerText = stats.total_trades;
    
    const netPnlEl = document.getElementById("statsNetPnl");
    netPnlEl.innerText = `${stats.net_pnl_inr > 0 ? '+' : ''}₹${formatNumber(stats.net_pnl_inr, 2)}`;
    netPnlEl.className = `text-xl font-bold mono ${stats.net_pnl_inr >= 0 ? 'text-[#1e7e34]' : 'text-[#b32020]'}`;

    // Closed Trades History
    const historyContainer = document.getElementById("closedTradesHistoryContainer");
    if (historyContainer && stats.closed_history) {
        historyContainer.innerHTML = stats.closed_history.map(c => `
            <div class="p-3 rounded-xl macos-box flex justify-between items-center text-xs">
                <div>
                    <span class="font-bold text-[#1c1c1e]">${c.code}</span>
                    <span class="text-[#86868b] text-[10px] block">Exited on ${c.exit_date} (${c.reason || 'Closed'})</span>
                </div>
                <div class="text-right">
                    <span class="font-bold mono ${c.pnl >= 0 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                        ${c.pnl > 0 ? '+' : ''}₹${formatNumber(c.pnl, 2)} (${c.pnl_pct > 0 ? '+' : ''}${c.pnl_pct}%)
                    </span>
                    <span class="text-[#86868b] text-[10px] block">${c.quantity} Shares @ ₹${c.entry_price} → ₹${c.exit_price}</span>
                </div>
            </div>
        `).join("");
    }
}

async function closeJournalTrade(tradeId, currentPrice) {
    if (!confirm("Are you sure you want to close this trade at current market price?")) return;

    try {
        const res = await fetch(`/api/journal/close/${tradeId}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ exit_price: currentPrice, reason: "Manual Target/Stop Close" })
        });
        const data = await res.json();
        if (data.status === "success") {
            loadTradeJournal();
        }
    } catch (e) {
        console.error("Error closing trade:", e);
    }
}

// ===== MANUAL TRADE ENTRY MODAL =====

function openManualTradeModal() {
    const today = new Date().toISOString().split("T")[0];
    const modal = document.createElement("div");
    modal.id = "manualTradeModal";
    modal.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-sm";
    modal.innerHTML = `
        <div class="bg-white border border-[rgba(0,0,0,0.12)] rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6 text-[#1c1c1e]" onclick="event.stopPropagation()">
            <div class="flex justify-between items-center mb-5 border-b border-[rgba(0,0,0,0.06)] pb-3">
                <div>
                    <h3 class="text-base font-semibold text-[#1c1c1e] flex items-center gap-2">✏️ Add Previous / Manual Position</h3>
                    <p class="text-xs text-[#6e6e73] mt-0.5">Enter any trade you've already taken or a position you're tracking</p>
                </div>
                <button onclick="closeManualModal()" class="text-[#86868b] hover:text-[#1c1c1e] text-xl font-bold px-2">✕</button>
            </div>

            <div class="space-y-4">
                <!-- Stock Symbol -->
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <label class="text-[10px] text-[#6e6e73] uppercase tracking-wider block mb-1 font-semibold">Stock / ETF Symbol *</label>
                        <input id="mt_symbol" type="text" placeholder="e.g. RELIANCE.NS" 
                            class="w-full bg-[#f8f8fa] border border-[rgba(0,0,0,0.12)] rounded-lg px-3 py-2 text-sm text-[#1c1c1e] outline-none focus:border-[#007aff] focus:bg-white transition-all" />
                        <span class="text-[9px] text-[#86868b]">Use .NS for NSE, .BO for BSE</span>
                    </div>
                    <div>
                        <label class="text-[10px] text-[#6e6e73] uppercase tracking-wider block mb-1 font-semibold">Buy Date *</label>
                        <input id="mt_date" type="date" value="${today}"
                            class="w-full bg-[#f8f8fa] border border-[rgba(0,0,0,0.12)] rounded-lg px-3 py-2 text-sm text-[#1c1c1e] outline-none focus:border-[#007aff] focus:bg-white transition-all" />
                    </div>
                </div>

                <!-- Price & Qty -->
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <label class="text-[10px] text-[#6e6e73] uppercase tracking-wider block mb-1 font-semibold">Buy Price (₹) *</label>
                        <input id="mt_entry" type="number" step="0.05" placeholder="e.g. 1250.50"
                            class="w-full bg-[#f8f8fa] border border-[rgba(0,0,0,0.12)] rounded-lg px-3 py-2 text-sm text-[#1c1c1e] outline-none focus:border-[#007aff] focus:bg-white transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#6e6e73] uppercase tracking-wider block mb-1 font-semibold">Quantity *</label>
                        <input id="mt_qty" type="number" placeholder="e.g. 50"
                            class="w-full bg-[#f8f8fa] border border-[rgba(0,0,0,0.12)] rounded-lg px-3 py-2 text-sm text-[#1c1c1e] outline-none focus:border-[#007aff] focus:bg-white transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#6e6e73] uppercase tracking-wider block mb-1 font-semibold">Trade Type</label>
                        <select id="mt_style" class="w-full bg-[#f8f8fa] border border-[rgba(0,0,0,0.12)] rounded-lg px-3 py-2 text-sm text-[#1c1c1e] outline-none focus:border-[#007aff] focus:bg-white transition-all">
                            <option value="Manual">Manual</option>
                            <option value="Swing">Swing</option>
                            <option value="Positional">Positional</option>
                            <option value="ETF">ETF/SIP</option>
                            <option value="Intraday">Intraday</option>
                        </select>
                    </div>
                </div>

                <!-- Stop Loss & Targets -->
                <div class="grid grid-cols-3 gap-3">
                    <div>
                        <label class="text-[10px] text-[#b32020] uppercase tracking-wider block mb-1 font-semibold">Stop Loss (₹)</label>
                        <input id="mt_sl" type="number" step="0.05" placeholder="e.g. 1200"
                            class="w-full bg-[#f8f8fa] border border-[#f5c6cb] rounded-lg px-3 py-2 text-sm text-[#1c1c1e] outline-none focus:border-[#b32020] focus:bg-white transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#1e7e34] uppercase tracking-wider block mb-1 font-semibold">Target 1 (₹)</label>
                        <input id="mt_t1" type="number" step="0.05" placeholder="e.g. 1350"
                            class="w-full bg-[#f8f8fa] border border-[#c3e6cb] rounded-lg px-3 py-2 text-sm text-[#1c1c1e] outline-none focus:border-[#1e7e34] focus:bg-white transition-all" />
                    </div>
                    <div>
                        <label class="text-[10px] text-[#007aff] uppercase tracking-wider block mb-1 font-semibold">Target 2 (₹)</label>
                        <input id="mt_t2" type="number" step="0.05" placeholder="e.g. 1450"
                            class="w-full bg-[#f8f8fa] border border-[#b9d7fb] rounded-lg px-3 py-2 text-sm text-[#1c1c1e] outline-none focus:border-[#007aff] focus:bg-white transition-all" />
                    </div>
                </div>

                <!-- Notes -->
                <div>
                    <label class="text-[10px] text-[#6e6e73] uppercase tracking-wider block mb-1 font-semibold">Notes / Reason for Trade</label>
                    <input id="mt_notes" type="text" placeholder="e.g. Breakout above 200 DMA on high volume"
                        class="w-full bg-[#f8f8fa] border border-[rgba(0,0,0,0.12)] rounded-lg px-3 py-2 text-sm text-[#1c1c1e] outline-none focus:border-[#007aff] focus:bg-white transition-all" />
                </div>

                <!-- Auto-Calculate hint -->
                <div class="p-3 rounded-xl bg-[#eef5fd] border border-[#b9d7fb] text-xs text-[#0051a8]">
                    💡 After adding, this position will appear in your journal with <strong>live P&L</strong> calculated against the current market price.
                </div>
            </div>

            <!-- Actions -->
            <div class="flex gap-3 mt-5 pt-4 border-t border-[rgba(0,0,0,0.06)]">
                <button onclick="submitManualTrade()" class="flex-1 px-4 py-2.5 rounded-xl bg-[#007aff] hover:bg-[#0062cc] text-white font-semibold text-sm transition-all shadow-sm">
                    ✅ Add to Journal
                </button>
                <button onclick="closeManualModal()" class="px-4 py-2.5 rounded-xl bg-[#e3e3e8] hover:bg-[#d1d1d6] text-[#1c1c1e] font-semibold text-sm transition-all">
                    Cancel
                </button>
            </div>
        </div>
    `;
    modal.addEventListener("click", closeManualModal);
    document.body.appendChild(modal);
}

function closeManualModal() {
    const modal = document.getElementById("manualTradeModal");
    if (modal) modal.remove();
}

async function submitManualTrade() {
    const symbol = document.getElementById("mt_symbol")?.value.trim().toUpperCase();
    const entry_price = parseFloat(document.getElementById("mt_entry")?.value);
    const quantity = parseInt(document.getElementById("mt_qty")?.value);
    const stop_loss = parseFloat(document.getElementById("mt_sl")?.value) || 0;
    const target_1 = parseFloat(document.getElementById("mt_t1")?.value) || 0;
    const target_2 = parseFloat(document.getElementById("mt_t2")?.value) || 0;
    const style = document.getElementById("mt_style")?.value || "Manual";
    const notes = document.getElementById("mt_notes")?.value || "";
    const entry_date = document.getElementById("mt_date")?.value || "";

    if (!symbol || !entry_price || !quantity) {
        alert("Please fill in Symbol, Buy Price, and Quantity.");
        return;
    }

    // Ensure symbol has exchange suffix
    let finalSymbol = symbol;
    if (!finalSymbol.includes(".") ) {
        finalSymbol = finalSymbol + ".NS";
    }

    try {
        const res = await fetch("/api/journal/manual", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol: finalSymbol, entry_price, quantity, stop_loss, target_1, target_2, style, notes, entry_date })
        });
        const data = await res.json();
        if (data.status === "success") {
            closeManualModal();
            await loadTradeJournal();
            // Show success message
            const container = document.getElementById("journalNotification");
            if (container) {
                container.innerHTML = `<div class="p-3 text-xs text-emerald-400 bg-emerald-900/20 border border-emerald-700/30 rounded-xl flex items-center gap-2">✅ Position added! Live P&L will update shortly.</div>`;
                setTimeout(() => { if (container) container.innerHTML = ""; }, 4000);
            }
        } else {
            alert("Error: " + (data.message || "Could not add trade"));
        }
    } catch (e) {
        alert("Connection error. Please ensure the server is running.");
    }
}

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

/**
 * Export active and logged journal trades to a downloadable CSV file.
 */
function exportJournalToCSV() {
    if (!_lastActiveTrades || _lastActiveTrades.length === 0) {
        alert("⚠️ No active trades in the journal to export.");
        return;
    }

    const headers = ["ID", "Symbol", "Entry_Date", "Entry_Price_INR", "Current_Price_INR", "Quantity", "Stop_Loss_INR", "Target_1_INR", "Target_2_INR", "PNL_INR", "PNL_Pct", "Status", "Notes"];
    const rows = _lastActiveTrades.map(t => [
        t.id || "",
        `"${t.symbol || ''}"`,
        `"${t.entry_date || ''}"`,
        t.entry_price || 0,
        t.current_price || 0,
        t.quantity || 0,
        t.stop_loss || 0,
        t.target_1 || 0,
        t.target_2 || 0,
        t.pnl || 0,
        t.pnl_pct || 0,
        `"${t.status || 'ACTIVE'}"`,
        `"${(t.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `market_analysis_journal_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

/**
 * Open print dialogue for a clean print summary of the journal.
 */
function printJournalSummary() {
    window.print();
}

