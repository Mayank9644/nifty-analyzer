/**
 * 15 Nifty Sectors Rotation (RRG), Treemap, and Breadth Client Engine.
 */

let _allSectorsData = [];
let _activeSectorTab = "rrg"; // 'rrg', 'treemap', 'grid'
let _sectorRrgChart = null;

async function loadSectorsAnalysis() {
    const gridContainer = document.getElementById("sectorsGridContainer");
    const rrgContainer = document.getElementById("sectorsRrgView");
    const treemapContainer = document.getElementById("sectorsTreemapContainer");

    if (gridContainer) gridContainer.innerHTML = `<div class="p-8 text-center text-[#86868b] text-xs">Analyzing rotation, money flow & breadth across 15 Nifty sectors...</div>`;

    try {
        const res = await fetch("/api/sectors");
        const data = await res.json();

        if (data.status === "success") {
            _allSectorsData = data.sectors || [];

            const banner = document.getElementById("sectorRotationBanner");
            if (banner && data.rotation_summary) {
                banner.innerHTML = `
                    <div class="p-3.5 rounded-xl bg-[#eff6ff] border border-[#bfdbfe] text-[#0062cc] text-xs font-semibold flex items-center justify-between gap-3 shadow-xs">
                        <div class="flex items-center space-x-2">
                            <span class="text-base">🔄</span>
                            <span>${data.rotation_summary}</span>
                        </div>
                        <span class="text-[10.5px] px-2 py-0.5 rounded-full bg-white text-[#007aff] font-bold">15 Sectors RRG</span>
                    </div>
                `;
            }

            renderActiveSectorView();
        }
    } catch (e) {
        console.error("Error loading sectors:", e);
    }
}

function switchSectorSubTab(tab) {
    _activeSectorTab = tab;
    document.querySelectorAll(".sector-subtab-btn").forEach(btn => {
        if (btn.dataset.tab === tab) {
            btn.classList.add("active", "bg-white", "text-[#1d1d1f]", "font-semibold", "shadow-sm");
            btn.classList.remove("text-[#636366]");
        } else {
            btn.classList.remove("active", "bg-white", "text-[#1d1d1f]", "font-semibold", "shadow-sm");
            btn.classList.add("text-[#636366]");
        }
    });
    renderActiveSectorView();
}

function renderActiveSectorView() {
    const rrgView = document.getElementById("sectorsRrgView");
    const treemapView = document.getElementById("sectorsTreemapView");
    const gridView = document.getElementById("sectorsGridView");

    if (rrgView) rrgView.classList.toggle("hidden", _activeSectorTab !== "rrg");
    if (treemapView) treemapView.classList.toggle("hidden", _activeSectorTab !== "treemap");
    if (gridView) gridView.classList.toggle("hidden", _activeSectorTab !== "grid");

    if (_activeSectorTab === "rrg") {
        renderSectorRrgGraph(_allSectorsData);
    } else if (_activeSectorTab === "treemap") {
        renderSectorTreemap(_allSectorsData);
    } else {
        renderSectorsGrid(_allSectorsData);
    }
}

function renderSectorRrgGraph(sectors) {
    const canvas = document.getElementById("sectorRrgCanvas");
    if (!canvas || !sectors || sectors.length === 0) return;

    if (_sectorRrgChart) {
        try { _sectorRrgChart.destroy(); } catch (e) {}
        _sectorRrgChart = null;
    }

    const scatterPoints = sectors.map(s => ({
        x: s.rs_ratio,
        y: s.rs_momentum,
        label: `${s.icon} ${s.name}`,
        code: s.code,
        quadrant: s.quadrant,
        color: s.quadrant_color,
        score: s.sector_score
    }));

    const ctx = canvas.getContext("2d");
    _sectorRrgChart = new Chart(ctx, {
        type: "scatter",
        data: {
            datasets: [{
                data: scatterPoints,
                pointBackgroundColor: scatterPoints.map(p => p.color),
                pointBorderColor: "#ffffff",
                pointBorderWidth: 2,
                pointRadius: 8,
                pointHoverRadius: 11
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => {
                            const raw = ctx.raw;
                            return ` ${raw.label} [${raw.quadrant}] — RS-Ratio: ${raw.x}, Momentum: ${raw.y}`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: true, text: "Relative Strength Ratio (RS-Ratio vs Nifty 50)", font: { size: 11, weight: "bold" } },
                    grid: {
                        color: (ctx) => (ctx.tick && ctx.tick.value === 1.0 ? "#1c1c1e" : "#f2f2f7"),
                        lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 1.0 ? 1.5 : 1)
                    }
                },
                y: {
                    title: { display: true, text: "Momentum of Relative Strength (RS-Momentum)", font: { size: 11, weight: "bold" } },
                    grid: {
                        color: (ctx) => (ctx.tick && ctx.tick.value === 0.0 ? "#1c1c1e" : "#f2f2f7"),
                        lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 0.0 ? 1.5 : 1)
                    }
                }
            }
        }
    });
}

function renderSectorTreemap(sectors) {
    const container = document.getElementById("sectorsTreemapContainer");
    if (!container || !sectors) return;

    // Sort by market cap weight descending
    const sorted = [...sectors].sort((a, b) => (b.market_cap_weight || 1) - (a.market_cap_weight || 1));

    container.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-3">
            ${sorted.map(s => {
                const isPos = (s.change_pct || 0) >= 0;
                const bg = isPos ? "bg-[#edf7ee] border-[#c3e6cb] hover:bg-[#d4edda]" : "bg-[#fdf0f0] border-[#f5c6cb] hover:bg-[#f8d7da]";
                const textColor = isPos ? "text-[#1e7e34]" : "text-[#b32020]";

                return `
                    <div class="p-3.5 rounded-xl border ${bg} transition-all cursor-pointer flex flex-col justify-between"
                        onclick="switchTab('stocks'); loadStock('${s.top_stocks[0]}.NS')" title="Click to view top constituent ${s.top_stocks[0]}">
                        <div>
                            <div class="flex items-center justify-between">
                                <span class="text-xl">${s.icon}</span>
                                <span class="text-[10px] font-bold mono px-1.5 py-0.5 rounded bg-white/70 border border-black/5 text-[#48484a]">
                                    ${s.market_cap_weight}% Weight
                                </span>
                            </div>
                            <h4 class="font-bold text-xs text-[#1c1c1e] mt-2 line-clamp-1">${s.name}</h4>
                            <span class="text-[10px] text-[#86868b] font-mono">${s.code}</span>
                        </div>
                        <div class="mt-3 pt-2 border-t border-black/5 flex items-center justify-between">
                            <span class="text-[10px] font-semibold text-[#6e6e73]">${s.quadrant}</span>
                            <span class="font-bold text-xs mono ${textColor}">
                                ${isPos ? '+' : ''}${s.change_pct || 0.0}%
                            </span>
                        </div>
                    </div>
                `;
            }).join("")}
        </div>
    `;
}

function renderSectorsGrid(sectors) {
    const container = document.getElementById("sectorsGridContainer");
    if (!container) return;

    container.innerHTML = sectors.map(s => {
        const quadrantBadge = `
            <span class="text-[10px] font-semibold px-2 py-0.5 rounded-md uppercase tracking-wider" style="background-color: ${s.quadrant_color}18; color: ${s.quadrant_color}; border: 1px solid ${s.quadrant_color}35;">
                ${s.quadrant}
            </span>
        `;

        return `
            <div class="macos-card p-4 hover:shadow-md transition-all flex flex-col justify-between">
                <div>
                    <!-- Header -->
                    <div class="flex justify-between items-start mb-2">
                        <div class="flex items-center space-x-2">
                            <span class="text-2xl">${s.icon}</span>
                            <div>
                                <h4 class="text-sm font-semibold text-[#1c1c1e]">${s.name}</h4>
                                <span class="text-[10px] text-[#86868b] font-mono">${s.code}</span>
                            </div>
                        </div>
                        ${quadrantBadge}
                    </div>

                    <!-- Metrics Grid -->
                    <div class="macos-box grid grid-cols-3 gap-2 my-3 p-2.5 text-center text-xs">
                        <div>
                            <span class="text-[10px] text-[#86868b] block font-medium">Score</span>
                            <span class="font-bold text-[#1c1c1e] mono">${s.sector_score}/100</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-[#86868b] block font-medium">Money Flow</span>
                            <span class="font-bold ${s.cmf_signal.includes('Inflow') ? 'text-[#1e7e34]' : 'text-[#b32020]'} text-[11px]">${s.cmf_signal}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-[#86868b] block font-medium">Breadth >50D</span>
                            <span class="font-bold text-[#007aff] mono">${s.breadth_50dma}%</span>
                        </div>
                    </div>

                    <p class="text-[11px] text-[#48484a] leading-relaxed">${s.commentary}</p>
                </div>

                <!-- Top Leaders -->
                <div class="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)]">
                    <span class="text-[10px] text-[#86868b] block mb-1.5 font-medium">Top Relative Strength Leaders:</span>
                    <div class="flex flex-wrap gap-1.5">
                        ${s.top_stocks.map(tk => `
                            <button onclick="switchTab('stocks'); loadStock('${tk}.NS')" class="text-[10px] px-2 py-0.5 rounded-md bg-[#eef5fd] text-[#007aff] hover:bg-[#007aff] hover:text-white transition-colors font-mono font-medium border border-[#b9d7fb]/50">
                                ${tk}
                            </button>
                        `).join("")}
                    </div>
                </div>
            </div>
        `;
    }).join("");
}
