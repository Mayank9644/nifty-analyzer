/**
 * FRESH ETF Mean-Reversion Screener Client.
 */

async function loadEtfScreener() {
    const tableContainer = document.getElementById("etfTableContainer");
    const capitalInput = document.getElementById("etfCapitalInput");
    const capital = parseFloat(capitalInput ? capitalInput.value : 1000000) || 1000000;

    if (tableContainer) {
        tableContainer.innerHTML = `
            <div class="p-8 text-center text-[#86868b] text-xs space-y-2">
                <svg class="animate-spin h-5 w-5 mx-auto text-[#007aff]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                    <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <p>Evaluating systematic FRESH mean-reversion rules across Core Indian ETF universe...</p>
            </div>
        `;
    }

    try {
        const res = await fetch(`/api/etf/screener?capital=${capital}`);
        const data = await res.json();

        if (data.status === "success") {
            renderEtfDashboard(data);
        } else {
            if (tableContainer) tableContainer.innerHTML = `<div class="p-6 text-center text-xs text-[#b32020]">${data.message || 'Error loading ETF screener'}</div>`;
        }
    } catch (e) {
        console.error("Error loading ETF screener:", e);
        if (tableContainer) tableContainer.innerHTML = `<div class="p-6 text-center text-xs text-[#b32020]">Failed to connect to server. Please check connection.</div>`;
    }
}

function renderEtfDashboard(data) {
    const macro = data.macro_filter;
    const summary = data.portfolio_summary;
    const newEntries = data.new_entries || [];
    const etfs = data.etfs || [];

    // Macro Banner
    const macroBanner = document.getElementById("etfMacroBanner");
    if (macroBanner && macro) {
        macroBanner.innerHTML = `
            <div class="p-4 rounded-xl ${macro.is_green ? 'bg-[#edf7ee] border border-[#c3e6cb] text-[#1e7e34]' : 'bg-[#fdf0f0] border border-[#f5c6cb] text-[#b32020]'} flex justify-between items-center">
                <div>
                    <span class="text-xs font-semibold uppercase tracking-wider block">Macro Filter (Nifty 50 vs 100 DMA)</span>
                    <div class="text-sm font-bold mt-0.5">${macro.verdict}</div>
                </div>
                <div class="text-right mono text-xs">
                    <div>Spot: ₹${macro.nifty_spot}</div>
                    <div class="text-[#6e6e73]">100 DMA: ₹${macro.nifty_sma100}</div>
                </div>
            </div>
        `;
    }

    // Portfolio rules stats
    const chunkVal = document.getElementById("etfChunkSizeVal");
    if (chunkVal && summary) chunkVal.innerText = `₹${formatNumber(summary.chunk_size, 0)}`;

    const totalChunks = document.getElementById("etfTotalChunksVal");
    if (totalChunks && summary) totalChunks.innerText = `${summary.max_chunks} Chunks (5% each)`;

    // New Entries
    const entriesBox = document.getElementById("etfNewEntriesContainer");
    if (entriesBox) {
        if (newEntries.length) {
            entriesBox.innerHTML = newEntries.map(e => `
                <div class="p-3.5 rounded-xl bg-[#edf7ee] border border-[#c3e6cb] flex justify-between items-center text-xs">
                    <div>
                        <span class="font-bold text-[#1c1c1e] text-sm">${e.code}</span>
                        <span class="text-[#6e6e73] block">${e.name}</span>
                        <span class="text-[#1e7e34] text-[11px] font-medium">${e.reason}</span>
                    </div>
                    <div class="text-right">
                        <span class="font-bold text-[#1e7e34] text-sm block mono">${e.shares} Units</span>
                        <span class="text-[#6e6e73] text-[10px]">₹${formatNumber(e.allocation_rupees, 0)}</span>
                    </div>
                </div>
            `).join("");
        } else {
            entriesBox.innerHTML = `<div class="p-4 text-xs text-[#86868b] text-center">No new ETF entries triggered today. Holding existing portfolio positions.</div>`;
        }
    }

    // All Core ETFs Table
    const tableContainer = document.getElementById("etfTableContainer");
    if (tableContainer) {
        tableContainer.innerHTML = `
            <div class="overflow-x-auto">
                <table class="w-full text-left border-collapse text-xs">
                    <thead>
                        <tr class="bg-[#f5f5f7] text-[#6e6e73] text-[11px] font-semibold uppercase tracking-wider border-b border-[rgba(0,0,0,0.08)]">
                            <th class="py-2.5 px-3">Core ETF</th>
                            <th class="py-2.5 px-3">Category</th>
                            <th class="py-2.5 px-3 text-right">Price</th>
                            <th class="py-2.5 px-3 text-center">RSI (14)</th>
                            <th class="py-2.5 px-3 text-center">Vs 20 DMA</th>
                            <th class="py-2.5 px-3 text-center">From 52W High</th>
                            <th class="py-2.5 px-3 text-center">System Signal</th>
                            <th class="py-2.5 px-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${etfs.map(e => {
                            const sym = e.code.endsWith('.NS') ? e.code : `${e.code}.NS`;
                            return `
                                <tr class="border-b border-[rgba(0,0,0,0.06)] hover:bg-[#f5f5f7] transition-colors cursor-pointer" onclick="selectSearchedStock('${sym}')">
                                    <td class="py-3 px-3 text-col">
                                        <div class="font-bold text-[#1c1c1e] text-xs">${e.icon || '📈'} ${e.code}</div>
                                        <span class="text-[10.5px] text-[#86868b]">${e.name}</span>
                                    </td>
                                    <td class="py-3 px-3 text-col text-[#6e6e73] text-[11px]">
                                        <span class="badge-stock">${e.category || 'Equity'}</span>
                                    </td>
                                    <td class="py-3 px-3 num-col font-semibold text-[#1c1c1e]">${formatINR(e.current_price || 0)}</td>
                                    <td class="py-3 px-3 badge-col mono ${e.rsi < 35 ? 'text-[#1e7e34] font-bold' : (e.rsi > 70 ? 'text-[#b32020] font-bold' : 'text-[#48484a]')}">
                                        <span class="px-2 py-0.5 rounded-full ${e.rsi < 35 ? 'bg-[#edf7ee]' : (e.rsi > 70 ? 'bg-[#fdf0f0]' : 'bg-[#f5f5f7]')}">${e.rsi}</span>
                                    </td>
                                    <td class="py-3 px-3 num-col mono ${e.dist_20dma <= 0 ? 'text-[#1e7e34] font-medium' : 'text-[#6e6e73]'}">${e.dist_20dma > 0 ? '+' : ''}${e.dist_20dma}%</td>
                                    <td class="py-3 px-3 num-col mono text-[#b32020] font-medium">-${e.dist_52h}%</td>
                                    <td class="py-3 px-3 badge-col font-bold text-[11px]" style="color: ${e.action_color}">
                                        ${e.action}
                                    </td>
                                    <td class="py-3 px-3 text-right" onclick="event.stopPropagation();">
                                        <div class="flex items-center justify-end gap-1.5">
                                            <button onclick="openBrokerOrderModal('${sym}', 20, ${e.current_price || 0}, ${((e.current_price*0.97).toFixed(2)) || 0}, ${((e.current_price*1.05).toFixed(2)) || 0})" class="btn-broker" title="Execute on Zerodha Kite or Dhan">
                                                <span>⚡</span> <span>Broker</span>
                                            </button>
                                            <button onclick="selectSearchedStock('${sym}')" class="btn-primary px-2.5 py-1 text-[11px] cursor-pointer" title="Load chart">
                                                <span>📈</span> <span>Chart</span>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            `;
                        }).join("")}
                    </tbody>
                </table>
            </div>
        `;
        _lastEtfData = data;
    }
}

let _lastEtfData = null;

/**
 * Export current ETF Screener status to a downloadable CSV file.
 */
function exportEtfToCSV() {
    if (!_lastEtfData || !_lastEtfData.etfs || _lastEtfData.etfs.length === 0) {
        alert("⚠️ No ETF data loaded to export. Please evaluate ETFs first.");
        return;
    }

    const headers = ["ETF_Code", "Name", "Category", "Price_INR", "RSI_14", "Dist_20_DMA_Pct", "Dist_52W_High_Pct", "System_Signal"];
    const rows = _lastEtfData.etfs.map(e => [
        `"${e.code}"`,
        `"${(e.name || '').replace(/"/g, '""')}"`,
        `"${e.category || ''}"`,
        e.current_price || 0,
        e.rsi || "",
        e.dist_20dma || "",
        e.dist_52h || "",
        `"${e.action || ''}"`
    ]);

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    const today = new Date().toISOString().split("T")[0];
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `market_analysis_etfs_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}


