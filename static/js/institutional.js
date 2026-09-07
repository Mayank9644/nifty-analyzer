/**
 * Institutional Smart Money Radar Frontend Module.
 * Visualizes FII/DII cash flows, FII Futures Long/Short ratios,
 * and high-delivery accumulation scanner.
 */

let fiiDiiChartInstance = null;

async function loadInstitutionalRadar() {
    const container = document.getElementById("tab-view-institutional");
    if (!container) return;

    const loader = document.getElementById("institutionalLoader");
    const content = document.getElementById("institutionalContent");
    if (loader) loader.classList.remove("hidden");
    if (content) content.classList.add("hidden");

    try {
        const res = await fetch("/api/institutional/radar");
        const data = await res.json();

        if (loader) loader.classList.add("hidden");
        if (content) content.classList.remove("hidden");

        if (data.status !== "success") {
            showToast("Failed to load institutional data", "error");
            return;
        }

        renderFiiDiiCashFlows(data.cash_flows, data.summary);
        renderFuturesPositioning(data.futures_positioning);
        renderDeliveryAccumulationTable(data.delivery_stocks);
    } catch (err) {
        console.error("Error loading institutional radar:", err);
        if (loader) loader.classList.add("hidden");
        showToast("Error connecting to institutional radar API", "error");
    }
}

function renderFiiDiiCashFlows(cashFlows, summary) {
    // Update summary counters
    if (summary) {
        const latestFiiEl = document.getElementById("instLatestFii");
        const latestDiiEl = document.getElementById("instLatestDii");
        const net30FiiEl = document.getElementById("instNet30Fii");
        const net30DiiEl = document.getElementById("instNet30Dii");

        if (latestFiiEl) {
            const val = summary.latest_fii_cr || 0;
            latestFiiEl.textContent = `${val >= 0 ? "+" : ""}₹${val.toLocaleString("en-IN")} Cr`;
            latestFiiEl.className = `text-lg font-bold mono ${val >= 0 ? "text-emerald-700" : "text-red-600"}`;
        }
        if (latestDiiEl) {
            const val = summary.latest_dii_cr || 0;
            latestDiiEl.textContent = `${val >= 0 ? "+" : ""}₹${val.toLocaleString("en-IN")} Cr`;
            latestDiiEl.className = `text-lg font-bold mono ${val >= 0 ? "text-emerald-700" : "text-red-600"}`;
        }
        if (net30FiiEl) {
            const val = summary.net_30d_fii_cr || 0;
            net30FiiEl.textContent = `${val >= 0 ? "+" : ""}₹${val.toLocaleString("en-IN")} Cr`;
            net30FiiEl.className = `text-xs font-semibold mono ${val >= 0 ? "text-emerald-700" : "text-red-600"}`;
        }
        if (net30DiiEl) {
            const val = summary.net_30d_dii_cr || 0;
            net30DiiEl.textContent = `${val >= 0 ? "+" : ""}₹${val.toLocaleString("en-IN")} Cr`;
            net30DiiEl.className = `text-xs font-semibold mono ${val >= 0 ? "text-emerald-700" : "text-red-600"}`;
        }
    }

    const canvas = document.getElementById("fiiDiiCashChart");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (fiiDiiChartInstance) {
        fiiDiiChartInstance.destroy();
    }

    const labels = cashFlows.map(c => c.date);
    const fiiData = cashFlows.map(c => c.fii_net_cr);
    const diiData = cashFlows.map(c => c.dii_net_cr);

    fiiDiiChartInstance = new Chart(ctx, {
        type: "bar",
        data: {
            labels: labels,
            datasets: [
                {
                    label: "FII Net (₹ Cr)",
                    data: fiiData,
                    backgroundColor: fiiData.map(v => v >= 0 ? "rgba(0, 122, 255, 0.75)" : "rgba(239, 68, 68, 0.75)"),
                    borderColor: fiiData.map(v => v >= 0 ? "#007aff" : "#ef4444"),
                    borderWidth: 1,
                    borderRadius: 4
                },
                {
                    label: "DII Net (₹ Cr)",
                    data: diiData,
                    backgroundColor: "rgba(16, 185, 129, 0.75)",
                    borderColor: "#10b981",
                    borderWidth: 1,
                    borderRadius: 4
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: "index",
                intersect: false
            },
            plugins: {
                legend: {
                    position: "top",
                    labels: {
                        boxWidth: 12,
                        font: { size: 11, family: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto" },
                        color: "#48484a"
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(ctx) {
                            const val = ctx.raw;
                            return `${ctx.dataset.label}: ${val >= 0 ? "+" : ""}₹${val.toLocaleString("en-IN")} Cr`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: { font: { size: 10 }, color: "#8e8e93" }
                },
                y: {
                    grid: { color: "rgba(0,0,0,0.04)" },
                    ticks: {
                        font: { size: 10 },
                        color: "#8e8e93",
                        callback: v => `₹${v} Cr`
                    }
                }
            }
        }
    });
}

function renderFuturesPositioning(positioning) {
    if (!positioning) return;

    const longPctEl = document.getElementById("instLongPct");
    const shortPctEl = document.getElementById("instShortPct");
    const barEl = document.getElementById("instLongProgressBar");
    const badgeEl = document.getElementById("instRegimeBadge");
    const verdictEl = document.getElementById("instVerdictText");
    const adviceEl = document.getElementById("instActionAdvice");

    const longPct = positioning.long_ratio_pct || 50;
    const shortPct = positioning.short_ratio_pct || 50;

    if (longPctEl) longPctEl.textContent = `${longPct}% Long`;
    if (shortPctEl) shortPctEl.textContent = `${shortPct}% Short`;
    if (barEl) barEl.style.width = `${longPct}%`;

    if (badgeEl) {
        badgeEl.textContent = positioning.regime_badge || positioning.regime;
        badgeEl.style.backgroundColor = `${positioning.regime_color}18`;
        badgeEl.style.color = positioning.regime_color;
        badgeEl.style.borderColor = `${positioning.regime_color}40`;
    }

    if (verdictEl) {
        verdictEl.textContent = positioning.verdict;
    }

    if (adviceEl) {
        adviceEl.textContent = positioning.action_advice;
    }
}

function renderDeliveryAccumulationTable(stocks) {
    const tbody = document.getElementById("instDeliveryTableBody");
    if (!tbody) return;

    if (!stocks || stocks.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-6 text-xs text-[#8e8e93]">No high-delivery accumulation data available currently.</td></tr>`;
        return;
    }

    tbody.innerHTML = stocks.map((s, idx) => {
        const isUp = (s.day_change_pct || 0) >= 0;
        const changeClass = isUp ? "text-emerald-700" : "text-red-600";
        const changeSign = isUp ? "+" : "";

        return `
        <tr class="border-b border-[rgba(0,0,0,0.04)] hover:bg-[#fafafc] transition-colors text-xs">
            <td class="py-2.5 px-3">
                <div class="font-bold text-[#1c1c1e]">${s.code}</div>
                <div class="text-[10px] text-[#8e8e93]">${s.name}</div>
            </td>
            <td class="py-2.5 px-3 text-[#5a5a5f] text-[11px]">${s.sector || "Large Cap"}</td>
            <td class="py-2.5 px-3 font-semibold mono text-[#1c1c1e]">₹${(s.price || 0).toLocaleString("en-IN")}</td>
            <td class="py-2.5 px-3 font-semibold mono ${changeClass}">${changeSign}${s.day_change_pct}%</td>
            <td class="py-2.5 px-3 font-semibold mono text-[#007aff]">${s.volume_surge}</td>
            <td class="py-2.5 px-3">
                <div class="flex items-center gap-2">
                    <span class="font-bold mono text-[#1c1c1e]">${s.delivery_pct}%</span>
                    <div class="w-16 bg-[#e5e5ea] rounded-full h-1.5 overflow-hidden">
                        <div class="h-1.5 rounded-full ${s.delivery_pct >= 50 ? 'bg-[#10b981]' : 'bg-[#007aff]'}" style="width: ${Math.min(100, s.delivery_pct)}%"></div>
                    </div>
                </div>
            </td>
            <td class="py-2.5 px-3">
                <span class="px-2 py-0.5 rounded-md text-[10.5px] font-bold" style="background-color: ${s.status_color}18; color: ${s.status_color};">
                    ${s.status}
                </span>
            </td>
            <td class="py-2.5 px-3 text-right">
                <button onclick="selectSearchedStock('${s.symbol}')" class="px-2.5 py-1 rounded-md bg-[#007aff]/10 text-[#007aff] hover:bg-[#007aff]/20 font-semibold text-[11px] transition-all cursor-pointer">
                    Analyze ➔
                </button>
            </td>
        </tr>
        `;
    }).join("");
}
