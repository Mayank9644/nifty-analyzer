/**
 * Stock Screener Module (macOS Light Theme)
 * Interactive multi-parameter filtering for Indian equities.
 */

async function initScreener() {
    loadScreenerPresets("breakout");
}

function loadScreenerPresets(preset) {
    const peInput = document.getElementById("screenerPeMax");
    const roeInput = document.getElementById("screenerRoeMin");
    const rsiMinInput = document.getElementById("screenerRsiMin");
    const rsiMaxInput = document.getElementById("screenerRsiMax");
    const near52wCheck = document.getElementById("screener52wCheck");
    const volSurgeCheck = document.getElementById("screenerVolSurgeCheck");
    const goldenCrossCheck = document.getElementById("screenerGoldenCheck");

    if (preset === "breakout") {
        if (peInput) peInput.value = "";
        if (roeInput) roeInput.value = "10";
        if (rsiMinInput) rsiMinInput.value = "50";
        if (rsiMaxInput) rsiMaxInput.value = "75";
        if (near52wCheck) near52wCheck.checked = true;
        if (volSurgeCheck) volSurgeCheck.checked = true;
        if (goldenCrossCheck) goldenCrossCheck.checked = true;
    } else if (preset === "compounder") {
        if (peInput) peInput.value = "30";
        if (roeInput) roeInput.value = "18";
        if (rsiMinInput) rsiMinInput.value = "40";
        if (rsiMaxInput) rsiMaxInput.value = "70";
        if (near52wCheck) near52wCheck.checked = false;
        if (volSurgeCheck) volSurgeCheck.checked = false;
        if (goldenCrossCheck) goldenCrossCheck.checked = true;
    } else if (preset === "oversold") {
        if (peInput) peInput.value = "35";
        if (roeInput) roeInput.value = "12";
        if (rsiMinInput) rsiMinInput.value = "20";
        if (rsiMaxInput) rsiMaxInput.value = "45";
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
        const res = await fetch(`/api/screener?${params.toString()}`);
        const data = await res.json();
        const results = data.results || [];

        if (countBadge) {
            countBadge.innerText = `${results.length} Stocks Matched`;
        }

        if (results.length === 0) {
            container.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-10 text-xs text-[#6e6e73]">
                        No stocks matched all active filter criteria. Try relaxing the P/E or RSI constraints.
                    </td>
                </tr>
            `;
            return;
        }

        _lastScreenerResults = results;

        container.innerHTML = results.map(s => {
            const priceVal = Number(s.current_price) || 0;
            const chgVal = Number(s.day_change_pct) || 0;
            const isGreen = chgVal >= 0;
            return `
                <tr class="hover:bg-[#f8f8fa] transition-colors border-b border-[rgba(0,0,0,0.05)] cursor-pointer" onclick="selectSearchedStock('${s.symbol}')">
                    <td class="px-4 py-3">
                        <div class="font-semibold text-xs text-[#1c1c1e]">${s.code}</div>
                        <div class="text-[10.5px] text-[#6e6e73] truncate max-w-[180px]">${s.name}</div>
                    </td>
                    <td class="px-4 py-3 text-xs text-[#6e6e73]">
                        <span class="badge-stock">${s.sector}</span>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <div class="text-xs font-semibold mono text-[#1c1c1e]">${priceVal > 0 ? '₹' + priceVal.toLocaleString('en-IN') : '—'}</div>
                        <div class="text-[10.5px] font-medium mono ${isGreen ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                            ${s.day_change_pct != null ? (isGreen ? '▲ +' : '▼ ') + chgVal + '%' : '—'}
                        </div>
                    </td>
                    <td class="px-4 py-3 text-center mono text-xs text-[#1c1c1e]">
                        ${s.pe_ratio > 0 ? s.pe_ratio + 'x' : '—'}
                    </td>
                    <td class="px-4 py-3 text-center mono text-xs font-medium ${s.roe >= 18 ? 'text-[#1e7e34]' : 'text-[#1c1c1e]'}">
                        ${s.roe > 0 ? s.roe + '%' : '—'}
                    </td>
                    <td class="px-4 py-3 text-center mono text-xs font-medium">
                        <span class="px-2 py-0.5 rounded-full ${s.rsi >= 70 ? 'bg-[#fdf0f0] text-[#b32020]' : (s.rsi <= 35 ? 'bg-[#edf7ee] text-[#1e7e34]' : 'bg-[#f5f5f7] text-[#1c1c1e]')}">
                            ${s.rsi}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-center text-xs">
                        <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-semibold border ${s.tag_color}">
                            ${s.setup_tag}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-right">
                        <button class="px-2.5 py-1 text-[11px] font-medium rounded-lg bg-[#007aff] text-white hover:bg-[#0062cc] transition-all">
                            Analyze ➔
                        </button>
                    </td>
                </tr>
            `;
        }).join("");

    } catch (e) {
        console.error("Screener error:", e);
        container.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-8 text-xs text-[#b32020]">
                    Failed to run screener. Please check connection and retry.
                </td>
            </tr>
        `;
    }
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

