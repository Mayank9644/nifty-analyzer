"""
SEPA V4 Alpha-Momentum Live Scanner with Position Sizing Engine.
Implements Mark Minervini's Trend Template + Breakout Entries, ATR Stops, and 2R/3R Targets.
Uses concurrent execution and in-memory TTL caching for instant responses.
"""

import math
import concurrent.futures
from cachetools import TTLCache
import pandas as pd
import numpy as np
from data.stock_list import NIFTY_50_STOCKS, POPULAR_ADDITIONAL_STOCKS
from data.fetcher import get_stock_history
from analysis.technical import calculate_sma, calculate_ema, calculate_atr, calculate_rsi

_scanner_cache = TTLCache(maxsize=10, ttl=300)


def _eval_single_stock(stock, max_risk_amount, capital):
    symbol = stock["symbol"]
    code = stock["code"]
    name = stock["name"]
    sector = stock["sector"]

    try:
        df = get_stock_history(symbol, period="1y", interval="1d")
        if df.empty or len(df) < 50:
            return None

        close = df["Close"]
        high = df["High"]
        low = df["Low"]
        volume = df["Volume"]

        latest_close = float(close.iloc[-1])
        if latest_close <= 0:
            return None

        sma50 = float(calculate_sma(close, 50).iloc[-1])
        sma200 = float(calculate_sma(close, 200).iloc[-1]) if len(df) >= 200 else sma50

        atr_series = calculate_atr(df, 14)
        atr_val = float(atr_series.iloc[-1]) if not atr_series.empty else latest_close * 0.02

        rsi_series = calculate_rsi(close, 14)
        rsi_val = float(rsi_series.iloc[-1])

        high_52 = float(high.max())
        low_52 = float(low.min())
        dist_to_52h = ((high_52 - latest_close) / high_52) * 100

        vol_sma20 = float(calculate_sma(volume, 20).iloc[-1]) if len(df) >= 20 else float(volume.iloc[-1])
        vol_ratio = float(volume.iloc[-1]) / vol_sma20 if vol_sma20 > 0 else 1.0

        cond1 = latest_close >= sma50
        cond2 = sma50 >= sma200 * 0.95
        cond3 = dist_to_52h <= 28.0
        cond4 = latest_close >= (low_52 * 1.20)
        cond5 = 45 <= rsi_val <= 75

        score = 0
        if cond1: score += 25
        if cond2: score += 20
        if cond3: score += 20
        if cond4: score += 15
        if cond5: score += 10
        if vol_ratio >= 1.2: score += 10

        if score >= 40:
            entry_price = round(latest_close, 2)
            stop_loss = round(max(entry_price - (1.5 * atr_val), entry_price * 0.94), 2)
            risk_per_share = max(entry_price - stop_loss, entry_price * 0.015)
            risk_pct_stock = round((risk_per_share / entry_price) * 100, 2)

            quantity = math.floor(max_risk_amount / risk_per_share)
            max_allowed_qty = math.floor((capital * 0.25) / entry_price)
            if quantity > max_allowed_qty:
                quantity = max_allowed_qty
            quantity = max(1, quantity)

            position_value = round(quantity * entry_price, 2)
            actual_risk_amount = round(quantity * risk_per_share, 2)

            target_2r = round(entry_price + (2.0 * risk_per_share), 2)
            target_3r = round(entry_price + (3.0 * risk_per_share), 2)
            reward_2r_pct = round(((target_2r - entry_price) / entry_price) * 100, 2)
            reward_3r_pct = round(((target_3r - entry_price) / entry_price) * 100, 2)

            pattern = "VCP Breakout" if dist_to_52h <= 10 else ("Pullback to 50 SMA" if abs(latest_close - sma50) / latest_close <= 0.03 else "Trend Continuation")

            return {
                "symbol": symbol,
                "code": code,
                "name": name,
                "sector": sector,
                "score": score,
                "pattern": pattern,
                "current_price": entry_price,
                "stop_loss": stop_loss,
                "stop_loss_pct": risk_pct_stock,
                "target_2r": target_2r,
                "target_2r_pct": reward_2r_pct,
                "target_3r": target_3r,
                "target_3r_pct": reward_3r_pct,
                "atr": round(atr_val, 2),
                "rsi": round(rsi_val, 1),
                "vol_ratio": round(vol_ratio, 2),
                "dist_52h": round(dist_to_52h, 1),
                "sizing": {
                    "shares_to_buy": quantity,
                    "position_value": position_value,
                    "position_pct_capital": round((position_value / capital) * 100, 1),
                    "max_risk_rupees": actual_risk_amount
                }
            }
    except Exception:
        pass
    return None


def scan_alpha_momentum(capital: float = 1000000.0, risk_pct: float = 2.0, top_n: int = 15, force_refresh: bool = False) -> dict:
    cache_key = f"scan_{capital}_{risk_pct}"
    if not force_refresh and cache_key in _scanner_cache:
        cached = _scanner_cache[cache_key]
        if cached.get("results") and len(cached["results"]) > 0:
            return cached.copy()

    max_risk_amount = capital * (risk_pct / 100.0)
    universe = NIFTY_50_STOCKS + POPULAR_ADDITIONAL_STOCKS[:8]

    candidates = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(_eval_single_stock, s, max_risk_amount, capital) for s in universe]
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            if res:
                candidates.append(res)

    candidates.sort(key=lambda x: (x["score"], -x["dist_52h"]), reverse=True)
    top_candidates = candidates[:top_n]

    result = {
        "status": "success",
        "capital": capital,
        "risk_pct": risk_pct,
        "max_risk_per_trade": max_risk_amount,
        "total_scanned": len(universe),
        "total_qualified": len(candidates),
        "results": top_candidates
    }

    # Only cache if we got positive qualified candidates (never cache empty runs)
    if candidates:
        _scanner_cache[cache_key] = result

    return result
