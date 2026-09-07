/**
 * 15 Nifty Sectors Rotation & Health Client.
 */

async function loadSectorsAnalysis() {
    const container = document.getElementById("sectorsGridContainer");
    if (!container) return;

    container.innerHTML = `<div class="p-8 text-center text-[#86868b] text-xs">Analyzing rotation, money flow & breadth across 15 Nifty sectors...</div>`;

    try {
        const res = await fetch("/api/sectors");
        const data = await res.json();

        if (data.status === "success") {
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
            renderSectorsGrid(data.sectors);
        }
    } catch (e) {

        console.error("Error loading sectors:", e);
    }
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
