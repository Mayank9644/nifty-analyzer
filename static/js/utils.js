/**
 * Financial formatters, tooltips, and helper utilities.
 */

// Layman definitions for financial terms
const JARGON_DICTIONARY = {
    "P/E Ratio": "Price-to-Earnings: Tells you how many rupees investors are paying for every ₹1 of company profit. Under 25 is generally considered reasonable in India.",
    "P/B Ratio": "Price-to-Book: Compares market value to actual asset value. Low P/B indicates bargain asset backing.",
    "ROE": "Return on Equity: Measures how efficiently management turns shareholders' money into net profit. Above 15% indicates an elite business.",
    "Debt to Equity": "Financial leverage: Compares total debt to equity capital. Below 0.5 means the company is very safe from bankruptcy.",
    "RSI": "Relative Strength Index (0-100): Measures buying momentum. Below 30 is oversold (cheap/bounce likely), above 70 is overbought (heated).",
    "MACD": "Moving Average Convergence Divergence: When the MACD line crosses above the Signal line, buying momentum is accelerating.",
    "Bollinger Bands": "Volatility boundaries: Price usually stays between the bands. Hitting the bottom band signals a potential rebound.",
    "ADX": "Average Directional Index: Measures trend strength. Above 25 confirms a strong, genuine trend (either up or down).",
    "VWAP": "Volume-Weighted Average Price: The true intraday benchmark price paid by institutional buyers.",
    "Promoter Holding": "Founders' and controlling group's ownership stake. Over 50% means founders have high confidence in their company.",
    "Pledging": "When promoters borrow personal loans against their shares. 0% is safest. High pledging is a major red flag.",
    "FII / DII": "Foreign Institutional Investors (global funds) and Domestic Institutional Investors (Indian mutual funds).",
    "PCR": "Put-Call Ratio: Ratio of put options to call options. Over 1.1 means bullish sentiment; under 0.7 signals caution.",
    "Max Pain": "The strike price where option buyers would lose the maximum money on expiry day. Prices often gravitate toward this level.",
    "Option Greeks": "Mathematical risk measures: Delta (price move), Gamma (acceleration), Theta (daily time decay loss), Vega (volatility impact)."
};

function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
window.escapeHtml = escapeHtml;

function formatINR(val) {
    if (val === null || val === undefined || isNaN(val)) return "₹0.00";
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 2
    }).format(val);
}

function formatNumber(val, decimals = 2) {
    if (val === null || val === undefined || isNaN(val)) return "0";
    return Number(val).toLocaleString('en-IN', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

function formatCrores(val) {
    if (!val || isNaN(val)) return "₹0 Cr";
    const cr = val / 10000000;
    if (cr >= 100000) {
        return `₹${(cr / 100000).toFixed(2)} Lakh Cr`;
    }
    return `₹${cr.toFixed(2)} Cr`;
}

function formatVolume(val) {
    if (!val || isNaN(val)) return "0";
    if (val >= 10000000) return `${(val / 10000000).toFixed(2)} Cr`;
    if (val >= 100000) return `${(val / 100000).toFixed(2)} L`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)} K`;
    return val.toString();
}

function renderJargonTooltip(term) {
    const desc = JARGON_DICTIONARY[term] || "Key financial parameter.";
    return `
        <span class="has-tooltip inline-flex items-center cursor-help ml-1 text-[#86868b] hover:text-[#007aff] transition-colors">
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
            <span class="tooltip-box w-64 bg-white/95 backdrop-blur-md border border-[rgba(0,0,0,0.12)] text-xs text-[#1c1c1e] p-2.5 rounded-xl shadow-xl -left-20 bottom-6 text-left">
                <strong class="text-[#007aff] block mb-1 font-semibold">${term}</strong>
                <span class="text-[#48484a] leading-relaxed block">${desc}</span>
            </span>
        </span>
    `;
}

/**
 * Universal Floating Toast Notification (macOS Native Design)
 */
function showNotification(message, type = "info") {
    let toastContainer = document.getElementById("macosToastContainer");
    if (!toastContainer) {
        toastContainer = document.createElement("div");
        toastContainer.id = "macosToastContainer";
        toastContainer.className = "fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none";
        document.body.appendChild(toastContainer);
    }

    const toast = document.createElement("div");
    const isError = type === "error" || type === "danger";
    const isSuccess = type === "success";
    const isWarning = type === "warning";

    const bgClass = isError
        ? "bg-rose-600 text-white border-rose-700"
        : isSuccess
        ? "bg-[#1e7e34] text-white border-[#155724]"
        : isWarning
        ? "bg-amber-500 text-white border-amber-600"
        : "bg-[#1c1c1e] text-white border-[rgba(255,255,255,0.15)]";

    const icon = isError ? "✕" : isSuccess ? "✓" : isWarning ? "⚠️" : "ℹ️";

    toast.className = `pointer-events-auto px-4 py-2.5 rounded-xl text-xs font-semibold shadow-2xl flex items-center gap-2 border transition-all duration-200 transform translate-y-2 opacity-0 ${bgClass}`;
    toast.innerHTML = `<span class="text-sm font-bold">${icon}</span> <span class="leading-tight">${message}</span>`;

    toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
        toast.classList.remove("translate-y-2", "opacity-0");
        toast.classList.add("translate-y-0", "opacity-100");
    });

    setTimeout(() => {
        toast.classList.remove("opacity-100");
        toast.classList.add("opacity-0", "translate-y-2");
        setTimeout(() => toast.remove(), 250);
    }, 3500);
}
window.showNotification = showNotification;
window.showToast = showNotification;

