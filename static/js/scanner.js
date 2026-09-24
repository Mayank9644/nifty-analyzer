/**
 * SEPA V4 Alpha-Momentum Live Scanner with Position Sizing Client Engine.
 */

/**
 * SEPA V4 Alpha-Momentum Live Scanner with Position Sizing Client Engine.
 */

async function runLiveScanner(forceRefresh = false) {
    const capitalInput = document.getElementById("scannerCapitalInput");
    const riskInput = document.getElementById("scannerRiskInput");
    const container = document.getElementById("scannerResultsContainer");
    const statusBanner = document.getElementById("scannerStatusBanner");

    const capital = parseFloat(capitalInput ? capitalInput.value : 1000000) || 1000000;
    const riskPct = parseFloat(riskInput ? riskInput.value : 2.0) || 2.0;

    if (statusBanner) {
        statusBanner.innerHTML = `
            <span class="inline-flex items-center text-[#007aff] gap-2 font-medium">
                <svg class="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Scanning universe for SEPA V4 Trend Breakouts & calculating position sizes...
            </span>
        `;
    }

    if (container && !container.querySelector("table")) {
        container.innerHTML = `
            <div class="py-12 text-center text-xs text-[#8e8e93]">
                <svg class="animate-spin h-6 w-6 text-[#007aff] mx-auto mb-2.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Evaluating 60+ NSE momentum leaders across Minervini Trend Templates...</span>
            </div>
        `;
    }

    try {
        const url = `/api/scanner?capital=${capital}&risk_pct=${riskPct}${forceRefresh ? '&refresh=true' : ''}`;
        const res = await fetch(url);
        const data = await res.json();

        if (data.status === "success") {
            const results = data.results || [];
            if (statusBanner) {
                statusBanner.innerHTML = `
                    <span class="text-emerald-700 font-semibold">✓ Scan Complete:</span> Found <strong>${results.length}</strong> high-probability setups from ${data.total_scanned} scanned stocks. Max Risk per trade: <strong class="mono">₹${(data.max_risk_per_trade || 0).toLocaleString('en-IN')}</strong>.
                `;
            }
            renderScannerTable(results, capital, riskPct);
        } else {
            throw new Error(data.message || "Failed to fetch scanner results");
        }
    } catch (e) {
        console.error("Scanner error:", e);
        if (statusBanner) {
            statusBanner.innerHTML = `<span class="text-rose-600 font-medium">⚠️ Scan failed: ${e.message || 'Connection error'}. Please try again.</span>`;
        }
        if (container) {
            container.innerHTML = `<div class="p-8 text-center text-rose-600 text-xs">Error loading scanner data. Click "Run Live Scan" to retry.</div>`;
        }
    }
}

function renderScannerTable(candidates, capital, riskPct) {
    const container = document.getElementById("scannerResultsContainer");
    if (!container) return;

    if (!candidates.length) {
        container.innerHTML = `<div class="p-8 text-center text-[#86868b] text-xs">No stocks currently meet strict SEPA V4 breakout criteria. Market may be consolidating.</div>`;
        return;
    }

    let rowsHtml = candidates.map(c => {
        const s = c.sizing || {};
        return `
            <tr class="border-b border-[rgba(0,0,0,0.06)] dark:border-white/5 hover:bg-[#f5f5f7] dark:hover:bg-white/5 transition-colors text-xs text-[#1c1c1e] dark:text-[#f5f5f7]">
                <!-- Stock Details -->
                <td class="py-3 px-3 text-col">
                    <div class="font-bold text-[#1c1c1e] dark:text-[#f5f5f7]">${c.code}</div>
                    <span class="text-[10px] text-[#86868b] dark:text-[#a1a1a6] block">${c.name}</span>
                    <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#eef5fd] dark:bg-blue-900/30 text-[#007aff] dark:text-blue-300 font-medium mt-0.5 inline-block">${c.pattern}</span>
                </td>

                <!-- Alpha Score -->
                <td class="py-3 px-2 badge-col">
                    <span class="font-bold px-2.5 py-1 rounded-md text-xs ${c.score >= 80 ? 'bg-[#edf7ee] text-[#1e7e34] border border-[#c3e6cb]' : 'bg-[#eef5fd] text-[#007aff] border border-[#b9d7fb]'}">
                        ${c.score}
                    </span>
                </td>

                <!-- Price & Stops -->
                <td class="py-3 px-3 num-col font-semibold text-[#1c1c1e] dark:text-[#f5f5f7]">${formatINR(c.current_price || 0)}</td>
                <td class="py-3 px-3 num-col text-[#b32020]">
                    ${formatINR(c.stop_loss || 0)}
                    <span class="text-[10px] text-[#86868b] dark:text-[#a1a1a6] block font-normal">(-${c.stop_loss_pct}%)</span>
                </td>

                <!-- Targets -->
                <td class="py-3 px-3 num-col text-[#1e7e34] font-semibold">
                    ${formatINR(c.target_2r || 0)} <span class="text-[10px] text-[#86868b] dark:text-[#a1a1a6] font-normal">(2R)</span>
                    <span class="text-[10px] text-[#1e7e34] block font-normal">${formatINR(c.target_3r || 0)} (3R)</span>
                </td>

                <!-- Calculated Position Sizing -->
                <td class="py-3 px-3 num-col bg-[#eef5fd]/60 dark:bg-white/5 border-x border-[rgba(0,0,0,0.06)] dark:border-white/5">
                    <div class="font-bold text-[#007aff] dark:text-blue-400 text-sm">${s.shares_to_buy || 0} Shares</div>
                    <span class="text-[10px] text-[#6e6e73] dark:text-[#a1a1a6] block">Capital: ${formatINR(s.position_value || 0)} (${s.position_pct_capital || 0}%)</span>
                    <span class="text-[9px] text-[#b32020] block">Max Risk: ${formatINR(s.max_risk_rupees || 0)}</span>
                </td>

                <!-- Action Buttons: Trade on Broker, Journal, and Analyze -->
                <td class="py-3 px-3 badge-col space-y-1">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="openBrokerOrderModal('${c.symbol}', ${s.shares_to_buy || 10}, ${c.current_price}, ${c.stop_loss}, ${c.target_2r})" class="btn-broker" title="Execute on Zerodha Kite or Dhan">
                            <span>⚡</span> <span>Broker</span>
                        </button>
                        <button onclick="takeTradeFromScanner('${c.symbol}', ${c.current_price}, ${s.shares_to_buy}, ${c.stop_loss}, ${c.target_2r}, ${c.target_3r})" class="btn-log" title="Log trade in personal journal">
                            <span>🎯</span> <span>Log</span>
                        </button>
                    </div>
                    <button onclick="selectSearchedStock('${c.symbol}')" class="btn-chart mx-auto" title="Analyze chart">
                        <span>📈</span> <span>Chart ➔</span>
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="bg-[#f5f5f7] dark:bg-[#1a1c26] text-[#6e6e73] dark:text-[#a1a1a6] text-[11px] font-semibold uppercase tracking-wider border-b border-[rgba(0,0,0,0.08)] dark:border-white/10">
                        <th class="py-2.5 px-3 text-col">Stock / Pattern</th>
                        <th class="py-2.5 px-2 badge-col">Alpha Score</th>
                        <th class="py-2.5 px-3 num-col">Entry (CMP)</th>
                        <th class="py-2.5 px-3 num-col">Stop-Loss (ATR)</th>
                        <th class="py-2.5 px-3 num-col">Targets (2R / 3R)</th>
                        <th class="py-2.5 px-3 num-col bg-[#eef5fd] dark:bg-white/5 text-[#007aff] dark:text-blue-400 font-semibold border-x border-[rgba(0,0,0,0.08)] dark:border-white/10">Calculated Sizing</th>
                        <th class="py-2.5 px-3 badge-col">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}


function takeTradeFromScanner(symbol, entryPrice, qty, sl, t1, t2) {
    if (typeof openManualTradeModal === "function") {
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
            if (e) e.value = entryPrice;
            if (q) q.value = qty;
            if (slEl) slEl.value = sl;
            if (t1El) t1El.value = t1;
            if (t2El) t2El.value = t2;
            if (noteEl) noteEl.value = "Added from scanner / analysis";
        }, 50);
        return;
    }
    // Fallback direct API logging if modal not in DOM
    fetch("/api/journal/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            symbol: symbol,
            entry_price: entryPrice,
            quantity: qty,
            stop_loss: sl,
            target_1: t1,
            target_2: t2,
            style: "SEPA Breakout",
            notes: "Taken from Alpha-Momentum Scanner"
        })
    }).then(r => r.json()).then(data => {
        if (data.status === "success") {
            showNotification(`🎉 Position logged: ${symbol.replace('.NS', '')} (${qty} shares @ ₹${entryPrice})`, "success");
        } else {
            showNotification(`Failed to log trade: ${data.message || 'Error'}`, "error");
        }
    }).catch(e => {
        console.error("Error adding trade:", e);
        showNotification("Failed to add trade to journal", "error");
    });
}

window.runLiveScanner = runLiveScanner;
window.takeTradeFromScanner = takeTradeFromScanner;
window.renderScannerTable = renderScannerTable;
