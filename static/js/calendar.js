/**
 * Macro Economic Calendar Module (macOS Light Theme)
 */

async function loadEconomicCalendar() {
    const container = document.getElementById("calendarEventsContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="col-span-full p-8 text-center text-xs text-[#6e6e73]">
            <svg class="animate-spin h-5 w-5 mx-auto mb-2 text-[#007aff]" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
                <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            Loading macro catalysts, central bank decisions, and expiry dates...
        </div>
    `;

    try {
        const res = await fetch("/api/calendar");
        const data = await res.json();
        const events = data.events || [];

        container.innerHTML = events.map(ev => {
            return `
                <div class="macos-card p-5 space-y-3.5 hover:shadow-md transition-all">
                    <div class="flex items-start justify-between gap-3">
                        <div class="flex items-center space-x-2.5">
                            <span class="text-xl">📅</span>
                            <div>
                                <div class="text-[11px] font-bold uppercase tracking-wider text-[#8e8e93]">${ev.category} • ${ev.country}</div>
                                <h4 class="text-sm font-bold text-[#1c1c1e]">${ev.event}</h4>
                            </div>
                        </div>
                        <span class="inline-flex items-center px-2 py-0.5 rounded-md text-[10.5px] font-bold border ${ev.impact_badge}">
                            ${ev.impact} IMPACT
                        </span>
                    </div>

                    <!-- Date & Consensus -->
                    <div class="grid grid-cols-3 gap-2 text-xs">
                        <div class="macos-box p-2.5">
                            <div class="text-[10px] text-[#8e8e93]">Scheduled Time</div>
                            <div class="font-semibold text-[#1c1c1e]">${ev.date} (${ev.time})</div>
                        </div>
                        <div class="macos-box p-2.5">
                            <div class="text-[10px] text-[#8e8e93]">Market Consensus</div>
                            <div class="font-semibold text-[#007aff]">${ev.forecast}</div>
                        </div>
                        <div class="macos-box p-2.5">
                            <div class="text-[10px] text-[#8e8e93]">Previous / History</div>
                            <div class="font-semibold text-[#6e6e73]">${ev.previous}</div>
                        </div>
                    </div>

                    <!-- Trader's Tactical Rule -->
                    <div class="p-3 rounded-xl bg-[#f8f8fa] border border-[rgba(0,0,0,0.06)] text-xs text-[#1c1c1e] space-y-1">
                        <div class="font-semibold text-[#1c1c1e] flex items-center gap-1.5 text-[11.5px]">
                            <span>💡</span> <span>Tactical Trading Rule & Volatility Strategy:</span>
                        </div>
                        <p class="text-[11px] text-[#48484a] leading-relaxed">${ev.trader_action}</p>
                    </div>
                </div>
            `;
        }).join("");

    } catch (e) {
        console.error("Calendar load error:", e);
        container.innerHTML = `
            <div class="col-span-full p-8 text-center text-xs text-[#b32020]">
                Failed to load economic calendar. Please check connection and retry.
            </div>
        `;
    }
}
