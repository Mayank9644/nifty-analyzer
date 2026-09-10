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
        const [radarRes, breadthRes] = await Promise.all([
            fetch("/api/institutional/radar").then(r => r.json()).catch(() => null),
            fetch("/api/breadth").then(r => r.json()).catch(() => null)
        ]);

        if (loader) loader.classList.add("hidden");
        if (content) content.classList.remove("hidden");

        if (radarRes && radarRes.status === "success") {
            renderFiiDiiCashFlows(radarRes.cash_flows, radarRes.summary);
            renderFuturesPositioning(radarRes.futures_positioning);
            renderDeliveryAccumulationTable(radarRes.delivery_stocks);
        } else {
            showToast("Failed to load institutional radar data", "error");
        }

        if (breadthRes && breadthRes.status === "success") {
            renderMarketBreadth(breadthRes);
        }
    } catch (err) {
        console.error("Error loading institutional radar:", err);
        if (loader) loader.classList.add("hidden");
        showToast("Error connecting to institutional radar API", "error");
    }
}

function renderMarketBreadth(data) {
    if (!data) return;

    const b = data.breadth || {};
    const ad = data.advance_decline || {};
    const hl = data.new_highs_lows || {};
    const regime = data.market_regime || {};

    const badge = document.getElementById("breadthRegimeBadge");
    const desc = document.getElementById("breadthRegimeDesc");
    const sampleSize = document.getElementById("breadthSampleSize");

    if (badge && regime.badge) {
        badge.textContent = regime.badge;
        badge.style.backgroundColor = `${regime.color}15`;
        badge.style.color = regime.color;
        badge.style.borderColor = `${regime.color}40`;
    }
    if (desc && regime.description) desc.textContent = regime.description;
    if (sampleSize) sampleSize.textContent = data.sample_size || "50";

    const pct20 = b.pct_above_20ema != null ? b.pct_above_20ema : 0;
    const pct50 = b.pct_above_50ema != null ? b.pct_above_50ema : 0;
    const pct200 = b.pct_above_200ema != null ? b.pct_above_200ema : 0;

    const el20 = document.getElementById("breadthPct20Val");
    const bar20 = document.getElementById("breadthBar20");
    if (el20) el20.textContent = `${pct20}%`;
    if (bar20) bar20.style.width = `${pct20}%`;

    const el50 = document.getElementById("breadthPct50Val");
    const bar50 = document.getElementById("breadthBar50");
    if (el50) el50.textContent = `${pct50}%`;
    if (bar50) {
        bar50.style.width = `${pct50}%`;
        bar50.className = `h-2 rounded-full transition-all duration-500 ${pct50 >= 50 ? "bg-emerald-500" : "bg-red-500"}`;
    }

    const el200 = document.getElementById("breadthPct200Val");
    const bar200 = document.getElementById("breadthBar200");
    if (el200) el200.textContent = `${pct200}%`;
    if (bar200) bar200.style.width = `${pct200}%`;

    const adRatioEl = document.getElementById("breadthAdRatio");
    const advEl = document.getElementById("breadthAdvCount");
    const decEl = document.getElementById("breadthDecCount");
    const highsEl = document.getElementById("breadth52wHighs");
    const lowsEl = document.getElementById("breadth52wLows");

    if (adRatioEl) adRatioEl.textContent = `${ad.ratio != null ? ad.ratio : "—"} (Ratio)`;
    if (advEl) advEl.textContent = ad.advances || 0;
    if (decEl) decEl.textContent = ad.declines || 0;
    if (highsEl) highsEl.textContent = hl.highs_52w || 0;
    if (lowsEl) lowsEl.textContent = hl.lows_52w || 0;
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
        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-6 text-xs text-[#8e8e93]">No high-delivery accumulation data available currently.</td></tr>`;
        return;
    }

    tbody.innerHTML = stocks.map((s, idx) => {
        const isUp = (s.day_change_pct || 0) >= 0;
        const changeClass = isUp ? "text-emerald-700" : "text-red-600";
        const changeSign = isUp ? "+" : "";

        return `
        <tr class="border-b border-[rgba(0,0,0,0.04)] hover:bg-[#fafafc] transition-colors text-xs">
            <td class="py-2.5 px-3 text-col">
                <div class="font-bold text-[#1c1c1e]">${s.code}</div>
                <div class="text-[10px] text-[#8e8e93]">${s.name}</div>
            </td>
            <td class="py-2.5 px-3 text-col text-[#5a5a5f] text-[11px]">${s.sector || "Large Cap"}</td>
            <td class="py-2.5 px-3 num-col font-semibold text-[#1c1c1e]">${formatINR(s.price || 0)}</td>
            <td class="py-2.5 px-3 num-col font-semibold ${changeClass}">${changeSign}${s.day_change_pct}%</td>
            <td class="py-2.5 px-3 num-col font-semibold text-[#007aff]">${s.volume_surge}</td>
            <td class="py-2.5 px-3 num-col">
                <div class="flex items-center justify-end gap-2">
                    <span class="font-bold mono text-[#1c1c1e]">${s.delivery_pct}%</span>
                    <div class="w-14 bg-[#e5e5ea] rounded-full h-1.5 overflow-hidden">
                        <div class="h-1.5 rounded-full ${s.delivery_pct >= 50 ? 'bg-[#10b981]' : 'bg-[#007aff]'}" style="width: ${Math.min(100, s.delivery_pct)}%"></div>
                    </div>
                </div>
            </td>
            <td class="py-2.5 px-3 badge-col">
                <span class="px-2 py-0.5 rounded-md text-[10.5px] font-bold" style="background-color: ${s.status_color}18; color: ${s.status_color};">
                    ${s.status}
                </span>
            </td>
            <td class="py-2.5 px-3 text-right">
                <button onclick="selectSearchedStock('${s.symbol}')" class="btn-primary px-2.5 py-1 text-[11px] cursor-pointer" title="Load chart">
                    <span>📈</span> <span>Chart</span>
                </button>
            </td>
        </tr>
        `;
    }).join("");
}
