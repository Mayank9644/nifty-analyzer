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
    const sectorLabelsPlugin = {
        id: 'sectorLabelsPlugin',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            const meta = chart.getDatasetMeta(0);
            if (!meta || !meta.data) return;
            const isDark = document.documentElement.getAttribute("data-theme") === "dark";
            ctx.save();
            ctx.font = "bold 10px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.fillStyle = isDark ? "#f5f5f7" : "#1c1c1e";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";

            meta.data.forEach((element, index) => {
                const pt = scatterPoints[index];
                if (pt && pt.code) {
                    const shortName = pt.code.replace("NIFTY_", "").replace("NIFTY ", "");
                    ctx.fillText(shortName, element.x + 9, element.y);
                }
            });
            ctx.restore();
        }
    };

    _sectorRrgChart = new Chart(ctx, {
        type: "scatter",
        plugins: [sectorLabelsPlugin],
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
                    title: {
                        display: true,
                        text: "Relative Strength Ratio (RS-Ratio vs Nifty 50)",
                        font: { size: 11, weight: "bold" },
                        color: document.documentElement.getAttribute("data-theme") === "dark" ? "#d1d1d6" : "#48484a"
                    },
                    ticks: {
                        color: document.documentElement.getAttribute("data-theme") === "dark" ? "#a1a1a6" : "#8e8e93"
                    },
                    grid: {
                        color: (ctx) => {
                            const isDark = document.documentElement.getAttribute("data-theme") === "dark";
                            if (ctx.tick && ctx.tick.value === 1.0) return isDark ? "rgba(255,255,255,0.4)" : "#1c1c1e";
                            return isDark ? "rgba(255,255,255,0.06)" : "#f2f2f7";
                        },
                        lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 1.0 ? 1.5 : 1)
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: "Momentum of Relative Strength (RS-Momentum)",
                        font: { size: 11, weight: "bold" },
                        color: document.documentElement.getAttribute("data-theme") === "dark" ? "#d1d1d6" : "#48484a"
                    },
                    ticks: {
                        color: document.documentElement.getAttribute("data-theme") === "dark" ? "#a1a1a6" : "#8e8e93"
                    },
                    grid: {
                        color: (ctx) => {
                            const isDark = document.documentElement.getAttribute("data-theme") === "dark";
                            if (ctx.tick && ctx.tick.value === 0.0) return isDark ? "rgba(255,255,255,0.4)" : "#1c1c1e";
                            return isDark ? "rgba(255,255,255,0.06)" : "#f2f2f7";
                        },
                        lineWidth: (ctx) => (ctx.tick && ctx.tick.value === 0.0 ? 1.5 : 1)
                    }
                }
            }
        }
    });

    // Populate Plain-English Sector Leaderboard
    const leaderboardEl = document.getElementById("sectorLeaderboardContainer");
    if (leaderboardEl) {
        const sorted = [...sectors].sort((a, b) => (Number(b.change_pct) || 0) - (Number(a.change_pct) || 0));
        const winners = sorted.slice(0, 3);
        const laggards = sorted.slice(-3).reverse();

        leaderboardEl.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                <div class="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs space-y-1.5">
                    <div class="font-bold text-[#1e7e34] dark:text-emerald-400 flex items-center gap-1.5">
                        <span>🟢</span> <span>Top 3 Winning Sectors Today:</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        ${winners.map(w => {
                            const chg = Number(w.change_pct) || 0;
                            return `<span class="px-2 py-0.5 rounded-md bg-white dark:bg-white/10 font-semibold mono text-[11px] text-[#1e7e34] dark:text-emerald-300 border border-emerald-500/30">${w.icon || '📊'} ${w.name}: +${chg.toFixed(2)}%</span>`;
                        }).join("")}
                    </div>
                    <div class="text-[10.5px] text-[#48484a] dark:text-[#d1d1d6]">Institutional capital is actively rotating into these sectors.</div>
                </div>
                <div class="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs space-y-1.5">
                    <div class="font-bold text-[#b32020] dark:text-rose-400 flex items-center gap-1.5">
                        <span>🔴</span> <span>Lagging Sectors Today:</span>
                    </div>
                    <div class="flex flex-wrap items-center gap-2">
                        ${laggards.map(l => {
                            const chg = Number(l.change_pct) || 0;
                            return `<span class="px-2 py-0.5 rounded-md bg-white dark:bg-white/10 font-semibold mono text-[11px] text-[#b32020] dark:text-rose-300 border border-rose-500/30">${l.icon || '📉'} ${l.name}: ${chg.toFixed(2)}%</span>`;
                        }).join("")}
                    </div>
                    <div class="text-[10.5px] text-[#48484a] dark:text-[#d1d1d6]">Underperforming the index today. Exercise defensive discipline.</div>
                </div>
            </div>
        `;
    }
}

function renderSectorTreemap(sectors) {
    const container = document.getElementById("sectorsTreemapContainer");
    if (!container || !sectors) return;

    // Sort by market cap weight descending
    const sorted = [...sectors].sort((a, b) => (b.market_cap_weight || 1) - (a.market_cap_weight || 1));

    container.innerHTML = `
        <div class="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
            ${sorted.map(s => {
                const chg = Number(s.change_pct) || 0.0;
                const weight = Number(s.market_cap_weight) || 3.0;

                // Bento span based on index weighting
                let spanClass = "col-span-1 min-h-[110px]";
                if (weight >= 12.0) {
                    spanClass = "col-span-2 sm:col-span-2 md:col-span-3 min-h-[150px]";
                } else if (weight >= 6.0) {
                    spanClass = "col-span-2 sm:col-span-2 md:col-span-2 min-h-[130px]";
                }

                // Dynamic Finviz heat scale
                let tileTheme = "";
                let changeColor = "";
                if (chg >= 2.0) {
                    tileTheme = "bg-emerald-600/90 text-white border-emerald-700 dark:bg-emerald-700/80 dark:border-emerald-600";
                    changeColor = "text-white font-extrabold";
                } else if (chg >= 0.3) {
                    tileTheme = "bg-emerald-100/90 text-emerald-950 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800/60";
                    changeColor = "text-emerald-700 dark:text-emerald-300 font-bold";
                } else if (chg >= 0.0) {
                    tileTheme = "bg-[#edf7ee] text-emerald-900 border-[#c3e6cb] dark:bg-emerald-950/30 dark:text-emerald-300 dark:border-emerald-900/40";
                    changeColor = "text-emerald-700 dark:text-emerald-400 font-bold";
                } else if (chg > -1.5) {
                    tileTheme = "bg-[#fdf0f0] text-rose-900 border-[#f5c6cb] dark:bg-rose-950/30 dark:text-rose-300 dark:border-rose-900/40";
                    changeColor = "text-rose-700 dark:text-rose-400 font-bold";
                } else {
                    tileTheme = "bg-rose-600/90 text-white border-rose-700 dark:bg-rose-800/80 dark:border-rose-700";
                    changeColor = "text-white font-extrabold";
                }

                const constituents = (s.top_stocks || []).slice(0, weight >= 12.0 ? 4 : (weight >= 6.0 ? 3 : 2));

                return `
                    <div class="${spanClass} p-3.5 rounded-xl border ${tileTheme} transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer flex flex-col justify-between"
                        onclick="switchTab('stocks'); loadStock('${s.top_stocks[0]}.NS')" title="Click to inspect ${s.name} in Stock Desk">
                        <div>
                            <div class="flex items-center justify-between gap-1.5">
                                <div class="flex items-center gap-1.5 min-w-0">
                                    <span class="text-lg flex-shrink-0">${s.icon}</span>
                                    <h4 class="font-bold text-xs truncate">${s.name}</h4>
                                </div>
                                <span class="text-[10px] font-bold mono px-1.5 py-0.5 rounded bg-black/10 dark:bg-white/10 flex-shrink-0">
                                    ${weight}%
                                </span>
                            </div>
                            <div class="flex items-baseline justify-between mt-2">
                                <span class="text-base sm:text-lg mono ${changeColor}">
                                    ${chg >= 0 ? '+' : ''}${chg}%
                                </span>
                                <span class="text-[9.5px] uppercase tracking-wider font-semibold opacity-85">
                                    ${s.quadrant}
                                </span>
                            </div>
                        </div>

                        <!-- Top constituent quick links -->
                        <div class="mt-2.5 pt-2 border-t border-black/10 dark:border-white/10 flex flex-wrap items-center justify-between gap-1">
                            <span class="text-[9.5px] opacity-75 font-mono">${s.code}</span>
                            <div class="flex flex-wrap gap-1">
                                ${constituents.map(stk => `
                                    <button onclick="event.stopPropagation(); switchTab('stocks'); loadStock('${stk}.NS');"
                                        class="px-1.5 py-0.5 rounded text-[9.5px] font-mono font-medium bg-black/10 dark:bg-white/15 hover:bg-black/20 dark:hover:bg-white/30 transition-colors"
                                        title="View ${stk}">
                                        ${stk}
                                    </button>
                                `).join("")}
                            </div>
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
                                <h4 class="text-sm font-semibold text-[#1c1c1e] dark:text-[#f5f5f7]">${s.name}</h4>
                                <span class="text-[10px] text-[#86868b] dark:text-[#a1a1a6] font-mono">${s.code}</span>
                            </div>
                        </div>
                        ${quadrantBadge}
                    </div>

                    <!-- Metrics Grid -->
                    <div class="macos-box grid grid-cols-3 gap-2 my-3 p-2.5 text-center text-xs">
                        <div>
                            <span class="text-[10px] text-[#86868b] dark:text-[#a1a1a6] block font-medium">Score</span>
                            <span class="font-bold text-[#1c1c1e] dark:text-white mono">${s.sector_score}/100</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-[#86868b] dark:text-[#a1a1a6] block font-medium">Money Flow</span>
                            <span class="font-bold ${s.cmf_signal.includes('Inflow') ? 'text-[#1e7e34] dark:text-emerald-400' : 'text-[#b32020] dark:text-rose-400'} text-[11px]">${s.cmf_signal}</span>
                        </div>
                        <div>
                            <span class="text-[10px] text-[#86868b] dark:text-[#a1a1a6] block font-medium">Breadth >50D</span>
                            <span class="font-bold text-[#007aff] dark:text-blue-400 mono">${s.breadth_50dma}%</span>
                        </div>
                    </div>

                    <p class="text-[11px] text-[#48484a] dark:text-[#d1d1d6] leading-relaxed">${s.commentary}</p>
                </div>

                <!-- Top Leaders -->
                <div class="mt-4 pt-3 border-t border-[rgba(0,0,0,0.06)] dark:border-white/10">
                    <span class="text-[10px] text-[#86868b] dark:text-[#a1a1a6] block mb-1.5 font-medium">Top Relative Strength Leaders:</span>
                    <div class="flex flex-wrap gap-1.5">
                        ${s.top_stocks.map(tk => `
                            <button onclick="switchTab('stocks'); loadStock('${tk}.NS')" class="text-[10px] px-2 py-0.5 rounded-md bg-[#eef5fd] dark:bg-white/10 text-[#007aff] dark:text-blue-300 hover:bg-[#007aff] hover:text-white dark:hover:bg-[#007aff] transition-colors font-mono font-medium border border-[#b9d7fb]/50 dark:border-white/10">
                                ${tk}
                            </button>
                        `).join("")}
                    </div>
                </div>
            </div>
        `;
    }).join("");
}

