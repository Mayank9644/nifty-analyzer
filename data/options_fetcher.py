"""
Options and F&O data fetcher for NSE indices and equities.
Fetches official option chains with resilient session handling and fallback simulation.
"""

import requests
import json
import math
import numpy as np
from cachetools import TTLCache
from config import CACHE_TTL
from data.fetcher import get_stock_info

_options_cache = TTLCache(maxsize=50, ttl=180)  # 3 minute cache

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Accept": "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Referer": "https://www.nseindia.com/option-chain",
}


def _get_nse_session():
    """Create a session that has NSE homepage cookies."""
    session = requests.Session()
    session.headers.update(HEADERS)
    try:
        session.get("https://www.nseindia.com", timeout=5)
    except Exception as e:
        print(f"Warning: Could not initiate NSE session: {e}")
    return session


def fetch_nse_option_chain_raw(symbol: str) -> dict:
    """
    Attempt to fetch real option chain JSON from official NSE endpoint.
    """
    clean_sym = symbol.replace(".NS", "").replace("^", "").strip().upper()
    is_index = clean_sym in ["NIFTY", "BANKNIFTY", "FINNIFTY", "MIDCPNIFTY"]

    url = (
        f"https://www.nseindia.com/api/option-chain-indices?symbol={clean_sym}"
        if is_index
        else f"https://www.nseindia.com/api/option-chain-equities?symbol={clean_sym}"
    )

    try:
        session = _get_nse_session()
        response = session.get(url, timeout=6)
        if response.status_code == 200:
            return response.json()
    except Exception as e:
        print(f"NSE Live Option Chain request failed ({symbol}): {e}")

    return {}


def generate_modeled_option_chain(symbol: str, spot_price: float) -> dict:
    """
    High-fidelity mathematical model of options chain when NSE is off-hours or rate-limited.
    Generates realistic strikes around spot with Black-Scholes approximate premiums,
    bell-curve Open Interest distribution, and realistic PCR.
    """
    if spot_price <= 0:
        spot_price = 24500.0 if "NIFTY" in symbol else 1300.0

    # Determine strike step
    if spot_price > 40000:
        step = 100
    elif spot_price > 10000:
        step = 50
    elif spot_price > 2000:
        step = 20
    elif spot_price > 500:
        step = 10
    else:
        step = 5

    atm_strike = round(spot_price / step) * step
    strikes = [atm_strike + i * step for i in range(-12, 13)]

    records = []
    base_iv = 0.13  # 13% IV typical for Nifty

    for strike in strikes:
        moneyness = (strike - spot_price) / spot_price
        # Call pricing approximation
        intrinsic_call = max(0.0, spot_price - strike)
        time_value_call = spot_price * base_iv * math.sqrt(7 / 365.0) * math.exp(-0.5 * (moneyness / 0.04) ** 2)
        call_ltp = round(intrinsic_call + max(time_value_call, 1.5), 1)

        # Put pricing approximation
        intrinsic_put = max(0.0, strike - spot_price)
        time_value_put = spot_price * base_iv * math.sqrt(7 / 365.0) * math.exp(-0.5 * (moneyness / 0.04) ** 2)
        put_ltp = round(intrinsic_put + max(time_value_put, 1.5), 1)

        # Open Interest distribution (calls peak above spot, puts peak below spot)
        call_oi_weight = math.exp(-0.5 * ((strike - (atm_strike + step * 2)) / (step * 4)) ** 2)
        put_oi_weight = math.exp(-0.5 * ((strike - (atm_strike - step * 2)) / (step * 4)) ** 2)

        call_oi = int(120000 * call_oi_weight + np.random.randint(5000, 20000))
        put_oi = int(135000 * put_oi_weight + np.random.randint(5000, 20000))

        records.append({
            "strikePrice": strike,
            "expiryDate": "Current Expiry",
            "CE": {
                "strikePrice": strike,
                "lastPrice": call_ltp,
                "openInterest": call_oi,
                "changeinOpenInterest": int(call_oi * 0.08),
                "totalTradedVolume": int(call_oi * 1.5),
                "impliedVolatility": round((base_iv + abs(moneyness) * 0.1) * 100, 2)
            },
            "PE": {
                "strikePrice": strike,
                "lastPrice": put_ltp,
                "openInterest": put_oi,
                "changeinOpenInterest": int(put_oi * 0.09),
                "totalTradedVolume": int(put_oi * 1.4),
                "impliedVolatility": round((base_iv + abs(moneyness) * 0.12) * 100, 2)
            }
        })

    return {
        "records": {
            "expiryDates": ["Current Expiry", "Next Week", "Monthly Expiry"],
            "data": records,
            "underlyingValue": spot_price,
            "is_modeled": True
        }
    }


def calculate_max_pain(records: list, spot_price: float) -> dict:
    """
    Computes Strike Max Pain, total Call/Put Open Interest, and Put-Call Ratio (PCR).
    Max pain represents the strike price where option sellers lose the least money at expiry.
    """
    if not records:
        return {"max_pain": round(spot_price, 2), "pcr": 1.0, "sentiment": "Neutral"}

    strikes = []
    call_oi_map = {}
    put_oi_map = {}
    total_call_oi = 0
    total_put_oi = 0

    for item in records:
        strike = item.get("strikePrice")
        if not strike:
            continue
        strikes.append(strike)
        ce = item.get("CE", {})
        pe = item.get("PE", {})
        c_oi = int(ce.get("openInterest", 0) or 0)
        p_oi = int(pe.get("openInterest", 0) or 0)
        call_oi_map[strike] = c_oi
        put_oi_map[strike] = p_oi
        total_call_oi += c_oi
        total_put_oi += p_oi

    if not strikes:
        return {"max_pain": round(spot_price, 2), "pcr": 1.0, "sentiment": "Neutral"}

    strikes = sorted(set(strikes))
    min_loss = float("inf")
    max_pain_strike = spot_price

    for s in strikes:
        call_loss = sum(call_oi_map.get(k, 0) * max(0.0, s - k) for k in strikes)
        put_loss = sum(put_oi_map.get(k, 0) * max(0.0, k - s) for k in strikes)
        total_loss = call_loss + put_loss
        if total_loss < min_loss:
            min_loss = total_loss
            max_pain_strike = s

    pcr = round(total_put_oi / total_call_oi, 2) if total_call_oi > 0 else 1.0
    if pcr > 1.2:
        sentiment = "Bullish (Heavy Put Writing Support)"
    elif pcr < 0.7:
        sentiment = "Bearish (Heavy Call Writing Overhead)"
    else:
        sentiment = "Rangebound / Consolidation"

    max_call_strike = max(call_oi_map, key=call_oi_map.get) if call_oi_map else max_pain_strike
    max_put_strike = max(put_oi_map, key=put_oi_map.get) if put_oi_map else max_pain_strike

    return {
        "max_pain": float(max_pain_strike),
        "total_call_oi": total_call_oi,
        "total_put_oi": total_put_oi,
        "pcr": pcr,
        "sentiment": sentiment,
        "major_resistance_strike": float(max_call_strike),
        "major_support_strike": float(max_put_strike),
    }


def get_option_chain_data(symbol: str) -> dict:
    """
    Get clean parsed option chain data with caching and Max Pain analysis.
    """
    clean_sym = symbol.replace(".NS", "").replace("^", "").strip().upper()
    if clean_sym in ("NSEI", "NIFTY50"):
        clean_sym = "NIFTY"
    elif clean_sym in ("NSEBANK", "BANK"):
        clean_sym = "BANKNIFTY"
    cache_key = f"opt_{clean_sym}"
    if cache_key in _options_cache:
        return _options_cache[cache_key].copy()

    # Try live NSE fetch first
    raw_data = fetch_nse_option_chain_raw(clean_sym)
    underlying = 0.0
    records = []
    expiry_dates = []

    if raw_data and "records" in raw_data and "data" in raw_data["records"]:
        underlying = raw_data["records"].get("underlyingValue", 0.0)
        expiry_dates = raw_data["records"].get("expiryDates", [])
        records = raw_data["records"].get("data", [])
        is_modeled = False
    else:
        # Fallback to model using yfinance spot price
        stock_sym = "^NSEI" if clean_sym == "NIFTY" else ("^NSEBANK" if clean_sym == "BANKNIFTY" else f"{clean_sym}.NS")
        info = get_stock_info(stock_sym)
        underlying = info.get("current_price", 0.0)
        modeled = generate_modeled_option_chain(clean_sym, underlying)
        records = modeled["records"]["data"]
        expiry_dates = modeled["records"]["expiryDates"]
        is_modeled = True

    max_pain_info = calculate_max_pain(records, underlying)

    parsed_result = {
        "symbol": clean_sym,
        "underlying_price": round(underlying, 2),
        "expiry_dates": expiry_dates,
        "chain": records,
        "is_modeled": is_modeled,
        "max_pain": max_pain_info
    }

    _options_cache[cache_key] = parsed_result
    return parsed_result.copy()
