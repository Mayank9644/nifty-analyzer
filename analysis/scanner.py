"""
Operation Antigravity — SEPA V4 Alpha-Momentum Scanner with Univest Position Sizing.
Implements Mark Minervini's Trend Template, Volatility-Adjusted Entry Ranges,
ATR Stops, and 3-Tier Multi-Tranche Targets (1.5R, 2.5R, 4.0R).
"""

import math
import concurrent.futures
from cachetools import TTLCache
import pandas as pd
import numpy as np
from config import MAX_SINGLE_STOCK_CAP_PCT, MAX_PORTFOLIO_RISK_PCT
from data.stock_list import NIFTY_50_STOCKS, POPULAR_ADDITIONAL_STOCKS
from data.fetcher import get_stock_history
from analysis.technical import calculate_sma, calculate_atr, calculate_rsi
from data.institutional_flow import get_delivery_volume_analysis

_scanner_cache = TTLCache(maxsize=10, ttl=300)
_SCANNER_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=8, thread_name_prefix="ScannerWorker")


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
        dist_to_52h = ((high_52 - latest_close) / high_52) * 100.0

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
            entry_low = round(entry_price - (0.3 * atr_val), 2)
            entry_high = round(entry_price + (0.3 * atr_val), 2)

            stop_loss = round(max(entry_price - (1.5 * atr_val), entry_price * 0.94), 2)
            risk_per_share = max(entry_price - stop_loss, entry_price * 0.015)
            risk_pct_stock = round((risk_per_share / entry_price) * 100.0, 2)

            # Institutional Position Sizing (Capped at MAX_SINGLE_STOCK_CAP_PCT = 15%)
            raw_quantity = math.floor(max_risk_amount / risk_per_share)
            max_allowed_qty = math.floor((capital * (MAX_SINGLE_STOCK_CAP_PCT / 100.0)) / entry_price)
            quantity = min(raw_quantity, max_allowed_qty)
            quantity = max(1, quantity)

            position_value = round(quantity * entry_price, 2)
            actual_risk_amount = round(quantity * risk_per_share, 2)

            # Univest 3-Tier Targets
            target_1 = round(entry_price + (1.5 * risk_per_share), 2)
            target_2 = round(entry_price + (2.5 * risk_per_share), 2)
            target_3 = round(entry_price + (4.0 * risk_per_share), 2)

            reward_1_pct = round(((target_1 - entry_price) / entry_price) * 100.0, 2)
            reward_2_pct = round(((target_2 - entry_price) / entry_price) * 100.0, 2)
            reward_3_pct = round(((target_3 - entry_price) / entry_price) * 100.0, 2)

            del_info = get_delivery_volume_analysis(symbol, df)
            delivery_pct = del_info.get("delivery_pct", 50.0)

            pattern = "VCP Breakout" if dist_to_52h <= 10 else ("Pullback to 50 SMA" if abs(latest_close - sma50) / latest_close <= 0.03 else "Trend Continuation")

            return {
                "symbol": symbol,
                "code": code,
                "name": name,
                "sector": sector,
                "score": score,
                "pattern": pattern,
                "current_price": entry_price,
                "entry_range": [entry_low, entry_high],
                "entry_range_str": f"₹{entry_low:.2f} – ₹{entry_high:.2f}",
                "stop_loss": stop_loss,
                "stop_loss_pct": risk_pct_stock,
                "target_2r": target_2,
                "target_2r_pct": reward_2_pct,
                "target_3r": target_3,
                "target_3r_pct": reward_3_pct,
                "targets_tranches": [
                    {"tranche": "T1 (1.5R - 50% De-Risk)", "price": target_1, "gain_pct": reward_1_pct, "allocation_pct": 50},
                    {"tranche": "T2 (2.5R - 30% Profit)", "price": target_2, "gain_pct": reward_2_pct, "allocation_pct": 30},
                    {"tranche": "T3 (Runner - 20% Trailing)", "price": target_3, "gain_pct": reward_3_pct, "allocation_pct": 20}
                ],
                "atr": round(atr_val, 2),
                "rsi": round(rsi_val, 1),
                "vol_ratio": round(vol_ratio, 2),
                "delivery_pct": delivery_pct,
                "dist_52h": round(dist_to_52h, 1),
                "sizing": {
                    "shares_to_buy": quantity,
                    "position_value": position_value,
                    "position_pct_capital": round((position_value / capital) * 100.0, 1),
                    "max_risk_rupees": actual_risk_amount,
                    "allocation_capped": bool(quantity < raw_quantity)
                }
            }
    except Exception:
        pass
    return None


def scan_alpha_momentum(capital: float = 1000000.0, risk_pct: float = 2.0, top_n: int = 15, force_refresh: bool = False) -> dict:
    """
    Run SEPA Alpha-Momentum scan across Indian universe using persistent thread pool.
    """
    cache_key = f"scan_{capital}_{risk_pct}"
    if not force_refresh and cache_key in _scanner_cache:
        cached = _scanner_cache[cache_key]
        if cached.get("results") and len(cached["results"]) > 0:
            return cached.copy()

    effective_risk_pct = min(risk_pct, MAX_PORTFOLIO_RISK_PCT)
    max_risk_amount = capital * (effective_risk_pct / 100.0)
    seen_syms = set()
    universe = []
    for s in (NIFTY_50_STOCKS + POPULAR_ADDITIONAL_STOCKS[:8]):
        sym = s.get("symbol")
        if sym and sym not in seen_syms:
            seen_syms.add(sym)
            universe.append(s)

    candidates = []
    futures = [_SCANNER_EXECUTOR.submit(_eval_single_stock, s, max_risk_amount, capital) for s in universe]
    try:
        for f in concurrent.futures.as_completed(futures, timeout=15.0):
            try:
                res = f.result()
                if res:
                    candidates.append(res)
            except Exception:
                pass
    except concurrent.futures.TimeoutError:
        for f in futures:
            f.cancel()

    candidates.sort(key=lambda x: (x["score"], -x["dist_52h"]), reverse=True)
    top_candidates = candidates[:top_n]

    result = {
        "status": "success",
        "capital": capital,
        "risk_pct": effective_risk_pct,
        "max_risk_per_trade": max_risk_amount,
        "total_scanned": len(universe),
        "total_qualified": len(candidates),
        "results": top_candidates
    }

    if candidates:
        _scanner_cache[cache_key] = result

    return result
