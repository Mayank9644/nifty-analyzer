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
            <tr class="border-b border-[rgba(0,0,0,0.06)] hover:bg-[#f5f5f7] transition-colors text-xs text-[#1c1c1e]">
                <!-- Stock Details -->
                <td class="py-3 px-3">
                    <div class="font-bold text-[#1c1c1e]">${c.code}</div>
                    <span class="text-[10px] text-[#86868b] block">${c.name}</span>
                    <span class="text-[9px] px-1.5 py-0.5 rounded bg-[#eef5fd] text-[#007aff] font-medium mt-0.5 inline-block">${c.pattern}</span>
                </td>

                <!-- Alpha Score -->
                <td class="py-3 px-2 text-center">
                    <span class="font-bold px-2.5 py-1 rounded-md text-xs ${c.score >= 80 ? 'bg-[#edf7ee] text-[#1e7e34] border border-[#c3e6cb]' : 'bg-[#eef5fd] text-[#007aff] border border-[#b9d7fb]'}">
                        ${c.score}
                    </span>
                </td>

                <!-- Price & Stops -->
                <td class="py-3 px-3 font-semibold text-[#1c1c1e] mono">₹${(c.current_price || 0).toLocaleString('en-IN')}</td>
                <td class="py-3 px-3 text-[#b32020] mono">
                    ₹${(c.stop_loss || 0).toLocaleString('en-IN')}
                    <span class="text-[10px] text-[#86868b] block font-normal">(-${c.stop_loss_pct}%)</span>
                </td>

                <!-- Targets -->
                <td class="py-3 px-3 text-[#1e7e34] mono font-semibold">
                    ₹${(c.target_2r || 0).toLocaleString('en-IN')} <span class="text-[10px] text-[#86868b] font-normal">(2R)</span>
                    <span class="text-[10px] text-[#1e7e34] block font-normal">₹${(c.target_3r || 0).toLocaleString('en-IN')} (3R)</span>
                </td>

                <!-- Calculated Position Sizing -->
                <td class="py-3 px-3 bg-[#eef5fd]/60 border-x border-[rgba(0,0,0,0.06)]">
                    <div class="font-bold text-[#007aff] mono text-sm">${s.shares_to_buy || 0} Shares</div>
                    <span class="text-[10px] text-[#6e6e73] block">Capital: ₹${(s.position_value || 0).toLocaleString('en-IN')} (${s.position_pct_capital || 0}%)</span>
                    <span class="text-[9px] text-[#b32020] block">Max Risk: ₹${(s.max_risk_rupees || 0).toLocaleString('en-IN')}</span>
                </td>

                <!-- Action Buttons: Trade on Broker, Journal, and Analyze -->
                <td class="py-3 px-3 text-center space-y-1">
                    <div class="flex items-center justify-center gap-1.5">
                        <button onclick="openBrokerOrderModal('${c.symbol}', ${s.shares_to_buy || 10}, ${c.current_price}, ${c.stop_loss}, ${c.target_2r})" class="px-2 py-1 rounded-md bg-[#eff6ff] hover:bg-[#dbeafe] text-[#007aff] font-semibold text-[10.5px] transition-all flex items-center gap-1 cursor-pointer" title="Execute on Zerodha Kite or Dhan">
                            <span>⚡</span> <span>Broker</span>
                        </button>
                        <button onclick="takeTradeFromScanner('${c.symbol}', ${c.current_price}, ${s.shares_to_buy}, ${c.stop_loss}, ${c.target_2r}, ${c.target_3r})" class="px-2 py-1 rounded-md bg-[#007aff] hover:bg-[#0062cc] text-white font-semibold text-[10.5px] shadow-xs transition-all flex items-center gap-1 cursor-pointer" title="Log trade in personal journal">
                            <span>🎯</span> <span>Log</span>
                        </button>
                    </div>
                    <button onclick="selectSearchedStock('${c.symbol}')" class="text-[10px] text-[#86868b] hover:text-[#007aff] underline block mx-auto transition-colors cursor-pointer">
                        Analyze Chart ➔
                    </button>
                </td>
            </tr>
        `;
    }).join("");

    container.innerHTML = `
        <div class="overflow-x-auto">
            <table class="w-full text-left border-collapse text-xs">
                <thead>
                    <tr class="bg-[#f5f5f7] text-[#6e6e73] text-[11px] font-semibold uppercase tracking-wider border-b border-[rgba(0,0,0,0.08)]">
                        <th class="py-2.5 px-3">Stock / Pattern</th>
                        <th class="py-2.5 px-2 text-center">Alpha Score</th>
                        <th class="py-2.5 px-3">Entry (CMP)</th>
                        <th class="py-2.5 px-3">Stop-Loss (ATR)</th>
                        <th class="py-2.5 px-3">Targets (2R / 3R)</th>
                        <th class="py-2.5 px-3 bg-[#eef5fd] text-[#007aff] font-semibold border-x border-[rgba(0,0,0,0.08)]">Calculated Sizing (Qty)</th>
                        <th class="py-2.5 px-3 text-center">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>
        </div>
    `;
}

async function takeTradeFromScanner(symbol, entryPrice, qty, sl, t1, t2) {
    try {
        const res = await fetch("/api/journal/add", {
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
        });
        const data = await res.json();
        if (data.status === "success") {
            showNotification(`🎉 Position logged: ${symbol.replace('.NS', '')} (${qty} shares @ ₹${entryPrice})`, "success");
        } else {
            showNotification(`Failed to log trade: ${data.message || 'Error'}`, "error");
        }
    } catch (e) {
        console.error("Error adding trade:", e);
        showNotification("Failed to add trade to journal", "error");
    }
}

window.runLiveScanner = runLiveScanner;
window.takeTradeFromScanner = takeTradeFromScanner;
window.renderScannerTable = renderScannerTable;
