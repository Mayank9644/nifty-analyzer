/**
 * TradingView Lightweight Charts + Chart.js visualizer.
 * Clean, modern Apple Light Theme.
 */

let tvChart = null;
let candleSeries = null;
let areaSeries = null;
let volumeSeries = null;
let sma20Series = null;
let sma50Series = null;
let sma200Series = null;

let _currentCandleData = [];
let _chartType = "candle";
let _overlayVisibility = { sma20: true, sma50: true, sma200: true, volume: true };

let shareholdingChart = null;
let radarStrategyChart = null;

/**
 * Initialize or update the TradingView Lightweight Candlestick Chart.
 */
function initLightweightChart(containerId, candleData, maData = null) {
    const container = document.getElementById(containerId);
    if (!container) return;

    _currentCandleData = candleData || [];

    // Explicitly clean up previous chart instance, memory buffers, and canvas listeners
    if (tvChart) {
        try {
            tvChart.remove();
        } catch (e) {}
        tvChart = null;
    }
    container.innerHTML = "";

    const isDark = document.documentElement.getAttribute("data-theme") === "dark";
    const chartOptions = {
        width: container.clientWidth,
        height: container.clientHeight || 420,
        layout: {
            background: { color: isDark ? "#151722" : "#ffffff" },
            textColor: isDark ? "#a1a1a6" : "#6e6e73",
            fontSize: 12,
            fontFamily: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', sans-serif"
        },
        grid: {
            vertLines: { color: isDark ? "rgba(255, 255, 255, 0.05)" : "#f2f2f7" },
            horzLines: { color: isDark ? "rgba(255, 255, 255, 0.05)" : "#f2f2f7" }
        },
        crosshair: {
            mode: 1, // Magnet
            vertLine: { color: "#8e8e93", width: 1, style: 2 },
            horzLine: { color: "#8e8e93", width: 1, style: 2 }
        },
        timeScale: {
            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "#e5e5ea",
            timeVisible: true,
            secondsVisible: false
        },
        rightPriceScale: {
            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "#e5e5ea",
            scaleMargins: { top: 0.08, bottom: 0.2 }
        }
    };

    tvChart = LightweightCharts.createChart(container, chartOptions);

    // Candlestick Series (Apple green #34c759 and Apple red #ff3b30)
    candleSeries = tvChart.addCandlestickSeries({
        upColor: "#34c759",
        downColor: "#ff3b30",
        borderUpColor: "#34c759",
        borderDownColor: "#ff3b30",
        wickUpColor: "#34c759",
        wickDownColor: "#ff3b30",
        visible: _chartType === "candle"
    });
    candleSeries.setData(candleData);

    // Area / Smooth Line Series
    const lineData = candleData.map(d => ({ time: d.time, value: d.close }));
    areaSeries = tvChart.addAreaSeries({
        topColor: "rgba(0, 122, 255, 0.25)",
        bottomColor: "rgba(0, 122, 255, 0.01)",
        lineColor: "#007aff",
        lineWidth: 2,
        visible: _chartType === "area"
    });
    areaSeries.setData(lineData);

    // Volume Series
    volumeSeries = tvChart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "", // Overlay on main pane
        scaleMargins: { top: 0.82, bottom: 0 },
        visible: _overlayVisibility.volume
    });

    const volData = candleData.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? "rgba(52, 199, 89, 0.35)" : "rgba(255, 59, 48, 0.35)"
    }));
    volumeSeries.setData(volData);

    // Add Simple Moving Averages if data is available
    if (candleData.length >= 20) {
        sma20Series = tvChart.addLineSeries({
            color: "#ff9500", // Apple Orange
            lineWidth: 1.5,
            title: "SMA 20",
            visible: _overlayVisibility.sma20
        });
        sma20Series.setData(calculateSMAForChart(candleData, 20));
    }

    if (candleData.length >= 50) {
        sma50Series = tvChart.addLineSeries({
            color: "#0071e3", // Apple Blue
            lineWidth: 1.5,
            title: "SMA 50",
            visible: _overlayVisibility.sma50
        });
        sma50Series.setData(calculateSMAForChart(candleData, 50));
    }

    if (candleData.length >= 200) {
        sma200Series = tvChart.addLineSeries({
            color: "#af52de", // Apple Purple
            lineWidth: 2,
            title: "SMA 200",
            visible: _overlayVisibility.sma200
        });
        sma200Series.setData(calculateSMAForChart(candleData, 200));
    }

    tvChart.timeScale().fitContent();

    // Responsive resize handler
    window.addEventListener("resize", () => {
        if (tvChart && container) {
            tvChart.applyOptions({ width: container.clientWidth });
        }
    });
}

/**
 * Switch between Candlestick and Area/Line chart type.
 */
function setChartType(type) {
    _chartType = type;
    if (candleSeries) candleSeries.applyOptions({ visible: type === "candle" });
    if (areaSeries) areaSeries.applyOptions({ visible: type === "area" });

    document.querySelectorAll(".chart-type-btn").forEach(btn => {
        if (btn.dataset.type === type) {
            btn.classList.add("active", "bg-white", "text-[#1d1d1f]", "font-semibold", "shadow-sm");
            btn.classList.remove("text-[#636366]");
        } else {
            btn.classList.remove("active", "bg-white", "text-[#1d1d1f]", "font-semibold", "shadow-sm");
            btn.classList.add("text-[#636366]");
        }
    });
}

/**
 * Toggle visibility of technical overlays (sma20, sma50, sma200, volume).
 */
function toggleChartOverlay(name) {
    if (!tvChart) return;
    _overlayVisibility[name] = !_overlayVisibility[name];
    const isVisible = _overlayVisibility[name];

    if (name === "sma20" && sma20Series) sma20Series.applyOptions({ visible: isVisible });
    if (name === "sma50" && sma50Series) sma50Series.applyOptions({ visible: isVisible });
    if (name === "sma200" && sma200Series) sma200Series.applyOptions({ visible: isVisible });
    if (name === "volume" && volumeSeries) volumeSeries.applyOptions({ visible: isVisible });

    const btn = document.querySelector(`.overlay-toggle-btn[data-overlay="${name}"]`);
    if (btn) {
        if (isVisible) {
            btn.classList.add("bg-[#eff6ff]", "text-[#007aff]", "border-[#007aff]/30");
            btn.classList.remove("bg-white", "text-[#8e8e93]", "border-[rgba(0,0,0,0.1)]");
        } else {
            btn.classList.remove("bg-[#eff6ff]", "text-[#007aff]", "border-[#007aff]/30");
            btn.classList.add("bg-white", "text-[#8e8e93]", "border-[rgba(0,0,0,0.1)]");
        }
    }
}

let _riskRewardLines = [];
let _isRiskRewardActive = false;

/**
 * Interactive Risk/Reward Order Visualizer.
 * Draws Entry, Stop-Loss (2%), Target 1 (1:2), and Target 2 (1:3) lines on the TradingView canvas.
 */
function toggleRiskRewardPlanner() {
    if (!tvChart || !candleSeries || !_currentCandleData || _currentCandleData.length === 0) return;
    _isRiskRewardActive = !_isRiskRewardActive;

    const btn = document.getElementById("riskRewardToggleBtn");
    const bar = document.getElementById("riskRewardBar");

    // Clean up existing price lines
    if (_riskRewardLines.length > 0) {
        _riskRewardLines.forEach(line => {
            try { candleSeries.removePriceLine(line); } catch (e) {}
        });
        _riskRewardLines = [];
    }

    if (!_isRiskRewardActive) {
        if (btn) {
            btn.classList.remove("bg-[#ff9500]", "text-white", "font-bold");
            btn.classList.add("bg-[#fef6ed]", "text-[#b35900]");
        }
        if (bar) bar.classList.add("hidden");
        return;
    }

    if (btn) {
        btn.classList.add("bg-[#ff9500]", "text-white", "font-bold");
        btn.classList.remove("bg-[#fef6ed]", "text-[#b35900]");
    }
    if (bar) bar.classList.remove("hidden");

    // Current price is last candle close
    const lastCandle = _currentCandleData[_currentCandleData.length - 1];
    const entry = lastCandle.close;
    const riskPct = 0.02; // 2% risk
    const stopLoss = entry * (1 - riskPct);
    const riskAmount = entry - stopLoss;
    const target1 = entry + (riskAmount * 2); // 1:2 R:R
    const target2 = entry + (riskAmount * 3); // 1:3 R:R

    // Draw Price Lines on TradingView chart
    const entryLine = candleSeries.createPriceLine({
        price: entry,
        color: '#007aff',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'ENTRY'
    });

    const stopLine = candleSeries.createPriceLine({
        price: stopLoss,
        color: '#d9383a',
        lineWidth: 2,
        lineStyle: 2,
        axisLabelVisible: true,
        title: 'STOP LOSS (2%)'
    });

    const target1Line = candleSeries.createPriceLine({
        price: target1,
        color: '#28a745',
        lineWidth: 1.5,
        lineStyle: 1,
        axisLabelVisible: true,
        title: 'TARGET 1 (1:2)'
    });

    const target2Line = candleSeries.createPriceLine({
        price: target2,
        color: '#1e7e34',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: 'TARGET 2 (1:3)'
    });

    _riskRewardLines = [entryLine, stopLine, target1Line, target2Line];

    // Populate the UI summary bar
    if (document.getElementById("rrEntryVal")) document.getElementById("rrEntryVal").textContent = `₹${roundTo(entry, 2)}`;
    if (document.getElementById("rrStopVal")) document.getElementById("rrStopVal").textContent = `₹${roundTo(stopLoss, 2)}`;
    if (document.getElementById("rrRiskPct")) document.getElementById("rrRiskPct").textContent = `2.0%`;
    if (document.getElementById("rrTarget1Val")) document.getElementById("rrTarget1Val").textContent = `₹${roundTo(target1, 2)}`;
    if (document.getElementById("rrTarget2Val")) document.getElementById("rrTarget2Val").textContent = `₹${roundTo(target2, 2)}`;
    if (document.getElementById("rrRiskTotal")) document.getElementById("rrRiskTotal").textContent = `₹${roundTo(riskAmount * 100, 0)}`;
}

/**
 * Apply Dark / Light theme styling to TradingView Lightweight Chart canvas.
 */
function applyChartTheme(theme) {
    if (!tvChart) return;
    const isDark = theme === "dark";
    tvChart.applyOptions({
        layout: {
            background: { color: isDark ? "#151722" : "#ffffff" },
            textColor: isDark ? "#a1a1a6" : "#6e6e73"
        },
        grid: {
            vertLines: { color: isDark ? "rgba(255, 255, 255, 0.05)" : "#f2f2f7" },
            horzLines: { color: isDark ? "rgba(255, 255, 255, 0.05)" : "#f2f2f7" }
        },
        timeScale: {
            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "#e5e5ea"
        },
        rightPriceScale: {
            borderColor: isDark ? "rgba(255, 255, 255, 0.1)" : "#e5e5ea"
        }
    });
}

function calculateSMAForChart(data, period) {
    const smaData = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        smaData.push({
            time: data[i].time,
            value: roundTo(sum / period, 2)
        });
    }
    return smaData;
}

function roundTo(n, digits) {
    return Number(Math.round(n + "e" + digits) + "e-" + digits);
}

/**
 * Render Shareholding Pie / Doughnut chart with Chart.js.
 */
function renderShareholdingChart(canvasId, shareholding) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (shareholdingChart) {
        shareholdingChart.destroy();
    }

    shareholdingChart = new Chart(ctx, {
        type: "doughnut",
        data: {
            labels: ["Promoter", "FII (Foreign)", "DII (Mutual Funds)", "Public / Retail"],
            datasets: [{
                data: [
                    shareholding.promoter || 50,
                    shareholding.fii || 20,
                    shareholding.dii || 15,
                    shareholding.public || 15
                ],
                backgroundColor: ["#0071e3", "#34c759", "#ff9500", "#af52de"],
                borderColor: "#ffffff",
                borderWidth: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: "bottom",
                    labels: { color: "#48484a", font: { family: "-apple-system, BlinkMacSystemFont, sans-serif", size: 11 }, padding: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.label}: ${context.raw}%`;
                        }
                    }
                }
            },
            cutout: "70%"
        }
    });
}

/**
 * Render 8-Expert Strategies Radar Chart with Chart.js.
 */
function renderExpertRadarChart(canvasId, radarData) {
    const ctx = document.getElementById(canvasId);
    if (!ctx) return;

    if (radarStrategyChart) {
        radarStrategyChart.destroy();
    }

    radarStrategyChart = new Chart(ctx, {
        type: "radar",
        data: {
            labels: radarData.labels,
            datasets: [{
                label: "Expert Alignment Score (0-100)",
                data: radarData.data,
                backgroundColor: "rgba(0, 113, 227, 0.15)",
                borderColor: "#0071e3",
                pointBackgroundColor: "#0071e3",
                pointBorderColor: "#fff",
                pointHoverBackgroundColor: "#fff",
                pointHoverBorderColor: "#0071e3",
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: "#e5e5ea" },
                    grid: { color: "#e5e5ea" },
                    pointLabels: { color: "#3a3a3c", font: { family: "-apple-system, BlinkMacSystemFont, sans-serif", size: 10, weight: "500" } },
                    ticks: { display: false, min: 0, max: 100, stepSize: 25 },
                    suggestedMin: 0,
                    suggestedMax: 100
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: (ctx) => ` Match Score: ${ctx.raw} / 100`
                    }
                }
            }
        }
    });
}

// ===== ADVANCED INSTITUTIONAL CHARTING OVERLAYS =====
let _volumeProfileLines = [];
let _isVolumeProfileActive = false;
let _anchoredVwapSeries = null;
let _isAnchoredVwapActive = false;
let _isDualSplitActive = false;
let _splitTvChart = null;

/**
 * Toggle Volume Profile Visible Range (VPVR) with POC, VAH, and VAL horizontal price levels.
 */
function toggleVolumeProfile() {
    if (!tvChart || !candleSeries || !_currentCandleData || _currentCandleData.length === 0) return;
    _isVolumeProfileActive = !_isVolumeProfileActive;

    const btn = document.getElementById("vpToggleBtn");
    const bar = document.getElementById("volumeProfileBar");

    // Clean up existing price lines
    if (_volumeProfileLines.length > 0) {
        _volumeProfileLines.forEach(line => {
            try { candleSeries.removePriceLine(line); } catch (e) {}
        });
        _volumeProfileLines = [];
    }

    if (!_isVolumeProfileActive) {
        if (btn) {
            btn.classList.remove("bg-[#af52de]", "text-white", "font-bold");
            btn.classList.add("bg-[#fbf5fd]", "text-[#7828c8]");
        }
        if (bar) bar.classList.add("hidden");
        return;
    }

    if (btn) {
        btn.classList.add("bg-[#af52de]", "text-white", "font-bold");
        btn.classList.remove("bg-[#fbf5fd]", "text-[#7828c8]");
    }
    if (bar) bar.classList.remove("hidden");

    // Compute VPVR client-side over current candle dataset
    const lookback = Math.min(_currentCandleData.length, 120);
    const subset = _currentCandleData.slice(_currentCandleData.length - lookback);

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    subset.forEach(c => {
        if (c.low < minPrice) minPrice = c.low;
        if (c.high > maxPrice) maxPrice = c.high;
    });

    if (maxPrice <= minPrice) return;

    const bins = 24;
    const binSize = (maxPrice - minPrice) / bins;
    const binVolumes = new Array(bins).fill(0);
    const binLows = [];
    const binMids = [];
    const binHighs = [];

    for (let i = 0; i < bins; i++) {
        const bLow = minPrice + (i * binSize);
        const bHigh = minPrice + ((i + 1) * binSize);
        binLows.push(bLow);
        binHighs.push(bHigh);
        binMids.push((bLow + bHigh) / 2);
    }

    subset.forEach(c => {
        const vol = c.volume || 1;
        const startBin = Math.max(0, Math.min(bins - 1, Math.floor((c.low - minPrice) / binSize)));
        const endBin = Math.max(0, Math.min(bins - 1, Math.floor((c.high - minPrice) / binSize)));
        const numInter = Math.max(1, endBin - startBin + 1);
        const volPerBin = vol / numInter;
        for (let b = startBin; b <= endBin; b++) {
            binVolumes[b] += volPerBin;
        }
    });

    let pocIdx = 0;
    let maxVol = -1;
    let totalVol = 0;
    for (let i = 0; i < bins; i++) {
        totalVol += binVolumes[i];
        if (binVolumes[i] > maxVol) {
            maxVol = binVolumes[i];
            pocIdx = i;
        }
    }

    const pocPrice = binMids[pocIdx];

    // Value area: 70% of total volume
    const targetVaVol = totalVol * 0.70;
    let accumulatedVol = binVolumes[pocIdx];
    let left = pocIdx - 1;
    let right = pocIdx + 1;
    const vaIndices = new Set([pocIdx]);

    while (accumulatedVol < targetVaVol && (left >= 0 || right < bins)) {
        const leftVol = left >= 0 ? binVolumes[left] : -1;
        const rightVol = right < bins ? binVolumes[right] : -1;
        if (leftVol >= rightVol && left >= 0) {
            vaIndices.add(left);
            accumulatedVol += leftVol;
            left--;
        } else if (right < bins) {
            vaIndices.add(right);
            accumulatedVol += rightVol;
            right++;
        } else if (left >= 0) {
            vaIndices.add(left);
            accumulatedVol += leftVol;
            left--;
        } else {
            break;
        }
    }

    const vaArr = Array.from(vaIndices);
    const valIdx = Math.min(...vaArr);
    const vahIdx = Math.max(...vaArr);
    const valPrice = binLows[valIdx];
    const vahPrice = binHighs[vahIdx];

    // Draw lines
    const pocLine = candleSeries.createPriceLine({
        price: pocPrice,
        color: '#e11d48',
        lineWidth: 2,
        lineStyle: 0,
        axisLabelVisible: true,
        title: `POC ₹${pocPrice.toFixed(2)}`
    });

    const vahLine = candleSeries.createPriceLine({
        price: vahPrice,
        color: '#0284c7',
        lineWidth: 1.5,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `VAH ₹${vahPrice.toFixed(2)}`
    });

    const valLine = candleSeries.createPriceLine({
        price: valPrice,
        color: '#0284c7',
        lineWidth: 1.5,
        lineStyle: 2,
        axisLabelVisible: true,
        title: `VAL ₹${valPrice.toFixed(2)}`
    });

    _volumeProfileLines = [pocLine, vahLine, valLine];

    if (document.getElementById("vpPocVal")) document.getElementById("vpPocVal").textContent = `₹${pocPrice.toFixed(2)}`;
    if (document.getElementById("vpVahVal")) document.getElementById("vpVahVal").textContent = `₹${vahPrice.toFixed(2)}`;
    if (document.getElementById("vpValVal")) document.getElementById("vpValVal").textContent = `₹${valPrice.toFixed(2)}`;
}

/**
 * Toggle Anchored VWAP (AVWAP) anchored from the key swing low of the past 60 sessions.
 */
function toggleAnchoredVwap() {
    if (!tvChart || !_currentCandleData || _currentCandleData.length === 0) return;
    _isAnchoredVwapActive = !_isAnchoredVwapActive;

    const btn = document.getElementById("avwapToggleBtn");

    if (!_isAnchoredVwapActive) {
        if (_anchoredVwapSeries) {
            try { tvChart.removeSeries(_anchoredVwapSeries); } catch (e) {}
            _anchoredVwapSeries = null;
        }
        if (btn) {
            btn.classList.remove("bg-[#5856d6]", "text-white", "font-bold");
            btn.classList.add("bg-[#f4f4fe]", "text-[#4338ca]");
        }
        return;
    }

    if (btn) {
        btn.classList.add("bg-[#5856d6]", "text-white", "font-bold");
        btn.classList.remove("bg-[#f4f4fe]", "text-[#4338ca]");
    }

    // Find anchor index: lowest low of last 60 candles
    const lookback = Math.min(_currentCandleData.length, 60);
    const startIdx = _currentCandleData.length - lookback;
    let minLow = Infinity;
    let anchorIdx = startIdx;

    for (let i = startIdx; i < _currentCandleData.length; i++) {
        if (_currentCandleData[i].low < minLow) {
            minLow = _currentCandleData[i].low;
            anchorIdx = i;
        }
    }

    const avwapData = [];
    let cumTpVol = 0;
    let cumVol = 0;

    for (let i = anchorIdx; i < _currentCandleData.length; i++) {
        const c = _currentCandleData[i];
        const tp = (c.high + c.low + c.close) / 3;
        const vol = c.volume || 1;
        cumTpVol += (tp * vol);
        cumVol += vol;
        const avwap = cumVol > 0 ? (cumTpVol / cumVol) : c.close;
        avwapData.push({
            time: c.time,
            value: parseFloat(avwap.toFixed(2))
        });
    }

    _anchoredVwapSeries = tvChart.addLineSeries({
        color: "#5856d6",
        lineWidth: 2,
        title: "AVWAP",
        lineStyle: 0
    });
    _anchoredVwapSeries.setData(avwapData);
}

/**
 * Toggle Dual-Chart Split View (Side-by-side / benchmark comparison view).
 */
function toggleDualChartSplit() {
    _isDualSplitActive = !_isDualSplitActive;
    const btn = document.getElementById("dualSplitToggleBtn");
    const secondaryContainer = document.getElementById("secondaryChartContainer");

    if (!_isDualSplitActive) {
        if (secondaryContainer) secondaryContainer.classList.add("hidden");
        if (btn) {
            btn.classList.remove("bg-[#10b981]", "text-white", "font-bold");
            btn.classList.add("bg-[#ecfdf5]", "text-[#047857]");
        }
        if (_splitTvChart) {
            try { _splitTvChart.remove(); } catch (e) {}
            _splitTvChart = null;
        }
        if (tvChart) {
            const mainContainer = document.getElementById("candlestickChartContainer");
            if (mainContainer) tvChart.applyOptions({ width: mainContainer.clientWidth });
        }
        return;
    }

    if (btn) {
        btn.classList.add("bg-[#10b981]", "text-white", "font-bold");
        btn.classList.remove("bg-[#ecfdf5]", "text-[#047857]");
    }
    if (secondaryContainer) {
        secondaryContainer.classList.remove("hidden");
        secondaryContainer.innerHTML = "";

        const isDark = document.documentElement.getAttribute("data-theme") === "dark";
        _splitTvChart = LightweightCharts.createChart(secondaryContainer, {
            width: secondaryContainer.clientWidth,
            height: 380,
            layout: {
                background: { color: isDark ? "#151722" : "#ffffff" },
                textColor: isDark ? "#a1a1a6" : "#6e6e73",
                fontSize: 11
            },
            grid: {
                vertLines: { color: isDark ? "rgba(255, 255, 255, 0.05)" : "#f2f2f7" },
                horzLines: { color: isDark ? "rgba(255, 255, 255, 0.05)" : "#f2f2f7" }
            },
            timeScale: { borderColor: "#e5e5ea", timeVisible: true }
        });

        // Add benchmark comparative line or candle series
        const splitLineSeries = _splitTvChart.addAreaSeries({
            topColor: "rgba(16, 185, 129, 0.3)",
            bottomColor: "rgba(16, 185, 129, 0.02)",
            lineColor: "#10b981",
            lineWidth: 2,
            title: "Comparative Benchmark"
        });

        if (_currentCandleData && _currentCandleData.length > 0) {
            const splitData = _currentCandleData.map(d => ({ time: d.time, value: d.close }));
            splitLineSeries.setData(splitData);
            _splitTvChart.timeScale().fitContent();
        }
    }
}
