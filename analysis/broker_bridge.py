"""
Indian Broker Execution Bridge.
Generates 1-click order URLs and webhook payloads for Zerodha Kite and Dhan Web.
"""

import json
import urllib.parse


def generate_broker_order_links(
    symbol: str,
    quantity: int,
    entry_price: float,
    stop_loss: float = 0.0,
    target: float = 0.0,
    order_type: str = "LIMIT",
    product: str = "CNC"  # CNC (Delivery/Positional) or MIS (Intraday)
) -> dict:
    """
    Generates pre-populated execution links and webhook payloads for Indian brokers.
    """
    clean_sym = symbol.replace(".NS", "").replace(".BO", "").upper()
    exchange = "NSE"

    # 1. Zerodha Kite Basket / Deep Link
    kite_basket = [{
        "variety": "regular",
        "tradingsymbol": clean_sym,
        "exchange": exchange,
        "transaction_type": "BUY",
        "order_type": order_type,
        "quantity": int(quantity),
        "price": float(entry_price),
        "product": product
    }]

    kite_json_str = json.dumps(kite_basket)
    kite_url = f"https://kite.zerodha.com/market-depth?symbol={exchange}:{clean_sym}"

    # 2. Dhan Web Order Link
    dhan_params = {
        "symbol": clean_sym,
        "exchange": exchange,
        "qty": quantity,
        "price": entry_price,
        "orderType": order_type,
        "productType": product
    }
    dhan_url = f"https://web.dhan.co/?symbol={clean_sym}&exchange={exchange}&qty={quantity}&price={entry_price}"

    # 3. Standard Webhook Payload (For OpenAlgo, AlgoTest, or TradingView alerts)
    webhook_payload = {
        "action": "BUY",
        "symbol": clean_sym,
        "exchange": exchange,
        "quantity": quantity,
        "entry_price": entry_price,
        "stop_loss": stop_loss,
        "target": target,
        "product": product,
        "tag": "MarketAnalysisTerminal"
    }

    return {
        "status": "success",
        "symbol": symbol,
        "clean_symbol": clean_sym,
        "exchange": exchange,
        "quantity": quantity,
        "entry_price": entry_price,
        "stop_loss": stop_loss,
        "target": target,
        "product": product,
        "broker_links": {
            "zerodha_kite": {
                "name": "Zerodha Kite",
                "icon": "🪁",
                "url": kite_url,
                "label": f"Buy {quantity} shares on Kite @ ₹{entry_price}"
            },
            "dhan": {
                "name": "Dhan",
                "icon": "🎯",
                "url": dhan_url,
                "label": f"Buy {quantity} shares on Dhan @ ₹{entry_price}"
            }
        },
        "webhook_payload": webhook_payload
    }
