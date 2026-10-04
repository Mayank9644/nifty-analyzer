# Complete Performance Optimization & Institutional Feature Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform the Nifty Analyzer platform into a sub-250ms high-frequency trading terminal with 91.8% reduced payload bandwidth, persistent options connectivity, mobile/web responsive safety, and high-impact institutional desks (strike-wise OI chart, multi-leg options payoff builder, 1-click backtest presets with CSV export, and Finviz-style sector heatmap).

**Architecture:** Implement market-aware tiered caching with dynamic live/closed TTLs, single-pass zero-redundancy stock hydration, concurrent bulk thread pooling for commodities/screeners, compact binary/tuple autocomplete serialization with HTTP 24h caching, and high-performance Chart.js visualizers.

**Tech Stack:** Python 3.9+ / Flask, NumPy, Pandas, yfinance, cachetools, Gunicorn, Tailwind CSS JIT / Sequoia design system, TradingView Lightweight Charts, Chart.js, Turso Cloud SQLite DB (Hrana HTTPS v2).

**Spec:** [`docs/superpowers/specs/2026-10-04-complete-optimization-and-feature-package-design.md`](file:///Users/mayankyadav/.gemini/antigravity/scratch/nifty-analyzer/docs/superpowers/specs/2026-10-04-complete-optimization-and-feature-package-design.md)

## Global Constraints

- **Local Host Compute**: Apple Silicon M1 (8-core, 8 GB RAM) — zero unbounded memory allocations, keep worker pools $\le 10$ threads.
- **Cloud Deployment**: Render Web Service (512 MB RAM ceiling) — Gunicorn topology strictly `--workers 1 --threads 8` to guarantee unified memory cache.
- **Database Safety**: Turso Cloud SQLite tables (`trades`, `watchlist`) must remain 100% ACID-compliant and schema-compatible.
- **Zero Command Friction**: All migrations, commits, and tests run autonomously without slash command prompting.

## Review Focus

1. **Market State Transitions**: Does the cache dynamically detect 09:15 IST opening and invalidate 2-hour closed-session caches without serving stale prices?
2. **Illiquid & Delisted Ticker Safety**: When an unknown or newly listed symbol is queried, does the single-pass hydrator fall back safely without raising an unhandled 500 error?
3. **Mobile & Small Screen Viewport Limits**: On 360px–390px mobile screens (iPhone SE / iPhone 13), do modals (`positionCalcModal`, `manualTradeModal`) and tables remain scrollable without clipping submit actions?
4. **Options Chain Upstream Throttling**: If NSE official endpoints rate-limit or fail, does the system seamlessly pivot to Black-Scholes modeled options within 500ms?
5. **Autocomplete Main-Thread Performance**: Does typing in the search bar execute in < 2ms without blocking typing animations or triggering unnecessary network calls?

---

### Task 1: Market-Aware Tiered Caching & Fast-Path Stock Hydrator

**Files:**
- Modify: `config.py`
- Modify: `data/fetcher.py`
- Modify: `data/context.py`

- [ ] **Step 1: Write unit test for dynamic TTL and single-pass hydration**
  Create test asserting that:
  - During live session, TTL is 60s; during closed session, TTL is 7200s (2h).
  - `get_stock_info()` executes in < 350ms on cold fetch using direct v8 + fast_info.
  - `get_shareholding()` reuses pre-fetched info dict without initiating a second `ticker.info` scrape.
- [ ] **Step 2: Update `config.py` with tiered TTL thresholds**
  Define `CACHE_TTL_LIVE = 60`, `CACHE_TTL_CLOSED = 7200`, `CACHE_TTL_NEWS = 1800`, `CACHE_TTL_DAILY = 86400`.
- [ ] **Step 3: Refactor `data/fetcher.py` to single-pass extraction**
  - Update `get_stock_info()` to extract real-time quote, session high/low/open, and fundamentals in one pass.
  - Update `get_shareholding(symbol, info_dict=None)` to accept optional pre-fetched info.
  - Update `data/context.py` to pass the info dict into shareholding evaluation.
- [ ] **Step 4: Run test and verify latency reduction**
  Verify `get_stock_info('RELIANCE.NS')` drops from 2.1s to < 400ms.
- [ ] **Step 5: Commit changes**
  `git commit -m "perf(core): implement market-aware tiered caching and single-pass stock hydration"`

---

### Task 2: Parallel Bulk Commodities & Market Overview Engine

**Files:**
- Modify: `data/commodity_fetcher.py`
- Modify: `app.py`

- [ ] **Step 1: Write benchmark test for `/api/market/overview`**
  Measure cold execution time before and assert cold execution < 500ms.
- [ ] **Step 2: Concurrently fetch commodities in `data/commodity_fetcher.py`**
  Refactor `get_all_commodities_overview()` using `concurrent.futures.ThreadPoolExecutor(max_workers=5)` to fetch Gold, Silver, Crude Oil, Natural Gas, and Copper concurrently.
- [ ] **Step 3: Parallelize Nifty, Bank Nifty, and USD/INR extraction in `app.py`**
  In `api_market_overview()`, execute benchmark quotes and commodity pool concurrently.
- [ ] **Step 4: Test endpoint response**
  Verify `http://127.0.0.1:5050/api/market/overview` returns status 200 in < 400ms.
- [ ] **Step 5: Commit changes**
  `git commit -m "perf(macro): parallelize commodity and benchmark overview engine"`

---

### Task 3: Compact Search Universe & Pre-Indexed Autocomplete

**Files:**
- Modify: `data/fetcher.py`
- Modify: `app.py`
- Modify: `static/js/app.js`

- [ ] **Step 1: Write size audit test for `/api/stocks/list`**
  Assert response payload < 100 KB and `Cache-Control` header present.
- [ ] **Step 2: Compress `/api/stocks/list` payload in `app.py`**
  Deduplicate `ALL_ASSETS` into compact tuples `{"s": sym, "c": code, "n": name, "sec": sector, "cat": category, "f": fno}` and remove redundant `stocks` array duplication.
  Add response header: `Cache-Control: public, max-age=86400, stale-while-revalidate=3600`.
- [ ] **Step 3: Implement client-side search index in `static/js/app.js`**
  On `loadInitialData()`, map the compact array and store pre-lowercased search strings.
  Refactor input event handler to use indexed search in < 1ms on keystroke.
- [ ] **Step 4: Verify search responsiveness in browser**
  Confirm instant search dropdown for "RELIANCE", "NIFTY", "GOLD", "TCS".
- [ ] **Step 5: Commit changes**
  `git commit -m "perf(search): compact universe payload by 92% and add pre-indexed client autocomplete"`

---

### Task 4: Screener Batch Concurrency & Dynamic Institutional Calendar

**Files:**
- Modify: `analysis/screener.py`
- Modify: `data/institutional_flow.py`

- [ ] **Step 1: Write screener timeout test**
  Assert `run_stock_screener()` completes within 2.5 seconds with zero dropped stocks.
- [ ] **Step 2: Optimize screener pool in `analysis/screener.py`**
  Reuse warmed data contexts and optimize worker execution.
- [ ] **Step 3: Implement dynamic Indian business day flow in `data/institutional_flow.py`**
  Replace static September 2026 dates with dynamic calculation: past 5 Indian exchange trading days (Mon–Fri, skipping weekends/holidays).
- [ ] **Step 4: Test screener and institutional API**
  Verify `/api/screener` and `/api/institutional/radar` return valid dynamic data.
- [ ] **Step 5: Commit changes**
  `git commit -m "feat(screener): eliminate screener timeout drops and add dynamic rolling institutional dates"`

---

### Task 5: Strike-Wise Call/Put OI & Max Pain Bar Chart

**Files:**
- Modify: `analysis/options.py`
- Modify: `static/js/options_charts.js`
- Modify: `templates/index.html`

- [ ] **Step 1: Write test for options strike-wise OI extraction**
  Assert `analyze_option_chain()` extracts top 15 strikes around spot with Call OI, Put OI, and Max Pain strike.
- [ ] **Step 2: Add Chart.js container in `templates/index.html`**
  Insert `<canvas id="optionsOiChart">` with legend (Call OI Resistance 🔴, Put OI Support 🟢, Max Pain 🟡).
- [ ] **Step 3: Implement `renderOptionsOiChart(chainData)` in `static/js/options_charts.js`**
  Render horizontal/vertical stacked bar chart showing Call vs Put open interest at each strike with Max Pain reference marker.
- [ ] **Step 4: Test chart in browser**
  Verify rendering on Nifty, Bank Nifty, and Reliance options chains in both light and dark themes.
- [ ] **Step 5: Commit changes**
  `git commit -m "feat(options): add visual strike-wise Call vs Put OI and Max Pain chart"`

---

### Task 6: Multi-Leg Options Payoff Builder

**Files:**
- Modify: `analysis/options_payoff.py`
- Modify: `static/js/options_charts.js`
- Modify: `templates/index.html`

- [ ] **Step 1: Write test for multi-leg payoff generator**
  Test Bull Call Spread, Bear Put Spread, Straddle, and Iron Condor payoff curves, max profit, max loss, and breakevens.
- [ ] **Step 2: Add Payoff Builder UI in `templates/index.html`**
  Insert strategy preset selector (`Bull Call Spread`, `Bear Put Spread`, `Long Straddle`, `Iron Condor`), strike picker, and `<canvas id="optionsPayoffChart">`.
- [ ] **Step 3: Implement interactive payoff plotter in `static/js/options_charts.js`**
  Render P&L curve at expiry with shaded profit/loss zones and 1-click broker order ticket generation.
- [ ] **Step 4: Test in browser**
  Verify dynamic payoff curve recalculation on strike or strategy change.
- [ ] **Step 5: Commit changes**
  `git commit -m "feat(options): implement multi-leg options strategy payoff builder and Greeks visualizer"`

---

### Task 7: 1-Click Backtest Strategy Presets & CSV Trade Export

**Files:**
- Modify: `analysis/backtest.py`
- Modify: `static/js/backtest.js`
- Modify: `templates/index.html`

- [ ] **Step 1: Write test for CSV trade export formatting**
  Verify trade export string contains all columns: `Entry Date, Exit Date, Symbol, Strategy, Entry Price, Exit Price, Qty, Gross PnL, Friction, Net PnL, Return %, Reason`.
- [ ] **Step 2: Add 1-Click preset action bar in `templates/index.html`**
  Insert strategy preset pills: `SEPA V3 Breakout`, `Supertrend (10, 3)`, `RSI 200 DMA Pullback`, `Donchian 20/10 Breakout`.
  Add `📥 Export Trades CSV` button.
- [ ] **Step 3: Implement preset trigger and CSV download in `static/js/backtest.js`**
  Clicking a preset sets strategy, runs backtest, and updates equity curve. Clicking Export triggers direct client-side CSV download.
- [ ] **Step 4: Test CSV export and presets**
  Click presets and download CSV; verify valid spreadsheet structure.
- [ ] **Step 5: Commit changes**
  `git commit -m "feat(backtest): add 1-click strategy presets and trade audit CSV export"`

---

### Task 8: Finviz-Style Sector Tree-Map Heatmap

**Files:**
- Modify: `analysis/sectors.py`
- Modify: `static/js/sectors.js`
- Modify: `templates/index.html`

- [ ] **Step 1: Write test for Nifty 50 sector-weighted constituent map**
  Verify `get_sector_constituents_heatmap()` aggregates stocks by sector with market cap weight and day change %.
- [ ] **Step 2: Add Heatmap container in `templates/index.html`**
  Insert `#sectorHeatmapContainer` in the Sector Rotation workspace.
- [ ] **Step 3: Implement tree-map grid renderer in `static/js/sectors.js`**
  Render sector blocks with weighted child tiles colored by % change (+3% dark green to -3% deep red). Clicking a tile loads that stock in the Terminal.
- [ ] **Step 4: Test heatmap in browser**
  Verify interactive hover and click navigation to stock hero card.
- [ ] **Step 5: Commit changes**
  `git commit -m "feat(sectors): add Finviz-style Nifty 50 sector tree-map heatmap"`

---

### Task 9: Mobile & Web Responsive Polish & Modal Scroll Guards

**Files:**
- Modify: `static/css/style.css`
- Modify: `templates/index.html`

- [ ] **Step 1: Audit modal scrollability on small screens (< 768px)**
  Add `max-height: calc(100vh - 48px); overflow-y: auto; -webkit-overflow-scrolling: touch;` to all modals (`#positionCalcModal`, `#tradeLogModal`, `#alertsModal`, `#formulaInspectionModal`).
- [ ] **Step 2: Ensure omni-search bar flexibility on mobile**
  Change `min-w-[280px]` to `min-w-0 flex-1` on screens < 640px to prevent header layout overflow.
- [ ] **Step 3: Verify touch target sizing (44px rule)**
  Ensure mobile dock buttons, segmented pills, and modal close buttons have minimum 44px tap areas.
- [ ] **Step 4: Test in mobile viewport (375x667 and 390x844)**
  Verify zero horizontal scroll, smooth bottom-dock touch switching, and modal responsiveness.
- [ ] **Step 5: Commit changes**
  `git commit -m "fix(ui): enforce mobile modal scroll guards, touch target heights, and header flex safety"`

---

### Task 10: End-to-End Verification, Performance Benchmarking & Gunicorn Topology

**Files:**
- Modify: `Procfile`
- Modify: `render.yaml`

- [ ] **Step 1: Update Gunicorn configuration**
  Set `--workers 1 --threads 8` in `Procfile` and `render.yaml` to ensure 100% unified warm cache on Render.
- [ ] **Step 2: Run complete endpoint latency benchmarks**
  Measure:
  - `/api/stock/RELIANCE.NS` (< 250ms warm)
  - `/api/market/overview` (< 400ms)
  - `/api/stocks/list` (< 90 KB)
  - `/api/screener` (< 2.5s)
- [ ] **Step 3: Verify Turso Cloud Database integrity**
  Confirm watchlists, active trades, and journal stats remain intact.
- [ ] **Step 4: Test in Light and Dark themes via headless Chrome**
  Take screenshots of Options OI chart, Payoff builder, Sector Heatmap, and Backtest CSV export.
- [ ] **Step 5: Final commit & push**
  `git commit -m "chore(deploy): finalize Gunicorn 1-worker 8-thread topology and end-to-end performance verification"`
  `git push origin main`
