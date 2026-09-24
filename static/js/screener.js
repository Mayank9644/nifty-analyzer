/**
 * Stock Screener Module (macOS Light Theme)
 * Interactive multi-parameter filtering for Indian equities.
 */

async function initScreener() {
    loadScreenerPresets("all_active");
}

function loadScreenerPresets(preset) {
    const peInput = document.getElementById("screenerPeMax");
    const roeInput = document.getElementById("screenerRoeMin");
    const rsiMinInput = document.getElementById("screenerRsiMin");
    const rsiMaxInput = document.getElementById("screenerRsiMax");
    const near52wCheck = document.getElementById("screener52wCheck");
    const volSurgeCheck = document.getElementById("screenerVolSurgeCheck");
    const goldenCrossCheck = document.getElementById("screenerGoldenCheck");

    if (preset === "all_active" || preset === "all") {
        if (peInput) peInput.value = "";
        if (roeInput) roeInput.value = "10";
        if (rsiMinInput) rsiMinInput.value = "35";
        if (rsiMaxInput) rsiMaxInput.value = "80";
        if (near52wCheck) near52wCheck.checked = false;
        if (volSurgeCheck) volSurgeCheck.checked = false;
        if (goldenCrossCheck) goldenCrossCheck.checked = true;
    } else if (preset === "breakout") {
        if (peInput) peInput.value = "";
        if (roeInput) roeInput.value = "";
        if (rsiMinInput) rsiMinInput.value = "45";
        if (rsiMaxInput) rsiMaxInput.value = "78";
        if (near52wCheck) near52wCheck.checked = true;
        if (volSurgeCheck) volSurgeCheck.checked = false;
        if (goldenCrossCheck) goldenCrossCheck.checked = true;
    } else if (preset === "compounder") {
        if (peInput) peInput.value = "45";
        if (roeInput) roeInput.value = "15";
        if (rsiMinInput) rsiMinInput.value = "35";
        if (rsiMaxInput) rsiMaxInput.value = "75";
        if (near52wCheck) near52wCheck.checked = false;
        if (volSurgeCheck) volSurgeCheck.checked = false;
        if (goldenCrossCheck) goldenCrossCheck.checked = true;
    } else if (preset === "oversold") {
        if (peInput) peInput.value = "";
        if (roeInput) roeInput.value = "";
        if (rsiMinInput) rsiMinInput.value = "20";
        if (rsiMaxInput) rsiMaxInput.value = "50";
        if (near52wCheck) near52wCheck.checked = false;
        if (volSurgeCheck) volSurgeCheck.checked = false;
        if (goldenCrossCheck) goldenCrossCheck.checked = false;
    }

    runScreenerQuery();
}

async function runScreenerQuery() {
    const container = document.getElementById("screenerResultsTable");
    const countBadge = document.getElementById("screenerMatchCount");
    if (!container) return;

    container.innerHTML = `
        <tr>
            <td colspan="8" class="text-center py-10 text-xs text-[#6e6e73]">
                <svg class="animate-spin h-5 w-5 mx-auto mb-2 text-[#007aff]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Scanning Nifty 50 & Midcap universe with selected parameters...
            </td>
        </tr>
    `;

    const peMax = document.getElementById("screenerPeMax")?.value || "";
    const roeMin = document.getElementById("screenerRoeMin")?.value || "";
    const rsiMin = document.getElementById("screenerRsiMin")?.value || "";
    const rsiMax = document.getElementById("screenerRsiMax")?.value || "";
    const near52w = document.getElementById("screener52wCheck")?.checked || false;
    const volSurge = document.getElementById("screenerVolSurgeCheck")?.checked || false;
    const goldenCross = document.getElementById("screenerGoldenCheck")?.checked || false;
    const sector = document.getElementById("screenerSectorSelect")?.value || "All";

    const params = new URLSearchParams();
    if (peMax) params.append("pe_max", peMax);
    if (roeMin) params.append("roe_min", roeMin);
    if (rsiMin) params.append("rsi_min", rsiMin);
    if (rsiMax) params.append("rsi_max", rsiMax);
    if (near52w) params.append("near_52w_high", "true");
    if (volSurge) params.append("volume_surge", "true");
    if (goldenCross) params.append("golden_cross", "true");
    if (sector && sector !== "All") params.append("sector", sector);

    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const res = await fetch(`/api/screener?${params.toString()}`, { signal: controller.signal });
        clearTimeout(timeoutId);
        const data = await res.json();
        const results = data.results || [];

        if (countBadge) {
            countBadge.innerText = `${results.length} Stocks Matched`;
        }

        if (results.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-10 text-xs text-[#6e6e73]">
                        <div class="font-medium text-sm text-[#1c1c1e] mb-1">No stocks matched all active filter criteria</div>
                        <div class="text-[#8e8e93] mb-3">Try widening P/E, RSI ranges or unchecking strict volume/52W high conditions.</div>
                        <button onclick="loadScreenerPresets('all_active')" class="px-3 py-1.5 rounded-lg bg-[#007aff] text-white font-medium text-xs shadow-xs hover:bg-[#0062cc] transition-all cursor-pointer">
                            Reset to All Leaders
                        </button>
                    </td>
                </tr>
            `;
            return;
        }

        _lastScreenerResults = results;
        _renderScreenerRows(container, results);

    } catch (e) {
        console.warn("Live screener fetch paused, attempting fallback:", e);
        try {
            const fallbackRes = await fetch("/static/data/screener_fallback.json?v=20260911");
            const fallbackData = await fallbackRes.json();
            const fallbackResults = fallbackData.results || [];
            if (fallbackResults.length > 0) {
                if (countBadge) {
                    countBadge.innerText = `${fallbackResults.length} Stocks (Cached)`;
                }
                _lastScreenerResults = fallbackResults;
                _renderScreenerRows(container, fallbackResults);
                return;
            }
        } catch (fErr) {
            console.error("Screener fallback error:", fErr);
        }

        container.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-xs text-[#6e6e73]">
                    <div class="font-semibold text-[#1c1c1e] mb-1">Connecting to Screener Engine</div>
                    <div class="text-[#8e8e93] mb-3">Retrying stock calculations in the background...</div>
                    <button onclick="runScreenerQuery()" class="btn-primary px-3.5 py-1.5 text-xs inline-flex items-center gap-1.5 cursor-pointer">
                        <span>🔄</span> <span>Retry Screener</span>
                    </button>
                </td>
            </tr>
        `;
    }
}

function _renderScreenerRows(container, results) {
    container.innerHTML = results.map(s => {
        const priceVal = Number(s.current_price) || 0;
        const chgVal = Number(s.day_change_pct) || 0;
        const isGreen = chgVal >= 0;
        return `
            <tr class="hover:bg-[#f8f8fa] dark:hover:bg-white/5 transition-colors border-b border-[rgba(0,0,0,0.05)] dark:border-white/5 cursor-pointer" onclick="selectSearchedStock('${s.symbol}')">
                <td class="px-4 py-3">
                    <div class="font-semibold text-xs text-[#1c1c1e] dark:text-[#f5f5f7]">${s.code}</div>
                    <div class="text-[10.5px] text-[#6e6e73] dark:text-[#a1a1a6] truncate max-w-[180px]">${s.name}</div>
                </td>
                <td class="px-4 py-3 text-xs text-[#6e6e73] dark:text-[#a1a1a6]">
                    <span class="badge-stock">${s.sector}</span>
                </td>
                <td class="px-4 py-3 text-right">
                    <div class="text-xs font-semibold mono text-[#1c1c1e] dark:text-[#f5f5f7]">${priceVal > 0 ? '₹' + priceVal.toLocaleString('en-IN') : '—'}</div>
                    <div class="text-[10.5px] font-medium mono ${isGreen ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                        ${s.day_change_pct != null ? (isGreen ? '▲ +' : '▼ ') + chgVal + '%' : '—'}
                    </div>
                </td>
                <td class="px-4 py-3 text-center mono text-xs text-[#1c1c1e] dark:text-[#f5f5f7]">
                    ${s.pe_ratio > 0 ? s.pe_ratio + 'x' : '—'}
                </td>
                <td class="px-4 py-3 text-center mono text-xs font-medium ${s.roe >= 18 ? 'text-[#1e7e34]' : 'text-[#1c1c1e] dark:text-[#f5f5f7]'}">
                    ${s.roe > 0 ? s.roe + '%' : '—'}
                </td>
                <td class="px-4 py-3 text-center mono text-xs font-medium">
                    <span class="px-2 py-0.5 rounded-full ${s.rsi >= 70 ? 'bg-[#fdf0f0] text-[#b32020]' : (s.rsi <= 35 ? 'bg-[#edf7ee] text-[#1e7e34]' : 'bg-[#f5f5f7] dark:bg-white/10 text-[#1c1c1e] dark:text-[#f5f5f7]')}">
                        ${s.rsi}
                    </span>
                </td>
                <td class="px-4 py-3 text-center text-xs">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold border ${s.tag_color}">
                        ${s.setup_tag}
                    </span>
                </td>
                <td class="px-3 py-3 text-right">
                    <div class="flex items-center justify-end gap-1.5" onclick="event.stopPropagation()">
                        <button onclick="openBrokerOrderModal('${s.symbol}', 10, ${priceVal || 0}, ${((priceVal*0.97).toFixed(2)) || 0}, ${((priceVal*1.05).toFixed(2)) || 0})" class="btn-broker" title="Execute on Zerodha Kite or Dhan">
                            <span>⚡</span> <span>Broker</span>
                        </button>
                        <button onclick="selectSearchedStock('${s.symbol}')" class="btn-primary px-2.5 py-1 text-[11px] cursor-pointer" title="Load chart">
                            <span>📈</span> <span>Chart</span>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

let _lastScreenerResults = [];

/**
 * Export current screener results to a downloadable CSV file.
 */
function exportScreenerToCSV() {
    if (!_lastScreenerResults || _lastScreenerResults.length === 0) {
        alert("⚠️ No screener results to export. Please run a filter query first.");
        return;
    }

    const headers = ["Symbol", "Name", "Sector", "Price_INR", "Day_Change_Pct", "PE_Ratio", "ROE_Pct", "RSI_14", "Setup_Tag"];
    const rows = _lastScreenerResults.map(s => [
        `"${s.symbol}"`,
        `"${(s.name || '').replace(/"/g, '""')}"`,
        `"${s.sector || ''}"`,
        s.current_price || 0,
        s.day_change_pct || 0,
        s.pe_ratio || "",
        s.roe || "",
        s.rsi || "",
        `"${s.setup_tag || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `market_analysis_screener_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

