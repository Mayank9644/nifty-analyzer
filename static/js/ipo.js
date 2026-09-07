/**
 * Indian IPO Tracker & GMP Module (macOS Light Theme)
 */

async function loadIpoTracker() {
    const activeContainer = document.getElementById("activeIposContainer");
    const recentContainer = document.getElementById("recentIposContainer");
    if (!activeContainer) return;

    activeContainer.innerHTML = `
        <div class="col-span-full p-8 text-center text-xs text-[#6e6e73]">
            <svg class="animate-spin h-5 w-5 mx-auto mb-2 text-[#007aff]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Fetching upcoming IPO issue details, grey market premiums, and valuations...
        </div>
    `;

    try {
        const res = await fetch("/api/ipo");
        const data = await res.json();
        const ipos = data.ipos || [];
        const recents = data.recent_listings || [];

        // Render Active & Upcoming IPOs
        activeContainer.innerHTML = ipos.map(ipo => {
            return `
                <div class="macos-card p-5 space-y-4 hover:shadow-md transition-all flex flex-col justify-between">
                    <div>
                        <div class="flex items-start justify-between gap-2">
                            <div>
                                <span class="badge-stock text-[10px] uppercase font-bold">${ipo.category}</span>
                                <h4 class="text-base font-bold text-[#1c1c1e] mt-1">${ipo.name}</h4>
                                <p class="text-[11px] text-[#6e6e73] font-medium">${ipo.sector}</p>
                            </div>
                            <div class="text-right">
                                <span class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold mono bg-[#edf7ee] text-[#1e7e34] border border-[#c6e8cc]">
                                    GMP ${ipo.gmp} (+${ipo.gmp_pct}%)
                                </span>
                            </div>
                        </div>

                        <!-- Key IPO Stats Grid -->
                        <div class="grid grid-cols-2 gap-2.5 my-3.5">
                            <div class="macos-box p-2.5">
                                <div class="text-[10.5px] text-[#8e8e93]">Price Band</div>
                                <div class="text-xs font-semibold mono text-[#1c1c1e]">${ipo.price_band}</div>
                            </div>
                            <div class="macos-box p-2.5">
                                <div class="text-[10.5px] text-[#8e8e93]">Issue Size</div>
                                <div class="text-xs font-semibold mono text-[#1c1c1e]">${ipo.issue_size}</div>
                            </div>
                            <div class="macos-box p-2.5">
                                <div class="text-[10.5px] text-[#8e8e93]">Min Investment (1 Lot)</div>
                                <div class="text-xs font-semibold mono text-[#1c1c1e]">₹${ipo.min_investment.toLocaleString('en-IN')} (${ipo.lot_size} shares)</div>
                            </div>
                            <div class="macos-box p-2.5">
                                <div class="text-[10.5px] text-[#8e8e93]">Dates (Open - Close)</div>
                                <div class="text-xs font-semibold text-[#1c1c1e]">${ipo.open_date} to ${ipo.close_date}</div>
                            </div>
                        </div>

                        <!-- AI Recommendation & Rationale -->
                        <div class="p-3 rounded-xl border ${ipo.badge} space-y-1 text-xs">
                            <div class="font-bold flex items-center gap-1.5">
                                <span>🎯</span> <span>${ipo.verdict}</span>
                            </div>
                            <p class="text-[11px] leading-relaxed opacity-90">${ipo.rationale}</p>
                        </div>
                    </div>

                    <div class="pt-2 border-t border-[rgba(0,0,0,0.06)] flex items-center justify-between text-[11px] text-[#6e6e73]">
                        <span>Risk: <strong class="text-[#1c1c1e] font-semibold">${ipo.risk}</strong></span>
                        <span>Subscription: <strong class="text-[#007aff] font-semibold">${ipo.subscription}</strong></span>
                    </div>
                </div>
            `;
        }).join("");

        // Render Recently Listed IPOs
        if (recentContainer) {
            recentContainer.innerHTML = recents.map(r => {
                return `
                    <div class="macos-card p-4 space-y-2.5">
                        <div class="flex items-center justify-between">
                            <h5 class="text-xs font-bold text-[#1c1c1e]">${r.name}</h5>
                            <span class="badge-stock font-mono text-[10px]">${r.symbol}</span>
                        </div>
                        <div class="grid grid-cols-3 gap-2 text-center text-xs">
                            <div class="macos-box p-2">
                                <div class="text-[10px] text-[#8e8e93]">Issue Price</div>
                                <div class="font-semibold mono text-[#1c1c1e]">₹${r.issue_price}</div>
                            </div>
                            <div class="macos-box p-2">
                                <div class="text-[10px] text-[#8e8e93]">Listing Pop</div>
                                <div class="font-semibold mono text-[#1e7e34]">+${r.listing_gain_pct}%</div>
                            </div>
                            <div class="macos-box p-2">
                                <div class="text-[10px] text-[#8e8e93]">Current Price</div>
                                <div class="font-semibold mono text-[#007aff]">₹${r.current_price}</div>
                            </div>
                        </div>
                        <div class="text-center">
                            <span class="inline-block px-2 py-0.5 rounded-md text-[10.5px] font-semibold border ${r.badge}">
                                ${r.status} (Total Gain: +${r.total_gain_pct}%)
                            </span>
                        </div>
                    </div>
                `;
            }).join("");
        }

    } catch (e) {
        console.error("IPO load error:", e);
        activeContainer.innerHTML = `
            <div class="col-span-full p-8 text-center text-xs text-[#b32020]">
                Failed to load live IPO tracker. Please try again.
            </div>
        `;
    }
}
