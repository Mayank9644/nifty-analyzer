/**
 * 9:00 AM Pre-Market Morning Briefing Desk
 * Synthesizes global macro cues, Nifty pivot levels, opening bias, and focus setups.
 */

let _premarketBriefingData = null;

async function loadPremarketBriefing() {
    try {
        const res = await fetch("/api/macro/premarket");
        const data = await res.json();
        if (data.status !== "success") return;
        _premarketBriefingData = data;
        renderPremarketWidget(data);
    } catch (err) {
        console.error("Failed to load premarket briefing:", err);
    }
}

function renderPremarketWidget(data) {
    const banner = document.getElementById("premarketSummaryBanner");
    if (!banner) return;

    const bias = data.opening_bias || {};
    const pivots = data.nifty_pivots || {};
    const cues = data.global_cues || [];
    const focus = data.focus_candidates || [];

    banner.innerHTML = `
        <div class="macos-card p-4 space-y-3.5 border-l-4" style="border-left-color: ${bias.color || '#007aff'};">
            <!-- Header Row -->
            <div class="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(0,0,0,0.06)] dark:border-white/10 pb-3">
                <div class="flex items-center gap-3">
                    <span class="text-2xl p-2 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400">🌅</span>
                    <div>
                        <div class="flex items-center gap-2">
                            <h3 class="text-sm font-bold text-[#1c1c1e] dark:text-[#f5f5f7]">9:00 AM Institutional Morning Briefing</h3>
                            <span class="px-2.5 py-0.5 rounded-full text-[11px] font-bold" style="background-color: ${bias.color}18; color: ${bias.color};">
                                ${bias.badge || bias.bias}
                            </span>
                        </div>
                        <p class="text-xs text-[#6e6e73] dark:text-[#a1a1a6] mt-0.5">${bias.tactical_outlook}</p>
                    </div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="text-[11px] text-[#8e8e93] dark:text-[#a1a1a6]">Expected Open: <strong class="mono text-[#1c1c1e] dark:text-[#f5f5f7]">${bias.expected_range}</strong></span>
                    <span class="text-[10.5px] px-2 py-0.5 rounded-md bg-[#f2f2f7] dark:bg-white/10 text-[#8e8e93] dark:text-[#a1a1a6] mono">${data.timestamp}</span>
                </div>
            </div>

            <!-- 3 Grid Sections: Global Cues + Nifty Pivots + Top Setups -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5 text-xs">
                <!-- Col 1: Global Macro Cues -->
                <div class="p-3 rounded-xl bg-[#f8f8fa] dark:bg-[#1c1f2e] border border-[rgba(0,0,0,0.04)] dark:border-white/10 space-y-2">
                    <span class="text-[11px] font-bold text-[#48484a] dark:text-[#d1d1d6] uppercase tracking-wider block">🌍 Global Macro Cues</span>
                    <div class="space-y-1.5">
                        ${cues.map(c => {
                            const isGreen = c.change_pct >= 0;
                            return `
                                <div class="flex justify-between items-center text-xs">
                                    <span class="text-[#6e6e73] dark:text-[#a1a1a6]">${c.name}</span>
                                    <div class="flex items-center gap-1.5 font-semibold mono">
                                        <span class="text-[#1c1c1e] dark:text-[#f5f5f7]">${c.value}</span>
                                        <span class="${c.sentiment === 'BULLISH' ? 'text-emerald-700 dark:text-emerald-400' : (c.sentiment === 'BEARISH' ? 'text-red-600 dark:text-red-400' : 'text-[#8e8e93] dark:text-[#a1a1a6]')}">
                                            (${isGreen ? '+' : ''}${c.change_pct}%)
                                        </span>
                                    </div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </div>

                <!-- Col 2: Nifty Pivots -->
                <div class="p-3 rounded-xl bg-[#f8f8fa] dark:bg-[#1c1f2e] border border-[rgba(0,0,0,0.04)] dark:border-white/10 space-y-2">
                    <span class="text-[11px] font-bold text-[#48484a] dark:text-[#d1d1d6] uppercase tracking-wider block">🎯 Nifty 50 Pivots</span>
                    <div class="grid grid-cols-3 gap-1.5 text-center">
                        <div class="p-1.5 rounded-lg bg-white dark:bg-[#151722] border border-[rgba(0,0,0,0.05)] dark:border-white/10">
                            <span class="text-[9.5px] text-red-600 dark:text-red-400 font-bold block">R2</span>
                            <span class="mono font-semibold text-[11px] text-[#1c1c1e] dark:text-[#f5f5f7]">₹${pivots.resistance_2?.toLocaleString('en-IN')}</span>
                        </div>
                        <div class="p-1.5 rounded-lg bg-[#007aff]/5 dark:bg-blue-900/20 border border-[#007aff]/20 dark:border-blue-700/40">
                            <span class="text-[9.5px] text-[#007aff] dark:text-blue-400 font-bold block">PIVOT</span>
                            <span class="mono font-bold text-[11px] text-[#007aff] dark:text-blue-400">₹${pivots.pivot?.toLocaleString('en-IN')}</span>
                        </div>
                        <div class="p-1.5 rounded-lg bg-white dark:bg-[#151722] border border-[rgba(0,0,0,0.05)] dark:border-white/10">
                            <span class="text-[9.5px] text-emerald-700 dark:text-emerald-400 font-bold block">S2</span>
                            <span class="mono font-semibold text-[11px] text-[#1c1c1e] dark:text-[#f5f5f7]">₹${pivots.support_2?.toLocaleString('en-IN')}</span>
                        </div>
                    </div>
                    <div class="flex justify-between items-center text-[11px] text-[#6e6e73] dark:text-[#a1a1a6] pt-1 border-t border-[rgba(0,0,0,0.04)] dark:border-white/10">
                        <span>R1: <strong class="mono text-red-600 dark:text-red-400">₹${pivots.resistance_1?.toLocaleString('en-IN')}</strong></span>
                        <span>Spot: <strong class="mono text-[#1c1c1e] dark:text-[#f5f5f7]">₹${pivots.spot?.toLocaleString('en-IN')}</strong></span>
                        <span>S1: <strong class="mono text-emerald-700 dark:text-emerald-400">₹${pivots.support_1?.toLocaleString('en-IN')}</strong></span>
                    </div>
                </div>

                <!-- Col 3: Focus Candidates -->
                <div class="p-3 rounded-xl bg-[#f8f8fa] dark:bg-[#1c1f2e] border border-[rgba(0,0,0,0.04)] dark:border-white/10 space-y-2">
                    <span class="text-[11px] font-bold text-[#48484a] dark:text-[#d1d1d6] uppercase tracking-wider block">⚡ Session Focus Setups</span>
                    <div class="space-y-1.5">
                        ${focus.map(f => `
                            <div class="flex items-center justify-between text-xs hover:bg-white dark:hover:bg-white/5 p-1 rounded-lg transition-colors cursor-pointer" onclick="selectSearchedStock('${f.symbol}')">
                                <div>
                                    <div class="font-bold text-[#1c1c1e] dark:text-[#f5f5f7]">${f.name}</div>
                                    <div class="text-[10px] text-[#8e8e93] dark:text-[#a1a1a6]">${f.catalyst}</div>
                                </div>
                                <div class="text-right">
                                    <span class="mono font-bold text-emerald-700 dark:text-emerald-400 text-[11px]">${f.trigger}</span>
                                    <span class="text-[10px] text-[#007aff] dark:text-blue-400 block">Analyze ➔</span>
                                </div>
                            </div>
                        `).join("")}
                    </div>
                </div>
            </div>
        </div>
    `;
}

window.loadPremarketBriefing = loadPremarketBriefing;
window.renderPremarketWidget = renderPremarketWidget;
