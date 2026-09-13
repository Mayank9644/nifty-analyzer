/**
 * Real-Time Audio-Visual Alert Watchdog
 * Web Audio API synthesized harmonic chimes, threshold monitoring, and local storage persistence.
 */

const ALERTS_STORAGE_KEY = "terminal_price_alerts";

function getStoredAlerts() {
    try {
        return JSON.parse(localStorage.getItem(ALERTS_STORAGE_KEY) || "[]");
    } catch {
        return [];
    }
}

function saveStoredAlerts(alerts) {
    localStorage.setItem(ALERTS_STORAGE_KEY, JSON.stringify(alerts));
    updateAlertBadge();
}

function playAlertChime() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        // Harmonic dual chime (D5 -> A5)
        osc1.type = "sine";
        osc1.frequency.setValueAtTime(587.33, ctx.currentTime);
        osc1.frequency.exponentialRampToValueAtTime(880.00, ctx.currentTime + 0.15);

        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(880.00, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(1174.66, ctx.currentTime + 0.2);

        gain.gain.setValueAtTime(0.18, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.65);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);

        osc1.start();
        osc2.start();
        osc1.stop(ctx.currentTime + 0.65);
        osc2.stop(ctx.currentTime + 0.65);
        setTimeout(() => { try { ctx.close(); } catch (_) {} }, 1000);
    } catch (e) {
        console.warn("Audio chime prevented by autoplay policy:", e);
    }
}

function checkPriceAlerts(symbol, currentPrice, high52w = 0) {
    if (!symbol || !currentPrice) return;
    const alerts = getStoredAlerts();
    let updated = false;

    alerts.forEach(a => {
        if (a.triggered) return;
        if (a.symbol !== symbol && a.code !== symbol.replace('.NS', '')) return;

        let isTriggered = false;
        if (a.condition === "ABOVE" && currentPrice >= a.targetPrice) {
            isTriggered = true;
        } else if (a.condition === "BELOW" && currentPrice <= a.targetPrice) {
            isTriggered = true;
        } else if (a.condition === "52W_HIGH" && high52w > 0 && currentPrice >= high52w * 0.995) {
            isTriggered = true;
        }

        if (isTriggered) {
            a.triggered = true;
            a.triggeredAt = new Date().toLocaleTimeString('en-IN');
            updated = true;
            playAlertChime();
            showNotification(`🚨 WATCHDOG ALERT: ${a.code} hit ₹${currentPrice.toLocaleString('en-IN')} (${a.condition})`, "warning");
        }
    });

    if (updated) {
        saveStoredAlerts(alerts);
        renderAlertListInModal();
    }
}

function addPriceAlert(symbol, targetPrice, condition = "ABOVE") {
    if (!symbol) symbol = appState.currentSymbol || "RELIANCE.NS";
    targetPrice = parseFloat(targetPrice);
    if (!targetPrice || isNaN(targetPrice)) {
        showNotification("Please enter a valid target price", "error");
        return;
    }

    const alerts = getStoredAlerts();
    const code = symbol.replace('.NS', '').toUpperCase();
    const newAlert = {
        id: "alert_" + Date.now(),
        symbol: symbol,
        code: code,
        targetPrice: targetPrice,
        condition: condition,
        created: new Date().toLocaleDateString('en-IN'),
        triggered: false
    };

    alerts.push(newAlert);
    saveStoredAlerts(alerts);
    showNotification(`🔔 Alert set for ${code} ${condition} ₹${targetPrice}`, "success");
    renderAlertListInModal();
}

function deletePriceAlert(alertId) {
    let alerts = getStoredAlerts();
    alerts = alerts.filter(a => a.id !== alertId);
    saveStoredAlerts(alerts);
    renderAlertListInModal();
    showNotification("Alert removed", "info");
}

function clearTriggeredAlerts() {
    let alerts = getStoredAlerts();
    alerts = alerts.filter(a => !a.triggered);
    saveStoredAlerts(alerts);
    renderAlertListInModal();
    showNotification("Cleared triggered alerts", "info");
}

function updateAlertBadge() {
    const alerts = getStoredAlerts();
    const activeCount = alerts.filter(a => !a.triggered).length;
    const badge = document.getElementById("navAlertBadge");
    if (badge) {
        badge.textContent = activeCount;
        if (activeCount > 0) {
            badge.classList.remove("hidden");
        } else {
            badge.classList.add("hidden");
        }
    }
}

function openAlertManagerModal() {
    let modal = document.getElementById("alertWatchdogModal");
    if (!modal) {
        createAlertModalDOM();
        modal = document.getElementById("alertWatchdogModal");
    }

    // Prepopulate with current stock
    const symInput = document.getElementById("alertModalSymbol");
    const priceInput = document.getElementById("alertModalPrice");
    if (symInput && appState.currentSymbol) {
        symInput.value = appState.currentSymbol.replace('.NS', '');
    }
    if (priceInput && appState.currentStockData) {
        priceInput.value = appState.currentStockData.current_price || "";
    }

    renderAlertListInModal();
    modal.classList.remove("hidden");
}

function closeAlertManagerModal() {
    const modal = document.getElementById("alertWatchdogModal");
    if (modal) modal.classList.add("hidden");
}

function renderAlertListInModal() {
    const container = document.getElementById("alertModalListContainer");
    if (!container) return;

    const alerts = getStoredAlerts();
    if (alerts.length === 0) {
        container.innerHTML = `
            <div class="text-center py-6 text-xs text-[#8e8e93]">
                No active price alerts. Set a price trigger above.
            </div>
        `;
        return;
    }

    container.innerHTML = alerts.map(a => {
        const isTriggered = a.triggered;
        return `
            <div class="flex items-center justify-between p-2.5 rounded-xl border ${isTriggered ? 'bg-amber-50/50 border-amber-200' : 'bg-[#f8f8fa] border-[rgba(0,0,0,0.05)]'} text-xs">
                <div class="flex items-center gap-2.5">
                    <span class="text-sm">${isTriggered ? '⚡' : '🔔'}</span>
                    <div>
                        <div class="font-bold text-[#1c1c1e] flex items-center gap-1.5">
                            ${a.code}
                            <span class="px-1.5 py-0.2 rounded text-[10px] font-semibold ${a.condition === 'ABOVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'}">
                                ${a.condition} ₹${a.targetPrice.toLocaleString('en-IN')}
                            </span>
                        </div>
                        <div class="text-[10.5px] text-[#8e8e93]">
                            ${isTriggered ? `Triggered at ${a.triggeredAt}` : `Created on ${a.created}`}
                        </div>
                    </div>
                </div>
                <button onclick="deletePriceAlert('${a.id}')" class="text-[#8e8e93] hover:text-rose-600 px-2 py-1 text-xs font-bold transition-colors cursor-pointer">
                    ✕
                </button>
            </div>
        `;
    }).join("");
}

function createAlertModalDOM() {
    const div = document.createElement("div");
    div.id = "alertWatchdogModal";
    div.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 hidden";
    div.innerHTML = `
        <div class="macos-card bg-white w-full max-w-md p-6 space-y-4 shadow-2xl relative">
            <button onclick="closeAlertManagerModal()" class="absolute top-4 right-4 text-[#8e8e93] hover:text-[#1c1c1e] text-lg font-bold">✕</button>
            
            <div class="flex items-center gap-3">
                <span class="text-2xl p-2 rounded-xl bg-amber-500/10 text-amber-600">🔔</span>
                <div>
                    <h3 class="text-base font-bold text-[#1c1c1e]">Real-Time Alert Watchdog</h3>
                    <p class="text-xs text-[#6e6e73]">Audio chime & visual notifications when targets trigger</p>
                </div>
            </div>

            <!-- Create New Alert Card -->
            <div class="p-3.5 rounded-xl bg-[#f8f8fa] border border-[rgba(0,0,0,0.06)] space-y-2.5 text-xs">
                <div class="font-semibold text-[#1c1c1e]">Set New Price Threshold</div>
                <div class="grid grid-cols-3 gap-2">
                    <div>
                        <label class="text-[#6e6e73] block mb-1">Symbol</label>
                        <input id="alertModalSymbol" type="text" placeholder="RELIANCE" class="w-full px-2.5 py-1.5 rounded-lg border border-[rgba(0,0,0,0.12)] font-bold uppercase outline-none focus:border-[#007aff]">
                    </div>
                    <div>
                        <label class="text-[#6e6e73] block mb-1">Condition</label>
                        <select id="alertModalCondition" class="w-full px-2 py-1.5 rounded-lg border border-[rgba(0,0,0,0.12)] font-semibold outline-none focus:border-[#007aff]">
                            <option value="ABOVE">Price ≥</option>
                            <option value="BELOW">Price ≤</option>
                            <option value="52W_HIGH">52W Breakout</option>
                        </select>
                    </div>
                    <div>
                        <label class="text-[#6e6e73] block mb-1">Price (₹)</label>
                        <input id="alertModalPrice" type="number" step="0.5" placeholder="2850" class="w-full px-2.5 py-1.5 rounded-lg border border-[rgba(0,0,0,0.12)] font-bold mono outline-none focus:border-[#007aff]">
                    </div>
                </div>
                <button onclick="handleCreateAlertSubmit()" class="w-full py-2 rounded-xl bg-[#007aff] hover:bg-[#0062cc] text-white font-bold text-xs transition-colors cursor-pointer">
                    + Activate Alert Watchdog
                </button>
            </div>

            <!-- Active Alerts List -->
            <div class="space-y-2">
                <div class="flex justify-between items-center text-xs">
                    <span class="font-semibold text-[#48484a]">Monitored Alerts</span>
                    <button onclick="clearTriggeredAlerts()" class="text-[#8e8e93] hover:text-[#1c1c1e] text-[11px] font-medium">Clear Triggered</button>
                </div>
                <div id="alertModalListContainer" class="space-y-1.5 max-h-48 overflow-y-auto pr-1"></div>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

function handleCreateAlertSubmit() {
    const sym = document.getElementById("alertModalSymbol").value.trim();
    const cond = document.getElementById("alertModalCondition").value;
    const price = parseFloat(document.getElementById("alertModalPrice").value);

    if (!sym || !price) {
        showNotification("Please provide both symbol and target price", "error");
        return;
    }

    addPriceAlert(sym.endsWith(".NS") ? sym : `${sym}.NS`, price, cond);
}

// Global Exports
window.playAlertChime = playAlertChime;
window.checkPriceAlerts = checkPriceAlerts;
window.addPriceAlert = addPriceAlert;
window.deletePriceAlert = deletePriceAlert;
window.clearTriggeredAlerts = clearTriggeredAlerts;
window.openAlertManagerModal = openAlertManagerModal;
window.closeAlertManagerModal = closeAlertManagerModal;
window.handleCreateAlertSubmit = handleCreateAlertSubmit;

// Initialize badge count on script load
document.addEventListener("DOMContentLoaded", updateAlertBadge);
