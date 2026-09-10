/**
 * Main application client logic.
 */

// Application State
const appState = {
    currentTab: "stocks",          // "stocks" | "commodities" | "options" | "news"
    currentSymbol: "RELIANCE.NS",
    currentStyle: "swing",         // "intraday" | "swing" | "positional" | "fno"
    currentPeriod: "1y",
    currentInterval: "1d",
    currentCommodity: "GC=F",
    stocksList: [],
    commoditiesList: [],
    marketOverview: null
};

// High-Efficiency In-Memory Client Stock Cache (0ms Instant Switching)
const clientStockCache = new Map();
const CLIENT_CACHE_TTL_MS = 60 * 1000; // 60s TTL during live session

// DOM ready
document.addEventListener("DOMContentLoaded", () => {
    initApp();
});

async function initApp() {
    initAppTheme();
    setupEventListeners();
    initDisplayDensity();
    initWatchlist();
    initCommandPalette();
    renderRecentChips();
    // Fire off primary stock analysis immediately for instantaneous UI rendering
    loadStock(appState.currentSymbol);
    // Asynchronously load universe assets & market overview in background
    loadInitialData();
    if (typeof loadPremarketBriefing === "function") {
        loadPremarketBriefing();
    }
    // Restore saved ticker tape state
    if (localStorage.getItem("terminal_ticker_hidden") === "true") {
        const strip = document.getElementById("liveTickerStrip");
        if (strip) strip.classList.add("hidden");
        const btn = document.getElementById("tickerToggleBtn");
        if (btn) btn.classList.add("opacity-60");
    }
    // Initialize workspace sub-desk bar
    switchTab(appState.currentTab || "stocks");
}


function setupEventListeners() {
    // Top Tabs
    document.querySelectorAll(".nav-tab-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const tab = e.currentTarget.dataset.tab;
            switchTab(tab);
        });
    });

    // Trading Style Switcher
    document.querySelectorAll(".style-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            const style = e.currentTarget.dataset.style;
            switchTradingStyle(style);
        });
    });

    // Chart Period Switcher
    document.querySelectorAll(".period-btn").forEach(btn => {
        btn.addEventListener("click", (e) => {
            document.querySelectorAll(".period-btn").forEach(b => {
                b.classList.remove("bg-white", "text-[#1d1d1f]", "font-semibold", "shadow-sm", "bg-blue-600", "text-white");
                b.classList.add("text-[#636366]");
            });
            e.currentTarget.classList.remove("text-[#636366]");
            e.currentTarget.classList.add("bg-white", "text-[#1d1d1f]", "font-semibold", "shadow-sm");
            const period = e.currentTarget.dataset.period;

            const interval = e.currentTarget.dataset.interval || "1d";
            appState.currentPeriod = period;
            appState.currentInterval = interval;
            loadChart(appState.currentSymbol, period, interval);
        });
    });

    // Search bar autocomplete with dynamic Stocks, ETFs, Bonds & Commodities search
    const searchInput = document.getElementById("stockSearchInput");
    const searchDropdown = document.getElementById("searchDropdown");
    let searchDebounceTimer = null;

    // Handle Enter key for instantaneous navigation
    searchInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            const query = searchInput.value.trim();
            if (!query) return;

            // 1. If dropdown is visible and has items, click first item
            const firstItem = searchDropdown.querySelector(".search-item");
            if (firstItem && !searchDropdown.classList.contains("hidden")) {
                firstItem.click();
                return;
            }

            // 2. Otherwise load the symbol directly
            let sym = query.toUpperCase();
            if (!sym.endsWith(".NS") && !sym.endsWith(".BO") && !sym.includes("=F") && !sym.startsWith("^")) {
                sym = `${sym}.NS`;
            }
            searchInput.value = "";
            searchDropdown.classList.add("hidden");
            selectSearchedStock(sym);
        }
    });

    searchInput.addEventListener("input", (e) => {
        const query = e.target.value.trim();
        clearTimeout(searchDebounceTimer);

        if (!query) {
            searchDropdown.classList.add("hidden");
            return;
        }

        // Instant local filter first for instant UI response
        const pool = appState.allAssets && appState.allAssets.length > 0 ? appState.allAssets : appState.stocksList;
        const localMatches = pool.filter(s =>
            (s.name && s.name.toLowerCase().includes(query.toLowerCase())) ||
            (s.code && s.code.toLowerCase().includes(query.toLowerCase())) ||
            (s.sector && s.sector.toLowerCase().includes(query.toLowerCase())) ||
            (s.category && s.category.toLowerCase().includes(query.toLowerCase()))
        ).slice(0, 8);

        if (localMatches.length > 0) {
            renderSearchDropdown(localMatches, query);
        }

        // If local matches already satisfy the query (>= 4 matches), skip remote network query
        if (localMatches.length >= 4) {
            return;
        }

        // Debounced comprehensive search against full Indian stock, ETF & Bond universe
        searchDebounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/stocks/search?q=${encodeURIComponent(query)}`);
                const data = await res.json();
                const results = data.results || [];
                if (results.length > 0) {
                    renderSearchDropdown(results, query);
                }
            } catch (err) {
                console.error("Stock search failed:", err);
            }
        }, 200);
    });

    function renderSearchDropdown(items, query) {
        if (!items || items.length === 0) {
            searchDropdown.innerHTML = `<div class="p-4 text-xs text-[#86868b] text-center">No instruments found matching "${query}"</div>`;
            searchDropdown.classList.remove("hidden");
            return;
        }

        // Strict deduplication by instrument code / symbol
        const uniqueItems = [];
        const seenCodes = new Set();
        items.forEach(item => {
            const code = (item.code || item.symbol || "").toUpperCase();
            if (!seenCodes.has(code)) {
                seenCodes.add(code);
                uniqueItems.push(item);
            }
        });

        searchDropdown.innerHTML = uniqueItems.map(s => {
            const code = s.code || s.symbol.replace(".NS", "").replace(".BO", "");
            const rawName = s.name || "";
            // Avoid repeating symbol if name is identical to code
            const isNameSameAsCode = rawName.trim().toUpperCase() === code.trim().toUpperCase() || rawName.trim().toUpperCase() === `${code}.NS`;
            const displayName = isNameSameAsCode ? (s.sector ? `${s.sector}` : '') : rawName;

            // Apple Category Badge
            const cat = s.category || (s.symbol.includes("=F") ? "Commodity" : s.symbol.startsWith("^") ? "Index" : (s.code.includes("BEES") || (s.name && s.name.toLowerCase().includes("etf"))) ? "ETF" : (s.code.includes("GILT") || s.code.includes("BOND") || s.code.includes("GSEC")) ? "Bond" : "Stock");
            let badgeClass = "badge-stock";
            if (cat === "ETF") badgeClass = "badge-etf";
            else if (cat === "Bond") badgeClass = "badge-bond";
            else if (cat === "Commodity") badgeClass = "badge-commodity";
            else if (cat === "Index") badgeClass = "badge-index";

            return `
                <div class="px-4 py-2.5 hover:bg-[#f5f5f7] cursor-pointer border-b border-[rgba(0,0,0,0.05)] flex justify-between items-center search-item transition-colors"
                     data-symbol="${s.symbol}" data-category="${cat}" data-code="${code}">
                    <div class="flex-1 pr-3">
                        <div class="flex items-center gap-2">
                            <span class="font-semibold text-sm text-[#1d1d1f] tracking-tight">${code}</span>
                            <span class="${badgeClass}">${cat.toUpperCase()}</span>
                        </div>
                        ${displayName ? `<span class="text-xs text-[#6e6e73] block mt-0.5 truncate max-w-xs">${displayName}</span>` : ''}
                    </div>
                    <span class="text-[11px] text-[#86868b] font-medium whitespace-nowrap">${s.sector || 'NSE'}</span>
                </div>
            `;
        }).join("");

        searchDropdown.querySelectorAll(".search-item").forEach(item => {
            item.addEventListener("click", () => {
                const sym = item.dataset.symbol;
                const cat = item.dataset.category;
                searchInput.value = "";
                searchDropdown.classList.add("hidden");

                if (cat === "Commodity" || sym.includes("=F")) {
                    switchTab("commodities");
                    selectCommodity(sym);
                } else {
                    switchTab("stocks");
                    if (typeof _currentChartEngine !== "undefined" && _currentChartEngine === "tv_pro" && typeof updateTradingViewProSymbol === "function") {
                        updateTradingViewProSymbol(sym);
                    }
                    loadStock(sym);
                }
            });
        });

        searchDropdown.classList.remove("hidden");
    }

    // Close dropdown on outside click
    document.addEventListener("click", (e) => {
        if (!searchInput.contains(e.target) && !searchDropdown.contains(e.target)) {
            searchDropdown.classList.add("hidden");
        }
    });
}

async function loadInitialData() {
    try {
        const res = await fetch("/api/stocks/list");
        const data = await res.json();
        appState.stocksList = data.stocks || [];
        appState.allAssets = data.all_assets || data.stocks || [];
        appState.commoditiesList = data.commodities || [];
        renderCommoditiesTicker(appState.commoditiesList);
    } catch (e) {
        console.error("Error loading initial data:", e);
    }
}


async function fetchMarketOverview() {
    try {
        const res = await fetch("/api/market/overview");
        const data = await res.json();
        if (data.status === "success") {
            appState.marketOverview = data;
            renderMarketTicker(data);
            updateLiveTickerTape(data);
            if (data.market_status) {
                updateNavbarMarketStatus(data.market_status);
            }
        }
    } catch (e) {
        console.error("Error fetching market overview:", e);
    }
}

function updateNavbarMarketStatus(ms) {
    if (!ms) return;
    const navStatus = document.getElementById("navbarMarketStatus");
    const navDot = document.getElementById("navbarMarketDot");
    const navText = document.getElementById("navbarMarketText");
    if (!navStatus || !navDot || !navText) return;

    if (ms.is_live) {
        navStatus.className = "inline-flex items-center px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold text-[11px] border border-emerald-200/60 shadow-xs";
        navDot.className = "w-2 h-2 rounded-full bg-emerald-500 mr-1.5 animate-pulse";
        navText.innerText = "NSE Live";
        navStatus.title = `${ms.detail} • IST: ${ms.current_ist_time}`;
    } else if (ms.session === "PRE_OPEN") {
        navStatus.className = "inline-flex items-center px-2.5 py-1 rounded-lg bg-amber-50 text-amber-700 font-semibold text-[11px] border border-amber-200/60 shadow-xs";
        navDot.className = "w-2 h-2 rounded-full bg-amber-500 mr-1.5";
        navText.innerText = "Pre-Open (09:00–09:15)";
        navStatus.title = `${ms.detail} • IST: ${ms.current_ist_time}`;
    } else {
        navStatus.className = "inline-flex items-center px-2.5 py-1 rounded-lg bg-[#f2f2f7] text-[#6e6e73] font-semibold text-[11px] border border-[rgba(0,0,0,0.1)] shadow-xs";
        navDot.className = "w-2 h-2 rounded-full bg-rose-500 mr-1.5";
        navText.innerText = `Market Closed (${ms.last_trading_date})`;
        navStatus.title = `${ms.detail} • ${ms.next_open}`;
    }
}

function renderMarketTicker(data) {
    const tickerContainer = document.getElementById("marketTickerBar");
    if (!tickerContainer) return;

    const nifty = data.indices.nifty;
    const bank = data.indices.bank_nifty;
    const comms = data.commodities || [];
    const usdinr = data.usd_inr || 83.5;

    const items = [
        { label: "NIFTY 50", price: formatINR(nifty.current_price), change: nifty.day_change_pct },
        { label: "BANK NIFTY", price: formatINR(bank.current_price), change: bank.day_change_pct },
        { label: "USD/INR", price: `₹${usdinr}`, change: 0.05 },
        ...comms.map(c => ({
            label: `${c.icon} ${c.code}`,
            price: `₹${formatNumber(c.price_inr, 0)}`,
            change: c.change_pct
        }))
    ];

    const htmlContent = items.map(it => {
        const isUp = it.change >= 0;
        return `
            <div class="inline-flex items-center space-x-2 px-4 border-r border-[rgba(0,0,0,0.08)] text-xs py-1">
                <span class="text-[#6e6e73] font-medium">${it.label}:</span>
                <span class="font-bold text-[#1c1c1e] mono">${it.price}</span>
                <span class="font-semibold ${isUp ? 'text-[#1e7e34]' : 'text-[#b32020]'} mono">
                    ${isUp ? '▲' : '▼'} ${Math.abs(it.change).toFixed(2)}%
                </span>
            </div>
        `;
    }).join("");

    tickerContainer.innerHTML = `<div class="ticker-move">${htmlContent}${htmlContent}</div>`;
}

const WORKSPACE_MAP = {
    "stocks": { ws: "terminal", label: "Terminal", desks: [{ id: "stocks", label: "📈 Stocks Deep Dive" }] },
    "scanner": { ws: "discovery", label: "Discovery", desks: [
        { id: "scanner", label: "📡 SEPA Alpha Scanner" },
        { id: "best-picks", label: "💡 Curated Guru Picks" },
        { id: "screener", label: "🎯 Multi-Metric Screener" }
    ]},
    "best-picks": { ws: "discovery", label: "Discovery", desks: [
        { id: "scanner", label: "📡 SEPA Alpha Scanner" },
        { id: "best-picks", label: "💡 Curated Guru Picks" },
        { id: "screener", label: "🎯 Multi-Metric Screener" }
    ]},
    "screener": { ws: "discovery", label: "Discovery", desks: [
        { id: "scanner", label: "📡 SEPA Alpha Scanner" },
        { id: "best-picks", label: "💡 Curated Guru Picks" },
        { id: "screener", label: "🎯 Multi-Metric Screener" }
    ]},
    "institutional": { ws: "markets", label: "Markets & Macro", desks: [
        { id: "institutional", label: "🏛️ Institutional Breadth" },
        { id: "sectors", label: "📊 Sector Heatmap" },
        { id: "options", label: "📋 F&O Options Desk" },
        { id: "commodities", label: "🥇 MCX Commodities" }
    ]},
    "sectors": { ws: "markets", label: "Markets & Macro", desks: [
        { id: "institutional", label: "🏛️ Institutional Breadth" },
        { id: "sectors", label: "📊 Sector Heatmap" },
        { id: "options", label: "📋 F&O Options Desk" },
        { id: "commodities", label: "🥇 MCX Commodities" }
    ]},
    "options": { ws: "markets", label: "Markets & Macro", desks: [
        { id: "institutional", label: "🏛️ Institutional Breadth" },
        { id: "sectors", label: "📊 Sector Heatmap" },
        { id: "options", label: "📋 F&O Options Desk" },
        { id: "commodities", label: "🥇 MCX Commodities" }
    ]},
    "commodities": { ws: "markets", label: "Markets & Macro", desks: [
        { id: "institutional", label: "🏛️ Institutional Breadth" },
        { id: "sectors", label: "📊 Sector Heatmap" },
        { id: "options", label: "📋 F&O Options Desk" },
        { id: "commodities", label: "🥇 MCX Commodities" }
    ]},
    "bees": { ws: "allocation", label: "ETFs & Allocation", desks: [
        { id: "bees", label: "⚖️ Bees Donchian Rotation" },
        { id: "etf", label: "📉 All-India ETF Screener" }
    ]},
    "etf": { ws: "allocation", label: "ETFs & Allocation", desks: [
        { id: "bees", label: "⚖️ Bees Donchian Rotation" },
        { id: "etf", label: "📉 All-India ETF Screener" }
    ]},
    "journal": { ws: "execution", label: "Execution & Risk", desks: [
        { id: "journal", label: "📒 Trading Journal & Risk" },
        { id: "backtest", label: "🧪 Strategy Backtester" }
    ]},
    "backtest": { ws: "execution", label: "Execution & Risk", desks: [
        { id: "journal", label: "📒 Trading Journal & Risk" },
        { id: "backtest", label: "🧪 Strategy Backtester" }
    ]},
    "ipo": { ws: "more", label: "Intelligence", desks: [
        { id: "ipo", label: "🚀 IPOs Tracker" },
        { id: "calendar", label: "📅 Economic Calendar" },
        { id: "news", label: "📰 Live Market News" }
    ]},
    "calendar": { ws: "more", label: "Intelligence", desks: [
        { id: "ipo", label: "🚀 IPOs Tracker" },
        { id: "calendar", label: "📅 Economic Calendar" },
        { id: "news", label: "📰 Live Market News" }
    ]},
    "news": { ws: "more", label: "Intelligence", desks: [
        { id: "ipo", label: "🚀 IPOs Tracker" },
        { id: "calendar", label: "📅 Economic Calendar" },
        { id: "news", label: "📰 Live Market News" }
    ]}
};

function switchWorkspace(workspaceKey, defaultTab) {
    switchTab(defaultTab || "stocks");
}
window.switchWorkspace = switchWorkspace;

function toggleTickerTape() {
    const strip = document.getElementById("liveTickerStrip");
    const btn = document.getElementById("tickerToggleBtn");
    if (!strip) return;
    const isHidden = strip.classList.toggle("hidden");
    localStorage.setItem("terminal_ticker_hidden", isHidden ? "true" : "false");
    if (btn) {
        btn.classList.toggle("opacity-60", isHidden);
    }
}
window.toggleTickerTape = toggleTickerTape;

function toggleMoreDesksDropdown(e) {
    if (e && e.stopPropagation) e.stopPropagation();
    const dd = document.getElementById("moreDesksDropdown");
    if (dd) dd.classList.toggle("hidden");
}
window.toggleMoreDesksDropdown = toggleMoreDesksDropdown;

function toggleMobileMoreSheet() {
    const sheet = document.getElementById("mobileMoreSheet");
    if (sheet) sheet.classList.toggle("hidden");
}
window.toggleMobileMoreSheet = toggleMobileMoreSheet;

// Close dropdown on outside click
document.addEventListener("click", () => {
    const dd = document.getElementById("moreDesksDropdown");
    if (dd && !dd.classList.contains("hidden")) dd.classList.add("hidden");
});

function switchTab(tab) {
    if (tab === "recommendations") tab = "best-picks";
    appState.currentTab = tab;

    // Synchronize Master Workspace navigation
    const info = WORKSPACE_MAP[tab] || WORKSPACE_MAP["stocks"];
    document.querySelectorAll(".workspace-btn").forEach(wb => {
        if (wb.dataset.workspace === info.ws) {
            wb.classList.add("active");
        } else {
            wb.classList.remove("active");
        }
    });

    // Populate Contextual Sub-Desks Track
    const subDeskTrack = document.getElementById("subDeskNavTrack");
    const breadcrumb = document.getElementById("activeWorkspaceBreadcrumb");
    if (breadcrumb) {
        breadcrumb.innerHTML = `Workspace: <strong class="text-[#1c1c1e]">${info.label}</strong>`;
    }
    if (subDeskTrack) {
        subDeskTrack.innerHTML = info.desks.map(d => `
            <button class="nav-tab-btn ${d.id === tab ? 'active' : ''}" data-tab="${d.id}" onclick="switchTab('${d.id}')">
                ${d.label}
            </button>
        `).join("");
    }

    // Toggle active tab view
    document.querySelectorAll(".tab-view").forEach(view => view.classList.add("hidden"));
    const activeView = document.getElementById(`tab-view-${tab}`);
    if (activeView) activeView.classList.remove("hidden");

    // Update Mobile Bottom Floating Dock highlighting
    document.querySelectorAll(".mobile-dock-btn").forEach(btn => {
        if (btn.dataset.tab === tab) {
            btn.classList.add("text-[#007aff]");
            btn.classList.remove("text-[#6e6e73]");
        } else {
            btn.classList.remove("text-[#007aff]");
            btn.classList.add("text-[#6e6e73]");
        }
    });

    if (tab === "stocks") {
        setTimeout(() => {
            const algoContainer = document.getElementById("candlestickChartContainer");
            if (typeof _currentChartEngine !== "undefined" && _currentChartEngine === "algo") {
                if (typeof tvChart !== "undefined" && tvChart && algoContainer && algoContainer.clientWidth > 0) {
                    tvChart.applyOptions({ width: algoContainer.clientWidth });
                    tvChart.timeScale().fitContent();
                }
            } else if (typeof _currentChartEngine !== "undefined" && _currentChartEngine === "tv_pro") {
                if (typeof updateTradingViewProSymbol === "function" && appState.currentSymbol) {
                    updateTradingViewProSymbol(appState.currentSymbol);
                }
            }
        }, 60);
    }

    if (tab === "institutional") {
        loadInstitutionalRadar();
    } else if (tab === "best-picks") {
        loadBestRecommendations();
    } else if (tab === "screener") {
        initScreener();
    } else if (tab === "bees") {
        loadBeesStrategy();
    } else if (tab === "scanner") {
        runLiveScanner();
    } else if (tab === "sectors") {
        loadSectorsAnalysis();
    } else if (tab === "etf") {
        loadEtfScreener();
    } else if (tab === "journal") {
        loadTradeJournal();
    } else if (tab === "backtest") {
        runBacktest();
    } else if (tab === "commodities") {
        loadCommoditiesDashboard();
    } else if (tab === "options") {
        loadOptionsDashboard("NIFTY");
        if (typeof loadOptionsPayoff === "function") {
            loadOptionsPayoff("bull_call_spread", 25);
        }
    } else if (tab === "ipo") {
        loadIpoTracker();
    } else if (tab === "calendar") {
        loadEconomicCalendar();
    } else if (tab === "news") {
        loadMarketNewsFixed();
    }
}


function switchTradingStyle(style) {
    appState.currentStyle = style;
    document.querySelectorAll(".style-btn").forEach(btn => {
        if (btn.dataset.style === style) {
            btn.classList.add("active", "bg-white", "text-[#1d1d1f]", "font-semibold", "shadow-sm");
            btn.classList.remove("text-[#636366]", "bg-blue-600", "text-white", "shadow-lg", "text-slate-400", "bg-slate-800/80");
        } else {
            btn.classList.remove("active", "bg-white", "text-[#1d1d1f]", "font-semibold", "shadow-sm", "bg-blue-600", "text-white", "shadow-lg");
            btn.classList.add("text-[#636366]");
        }
    });


    // Auto-adjust period based on style
    if (style === "intraday") {
        appState.currentPeriod = "5d";
        appState.currentInterval = "15m";
    } else if (style === "positional") {
        appState.currentPeriod = "2y";
        appState.currentInterval = "1d";
    } else {
        appState.currentPeriod = "1y";
        appState.currentInterval = "1d";
    }

    // Sync with Best Picks desk if user is on best-picks tab
    if (appState.currentTab === "best-picks" && typeof filterPicksSubTab === "function") {
        filterPicksSubTab(style);
    }

    // Refresh stock signals and chart with new style if on stocks tab
    if (appState.currentTab === "stocks" || !appState.currentTab) {
        loadStock(appState.currentSymbol);
    }
}

function addRecentSymbol(sym) {
    if (!sym) return;
    try {
        const raw = localStorage.getItem("recent_stock_history");
        let history = raw !== null ? JSON.parse(raw) : ["RELIANCE.NS", "TCS.NS", "NIFTYBEES.NS", "GOLDBEES.NS"];
        if (!Array.isArray(history)) history = [];
        history = [sym, ...history.filter(s => s !== sym)].slice(0, 7);
        localStorage.setItem("recent_stock_history", JSON.stringify(history));
        renderRecentChips();
    } catch (e) {
        console.error("Error adding recent symbol:", e);
    }
}

function renderRecentChips() {
    const container = document.getElementById("recentSearchesBar");
    if (!container) return;
    try {
        const raw = localStorage.getItem("recent_stock_history");
        let history = raw !== null ? JSON.parse(raw) : ["RELIANCE.NS", "TCS.NS", "NIFTYBEES.NS", "GOLDBEES.NS"];
        if (!Array.isArray(history) || history.length === 0) {
            container.innerHTML = `<span class="text-[10.5px] text-[#8e8e93] italic py-0.5">No recent searches</span>`;
            return;
        }
        container.innerHTML = `
            <span class="text-[10.5px] text-[#8e8e93] font-medium mr-1 uppercase">Recent:</span>
            <div class="flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5">
                ${history.map(s => {
                    const clean = s.replace(".NS", "").replace(".BO", "");
                    return `<button onclick="selectSearchedStock('${s}')" class="px-2 py-0.5 rounded-md bg-[#e8e8ed] hover:bg-[#d8d8de] text-[#1c1c1e] text-[10.5px] font-semibold transition-all mono flex-shrink-0 cursor-pointer" title="Load ${clean}">${clean}</button>`;
                }).join("")}
                <button onclick="clearRecentSearches()" class="px-1.5 py-0.5 rounded-md bg-transparent hover:bg-[#fdf0f0] text-[#8e8e93] hover:text-[#b32020] text-[10px] font-semibold transition-all ml-1 border border-transparent hover:border-[#f7c8c8] flex items-center gap-1 cursor-pointer flex-shrink-0" title="Clear recent searches">
                    <span>✕</span> <span>Clear</span>
                </button>
            </div>
        `;
    } catch(e) {
        console.error("Error rendering recent chips:", e);
    }
}

function clearRecentSearches() {
    try {
        localStorage.setItem("recent_stock_history", JSON.stringify([]));
        renderRecentChips();
        if (window.showNotification) {
            showNotification("Recent search history cleared.", "info");
        }
    } catch (e) {
        console.error("Failed to clear recents:", e);
    }
}
window.clearRecentSearches = clearRecentSearches;

async function refreshCurrentStock() {
    const svg = document.getElementById("stockRefreshSvg");
    if (svg) svg.classList.add("animate-spin");
    await loadStock(appState.currentSymbol, true);
    if (svg) {
        setTimeout(() => svg.classList.remove("animate-spin"), 400);
    }
}

async function loadStock(symbol, forceRefresh = false) {
    if (!symbol) return;
    appState.currentSymbol = symbol;
    addRecentSymbol(symbol);

    // Instant TradingView Pro sync (0ms latency without waiting for API roundtrip)
    if (typeof _currentChartEngine !== "undefined" && _currentChartEngine === "tv_pro" && typeof updateTradingViewProSymbol === "function") {
        updateTradingViewProSymbol(symbol);
    }

    const cacheKey = `${symbol}_${appState.currentStyle}_${appState.currentPeriod}_${appState.currentInterval}`;
    const now = Date.now();
    const cachedEntry = clientStockCache.get(cacheKey);

    // 0ms instant render from memory cache if fresh (< 60s)
    if (!forceRefresh && cachedEntry && (now - cachedEntry.timestamp < CLIENT_CACHE_TTL_MS)) {
        renderAllStockComponents(cachedEntry.stockData, cachedEntry.chartData, cachedEntry.newsData);
        return;
    }

    showLoading(true);

    try {
        const refreshParam = forceRefresh ? '&refresh=true' : '';
        // High-efficiency bundled request (single roundtrip)
        const stockRes = await fetch(`/api/stock/${symbol}?style=${appState.currentStyle}&period=${appState.currentPeriod}&interval=${appState.currentInterval}&bundle=true${refreshParam}`);
        const stockData = await stockRes.json();

        if (stockData && stockData.status === "success") {
            const chartData = stockData.chart || { candles: [] };
            const newsData = stockData.news || { articles: [] };

            // Save to memory cache for instantaneous subsequent visits
            clientStockCache.set(cacheKey, {
                stockData,
                chartData,
                newsData,
                timestamp: now
            });

            renderAllStockComponents(stockData, chartData, newsData);
        } else {
            console.warn("Stock data returned status:", stockData);
            if (window.showNotification) {
                showNotification(stockData?.message || `Unable to load data for ${symbol}.`, "warning");
            }
        }
    } catch (e) {
        console.error("Error loading stock:", e);
    } finally {
        showLoading(false);
    }
}

function renderAllStockComponents(stockData, chartData, newsData) {
    appState.latestStockData = stockData;

    // Render each section with dedicated error boundaries
    try {
        renderStockHeader(stockData.info, stockData.relative_strength, stockData.minervini, stockData.mtf);
    } catch (err) {
        console.error("renderStockHeader error:", err);
    }

    try {
        renderSignalsBox(stockData.signals, stockData.style_info);
    } catch (err) {
        console.error("renderSignalsBox error:", err);
    }

    try {
        renderTechnicals(stockData.technicals);
    } catch (err) {
        console.error("renderTechnicals error:", err);
    }

    try {
        renderFundamentals(stockData.fundamentals, stockData.info, stockData.valuation);
    } catch (err) {
        console.error("renderFundamentals error:", err);
    }

    try {
        renderShareholding(stockData.shareholding);
    } catch (err) {
        console.error("renderShareholding error:", err);
    }

    try {
        renderExpertStrategies(stockData.strategies);
    } catch (err) {
        console.error("renderExpertStrategies error:", err);
    }

    try {
        renderDeliveryRadar(stockData.delivery);
    } catch (err) {
        console.error("renderDeliveryRadar error:", err);
    }

    const chartContainer = document.getElementById("candlestickChartContainer");
    if (chartData && chartData.candles && chartData.candles.length > 0) {
        try {
            const indSeries = stockData.indicator_series || chartData.indicator_series;
            initLightweightChart("candlestickChartContainer", chartData.candles, null, indSeries);
        } catch (err) {
            console.error("initLightweightChart error:", err);
        }
    } else if (chartContainer) {
        chartContainer.innerHTML = `
            <div class="flex flex-col items-center justify-center h-full text-center p-8 text-[#86868b]">
                <div class="w-12 h-12 rounded-2xl bg-[#f5f5f7] flex items-center justify-center mb-3 text-xl shadow-xs">📈</div>
                <div class="text-sm font-semibold text-[#1d1d1f]">Historical Chart Synchronizing</div>
                <div class="text-xs text-[#86868b] mt-1.5 max-w-sm leading-relaxed">Exchange candlestick data is synchronizing with market feeds. Technical metrics and fundamental health below are active.</div>
            </div>
        `;
    }

    // Render TradingView Speedometer Technical Analysis Gauge
    const activeSymbol = stockData?.info?.symbol || appState.currentSymbol;
    try {
        renderTradingViewTechnicalGauge(activeSymbol);
    } catch (err) {
        console.error("renderTradingViewTechnicalGauge error:", err);
    }

    // Ensure TradingView Pro widget displays active stock if selected as current chart engine
    if (typeof _currentChartEngine !== "undefined" && _currentChartEngine === "tv_pro" && typeof updateTradingViewProSymbol === "function") {
        updateTradingViewProSymbol(activeSymbol);
    }

    // If an algorithmic pick was clicked, pre-plot its exact Entry, Stop-Loss, and Targets
    if (appState.pendingPick) {
        const p = appState.pendingPick;
        setTimeout(() => {
            if (typeof applyCustomRiskReward === "function") {
                applyCustomRiskReward(p.cmp, p.stop_loss, p.target, p.target_2, p.shares_qty, p.rationale);
            }
            appState.pendingPick = null;
        }, 120);
    }

    try {
        renderStockNews((newsData && newsData.articles) || []);
    } catch (err) {
        console.error("renderStockNews error:", err);
    }

    try {
        if (typeof checkPriceAlerts === "function" && stockData && stockData.info) {
            checkPriceAlerts(stockData.info.symbol, stockData.info.current_price, stockData.info.fifty_two_week_high);
        }
    } catch (err) {
        console.error("checkPriceAlerts error:", err);
    }
}

async function loadChart(symbol, period, interval) {
    try {
        const res = await fetch(`/api/stock/${symbol}/chart?period=${period}&interval=${interval}`);
        const data = await res.json();
        if (data.status === "success" && data.candles) {
            initLightweightChart("candlestickChartContainer", data.candles, null, data.indicator_series);
        }
    } catch (e) {
        console.error("Error refreshing chart:", e);
    }
}

function renderTradingViewTechnicalGauge(symbol) {
    const container = document.getElementById("tvTechnicalGaugeContainer");
    if (!container) return;

    let cleanSym = (symbol || "RELIANCE.NS").replace(".NS", "").replace(".BO", "").trim().toUpperCase();
    if (cleanSym === "^NSEI") cleanSym = "NIFTY";
    else if (cleanSym === "^NSEBANK") cleanSym = "BANKNIFTY";
    const tvSymbol = `NSE:${cleanSym}`;

    container.innerHTML = "";

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const widgetWrapper = document.createElement("div");
    widgetWrapper.className = "tradingview-widget-container";
    widgetWrapper.style.width = "100%";
    widgetWrapper.style.height = "100%";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetWrapper.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.type = "text/javascript";
    script.src = "https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js";
    script.async = true;
    script.innerHTML = JSON.stringify({
        "interval": "1D",
        "width": "100%",
        "isTransparent": true,
        "height": "310",
        "symbol": tvSymbol,
        "showIntervalTabs": true,
        "displayMode": "single",
        "locale": "in",
        "colorTheme": isDark ? "dark" : "light"
    });

    widgetWrapper.appendChild(script);
    container.appendChild(widgetWrapper);
}
window.renderTradingViewTechnicalGauge = renderTradingViewTechnicalGauge;

function inspectPickOnChart(pick) {
    if (!pick) return;
    appState.pendingPick = pick;
    switchTab("stocks");
    const sym = pick.symbol || (pick.code ? (pick.code + ".NS") : "RELIANCE.NS");
    loadStock(sym);
}
window.inspectPickOnChart = inspectPickOnChart;

function renderStockHeader(info, rs, minervini, mtf) {
    const isUp = info.day_change >= 0;
    document.getElementById("stockName").innerText = info.name;
    document.getElementById("stockSymbol").innerText = info.symbol;
    document.getElementById("stockSector").innerText = info.sector;
    document.getElementById("stockPrice").innerText = formatINR(info.current_price);
    
    const changeBadge = document.getElementById("stockChange");
    changeBadge.className = `inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold mono ${isUp ? 'bg-[#edf7ee] text-[#1e7e34] border border-[#c6e8cc]' : 'bg-[#fdf0f0] text-[#b32020] border border-[#f7c8c8]'}`;
    changeBadge.innerHTML = `${isUp ? '▲ +' : '▼ '}${info.day_change} (${isUp ? '+' : ''}${info.day_change_pct}%)`;

    document.getElementById("stockHighLow").innerText = `Day H: ₹${info.day_high} | L: ₹${info.day_low}`;
    document.getElementById("stock52W").innerText = `52W H: ₹${info.fifty_two_week_high} | L: ₹${info.fifty_two_week_low}`;
    document.getElementById("stockMarketCap").innerText = formatCrores(info.market_cap);

    const timeEl = document.getElementById("liveTickTimestamp");
    if (timeEl) {
        const ms = info.market_status;
        if (ms && ms.is_live) {
            timeEl.innerHTML = `<span class="inline-flex items-center text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10.5px] font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>🟢 Live Market Tick • ${ms.current_ist_time}</span>`;
        } else {
            const closeDate = (ms && ms.last_trading_date) || info.last_trading_date || 'Session Close';
            timeEl.innerHTML = `<span class="inline-flex items-center text-[#6e6e73] bg-[#f2f2f7] px-2 py-0.5 rounded border border-[rgba(0,0,0,0.08)] text-[10.5px] font-medium"><span class="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5"></span>🔴 Market Closed • Official Close (${closeDate}, 15:30 IST)</span>`;
        }
    }

    // Relative Strength & Minervini Stage 2 Badges
    const rsBadge = document.getElementById("stockRsBadge");
    if (rsBadge) {
        if (rs && rs.rs_rating) {
            rsBadge.innerText = `RS ${rs.rs_rating}/99`;
            rsBadge.style.color = rs.rating_color || "#007aff";
            rsBadge.style.backgroundColor = `${rs.rating_color || "#007aff"}15`;
            rsBadge.style.borderColor = `${rs.rating_color || "#007aff"}35`;
            rsBadge.title = rs.summary || "Mansfield Relative Strength vs NIFTY 50";
        } else {
            rsBadge.innerText = "RS 75/99";
        }
    }

    const minBadge = document.getElementById("stockMinerviniBadge");
    if (minBadge) {
        if (minervini && minervini.verdict) {
            minBadge.innerText = minervini.stage_2_confirmed ? "Stage 2 Mark-Up" : (minervini.passed_count >= 5 ? "Stage 1 Transition" : "Stage 4 Downtrend");
            minBadge.style.color = minervini.verdict_color || "#10b981";
            minBadge.style.backgroundColor = `${minervini.verdict_color || "#10b981"}15`;
            minBadge.style.borderColor = `${minervini.verdict_color || "#10b981"}35`;
            minBadge.title = minervini.summary || "";
        }
    }

    // MTF Confluence Strip
    renderMtfStrip(mtf);
}

function renderMtfStrip(mtf) {
    const verdictEl = document.getElementById("mtfVerdictBadge");
    const container = document.getElementById("mtfPillsContainer");
    if (!container) return;

    if (!mtf || !mtf.timeframes || mtf.timeframes.length === 0) {
        container.innerHTML = `<span class="text-xs text-[#8e8e93]">Timeframe alignment active</span>`;
        return;
    }

    if (verdictEl) {
        verdictEl.innerText = mtf.confluence_badge || "Aligned";
        verdictEl.style.color = mtf.confluence_color || "#10b981";
        verdictEl.style.backgroundColor = `${mtf.confluence_color || "#10b981"}15`;
        verdictEl.style.borderColor = `${mtf.confluence_color || "#10b981"}35`;
    }

    container.innerHTML = mtf.timeframes.map(t => `
        <span class="px-2 py-0.5 rounded border text-[10.5px] font-semibold flex items-center gap-1" style="background-color: ${t.color}15; color: ${t.color}; border-color: ${t.color}35;" title="${t.detail || ''}">
            <span>${t.icon}</span> <span>${t.timeframe}: ${t.status}</span>
        </span>
    `).join("");
}

function renderSignalsBox(signals, styleInfo) {
    const container = document.getElementById("signalsBoxContainer");
    if (!container) return;

    const sig = signals || {};
    const plan = sig.trade_plan || {
        time_horizon: "1-4 Weeks",
        entry_price: "—",
        stop_loss: "—",
        stop_loss_pct: 0,
        target_1: "—",
        target_1_pct: 0,
        risk_reward: "1 : 2.0"
    };
    const sInfo = styleInfo || { icon: "📈", name: "Swing" };
    const sList = Array.isArray(sig.signals) ? sig.signals : [];

    let signalPillsHtml = sList.length > 0 ? sList.map(s => `
        <div class="macos-box p-3 flex items-start space-x-2.5">
            <span class="text-base flex-shrink-0 mt-0.5">${s.icon || '📊'}</span>
            <div class="flex-1 min-w-0">
                <div class="flex items-center justify-between gap-2">
                    <span class="text-xs font-semibold text-[#1c1c1e]">${s.name || 'Signal'}</span>
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded border" style="background-color: ${s.color || '#007aff'}15; color: ${s.color || '#007aff'}; border-color: ${s.color || '#007aff'}35;">${s.verdict || 'HOLD'}</span>
                </div>
                <p class="text-[11px] text-[#6e6e73] mt-1 leading-relaxed">${s.explanation || ''}</p>
            </div>
        </div>
    `).join("") : `<div class="macos-box p-3 text-xs text-[#8e8e93]">Evaluating technical and fundamental indicators for this asset.</div>`;

    let conf = sig.confidence;
    if (!conf || typeof conf !== "object") {
        const score = typeof conf === "number" ? conf : 75;
        conf = {
            score: score,
            level: score >= 75 ? "High Conviction" : (score >= 55 ? "Moderate Conviction" : "Low / Speculative"),
            badge: score >= 75 ? "bg-[#edf7ee] text-[#1e7e34] border-[#c6e8cc]" : (score >= 55 ? "bg-[#fef6ed] text-[#8a4500] border-[#fcdcb8]" : "bg-[#fdf0f0] text-[#b32020] border-[#f7c8c8]"),
            factors: ["Consensus momentum active", "Volume supported"]
        };
    }

    container.innerHTML = `
        <div class="macos-card p-5 space-y-4">
            <!-- Header Verdict -->
            <div class="flex flex-wrap items-center justify-between gap-3 pb-3.5 border-b border-[rgba(0,0,0,0.06)]">
                <div>
                    <div class="flex items-center space-x-2">
                        <span class="text-xs text-[#007aff] font-semibold uppercase tracking-wider">${sInfo.icon} ${sInfo.name}</span>
                        <span class="text-[#d1d1d6]">•</span>
                        <span class="text-xs text-[#6e6e73]">${plan.time_horizon || 'Swing'}</span>
                    </div>
                    <h3 class="text-2xl font-bold mt-1 tracking-tight" style="color: ${sig.color || '#007aff'}">${sig.verdict || 'HOLD / MONITOR'}</h3>
                    <p class="text-xs text-[#48484a] mt-0.5">${sig.summary || 'Consensus analysis in progress.'}</p>
                </div>
                <!-- Consensus Score Pill -->
                <div class="text-right">
                    <div class="text-xs text-[#6e6e73]">Consensus Score</div>
                    <div class="text-base font-bold mono text-[#1c1c1e] mt-0.5">${sig.bullish_count || 0} 🟢 / ${sig.bearish_count || 0} 🔴</div>
                </div>
            </div>

            <!-- AI Trade Confidence Banner -->
            <div class="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl border ${conf.badge}">
                <div class="flex items-center space-x-2.5">
                    <span class="text-xl">🎯</span>
                    <div>
                        <div class="font-bold text-xs flex items-center gap-2">
                            <span>AI Trade Confidence:</span>
                            <span class="mono text-sm">${conf.score}%</span>
                            <span class="text-[10px] px-2 py-0.5 rounded-full bg-white font-semibold shadow-xs">(${conf.level})</span>
                        </div>
                        <div class="text-[11px] opacity-90 mt-0.5">
                            ${(conf.factors || []).join(" • ")}
                        </div>
                    </div>
                </div>
                <div class="w-36 bg-black/10 rounded-full h-2 overflow-hidden flex-shrink-0">
                    <div class="h-2 rounded-full ${conf.score >= 75 ? 'bg-[#1e7e34]' : (conf.score >= 55 ? 'bg-[#8a4500]' : 'bg-[#b32020]')}" style="width: ${conf.score}%"></div>
                </div>
            </div>

            <!-- Trade Plan Grid -->
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div class="macos-box p-3">
                    <div class="text-[11px] text-[#6e6e73] font-medium">Entry Zone</div>
                    <div class="text-base font-bold text-[#1c1c1e] mono mt-0.5">₹${plan.entry_price}</div>
                </div>
                <div class="macos-box p-3">
                    <div class="text-[11px] text-[#b32020] font-medium">Stop-Loss ${renderJargonTooltip("RSI")}</div>
                    <div class="text-base font-bold text-[#b32020] mono mt-0.5">₹${plan.stop_loss} <span class="text-xs font-normal">(-${plan.stop_loss_pct}%)</span></div>
                </div>
                <div class="macos-box p-3">
                    <div class="text-[11px] text-[#1e7e34] font-medium">Target 1</div>
                    <div class="text-base font-bold text-[#1e7e34] mono mt-0.5">₹${plan.target_1} <span class="text-xs font-normal">(+${plan.target_1_pct}%)</span></div>
                </div>
                <div class="macos-box p-3">
                    <div class="text-[11px] text-[#0062cc] font-medium">Risk : Reward</div>
                    <div class="text-base font-bold text-[#007aff] mono mt-0.5">${plan.risk_reward}</div>
                </div>
            </div>

            <!-- Plain English Indicators Checklist -->
            <div>
                <div class="text-[11px] font-semibold text-[#48484a] uppercase tracking-wider mb-2">Indicator Consensus Breakdown:</div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    ${signalPillsHtml}
                </div>
            </div>
        </div>
    `;
}


function renderTechnicals(t) {
    if (!t) return;
    if (t.status !== "success") {
        if (document.getElementById("rsiValue")) document.getElementById("rsiValue").innerText = "—";
        if (document.getElementById("rsiExplanation")) document.getElementById("rsiExplanation").innerText = "Technical indicators are indexing from recent exchange sessions.";
        if (document.getElementById("macdStatus")) document.getElementById("macdStatus").innerText = "NEUTRAL";
        if (document.getElementById("macdExplanation")) document.getElementById("macdExplanation").innerText = "Awaiting sufficient historical closing data.";
        if (document.getElementById("maTrendStatus")) document.getElementById("maTrendStatus").innerText = "MONITORING";
        if (document.getElementById("maExplanation")) document.getElementById("maExplanation").innerText = "Trend moving averages being computed from latest sessions.";
        if (document.getElementById("valSma50")) document.getElementById("valSma50").innerText = "—";
        if (document.getElementById("valSma200")) document.getElementById("valSma200").innerText = "—";
        if (document.getElementById("volRatio")) document.getElementById("volRatio").innerText = "1.0x";
        if (document.getElementById("volExplanation")) document.getElementById("volExplanation").innerText = "Session volume within regular parameters.";
        if (document.getElementById("supportLevel")) document.getElementById("supportLevel").innerText = "—";
        if (document.getElementById("resistanceLevel")) document.getElementById("resistanceLevel").innerText = "—";
        if (document.getElementById("pivotLevel")) document.getElementById("pivotLevel").innerText = "—";
        return;
    }

    // RSI
    document.getElementById("rsiValue").innerText = t.rsi.value;
    document.getElementById("rsiExplanation").innerText = t.rsi.explanation;
    const rsiProgress = document.getElementById("rsiProgressBar");
    if (rsiProgress) {
        rsiProgress.style.width = `${Math.min(t.rsi.value, 100)}%`;
        rsiProgress.className = `h-2 rounded-full ${t.rsi.value > 70 ? 'bg-rose-500' : (t.rsi.value < 30 ? 'bg-emerald-400' : 'bg-blue-500')}`;
    }

    // MACD
    document.getElementById("macdStatus").innerText = t.macd.status.toUpperCase();
    document.getElementById("macdExplanation").innerText = t.macd.explanation;

    // Moving Averages & Golden Cross
    document.getElementById("maTrendStatus").innerText = t.moving_averages.status.toUpperCase();
    document.getElementById("maExplanation").innerText = t.moving_averages.explanation;
    document.getElementById("valSma50").innerText = `₹${t.moving_averages.sma50}`;
    document.getElementById("valSma200").innerText = `₹${t.moving_averages.sma200}`;
    const crossBadge = document.getElementById("crossBadge");
    if (crossBadge) {
        crossBadge.innerText = t.moving_averages.cross_label || (t.moving_averages.is_golden_cross_active ? "🌟 Golden Cross Active (50 DMA > 200 DMA)" : "⚠️ Death Cross (50 DMA < 200 DMA)");
        if (t.moving_averages.is_golden_cross_active) {
            crossBadge.className = "text-[10px] font-bold mt-1 px-2 py-0.5 rounded bg-[#edf7ee] text-[#1e7e34] border border-[#c6e8cc] inline-block";
        } else {
            crossBadge.className = "text-[10px] font-bold mt-1 px-2 py-0.5 rounded bg-[#fdf0f0] text-[#b32020] border border-[#f7c8c8] inline-block";
        }
    }

    // Volume & Institutional Action + OBV
    document.getElementById("volRatio").innerText = `${t.volume.ratio}x`;
    document.getElementById("volExplanation").innerText = t.volume.explanation;
    const volSpike = document.getElementById("volSpikeBadge");
    if (volSpike) {
        if (t.volume.spike_alert || t.volume.ratio >= 1.8) {
            volSpike.classList.remove("hidden");
        } else {
            volSpike.classList.add("hidden");
        }
    }
    const obvEl = document.getElementById("obvTrendText");
    if (obvEl) {
        obvEl.innerText = t.volume.obv_trend === "up" ? "🟢 Accumulation (Rising)" : "🔴 Distribution (Falling)";
    }

    // Key Risk Levels
    document.getElementById("supportLevel").innerText = `₹${t.risk_levels.support_1}`;
    document.getElementById("resistanceLevel").innerText = `₹${t.risk_levels.resistance_1}`;
    document.getElementById("pivotLevel").innerText = `₹${t.risk_levels.pivot}`;
}

function renderFundamentals(f, info, valuation) {
    if (!f) return;

    // Grade Pill
    const gradeBadge = document.getElementById("fundamentalGradeBadge");
    if (gradeBadge) {
        gradeBadge.innerText = f.grade;
        gradeBadge.style.backgroundColor = `${f.color}20`;
        gradeBadge.style.color = f.color;
        gradeBadge.style.borderColor = `${f.color}40`;
    }

    if (document.getElementById("fundamentalRating")) document.getElementById("fundamentalRating").innerText = f.rating;
    if (document.getElementById("fundamentalScore")) document.getElementById("fundamentalScore").innerText = `${f.score} / 100`;
    if (document.getElementById("fundamentalSummary")) document.getElementById("fundamentalSummary").innerText = f.summary;

    // Promoter Pledge Warning Alert
    const pledgeAlert = document.getElementById("promoterPledgeAlert");
    const pledgeText = document.getElementById("promoterPledgeText");
    if (pledgeAlert && pledgeText) {
        if (f.promoter_pledge && f.promoter_pledge.risk_flag) {
            pledgeAlert.classList.remove("hidden");
            pledgeText.innerText = f.promoter_pledge.warning;
        } else {
            pledgeAlert.classList.add("hidden");
        }
    }

    // Core Ratios
    if (document.getElementById("peRatioVal")) document.getElementById("peRatioVal").innerHTML = `${info.pe_ratio}x ${renderJargonTooltip("P/E Ratio")}`;
    if (document.getElementById("pbRatioVal")) document.getElementById("pbRatioVal").innerHTML = `${info.pb_ratio}x ${renderJargonTooltip("P/B Ratio")}`;
    if (document.getElementById("roeVal")) document.getElementById("roeVal").innerHTML = `${info.roe}% ${renderJargonTooltip("ROE")}`;
    if (document.getElementById("debtVal")) document.getElementById("debtVal").innerHTML = `${info.debt_to_equity} ${renderJargonTooltip("Debt to Equity")}`;
    if (document.getElementById("divYieldVal")) document.getElementById("divYieldVal").innerText = `${info.dividend_yield}%`;
    if (document.getElementById("epsVal")) document.getElementById("epsVal").innerText = `₹${info.eps}`;

    // Piotroski 9-Point F-Score
    if (f.piotroski_f_score) {
        const p = f.piotroski_f_score;
        const pScore = document.getElementById("piotroskiScoreVal");
        const pVerdict = document.getElementById("piotroskiVerdict");
        const pSummary = document.getElementById("piotroskiSummary");
        if (pScore) {
            pScore.innerText = `${p.score} / 9`;
            pScore.style.color = p.color || "#10b981";
        }
        if (pVerdict) {
            pVerdict.innerText = p.grade || p.verdict || "Financial Health";
            pVerdict.style.color = p.color || "#10b981";
        }
        if (pSummary) pSummary.innerText = p.verdict || p.summary || "";
    }

    // Altman Z-Score
    if (f.altman_z_score) {
        const a = f.altman_z_score;
        const aScore = document.getElementById("altmanScoreVal");
        const aVerdict = document.getElementById("altmanVerdict");
        const aSummary = document.getElementById("altmanSummary");
        if (aScore) {
            aScore.innerText = a.z_score !== undefined ? a.z_score : (a.score || "--");
            aScore.style.color = a.color || "#007aff";
        }
        if (aVerdict) {
            aVerdict.innerText = a.zone || "Safe Zone";
            aVerdict.style.color = a.color || "#10b981";
        }
        if (aSummary) aSummary.innerText = a.summary || (a.z_score > 2.9 ? "Negligible insolvency probability." : "Keep watch on financial leverage.");
    }

    // Extended Aligned Metrics
    if (document.getElementById("netMarginVal")) document.getElementById("netMarginVal").innerText = `${info.profit_margins || 0}%`;
    if (document.getElementById("opMarginVal")) document.getElementById("opMarginVal").innerText = `${info.operating_margins || 0}%`;
    if (document.getElementById("bookVal")) document.getElementById("bookVal").innerText = `₹${info.book_value || 0}`;
    if (document.getElementById("fcfVal")) document.getElementById("fcfVal").innerText = formatCrores(info.free_cashflow);
    if (document.getElementById("pegVal")) document.getElementById("pegVal").innerText = info.peg_ratio ? `${info.peg_ratio}x` : 'N/A';
    if (document.getElementById("roaVal")) document.getElementById("roaVal").innerText = `${info.roa || 0}%`;

    // FinceptTerminal DCF & Graham Intrinsic Valuation Model
    if (valuation && valuation.status === "success") {
        const vBadge = document.getElementById("valuationVerdictBadge");
        if (vBadge) {
            vBadge.className = `text-[10.5px] font-bold px-2 py-0.5 rounded-md border ${valuation.verdict_badge}`;
            vBadge.innerText = `${valuation.icon} ${valuation.verdict}`;
        }
        if (document.getElementById("dcfFairValueVal")) {
            document.getElementById("dcfFairValueVal").innerText = formatINR(valuation.dcf_fair_value);
        }
        if (document.getElementById("grahamNumberVal")) {
            document.getElementById("grahamNumberVal").innerText = valuation.graham_number !== "N/A" ? formatINR(valuation.graham_number) : "N/A";
        }
        const mosEl = document.getElementById("marginOfSafetyVal");
        if (mosEl) {
            const mos = valuation.margin_of_safety_pct;
            const isDiscount = mos >= 0;
            mosEl.innerText = `${isDiscount ? '+' : ''}${mos}%`;
            mosEl.className = `font-bold mono mt-0.5 block ${isDiscount ? 'text-[#1e7e34]' : 'text-[#b32020]'}`;
            mosEl.title = isDiscount ? "Discount to Fair Value (Margin of Safety)" : "Trading at premium above intrinsic DCF estimate";
        }
        if (document.getElementById("valuationSummaryText")) {
            document.getElementById("valuationSummaryText").innerText = valuation.summary;
        }
    }
}


function renderShareholding(sh) {
    if (!sh) return;
    document.getElementById("promoterVal").innerText = `${sh.promoter}%`;
    document.getElementById("fiiVal").innerText = `${sh.fii}%`;
    document.getElementById("diiVal").innerText = `${sh.dii}%`;
    document.getElementById("publicVal").innerText = `${sh.public}%`;
    renderShareholdingChart("shareholdingChartCanvas", sh);
}

function renderExpertStrategies(strat) {
    if (!strat) return;

    // Best Match Highlight
    const bm = strat.best_match;
    document.getElementById("bestStrategyName").innerText = bm.name;
    document.getElementById("bestStrategyScore").innerText = `${bm.score} / 100`;
    document.getElementById("bestStrategyGuru").innerText = `By ${bm.guru}`;
    document.getElementById("bestStrategyDesc").innerText = bm.philosophy;

    // Radar Chart
    renderExpertRadarChart("expertRadarCanvas", strat.radar);

    // Strategy Cards Grid
    const cardsContainer = document.getElementById("expertStrategiesCards");
    if (cardsContainer) {
        cardsContainer.innerHTML = Object.values(strat.strategies).map(s => `
            <div class="macos-box p-3 space-y-2">
                <div class="flex justify-between items-start">
                    <div>
                        <h4 class="text-xs font-semibold text-[#1c1c1e]">${s.name}</h4>
                        <span class="text-[10px] text-[#6e6e73] block">${s.guru}</span>
                    </div>
                    <span class="text-[11px] font-bold px-1.5 py-0.5 rounded ${s.score >= 70 ? 'bg-[#edf7ee] text-[#1e7e34]' : (s.score >= 50 ? 'bg-[#fef6ed] text-[#8a4500]' : 'bg-[#e5e5ea] text-[#6e6e73]')}">
                        ${s.score}%
                    </span>
                </div>
                <div class="space-y-1 pt-1 border-t border-[rgba(0,0,0,0.05)]">
                    ${s.checks.map(c => `
                        <div class="text-[10px] flex items-center space-x-1.5 ${c.pass ? 'text-[#1e7e34]' : 'text-[#8e8e93]'}">
                            <span>${c.pass ? '✓' : '✗'}</span>
                            <span class="truncate">${c.name}</span>
                        </div>
                    `).join("")}
                </div>
            </div>
        `).join("");
    }
}

function renderStockNews(articles) {
    const container = document.getElementById("stockNewsContainer");
    if (!container) return;
    renderNewsArticles(articles, container);
}


// -------------------------------------------------------------------
// Commodities Dashboard
// -------------------------------------------------------------------
async function loadCommoditiesDashboard() {
    try {
        const res = await fetch("/api/commodities/overview");
        const data = await res.json();
        if (data.status === "success") {
            renderCommoditiesCards(data.commodities);
            selectCommodity(appState.currentCommodity);
        }
    } catch (e) {
        console.error("Error loading commodities:", e);
    }
}

function renderCommoditiesCards(commodities) {
    const container = document.getElementById("commoditiesGrid");
    if (!container) return;

    container.innerHTML = commodities.map(c => {
        const isUp = c.change_pct >= 0;
        return `
            <div class="macos-card p-4 hover:border-[#007aff] cursor-pointer transition-all commodity-card ${c.symbol === appState.currentCommodity ? 'ring-2 ring-[#007aff]' : ''}" data-symbol="${c.symbol}">
                <div class="flex justify-between items-start">
                    <div>
                        <span class="text-2xl block mb-1">${c.icon}</span>
                        <h4 class="text-xs font-semibold text-[#1c1c1e]">${c.name}</h4>
                        <span class="text-[10px] text-[#8e8e93] uppercase tracking-wider">${c.category}</span>
                    </div>
                    <span class="text-[11px] font-semibold px-2 py-0.5 rounded-full mono ${isUp ? 'bg-[#edf7ee] text-[#1e7e34]' : 'bg-[#fdf0f0] text-[#b32020]'}">
                        ${isUp ? '▲ +' : '▼ '}${c.change_pct}%
                    </span>
                </div>
                <div class="mt-3.5 pt-2 border-t border-[rgba(0,0,0,0.05)]">
                    <div class="text-lg font-bold text-[#1c1c1e] mono">₹${formatNumber(c.price_inr, 0)}</div>
                    <div class="text-[10.5px] text-[#8e8e93] mt-0.5">$${c.price_usd} USD (${c.unit_display})</div>
                </div>
            </div>
        `;
    }).join("");


    document.querySelectorAll(".commodity-card").forEach(card => {
        card.addEventListener("click", () => {
            selectCommodity(card.dataset.symbol);
        });
    });
}

async function selectCommodity(symbol) {
    appState.currentCommodity = symbol;
    document.querySelectorAll(".commodity-card").forEach(c => {
        if (c.dataset.symbol === symbol) c.classList.add("ring-2", "ring-blue-500");
        else c.classList.remove("ring-2", "ring-blue-500");
    });

    try {
        const [detailRes, chartRes] = await Promise.all([
            fetch(`/api/commodity/${symbol}`),
            fetch(`/api/commodity/${symbol}/chart?period=1y`)
        ]);

        const detail = await detailRes.json();
        const chart = await chartRes.json();

        if (detail.status === "success") {
            const info = detail.info;
            const sig = detail.signal;
            document.getElementById("selectedCommTitle").innerHTML = `${info.icon} ${info.name} — <span class="mono">₹${formatNumber(info.price_inr, 0)}</span> <span class="text-xs text-[#86868b] font-normal">($${info.price_usd} USD)</span>`;
            document.getElementById("commSignalVerdict").innerText = sig.verdict;
            document.getElementById("commSignalVerdict").style.color = sig.color;
            document.getElementById("commSignalSummary").innerText = sig.summary;

            // Reasons
            document.getElementById("commSignalReasons").innerHTML = sig.reasons.map(r => `<li class="text-xs text-[#48484a]">• ${r}</li>`).join("");

            // Gold/Silver Ratio Card
            const ratioCard = document.getElementById("commRatioCard");
            if (detail.gold_silver_ratio) {
                ratioCard.classList.remove("hidden");
                document.getElementById("gsRatioVal").innerText = detail.gold_silver_ratio.ratio;
                document.getElementById("gsRatioDesc").innerText = detail.gold_silver_ratio.verdict;
            } else {
                ratioCard.classList.add("hidden");
            }

            if (chart.candles && chart.candles.length > 0) {
                initLightweightChart("commodityChartContainer", chart.candles);
            }
        }
    } catch (e) {
        console.error("Error loading commodity detail:", e);
    }
}

// -------------------------------------------------------------------
// Bees Strategy: NIFTYBEES vs GOLDBEES Momentum Switcher
// -------------------------------------------------------------------
async function loadBeesStrategy() {
    const container = document.getElementById("beesResultsContainer");
    if (!container) return;

    container.innerHTML = `
        <div class="flex flex-col items-center justify-center p-12 text-[#8e8e93]">
            <div class="w-8 h-8 border-2 border-[#007aff] border-t-transparent rounded-full animate-spin mb-3"></div>
            <span class="text-xs font-semibold text-[#1c1c1e]">Evaluating 2-Year Trend, Momentum & 200 DMA Regime...</span>
        </div>
    `;

    try {
        const holding = document.getElementById("beesCurrentHolding") ? document.getElementById("beesCurrentHolding").value : "NONE";
        const amount = document.getElementById("beesInvestmentInput") ? document.getElementById("beesInvestmentInput").value : "100000";

        const res = await fetch(`/api/bees?amount=${amount}&holding=${holding}`);
        const data = await res.json();

        if (data.status !== "success") {
            container.innerHTML = `<div class="p-6 text-center text-rose-600 bg-rose-50 rounded-2xl">Unable to evaluate Bees Strategy: ${data.message || 'Unknown error'}</div>`;
            return;
        }

        const nb = data.niftybees;
        const gb = data.goldbees;
        const dep = data.deployment;
        const rules = data.shift_rules;

        container.innerHTML = `
            <!-- 1. Executive Recommendation Hero -->
            <div class="macos-card p-6 border-l-4" style="border-left-color: ${data.action_color || '#10b981'};">
                <div class="flex flex-wrap items-center justify-between gap-4">
                    <div class="flex items-center space-x-3.5">
                        <span class="text-3xl">${data.action_icon || '⚖️'}</span>
                        <div>
                            <div class="flex items-center space-x-2">
                                <h3 class="text-xl font-bold text-[#1c1c1e]">${data.action}</h3>
                                <span class="px-2.5 py-0.5 rounded-full text-xs font-bold" style="background-color: ${data.action_color}18; color: ${data.action_color};">
                                    ${data.recommended_etf}
                                </span>
                            </div>
                            <p class="text-xs text-[#6e6e73] mt-1 max-w-xl">${data.summary}</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <span class="text-[10px] text-[#8e8e93] uppercase font-bold tracking-wider block">Decision Score</span>
                        <span class="text-2xl font-bold mono" style="color: ${data.action_color || '#10b981'};">${data.score > 0 ? '+' : ''}${data.score} / ${data.max_score}</span>
                        <span class="text-[11px] text-[#6e6e73] block mt-0.5">${data.score_label}</span>
                    </div>
                </div>
            </div>

            <!-- 2. Head-to-Head Comparison: NIFTYBEES vs GOLDBEES -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <!-- NIFTYBEES Card -->
                <div class="macos-card p-5 space-y-3 ${data.recommended_etf === 'NIFTYBEES' ? 'ring-2 ring-emerald-500 bg-emerald-50/20' : ''}">
                    <div class="flex justify-between items-center border-b border-[rgba(0,0,0,0.06)] pb-2.5">
                        <div class="flex items-center space-x-2">
                            <span class="text-lg">📈</span>
                            <div>
                                <h4 class="font-bold text-[#1c1c1e] text-sm">${nb.name}</h4>
                                <span class="text-[10.5px] text-[#8e8e93] font-mono">NSE: ${nb.code}</span>
                            </div>
                        </div>
                        <span class="text-base font-bold mono text-[#1c1c1e]">₹${nb.price}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div class="p-2 rounded-lg bg-white border border-[rgba(0,0,0,0.06)]">
                            <span class="text-[10px] text-[#8e8e93] block">200 DMA</span>
                            <span class="font-semibold mono ${nb.is_above_200 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                                ${nb.is_above_200 ? '✅ Above' : '❌ Below'} (₹${nb.sma200})
                            </span>
                        </div>
                        <div class="p-2 rounded-lg bg-white border border-[rgba(0,0,0,0.06)]">
                            <span class="text-[10px] text-[#8e8e93] block">RSI (14)</span>
                            <span class="font-semibold mono text-[#1c1c1e]">${nb.rsi}</span>
                        </div>
                        <div class="p-2 rounded-lg bg-white border border-[rgba(0,0,0,0.06)]">
                            <span class="text-[10px] text-[#8e8e93] block">6M Return</span>
                            <span class="font-semibold mono ${nb.ret_6m >= 0 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">${nb.ret_6m > 0 ? '+' : ''}${nb.ret_6m}%</span>
                        </div>
                        <div class="p-2 rounded-lg bg-white border border-[rgba(0,0,0,0.06)]">
                            <span class="text-[10px] text-[#8e8e93] block">1Y Return</span>
                            <span class="font-semibold mono ${nb.ret_1y >= 0 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">${nb.ret_1y > 0 ? '+' : ''}${nb.ret_1y}%</span>
                        </div>
                    </div>
                </div>

                <!-- GOLDBEES Card -->
                <div class="macos-card p-5 space-y-3 ${data.recommended_etf === 'GOLDBEES' ? 'ring-2 ring-amber-500 bg-amber-50/20' : ''}">
                    <div class="flex justify-between items-center border-b border-[rgba(0,0,0,0.06)] pb-2.5">
                        <div class="flex items-center space-x-2">
                            <span class="text-lg">🥇</span>
                            <div>
                                <h4 class="font-bold text-[#1c1c1e] text-sm">${gb.name}</h4>
                                <span class="text-[10.5px] text-[#8e8e93] font-mono">NSE: ${gb.code}</span>
                            </div>
                        </div>
                        <span class="text-base font-bold mono text-[#1c1c1e]">₹${gb.price}</span>
                    </div>
                    <div class="grid grid-cols-2 gap-2 text-xs">
                        <div class="p-2 rounded-lg bg-white border border-[rgba(0,0,0,0.06)]">
                            <span class="text-[10px] text-[#8e8e93] block">200 DMA</span>
                            <span class="font-semibold mono ${gb.is_above_200 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">
                                ${gb.is_above_200 ? '✅ Above' : '❌ Below'} (₹${gb.sma200})
                            </span>
                        </div>
                        <div class="p-2 rounded-lg bg-white border border-[rgba(0,0,0,0.06)]">
                            <span class="text-[10px] text-[#8e8e93] block">RSI (14)</span>
                            <span class="font-semibold mono text-[#1c1c1e]">${gb.rsi}</span>
                        </div>
                        <div class="p-2 rounded-lg bg-white border border-[rgba(0,0,0,0.06)]">
                            <span class="text-[10px] text-[#8e8e93] block">6M Return</span>
                            <span class="font-semibold mono ${gb.ret_6m >= 0 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">${gb.ret_6m > 0 ? '+' : ''}${gb.ret_6m}%</span>
                        </div>
                        <div class="p-2 rounded-lg bg-white border border-[rgba(0,0,0,0.06)]">
                            <span class="text-[10px] text-[#8e8e93] block">1Y Return</span>
                            <span class="font-semibold mono ${gb.ret_1y >= 0 ? 'text-[#1e7e34]' : 'text-[#b32020]'}">${gb.ret_1y > 0 ? '+' : ''}${gb.ret_1y}%</span>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 3. 20-Bullet Deployment Plan & Triggers -->
            <div class="macos-card p-5 space-y-3">
                <div class="flex justify-between items-center border-b border-[rgba(0,0,0,0.06)] pb-2.5">
                    <h4 class="font-bold text-[#1c1c1e] text-sm flex items-center gap-2">
                        <span>🎯</span> <span>20-Bullet Disciplined Capital Deployment Plan</span>
                    </h4>
                    <span class="text-xs text-[#6e6e73]">Total Capital: <strong class="text-[#1c1c1e] mono">${formatINR(dep.total_capital)}</strong> • Bullet: <strong class="text-[#1c1c1e] mono">${formatINR(dep.bullet_size)}</strong> (5%)</span>
                </div>
                <div class="overflow-x-auto">
                    <table class="w-full text-xs text-left">
                        <thead>
                            <tr class="text-[#8e8e93] border-b border-[rgba(0,0,0,0.06)]">
                                <th class="py-2">Bullet #</th>
                                <th class="py-2">Trigger Condition</th>
                                <th class="py-2">Target Price</th>
                                <th class="py-2">Allocation</th>
                                <th class="py-2">Units</th>
                            </tr>
                        </thead>
                        <tbody class="divide-y divide-[rgba(0,0,0,0.04)] font-mono">
                            ${(dep.bullets || []).map(b => `
                                <tr>
                                    <td class="py-2 font-bold text-[#1c1c1e]">Bullet ${b.bullet} ${b.bullet === 1 ? '⚡ (CMP)' : ''}</td>
                                    <td class="py-2 text-[#6e6e73]">${b.trigger}</td>
                                    <td class="py-2 font-bold text-[#007aff]">₹${b.deploy_price}</td>
                                    <td class="py-2 font-semibold text-[#1c1c1e]">${formatINR(b.amount)}</td>
                                    <td class="py-2 text-[#6e6e73]">${b.units} units</td>
                                </tr>
                            `).join("")}
                        </tbody>
                    </table>
                </div>
                <p class="text-[11px] text-[#6e6e73] bg-[#f2f2f7] p-2.5 rounded-lg leading-relaxed mt-2">
                    💡 <strong>Discipline Protocol:</strong> ${dep.rule}
                </p>
            </div>

            <!-- 4. Regime Shift Rules -->
            <div class="macos-card p-5 space-y-2.5">
                <h4 class="font-bold text-[#1c1c1e] text-sm flex items-center gap-2 border-b border-[rgba(0,0,0,0.06)] pb-2">
                    <span>🔄</span> <span>Regime Shift & Rebalancing Protocol</span>
                </h4>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div class="p-3 rounded-lg bg-emerald-50/50 border border-emerald-200/60">
                        <span class="font-bold text-emerald-800 block mb-1">When to Shift to NIFTYBEES:</span>
                        <p class="text-[11px] text-emerald-700 leading-relaxed">${rules.switch_to_niftybees}</p>
                    </div>
                    <div class="p-3 rounded-lg bg-amber-50/50 border border-amber-200/60">
                        <span class="font-bold text-amber-800 block mb-1">When to Shift to GOLDBEES:</span>
                        <p class="text-[11px] text-amber-700 leading-relaxed">${rules.switch_to_goldbees}</p>
                    </div>
                </div>
                <div class="flex justify-between items-center text-[10.5px] text-[#8e8e93] pt-1">
                    <span>${rules.review_frequency}</span>
                    <span>${rules.cost_of_switching}</span>
                </div>
            </div>
        `;
    } catch (err) {
        console.error("Error loading Bees Strategy:", err);
        container.innerHTML = `<div class="p-6 text-center text-rose-600 bg-rose-50 rounded-2xl">Error executing Bees Strategy: ${err.message}</div>`;
    }
}

// -------------------------------------------------------------------
// F&O Options Dashboard
function selectOptionsUnderlying(btn, symbol) {
    if (btn && btn.parentElement) {
        btn.parentElement.querySelectorAll(".macos-segmented-item").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
    }
    loadOptionsDashboard(symbol);
}
window.selectOptionsUnderlying = selectOptionsUnderlying;

async function loadOptionsDashboard(symbol = "NIFTY") {
    try {
        const res = await fetch(`/api/options/${symbol}`);
        const data = await res.json();
        if (data.status === "success") {
            document.getElementById("optionsUnderlyingPrice").innerText = `Spot: ₹${data.underlying_price}`;
            document.getElementById("pcrValue").innerText = data.pcr.pcr_oi;
            document.getElementById("pcrSentiment").innerText = data.pcr.sentiment;
            document.getElementById("pcrSentiment").style.color = data.pcr.color;
            document.getElementById("maxPainStrike").innerText = `₹${data.max_pain.strike}`;
            document.getElementById("maxPainDistance").innerText = `${data.max_pain.distance_pts > 0 ? '+' : ''}${data.max_pain.distance_pts} pts (${data.max_pain.distance_pct}%)`;

            // Strategy suggestion
            const strat = data.suggested_strategy;
            document.getElementById("optionsStrategyName").innerHTML = `${strat.icon} ${strat.name}`;
            document.getElementById("optionsStrategySetup").innerText = strat.setup;
            document.getElementById("optionsStrategyRationale").innerText = strat.rationale;

            // F&O Prominent Callout Banner
            const banner = document.getElementById("fnoCalloutBanner");
            if (banner) {
                const isBull = data.pcr.pcr_oi >= 1.0;
                banner.innerHTML = `
                    <div class="p-3.5 rounded-xl bg-[#eff6ff] border border-[#bfdbfe] text-xs font-semibold flex flex-wrap items-center justify-between gap-3 text-[#0062cc] shadow-xs">
                        <div class="flex items-center space-x-2.5">
                            <span class="text-base">📍</span>
                            <span><strong>${symbol} Derivatives Radar:</strong> Max Pain pinned at <strong>₹${data.max_pain.strike}</strong> (${data.max_pain.distance_pts > 0 ? '+' : ''}${data.max_pain.distance_pts} pts) • PCR is <strong>${data.pcr.pcr_oi}</strong> (<span class="${isBull ? 'text-[#1e7e34]' : 'text-[#b32020]'}">${data.pcr.sentiment}</span>)</span>
                        </div>
                        <span class="text-[10.5px] px-2.5 py-0.5 rounded-full bg-white text-[#007aff] font-bold border border-[#bfdbfe]">Live Open Interest</span>
                    </div>
                `;
            }

            // Render chain table
            renderOptionsChainTable("optionsChainTableContainer", data);

            // Sync Options Payoff Studio
            if (typeof setOptionsPayoffSymbol === "function" && typeof loadOptionsPayoff === "function") {
                setOptionsPayoffSymbol(symbol);
                const defaultLot = symbol === "NIFTY" ? 25 : (symbol === "BANKNIFTY" ? 15 : 250);
                const lotInput = document.getElementById("payoffLotSizeInput");
                if (lotInput) lotInput.value = defaultLot;
                loadOptionsPayoff(null, defaultLot);
            }
        }
    } catch (e) {
        console.error("Error loading options:", e);
    }
}

// -------------------------------------------------------------------
// General Market News
// -------------------------------------------------------------------
async function loadMarketNews() {
    try {
        const res = await fetch("/api/market/news");
        const data = await res.json();
        const container = document.getElementById("generalNewsContainer");
        if (container && data.articles) {
            container.innerHTML = data.articles.map(a => `
                <div class="macos-card p-4 hover:shadow-md transition-all flex flex-col justify-between">
                    <div>
                        <div class="flex justify-between items-center text-xs text-[#86868b] mb-1.5">
                            <span class="font-semibold text-[#007aff] uppercase tracking-wider text-[10px]">${a.source}</span>
                            <span>${a.published}</span>
                        </div>
                        <a href="${a.link}" target="_blank" class="text-sm font-semibold text-[#1c1c1e] hover:text-[#007aff] transition-colors block mb-1.5">
                            ${a.title}
                        </a>
                        <p class="text-xs text-[#48484a] leading-relaxed">${a.summary}</p>
                    </div>
                </div>
            `).join("");
        }
    } catch (e) {
        console.error("Error loading general news:", e);
    }
}

function showLoading(isLoading) {
    const loader = document.getElementById("globalLoader");
    if (loader) {
        if (isLoading) loader.classList.remove("hidden");
        else loader.classList.add("hidden");
    }
}

// =====================================================================
// COLLAPSIBLE ACCORDION SECTION TOGGLE
// =====================================================================
function toggleSection(sectionId) {
    const body = document.getElementById(sectionId);
    const btn = document.querySelector(`[data-toggle="${sectionId}"]`);
    if (!body) return;
    const isHidden = body.classList.contains("hidden");
    body.classList.toggle("hidden", !isHidden);
    if (btn) btn.textContent = isHidden ? "▲" : "▼";
}

// =====================================================================
// NEWS TAB — Dedicated Market-Wide News with Sentiment Tags
// =====================================================================
async function loadMarketNewsFixed() {
    const container = document.getElementById("generalNewsContainer");
    if (!container) return;
    container.innerHTML = `<div class="col-span-3 p-8 text-center text-[#86868b] text-xs"><svg class="animate-spin h-5 w-5 mx-auto mb-2 text-[#007aff]" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" fill="none"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>Loading live Indian stock market headlines...</div>`;

    try {
        const res = await fetch("/api/market/news?limit=9");
        const data = await res.json();
        const articles = data.articles || [];

        if (articles.length > 0) {
            renderNewsArticles(articles, container);
        } else {
            const res2 = await fetch("/api/stock/NIFTYBEES.NS/news");
            const data2 = await res2.json();
            renderNewsArticles(data2.articles || [], container);
        }
    } catch (e) {
        console.error("News load error:", e);
        container.innerHTML = `
            <div class="col-span-3 p-6 rounded-2xl macos-card text-xs text-[#6e6e73] text-center">
                <p class="text-2xl mb-2">📰</p>
                <p class="font-medium text-[#1c1c1e]">Could not load live news. Visit these financial media sources directly:</p>
                <div class="flex flex-wrap gap-2 justify-center mt-3">
                    <a href="https://www.moneycontrol.com/news/business/markets/" target="_blank" class="px-3 py-1.5 rounded-lg bg-[#007aff] text-white hover:bg-[#0062cc] font-medium transition-all">MoneyControl</a>
                    <a href="https://economictimes.indiatimes.com/markets" target="_blank" class="px-3 py-1.5 rounded-lg bg-[#007aff] text-white hover:bg-[#0062cc] font-medium transition-all">Economic Times</a>
                    <a href="https://www.livemint.com/market" target="_blank" class="px-3 py-1.5 rounded-lg bg-[#007aff] text-white hover:bg-[#0062cc] font-medium transition-all">LiveMint</a>
                    <a href="https://www.nseindia.com" target="_blank" class="px-3 py-1.5 rounded-lg bg-[#e3e3e8] text-[#1c1c1e] hover:bg-[#d1d1d6] font-medium transition-all">NSE India</a>
                </div>
            </div>`;
    }
}

function renderNewsArticles(articles, container) {
    if (!articles || articles.length === 0) {
        container.innerHTML = `<div class="col-span-3 p-4 text-center text-[#86868b] text-xs">No news found. Markets may be closed.</div>`;
        return;
    }
    container.innerHTML = articles.map(a => `
        <div class="macos-card p-4 hover:shadow-md transition-all flex flex-col justify-between">
            <div>
                <div class="flex justify-between items-center text-[10px] text-[#86868b] mb-1.5">
                    <span class="font-bold text-[#007aff] uppercase tracking-wide">${a.source}</span>
                    <div class="flex items-center space-x-1.5">
                        ${a.sentiment ? `<span class="px-2 py-0.5 rounded-full text-[9.5px] font-semibold border ${a.badge || ''}">${a.sentiment}</span>` : ''}
                        <span>${a.published}</span>
                    </div>
                </div>
                <a href="${a.link}" target="_blank" rel="noopener noreferrer"
                   class="text-sm font-semibold text-[#1c1c1e] hover:text-[#007aff] transition-colors block mb-2 leading-snug">
                    ${a.title}
                </a>
                <p class="text-[11px] text-[#48484a] leading-relaxed">${a.summary}</p>
            </div>
        </div>
    `).join("");
}

// =====================================================================
// POSITION SIZING CALCULATOR MODAL
// =====================================================================
function openPositionCalcModal() {
    const modal = document.getElementById("positionCalcModal");
    if (!modal) return;
    modal.classList.remove("hidden");

    const entryInput = document.getElementById("calcEntryPrice");
    const slInput = document.getElementById("calcStopLoss");
    if (appState.currentStock && appState.currentStock.info) {
        const curPrice = appState.currentStock.info.current_price || 2500;
        if (entryInput) entryInput.value = curPrice;
        if (slInput) slInput.value = Math.round(curPrice * 0.96 * 10) / 10;
    }
    calculatePositionModal();
}

function closePositionCalcModal() {
    const modal = document.getElementById("positionCalcModal");
    if (modal) modal.classList.add("hidden");
}

async function calculatePositionModal() {
    const cap = parseFloat(document.getElementById("calcCapital")?.value || 500000);
    const riskPct = parseFloat(document.getElementById("calcRiskPct")?.value || 1.5);
    const entry = parseFloat(document.getElementById("calcEntryPrice")?.value || 2500);
    const sl = parseFloat(document.getElementById("calcStopLoss")?.value || 2400);

    if (entry <= sl) {
        alert("Entry price must be strictly greater than Stop-loss price.");
        return;
    }

    try {
        const res = await fetch(`/api/calculator/position-size?capital=${cap}&risk_pct=${riskPct}&entry_price=${entry}&stop_loss=${sl}`);
        const data = await res.json();
        if (data.status === "success") {
            const box = document.getElementById("calcResultBox");
            if (box) box.classList.remove("hidden");
            document.getElementById("calcQty").innerText = `${data.suggested_quantity} Shares`;
            document.getElementById("calcTotalInv").innerText = `₹${data.total_investment.toLocaleString('en-IN')}`;
            document.getElementById("calcRiskAmt").innerText = `₹${data.risk_amount.toLocaleString('en-IN')}`;
            document.getElementById("calcAllocPct").innerText = `${data.capital_allocation_pct}%`;
            document.getElementById("calcNote").innerText = data.rule_note;

            _lastCalculatedPosition = {
                qty: data.suggested_quantity,
                price: entry,
                sl: sl,
                target: Math.round((entry + (entry - sl) * 2) * 100) / 100
            };
        }
    } catch(e) {
        console.error("Calc error:", e);
    }
}

let _lastCalculatedPosition = null;

function executeCalculatedPositionOnBroker() {
    if (!_lastCalculatedPosition) return;
    const sym = appState.currentSymbol || "RELIANCE.NS";
    openBrokerOrderModal(sym, _lastCalculatedPosition.qty, _lastCalculatedPosition.price, _lastCalculatedPosition.sl, _lastCalculatedPosition.target);
}
window.executeCalculatedPositionOnBroker = executeCalculatedPositionOnBroker;

// Global click handler to select stock from screener / picks
function selectSearchedStock(symbol) {
    if (!symbol) return;
    const sym = symbol.trim();
    if (sym.includes("=F")) {
        switchTab("commodities");
        if (typeof selectCommodity === "function") {
            selectCommodity(sym);
        }
    } else {
        switchTab("stocks");
        if (typeof _currentChartEngine !== "undefined" && _currentChartEngine === "tv_pro" && typeof updateTradingViewProSymbol === "function") {
            updateTradingViewProSymbol(sym);
        }
        loadStock(sym);
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
}
window.selectSearchedStock = selectSearchedStock;

// Global Keyboard Shortcuts (macOS Native Experience)
document.addEventListener("keydown", (e) => {
    const activeEl = document.activeElement;
    const isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT");

    if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        openCommandPalette();
        return;
    }

    if (e.key === "Escape") {
        closeCommandPalette();
        const dropdown = document.getElementById("searchDropdown");
        if (dropdown) dropdown.classList.add("hidden");
        closePositionCalcModal();
        closeShortcutsModal();
        const drawer = document.getElementById("watchlistDrawer");
        if (drawer && drawer.classList.contains("open")) {
            toggleWatchlistDrawer();
        }
        if (activeEl) activeEl.blur();
        return;
    }

    if (isTyping) return;

    if (e.key === "/") {
        const searchInput = document.getElementById("stockSearchInput");
        if (searchInput) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    } else if (e.key === "?" || (e.shiftKey && e.key === "/")) {
        e.preventDefault();
        openShortcutsModal();
    } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        toggleWatchlistDrawer();
    } else if (e.key === "c" || e.key === "C") {
        e.preventDefault();
        openPositionCalcModal();
    } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        toggleDisplayDensity();
    } else if (e.key >= "1" && e.key <= "9") {
        const tabList = ["stocks", "institutional", "best-picks", "screener", "scanner", "bees", "sectors", "etf", "commodities"];
        const targetTab = tabList[parseInt(e.key, 10) - 1];
        if (targetTab) {
            e.preventDefault();
            switchTab(targetTab);
        }
    }
});

/* =========================================================================
   DISPLAY DENSITY SWITCHER (Standard vs Compact)
   ========================================================================= */
function initDisplayDensity() {
    const saved = localStorage.getItem("market_density") || "standard";
    setDisplayDensity(saved);
}

function setDisplayDensity(mode) {
    if (mode === "compact") {
        document.body.classList.add("density-compact");
        const cBtn = document.getElementById("densityCompactBtn");
        const sBtn = document.getElementById("densityStandardBtn");
        if (cBtn) {
            cBtn.classList.add("bg-white", "text-[#1c1c1e]", "shadow-xs");
            cBtn.classList.remove("text-[#6e6e73]");
        }
        if (sBtn) {
            sBtn.classList.remove("bg-white", "text-[#1c1c1e]", "shadow-xs");
            sBtn.classList.add("text-[#6e6e73]");
        }
    } else {
        document.body.classList.remove("density-compact");
        const cBtn = document.getElementById("densityCompactBtn");
        const sBtn = document.getElementById("densityStandardBtn");
        if (sBtn) {
            sBtn.classList.add("bg-white", "text-[#1c1c1e]", "shadow-xs");
            sBtn.classList.remove("text-[#6e6e73]");
        }
        if (cBtn) {
            cBtn.classList.remove("bg-white", "text-[#1c1c1e]", "shadow-xs");
            cBtn.classList.add("text-[#6e6e73]");
        }
    }
    localStorage.setItem("market_density", mode);
}

function toggleDisplayDensity() {
    const isCompact = document.body.classList.contains("density-compact");
    setDisplayDensity(isCompact ? "standard" : "compact");
}

/* =========================================================================
   KEYBOARD SHORTCUTS MODAL
   ========================================================================= */
function openShortcutsModal() {
    const m = document.getElementById("shortcutsModal");
    if (m) m.classList.remove("hidden");
}

function closeShortcutsModal() {
    const m = document.getElementById("shortcutsModal");
    if (m) m.classList.add("hidden");
}

/* =========================================================================
   macOS SLIDE-OVER WATCHLIST DRAWER
   ========================================================================= */
let _userWatchlist = [
    { symbol: "^NSEI", name: "NIFTY 50", price: 24852.15, change: "+0.45%" },
    { symbol: "^NSEBANK", name: "BANK NIFTY", price: 51240.60, change: "+0.32%" },
    { symbol: "GOLDBEES.NS", name: "Nippon Gold ETF", price: 127.17, change: "+0.65%" },
    { symbol: "NIFTYBEES.NS", name: "Nippon Nifty 50 ETF", price: 268.45, change: "+0.40%" },
    { symbol: "RELIANCE.NS", name: "Reliance Industries", price: 1395.40, change: "+0.80%" },
    { symbol: "HDFCBANK.NS", name: "HDFC Bank", price: 1720.50, change: "-0.15%" }
];

function initWatchlist() {
    try {
        const saved = localStorage.getItem("market_watchlist");
        if (saved) {
            _userWatchlist = JSON.parse(saved);
        }
    } catch (e) {}
    renderWatchlistUI();
}

function saveWatchlist() {
    try {
        localStorage.setItem("market_watchlist", JSON.stringify(_userWatchlist));
    } catch (e) {}
    renderWatchlistUI();
}

function toggleWatchlistDrawer() {
    const drawer = document.getElementById("watchlistDrawer");
    const backdrop = document.getElementById("watchlistBackdrop");
    if (!drawer || !backdrop) return;
    const isOpen = drawer.classList.contains("open");
    if (isOpen) {
        drawer.classList.remove("open");
        backdrop.classList.remove("open");
    } else {
        drawer.classList.add("open");
        backdrop.classList.add("open");
        updateDrawerCurrentStockLabel();
    }
}

function updateDrawerCurrentStockLabel() {
    const label = document.getElementById("drawerCurrentStockLabel");
    if (label && appState.currentSymbol) {
        label.innerText = `Currently: ${appState.currentSymbol}`;
    }
}

function renderWatchlistUI() {
    const list = document.getElementById("watchlistItemsList");
    const countBadge = document.getElementById("watchlistCountBadge");
    if (countBadge) countBadge.innerText = _userWatchlist.length;
    if (!list) return;

    if (_userWatchlist.length === 0) {
        list.innerHTML = `
            <div class="p-8 text-center text-xs text-[#8e8e93]">
                Your watchlist is empty.<br>Click <strong class="text-[#007aff]">+ Pin to List</strong> above to track stocks here!
            </div>
        `;
        return;
    }

    list.innerHTML = _userWatchlist.map((item, idx) => {
        const isGreen = !String(item.change).startsWith("-");
        return `
            <div class="p-3 rounded-xl bg-white hover:bg-[#f2f2f7] border border-[rgba(0,0,0,0.06)] shadow-xs transition-all flex items-center justify-between group cursor-pointer" onclick="selectSearchedStock('${item.symbol}')">
                <div class="flex-1 min-w-0 pr-2">
                    <div class="font-semibold text-xs text-[#1c1c1e] truncate">${item.name || item.symbol}</div>
                    <div class="text-[10px] text-[#6e6e73] mono">${item.symbol}</div>
                </div>
                <div class="text-right flex items-center space-x-2">
                    <div>
                        <div class="font-semibold text-xs mono text-[#1c1c1e]">₹${typeof item.price === 'number' ? item.price.toLocaleString('en-IN') : item.price}</div>
                        <div class="text-[10px] font-semibold mono ${isGreen ? 'text-[#1e7e34]' : 'text-[#b32020]'}">${item.change || '0.00%'}</div>
                    </div>
                    <button onclick="event.stopPropagation(); removeStockFromWatchlist(${idx});" title="Remove from Watchlist" class="text-[#8e8e93] hover:text-[#b32020] p-1 rounded hover:bg-[#e8e8ed] text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                        ✕
                    </button>
                </div>
            </div>
        `;
    }).join("");
}

function pinCurrentStockToWatchlist() {
    const sym = appState.currentSymbol;
    if (!sym) return;
    if (_userWatchlist.some(x => x.symbol === sym)) {
        alert(`${sym} is already in your watchlist.`);
        return;
    }
    const currentPrice = appState.currentStockData?.current_price || 0;
    const changePct = appState.currentStockData?.change_pct || 0;
    const name = appState.currentStockData?.name || sym;

    _userWatchlist.unshift({
        symbol: sym,
        name: name,
        price: currentPrice,
        change: `${changePct >= 0 ? '+' : ''}${changePct}%`
    });
    saveWatchlist();
}

function removeStockFromWatchlist(idx) {
    _userWatchlist.splice(idx, 1);
    saveWatchlist();
}

async function refreshWatchlistPrices() {
    const btn = document.querySelector("#watchlistDrawer button[title='Refresh Watchlist Ticks']");
    if (btn) btn.classList.add("animate-spin");
    for (let item of _userWatchlist) {
        try {
            const res = await fetch(`/api/stock/${item.symbol}`);
            const d = await res.json();
            if (d.status === "success" && d.data) {
                item.price = d.data.current_price;
                item.change = `${d.data.change_pct >= 0 ? '+' : ''}${d.data.change_pct}%`;
            }
        } catch (e) {}
    }
    if (btn) btn.classList.remove("animate-spin");
    saveWatchlist();
}


/**
 * 1-Click Indian Broker Order Execution Bridge (Zerodha Kite & Dhan Web)
 */
let currentBrokerOrder = {
    symbol: "RELIANCE.NS",
    clean_symbol: "RELIANCE",
    price: 2980.0,
    sl: 2890.0,
    target: 3120.0,
    qty: 10,
    order_type: "LIMIT",
    product: "CNC"
};

function openBrokerOrderModalFromHero() {
    const data = appState.latestStockData;
    const info = data && data.info ? data.info : {};
    const signals = data && data.signals ? data.signals : {};
    const plan = signals.trade_plan || {};

    const symbol = appState.currentSymbol || "RELIANCE.NS";
    const price = info.current_price || 0.0;
    const sl = plan.stop_loss ? parseFloat(plan.stop_loss) : (price * 0.96);
    const target = plan.target_1 ? parseFloat(plan.target_1) : (price * 1.06);

    openBrokerOrderModal(symbol, 10, price, sl, target);
}

function openBrokerOrderModal(symbol, qty, price, sl, target) {
    currentBrokerOrder.symbol = symbol || appState.currentSymbol || "RELIANCE.NS";
    currentBrokerOrder.clean_symbol = currentBrokerOrder.symbol.replace(".NS", "").replace(".BO", "").toUpperCase();
    currentBrokerOrder.price = Math.round((price || 0) * 100) / 100;
    currentBrokerOrder.sl = Math.round((sl || 0) * 100) / 100;
    currentBrokerOrder.target = Math.round((target || 0) * 100) / 100;
    currentBrokerOrder.qty = qty || 10;
    currentBrokerOrder.product = "CNC";
    currentBrokerOrder.order_type = "LIMIT";

    const modal = document.getElementById("brokerOrderModal");
    if (!modal) return;

    const symEl = document.getElementById("brokerModalSymbol");
    const qtyEl = document.getElementById("brokerModalQty");
    const priceEl = document.getElementById("brokerModalPrice");
    const slEl = document.getElementById("brokerModalStopLoss");
    const tgtEl = document.getElementById("brokerModalTarget");

    if (symEl) symEl.value = `${currentBrokerOrder.clean_symbol} (NSE)`;
    if (qtyEl) qtyEl.value = currentBrokerOrder.qty;
    if (priceEl) priceEl.value = currentBrokerOrder.price;
    if (slEl) slEl.innerText = `₹${currentBrokerOrder.sl.toLocaleString("en-IN")}`;
    if (tgtEl) tgtEl.innerText = `₹${currentBrokerOrder.target.toLocaleString("en-IN")}`;

    updateBrokerLinks();
    modal.classList.remove("hidden");
}

function closeBrokerOrderModal() {
    const modal = document.getElementById("brokerOrderModal");
    if (modal) modal.classList.add("hidden");
}

function updateBrokerLinks() {
    const cleanSym = currentBrokerOrder.clean_symbol;
    const qtyInput = document.getElementById("brokerModalQty");
    const priceInput = document.getElementById("brokerModalPrice");
    const productInput = document.getElementById("brokerModalProduct");
    const orderTypeInput = document.getElementById("brokerModalOrderType");

    const qty = qtyInput ? (parseInt(qtyInput.value) || 1) : 1;
    const price = priceInput ? (parseFloat(priceInput.value) || 0) : 0;
    const product = productInput ? productInput.value : "CNC";
    const orderType = orderTypeInput ? orderTypeInput.value : "LIMIT";

    currentBrokerOrder.qty = qty;
    currentBrokerOrder.price = price;
    currentBrokerOrder.product = product;
    currentBrokerOrder.order_type = orderType;

    const kiteUrl = `https://kite.zerodha.com/market-depth?symbol=NSE:${cleanSym}`;
    const dhanUrl = `https://web.dhan.co/?symbol=${cleanSym}&exchange=NSE&qty=${qty}&price=${price}`;

    const kiteBtn = document.getElementById("brokerKiteBtn");
    const dhanBtn = document.getElementById("brokerDhanBtn");

    if (kiteBtn) kiteBtn.href = kiteUrl;
    if (dhanBtn) dhanBtn.href = dhanUrl;
}

function copyBrokerWebhookPayload() {
    const payload = {
        action: "BUY",
        symbol: currentBrokerOrder.clean_symbol,
        exchange: "NSE",
        quantity: currentBrokerOrder.qty,
        entry_price: currentBrokerOrder.price,
        stop_loss: currentBrokerOrder.sl,
        target: currentBrokerOrder.target,
        product: currentBrokerOrder.product,
        order_type: currentBrokerOrder.order_type,
        tag: "MarketAnalysisTerminal"
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(JSON.stringify(payload, null, 2))
            .then(() => showNotification("Webhook JSON copied to clipboard for OpenAlgo / AlgoTest!", "success"))
            .catch(() => showNotification("Failed to copy webhook payload", "error"));
    } else {
        showNotification("Clipboard not supported in this environment", "warning");
    }
}
window.openBrokerModal = openBrokerOrderModal;
window.openBrokerOrderModal = openBrokerOrderModal;
window.closeBrokerOrderModal = closeBrokerOrderModal;
window.updateBrokerLinks = updateBrokerLinks;
window.copyBrokerWebhookPayload = copyBrokerWebhookPayload;


// Dynamic Auto-refresh: 25s when Live, 60s when Closed
setInterval(() => {
    if (!document.hidden) {
        fetchMarketOverview();

        if (appState.currentTab === "stocks" && appState.currentSymbol) {
            fetch(`/api/stock/${appState.currentSymbol}?style=${appState.currentStyle}&period=${appState.currentPeriod}&interval=${appState.currentInterval}`)
                .then(res => res.json())
                .then(data => {
                    if (data.status === "success" && data.info) {
                        const priceEl = document.getElementById("stockPrice");
                        if (priceEl) priceEl.innerText = formatINR(data.info.current_price);
                        const isUp = data.info.day_change >= 0;
                        const changeBadge = document.getElementById("stockChange");
                        if (changeBadge) {
                            changeBadge.className = `inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold mono ${isUp ? 'bg-[#edf7ee] text-[#1e7e34] border border-[#c6e8cc]' : 'bg-[#fdf0f0] text-[#b32020] border border-[#f7c8c8]'}`;
                            changeBadge.innerHTML = `${isUp ? '▲ +' : '▼ '}${data.info.day_change} (${isUp ? '+' : ''}${data.info.day_change_pct}%)`;
                        }
                        const timeEl = document.getElementById("liveTickTimestamp");
                        if (timeEl) {
                            const ms = data.info.market_status;
                            if (ms && ms.is_live) {
                                timeEl.innerHTML = `<span class="inline-flex items-center text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 text-[10.5px] font-semibold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse"></span>🟢 Live Market Tick • ${ms.current_ist_time}</span>`;
                            } else {
                                const closeDate = (ms && ms.last_trading_date) || data.info.last_trading_date || 'Session Close';
                                timeEl.innerHTML = `<span class="inline-flex items-center text-[#6e6e73] bg-[#f2f2f7] px-2 py-0.5 rounded border border-[rgba(0,0,0,0.08)] text-[10.5px] font-medium"><span class="w-1.5 h-1.5 rounded-full bg-rose-500 mr-1.5"></span>🔴 Market Closed • Official Close (${closeDate}, 15:30 IST)</span>`;
                            }
                        }
                        if (data.info.market_status) {
                            updateNavbarMarketStatus(data.info.market_status);
                        }
                    }
                })
                .catch(() => {});
        }
    }
}, 25000);


/* =========================================================================
   NATIVE OLED DARK / LIGHT MODE CONTROLLER
   ========================================================================= */
function initAppTheme() {
    const saved = localStorage.getItem("market_theme") || "light";
    setAppTheme(saved);
}

function toggleAppTheme() {
    const current = document.documentElement.getAttribute("data-theme") || "light";
    const next = current === "dark" ? "light" : "dark";
    setAppTheme(next);
    playChimeSound("success");
}

function setAppTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("market_theme", theme);

    const icon = document.getElementById("themeToggleIcon");
    if (icon) {
        icon.textContent = theme === "dark" ? "☀️" : "🌙";
    }

    if (typeof applyChartTheme === "function") {
        applyChartTheme(theme);
    }
}
window.toggleAppTheme = toggleAppTheme;

/* =========================================================================
   WEB AUDIO API SYNTHESIZER (Apple-style Chimes)
   ========================================================================= */
function playChimeSound(type = "success") {
    try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        if (type === "success") {
            osc1.frequency.setValueAtTime(587.33, now); // D5
            osc1.frequency.exponentialRampToValueAtTime(880.00, now + 0.12); // A5
            osc2.frequency.setValueAtTime(880.00, now + 0.12);
            osc2.frequency.exponentialRampToValueAtTime(1174.66, now + 0.28); // D6
        } else {
            osc1.frequency.setValueAtTime(440.00, now);
            osc1.frequency.exponentialRampToValueAtTime(330.00, now + 0.2);
        }

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

        osc1.start(now);
        osc2.start(now + 0.1);
        osc1.stop(now + 0.35);
        osc2.stop(now + 0.35);
    } catch (e) {
        // Safe fallback if audio context restricted
    }
}

/* =========================================================================
   STICKY LIVE FINANCIAL TICKER TAPE
   ========================================================================= */
function updateLiveTickerTape(data) {
    if (!data || !data.indices) return;
    const nifty = data.indices.nifty;
    const bank = data.indices.bank_nifty;
    const comms = data.commodities || [];
    const usdinr = data.usd_inr || 94.47;

    if (nifty) {
        const elP = document.getElementById("ttNifty");
        const elC = document.getElementById("ttNiftyChg");
        if (elP) elP.textContent = formatINR(nifty.current_price || 23779.15);
        if (elC) {
            const chg = nifty.day_change_pct || 0;
            elC.textContent = `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`;
            elC.className = `ticker-badge ${chg >= 0 ? "up" : "down"}`;
        }
    }

    if (bank) {
        const elP = document.getElementById("ttBank");
        const elC = document.getElementById("ttBankChg");
        if (elP) elP.textContent = formatINR(bank.current_price || 57088.30);
        if (elC) {
            const chg = bank.day_change_pct || 0;
            elC.textContent = `${chg >= 0 ? "+" : ""}${chg.toFixed(2)}%`;
            elC.className = `ticker-badge ${chg >= 0 ? "up" : "down"}`;
        }
    }

    const elUsd = document.getElementById("ttUsdInr");
    if (elUsd) elUsd.textContent = `₹${usdinr}`;

    const goldComm = comms.find(c => c.code === "GOLD");
    if (goldComm) {
        const elP = document.getElementById("ttGold");
        const elC = document.getElementById("ttGoldChg");
        if (elP) elP.textContent = `₹${formatNumber(goldComm.price_inr, 0)}`;
        if (elC) {
            elC.textContent = `${goldComm.change_pct >= 0 ? "+" : ""}${goldComm.change_pct.toFixed(2)}%`;
            elC.className = `ticker-badge ${goldComm.change_pct >= 0 ? "up" : "down"}`;
        }
    }

    const crudeComm = comms.find(c => c.code === "CRUDEOIL");
    if (crudeComm) {
        const elP = document.getElementById("ttCrude");
        const elC = document.getElementById("ttCrudeChg");
        if (elP) elP.textContent = `$${crudeComm.price_usd || 73.40}`;
        if (elC) {
            elC.textContent = `${crudeComm.change_pct >= 0 ? "+" : ""}${crudeComm.change_pct.toFixed(2)}%`;
            elC.className = `ticker-badge ${crudeComm.change_pct >= 0 ? "up" : "down"}`;
        }
    }
}

/* =========================================================================
   NSE DELIVERY VOLUME & INSTITUTIONAL ACCUMULATION RENDERER
   ========================================================================= */
function renderDeliveryRadar(delivery) {
    if (!delivery) return;
    const badge = document.getElementById("deliveryBadge");
    const pctVal = document.getElementById("deliveryPctVal");
    const avgVal = document.getElementById("deliveryAvgVal");
    const surgeVal = document.getElementById("deliverySurgeVal");
    const pBar = document.getElementById("deliveryProgressBar");
    const explanation = document.getElementById("deliveryExplanation");

    if (pctVal) pctVal.textContent = `${delivery.delivery_pct}%`;
    if (avgVal) avgVal.textContent = `${delivery.avg_delivery_20d}%`;
    if (surgeVal) surgeVal.textContent = `${delivery.delivery_surge}x`;

    if (pBar) {
        pBar.style.width = `${Math.min(Math.max(delivery.delivery_pct, 5), 100)}%`;
        if (delivery.delivery_pct >= 55) {
            pBar.className = "h-1.5 rounded-full bg-[#34c759] transition-all";
        } else if (delivery.delivery_pct >= 40) {
            pBar.className = "h-1.5 rounded-full bg-[#007aff] transition-all";
        } else {
            pBar.className = "h-1.5 rounded-full bg-[#ff9500] transition-all";
        }
    }

    if (badge) {
        badge.textContent = delivery.signal || "NORMAL TRADING";
        if (delivery.badge_color === "green") {
            badge.className = "text-[10.5px] font-bold px-2 py-0.5 rounded bg-[#edf7ee] text-[#1e7e34] border border-[#c6e8cc]";
        } else if (delivery.badge_color === "red") {
            badge.className = "text-[10.5px] font-bold px-2 py-0.5 rounded bg-[#fdf0f0] text-[#b32020] border border-[#f7c8c8]";
        } else if (delivery.badge_color === "blue") {
            badge.className = "text-[10.5px] font-bold px-2 py-0.5 rounded bg-[#eff6ff] text-[#007aff] border border-[#bfdbfe]";
        } else {
            badge.className = "text-[10.5px] font-bold px-2 py-0.5 rounded bg-[#f5f5f7] text-[#6e6e73] border border-[rgba(0,0,0,0.08)]";
        }
    }

    if (explanation && delivery.interpretation) {
        explanation.textContent = delivery.interpretation;
    }
}

/* =========================================================================
   macOS SPOTLIGHT COMMAND PALETTE (Cmd + K / Ctrl + K)
   ========================================================================= */
const COMMAND_PALETTE_ACTIONS = [
    // Operational Desks
    { id: "desk-stocks", title: "Stocks Deep Dive & Technicals", group: "Operational Desks", icon: "📈", action: () => switchTab("stocks") },
    { id: "desk-institutional", title: "Institutional Smart Money Radar", group: "Operational Desks", icon: "🏛️", action: () => switchTab("institutional") },
    { id: "desk-picks", title: "Top AI & Guru Stock Picks", group: "Operational Desks", icon: "💡", action: () => switchTab("best-picks") },
    { id: "desk-screener", title: "Multi-Metric Stock Screener", group: "Operational Desks", icon: "🎯", action: () => switchTab("screener") },
    { id: "desk-scanner", title: "SEPA V4 Momentum Alpha Scanner", group: "Operational Desks", icon: "📡", action: () => switchTab("scanner") },
    { id: "desk-bees", title: "NiftyBees vs GoldBees Capital Deployer", group: "Operational Desks", icon: "⚖️", action: () => switchTab("bees") },
    { id: "desk-sectors", title: "Sectoral Heatmap & Rotation", group: "Operational Desks", icon: "📊", action: () => switchTab("sectors") },
    { id: "desk-etf", title: "All-India ETF Screener Desk", group: "Operational Desks", icon: "📉", action: () => switchTab("etf") },
    { id: "desk-commodities", title: "MCX Gold, Silver & Crude Oil", group: "Operational Desks", icon: "🥇", action: () => switchTab("commodities") },
    { id: "desk-options", title: "F&O Options Chain & Max Pain", group: "Operational Desks", icon: "📋", action: () => switchTab("options") },
    { id: "desk-ipo", title: "Current & Upcoming IPO Tracker", group: "Operational Desks", icon: "🚀", action: () => switchTab("ipo") },
    { id: "desk-calendar", title: "Economic & RBI Policy Events Calendar", group: "Operational Desks", icon: "📅", action: () => switchTab("calendar") },
    { id: "desk-journal", title: "Personal Trading Journal & P&L Log", group: "Operational Desks", icon: "📒", action: () => switchTab("journal") },
    { id: "desk-backtest", title: "Historical Strategy Backtester", group: "Operational Desks", icon: "🧪", action: () => switchTab("backtest") },
    { id: "desk-news", title: "Live Financial Market News Feed", group: "Operational Desks", icon: "📰", action: () => switchTab("news") },

    // Workstation Quick Actions
    { id: "act-theme", title: "Toggle OLED Dark / Light Mode", group: "Workstation Tools", icon: "🌓", action: () => toggleAppTheme() },
    { id: "act-calc", title: "Open Position Size & Risk Calculator", group: "Workstation Tools", icon: "🧮", action: () => openPositionCalcModal() },
    { id: "act-watchlist", title: "Toggle Watchlist Drawer (W)", group: "Workstation Tools", icon: "⭐️", action: () => toggleWatchlistDrawer() },
    { id: "act-density", title: "Toggle Display Density (Standard / Compact)", group: "Workstation Tools", icon: "📏", action: () => toggleDisplayDensity() },
    { id: "act-rr", title: "Toggle Chart Risk/Reward Planner", group: "Workstation Tools", icon: "🎯", action: () => { switchTab("stocks"); if (typeof toggleRiskRewardPlanner === "function") toggleRiskRewardPlanner(); } },
    { id: "act-clear-recents", title: "Clear Recent Search History", group: "Workstation Tools", icon: "✕", action: () => clearSearchHistory() },
    { id: "act-shortcuts", title: "View Keyboard Shortcuts (? )", group: "Workstation Tools", icon: "⌨️", action: () => openShortcutsModal() },
];

let _selectedPaletteIndex = 0;
let _paletteFilteredItems = [];

function initCommandPalette() {
    const input = document.getElementById("commandPaletteInput");
    if (!input) return;

    input.addEventListener("input", (e) => {
        renderCommandPaletteResults(e.target.value.trim());
    });

    input.addEventListener("keydown", (e) => {
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (_paletteFilteredItems.length > 0) {
                _selectedPaletteIndex = (_selectedPaletteIndex + 1) % _paletteFilteredItems.length;
                highlightPaletteItem();
            }
        } else if (e.key === "ArrowUp") {
            e.preventDefault();
            if (_paletteFilteredItems.length > 0) {
                _selectedPaletteIndex = (_selectedPaletteIndex - 1 + _paletteFilteredItems.length) % _paletteFilteredItems.length;
                highlightPaletteItem();
            }
        } else if (e.key === "Enter") {
            e.preventDefault();
            if (_paletteFilteredItems.length > 0 && _paletteFilteredItems[_selectedPaletteIndex]) {
                executePaletteItem(_paletteFilteredItems[_selectedPaletteIndex]);
            }
        }
    });
}

function openCommandPalette() {
    const modal = document.getElementById("commandPaletteModal");
    const input = document.getElementById("commandPaletteInput");
    if (!modal || !input) return;

    modal.classList.remove("hidden");
    input.value = "";
    _selectedPaletteIndex = 0;
    renderCommandPaletteResults("");
    setTimeout(() => {
        input.focus();
    }, 50);
}
window.openCommandPalette = openCommandPalette;

function closeCommandPalette() {
    const modal = document.getElementById("commandPaletteModal");
    if (modal) modal.classList.add("hidden");
}
window.closeCommandPalette = closeCommandPalette;

function handleCommandPaletteBackdrop(e) {
    if (e.target.id === "commandPaletteModal") {
        closeCommandPalette();
    }
}
window.handleCommandPaletteBackdrop = handleCommandPaletteBackdrop;

function renderCommandPaletteResults(query) {
    const container = document.getElementById("commandPaletteResults");
    if (!container) return;

    _paletteFilteredItems = [];
    const q = query.toLowerCase();

    // 1. Filter Built-in Actions & Desks
    const matchedActions = COMMAND_PALETTE_ACTIONS.filter(item => {
        return !q || item.title.toLowerCase().includes(q) || item.group.toLowerCase().includes(q);
    });

    // 2. Filter Equities & ETFs from universe
    const matchedStocks = [];
    const stockPool = (appState.allAssets && appState.allAssets.length > 0) 
        ? appState.allAssets 
        : [
            { symbol: "RELIANCE.NS", name: "Reliance Industries Ltd", sector: "Energy" },
            { symbol: "TCS.NS", name: "Tata Consultancy Services", sector: "Technology" },
            { symbol: "HDFCBANK.NS", name: "HDFC Bank Ltd", sector: "Banking" },
            { symbol: "INFY.NS", name: "Infosys Ltd", sector: "Technology" },
            { symbol: "ICICIBANK.NS", name: "ICICI Bank Ltd", sector: "Banking" },
            { symbol: "SBIN.NS", name: "State Bank of India", sector: "Banking" },
            { symbol: "BHARTIARTL.NS", name: "Bharti Airtel Ltd", sector: "Telecom" },
            { symbol: "TMPV.NS", name: "Tata Motors Passenger Vehicles", sector: "Auto" },
            { symbol: "NIFTYBEES.NS", name: "Nippon India Nifty 50 BeES ETF", sector: "Index ETF" },
            { symbol: "GOLDBEES.NS", name: "Nippon India Gold BeES ETF", sector: "Commodity ETF" },
        ];

    if (q) {
        stockPool.forEach(s => {
            const sym = (s.symbol || "").toLowerCase();
            const name = (s.name || "").toLowerCase();
            if (sym.includes(q) || name.includes(q)) {
                matchedStocks.push({
                    id: `stock-${s.symbol}`,
                    title: `${s.symbol.replace('.NS', '')} — ${s.name}`,
                    group: "Stocks & Securities",
                    icon: "📊",
                    action: () => {
                        switchTab("stocks");
                        if (typeof _currentChartEngine !== "undefined" && _currentChartEngine === "tv_pro" && typeof updateTradingViewProSymbol === "function") {
                            updateTradingViewProSymbol(s.symbol);
                        }
                        loadStock(s.symbol);
                    }
                });
            }
        });
    }

    _paletteFilteredItems = [...matchedActions, ...matchedStocks.slice(0, 8)];
    _selectedPaletteIndex = 0;

    if (_paletteFilteredItems.length === 0) {
        container.innerHTML = `
            <div class="py-8 text-center text-xs text-[#8e8e93]">
                No matching desks, actions, or stocks found for "${escapeHtml(query)}"
            </div>
        `;
        return;
    }

    // Group items for clean macOS Spotlight rendering
    let html = "";
    let currentGroup = "";
    _paletteFilteredItems.forEach((item, idx) => {
        if (item.group !== currentGroup) {
            currentGroup = item.group;
            html += `<div class="command-palette-group-title">${currentGroup}</div>`;
        }
        const isSelected = idx === _selectedPaletteIndex;
        html += `
            <div class="command-palette-item ${isSelected ? 'selected' : ''}" data-index="${idx}" onclick="executePaletteItemIndex(${idx})">
                <div class="flex items-center gap-2.5">
                    <span class="text-base">${item.icon}</span>
                    <span class="font-medium">${item.title}</span>
                </div>
                <span class="command-sub text-[11px] text-[#8e8e93]">${item.group}</span>
            </div>
        `;
    });

    container.innerHTML = html;
}

function highlightPaletteItem() {
    const items = document.querySelectorAll(".command-palette-item");
    items.forEach((item, idx) => {
        if (idx === _selectedPaletteIndex) {
            item.classList.add("selected");
            item.scrollIntoView({ block: "nearest" });
        } else {
            item.classList.remove("selected");
        }
    });
}

function executePaletteItem(item) {
    closeCommandPalette();
    playChimeSound("success");
    if (item && typeof item.action === "function") {
        item.action();
    }
}

function executePaletteItemIndex(idx) {
    if (_paletteFilteredItems[idx]) {
        executePaletteItem(_paletteFilteredItems[idx]);
    }
}
window.executePaletteItemIndex = executePaletteItemIndex;




