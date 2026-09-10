"""
Nifty Market Breadth & Weekly Trend Engine.
Calculates percentage of stocks above 20, 50, and 200 EMAs to reveal internal market health.
Uses multithreading and TTL caching for instant rendering.
"""

import concurrent.futures
from cachetools import TTLCache
from data.stock_list import NIFTY_50_STOCKS
from data.fetcher import get_stock_history
from analysis.technical import calculate_ema

_breadth_cache = TTLCache(maxsize=5, ttl=300)


def _eval_breadth_single(s):
    sym = s["symbol"]
    try:
        df = get_stock_history(sym, period="1y", interval="1d")
        if df.empty or len(df) < 50:
            return None

        close = df["Close"]
        latest = float(close.iloc[-1])
        prev = float(close.iloc[-2]) if len(close) > 1 else latest

        ema20 = float(calculate_ema(close, 20).iloc[-1])
        ema50 = float(calculate_ema(close, 50).iloc[-1])
        ema200 = float(calculate_ema(close, 200).iloc[-1]) if len(df) >= 200 else ema50

        high_52w = float(df["High"].max())
        low_52w = float(df["Low"].min())
        is_52w_high = latest >= (high_52w * 0.985)
        is_52w_low = latest <= (low_52w * 1.015)

        return {
            "symbol": sym,
            "adv": latest > prev,
            "dec": latest < prev,
            "above_20": latest >= ema20,
            "above_50": latest >= ema50,
            "above_200": latest >= ema200,
            "is_52w_high": is_52w_high,
            "is_52w_low": is_52w_low
        }
    except Exception:
        return None


def calculate_market_breadth() -> dict:
    if "breadth" in _breadth_cache:
        return _breadth_cache["breadth"].copy()

    above_20 = 0
    above_50 = 0
    above_200 = 0
    advances = 0
    declines = 0
    unchanged = 0
    highs_52w = 0
    lows_52w = 0
    total = 0

    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as executor:
        futures = [executor.submit(_eval_breadth_single, s) for s in NIFTY_50_STOCKS]
        for f in concurrent.futures.as_completed(futures):
            res = f.result()
            if res:
                total += 1
                if res["adv"]: advances += 1
                elif res["dec"]: declines += 1
                else: unchanged += 1

                if res["above_20"]: above_20 += 1
                if res["above_50"]: above_50 += 1
                if res["above_200"]: above_200 += 1
                if res["is_52w_high"]: highs_52w += 1
                if res["is_52w_low"]: lows_52w += 1

    total = max(total, 1)
    pct_20 = round((above_20 / total) * 100, 1)
    pct_50 = round((above_50 / total) * 100, 1)
    pct_200 = round((above_200 / total) * 100, 1)
    ad_ratio = round(advances / max(declines, 1), 2)
    net_expansion = highs_52w - lows_52w

    if pct_50 >= 75:
        regime = "Overextended Bull Market"
        regime_desc = "Broad participation across sectors (>75% above 50 EMA). Guard against short-term exhaustion."
        regime_color = "#34D399"
        regime_badge = "🔥 Overextended Bull"
    elif pct_50 >= 55:
        regime = "Healthy Bullish Uptrend"
        regime_desc = "Strong internal market health with >55% of Nifty stocks in uptrends. Favorable for swing breakouts."
        regime_color = "#10B981"
        regime_badge = "🐂 Bullish Market"
    elif pct_50 >= 40:
        regime = "Neutral / Selective Market"
        regime_desc = "Selective environment. Focus strictly on top relative strength leaders in leading sectors."
        regime_color = "#F59E0B"
        regime_badge = "⚖️ Selective Neutral"
    else:
        regime = "Bearish Correction"
        regime_desc = "Majority of stocks are trading below 50 EMA. Cash preservation & tight risk limits are priority."
        regime_color = "#EF4444"
        regime_badge = "🐻 Bearish Regime"

    res = {
        "status": "success",
        "sample_size": total,
        "breadth": {
            "pct_above_20ema": pct_20,
            "pct_above_50ema": pct_50,
            "pct_above_200ema": pct_200,
        },
        "advance_decline": {
            "advances": advances,
            "declines": declines,
            "unchanged": unchanged,
            "ratio": ad_ratio
        },
        "new_highs_lows": {
            "highs_52w": highs_52w,
            "lows_52w": lows_52w,
            "net_expansion": net_expansion
        },
        "market_regime": {
            "name": regime,
            "badge": regime_badge,
            "color": regime_color,
            "description": regime_desc
        }
    }

    _breadth_cache["breadth"] = res
    return res
