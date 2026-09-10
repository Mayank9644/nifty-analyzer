/**
 * 1-Click Multi-Broker Deep Order Gateway
 * Seamlessly integrates Zerodha Kite, Dhan Web, and Webhook Payloads
 */

let _currentBrokerData = null;

async function openBrokerModal(symbol, quantity = 1, price = 0, stopLoss = 0, target = 0) {
    if (!symbol) symbol = appState.currentSymbol || "RELIANCE.NS";
    
    // Ensure clean values
    quantity = Math.max(1, parseInt(quantity) || 1);
    price = parseFloat(price) || (appState.currentStockData ? (appState.currentStockData.current_price || 0) : 0);
    stopLoss = parseFloat(stopLoss) || 0;
    target = parseFloat(target) || 0;

    let modal = document.getElementById("brokerExecutionModal");
    if (!modal) {
        createBrokerModalDOM();
        modal = document.getElementById("brokerExecutionModal");
    }

    const titleEl = document.getElementById("brokerModalTitle");
    const summaryEl = document.getElementById("brokerModalSummary");
    const kiteBtn = document.getElementById("brokerKiteLink");
    const dhanBtn = document.getElementById("brokerDhanLink");
    const qtyInput = document.getElementById("brokerModalQty");
    const priceInput = document.getElementById("brokerModalPrice");
    const webhookText = document.getElementById("brokerModalWebhookCode");

    if (titleEl) titleEl.textContent = `⚡ 1-Click Broker Execution: ${symbol.replace('.NS', '')}`;
    if (qtyInput) qtyInput.value = quantity;
    if (priceInput) priceInput.value = price;

    try {
        const res = await fetch(`/api/broker/order-links?symbol=${encodeURIComponent(symbol)}&qty=${quantity}&price=${price}&sl=${stopLoss}&tgt=${target}`);
        const data = await res.json();
        _currentBrokerData = data;

        if (summaryEl) {
            summaryEl.innerHTML = `Order: <strong>BUY ${quantity} shares</strong> of <strong>${data.clean_symbol}</strong> on NSE @ <strong class="mono">₹${price.toLocaleString('en-IN')}</strong> (Est. Capital: <span class="text-[#007aff] font-bold">₹${(quantity * price).toLocaleString('en-IN')}</span>)`;
        }

        if (kiteBtn && data.broker_links && data.broker_links.zerodha_kite) {
            kiteBtn.href = data.broker_links.zerodha_kite.url;
        }

        if (dhanBtn && data.broker_links && data.broker_links.dhan) {
            dhanBtn.href = data.broker_links.dhan.url;
        }

        if (webhookText && data.webhook_payload) {
            webhookText.textContent = JSON.stringify(data.webhook_payload, null, 2);
        }
    } catch (err) {
        console.error("Failed to load broker links:", err);
        const clean = symbol.replace('.NS', '').toUpperCase();
        if (kiteBtn) kiteBtn.href = `https://kite.zerodha.com/market-depth?symbol=NSE:${clean}`;
        if (dhanBtn) dhanBtn.href = `https://web.dhan.co/?symbol=${clean}&exchange=NSE&qty=${quantity}&price=${price}`;
    }

    modal.classList.remove("hidden");
}

function updateBrokerModalInputs() {
    if (!_currentBrokerData) return;
    const qty = parseInt(document.getElementById("brokerModalQty").value) || 1;
    const price = parseFloat(document.getElementById("brokerModalPrice").value) || 0;
    openBrokerModal(_currentBrokerData.symbol, qty, price, _currentBrokerData.stop_loss, _currentBrokerData.target);
}

function closeBrokerModal() {
    const modal = document.getElementById("brokerExecutionModal");
    if (modal) modal.classList.add("hidden");
}

function copyBrokerWebhookPayload() {
    const codeEl = document.getElementById("brokerModalWebhookCode");
    if (codeEl && codeEl.textContent) {
        navigator.clipboard.writeText(codeEl.textContent).then(() => {
            showNotification("Webhook JSON copied to clipboard for OpenAlgo / AlgoTest!", "success");
        }).catch(() => {
            showNotification("Failed to copy webhook payload", "error");
        });
    }
}

function exportTradebookCSV() {
    window.location.href = "/api/journal/export";
    showNotification("Downloading tax-formatted Tradebook CSV...", "info");
}

function createBrokerModalDOM() {
    const div = document.createElement("div");
    div.id = "brokerExecutionModal";
    div.className = "fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 hidden";
    div.innerHTML = `
        <div class="macos-card bg-white w-full max-w-lg p-6 space-y-4 shadow-2xl relative">
            <button onclick="closeBrokerModal()" class="absolute top-4 right-4 text-[#8e8e93] hover:text-[#1c1c1e] text-lg font-bold">✕</button>
            
            <div class="flex items-center gap-3">
                <span class="text-2xl p-2 rounded-xl bg-[#007aff]/10 text-[#007aff]">⚡</span>
                <div>
                    <h3 id="brokerModalTitle" class="text-base font-bold text-[#1c1c1e]">1-Click Broker Execution</h3>
                    <p class="text-xs text-[#6e6e73]">Instant prefilled order tickets for leading Indian brokers</p>
                </div>
            </div>

            <div id="brokerModalSummary" class="p-3 rounded-xl bg-[#f8f8fa] text-xs text-[#48484a] border border-[rgba(0,0,0,0.04)]">
                Preparing order ticket...
            </div>

            <!-- Parameters Adjuster -->
            <div class="grid grid-cols-2 gap-3 text-xs">
                <div>
                    <label class="text-[#6e6e73] font-medium block mb-1">Quantity</label>
                    <input type="number" id="brokerModalQty" min="1" onchange="updateBrokerModalInputs()" class="w-full px-3 py-2 rounded-lg border border-[rgba(0,0,0,0.12)] font-bold mono outline-none focus:border-[#007aff]">
                </div>
                <div>
                    <label class="text-[#6e6e73] font-medium block mb-1">Limit Price (₹)</label>
                    <input type="number" id="brokerModalPrice" step="0.05" onchange="updateBrokerModalInputs()" class="w-full px-3 py-2 rounded-lg border border-[rgba(0,0,0,0.12)] font-bold mono outline-none focus:border-[#007aff]">
                </div>
            </div>

            <!-- Broker 1-Click Cards -->
            <div class="space-y-2.5 pt-1">
                <a id="brokerKiteLink" href="https://kite.zerodha.com" target="_blank" rel="noopener noreferrer" class="flex items-center justify-between p-3.5 rounded-xl border border-orange-200 bg-orange-50/60 hover:bg-orange-100/70 transition-all group">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">🪁</span>
                        <div>
                            <div class="text-xs font-bold text-orange-950 flex items-center gap-1.5">
                                Execute on Zerodha Kite
                                <span class="px-1.5 py-0.5 rounded text-[9.5px] bg-orange-200 text-orange-800 font-semibold">1-Click Depth</span>
                            </div>
                            <div class="text-[11px] text-orange-800/80">Opens Zerodha Kite with prefilled symbol & market depth</div>
                        </div>
                    </div>
                    <span class="text-orange-600 font-bold group-hover:translate-x-0.5 transition-transform">➔</span>
                </a>

                <a id="brokerDhanLink" href="https://web.dhan.co" target="_blank" rel="noopener noreferrer" class="flex items-center justify-between p-3.5 rounded-xl border border-purple-200 bg-purple-50/60 hover:bg-purple-100/70 transition-all group">
                    <div class="flex items-center gap-3">
                        <span class="text-2xl">🎯</span>
                        <div>
                            <div class="text-xs font-bold text-purple-950 flex items-center gap-1.5">
                                Execute on Dhan Web
                                <span class="px-1.5 py-0.5 rounded text-[9.5px] bg-purple-200 text-purple-800 font-semibold">Deep Link</span>
                            </div>
                            <div class="text-[11px] text-purple-800/80">Pre-populates order ticket with exact quantity and price</div>
                        </div>
                    </div>
                    <span class="text-purple-600 font-bold group-hover:translate-x-0.5 transition-transform">➔</span>
                </a>
            </div>

            <!-- Webhook Payload for Algo Automation -->
            <div class="pt-2 border-t border-[rgba(0,0,0,0.06)] space-y-1.5">
                <div class="flex justify-between items-center text-xs">
                    <span class="font-semibold text-[#6e6e73]">Automated Webhook Payload (OpenAlgo / TV):</span>
                    <button onclick="copyBrokerWebhookPayload()" class="text-[#007aff] hover:underline font-bold text-[11px] cursor-pointer">
                        📋 Copy JSON
                    </button>
                </div>
                <pre id="brokerModalWebhookCode" class="text-[10px] mono bg-[#1c1c1e] text-emerald-400 p-2.5 rounded-lg overflow-x-auto max-h-24"></pre>
            </div>
        </div>
    `;
    document.body.appendChild(div);
}

window.openBrokerModal = openBrokerModal;
window.closeBrokerModal = closeBrokerModal;
window.copyBrokerWebhookPayload = copyBrokerWebhookPayload;
window.exportTradebookCSV = exportTradebookCSV;
window.updateBrokerModalInputs = updateBrokerModalInputs;
