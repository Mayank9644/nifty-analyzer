"""
High-Speed Stock Screener Engine for Indian Equities.
Allows multi-parameter filtering across P/E, ROE, RSI, Volume Surge, and 52W High breakouts.
Uses ThreadPoolExecutor for sub-second concurrent scanning.
"""

import concurrent.futures
from data.stock_list import NIFTY_50_STOCKS, POPULAR_ADDITIONAL_STOCKS
from data.fetcher import get_stock_info, get_stock_history
from analysis.technical import calculate_sma, calculate_rsi
from cachetools import TTLCache

_screener_cache = TTLCache(maxsize=50, ttl=180)


def _eval_stock(item, pe_max, roe_min, rsi_min, rsi_max, near_52w_high, volume_surge, golden_cross_only):
    sym = item["symbol"]
    try:
        info = get_stock_info(sym)
        price = info.get("current_price", 0.0)
        if price <= 0:
            return None

        pe = float(info.get("pe_ratio", 0.0) or 0.0)
        roe = float(info.get("roe", 0.0) or 0.0)
        high_52w = float(info.get("fifty_two_week_high", price) or price)
        dist_52w_high = round(((high_52w - price) / high_52w) * 100, 1) if high_52w > 0 else 0.0

        if pe_max is not None and pe_max > 0:
            if pe <= 0 or pe > pe_max:
                return None

        if roe_min is not None and roe_min > 0:
            if roe < roe_min:
                return None

        if near_52w_high and dist_52w_high > 15.0:
            return None

        df = get_stock_history(sym, period="6mo", interval="1d")
        if df.empty or len(df) < 25:
            return None

        close = df["Close"]
        vol = df["Volume"]

        rsi_series = calculate_rsi(close, 14)
        rsi = round(float(rsi_series.iloc[-1]), 1)

        vol_sma20 = calculate_sma(vol, 20)
        current_vol = float(vol.iloc[-1])
        avg_vol = float(vol_sma20.iloc[-1]) if len(vol_sma20) >= 20 and vol_sma20.iloc[-1] > 0 else current_vol
        vol_ratio = round((current_vol / avg_vol), 2) if avg_vol > 0 else 1.0

        sma50 = float(calculate_sma(close, 50).iloc[-1]) if len(close) >= 50 else float(close.mean())
        sma200 = float(calculate_sma(close, 200).iloc[-1]) if len(close) >= 200 else sma50
        is_golden = sma50 >= sma200

        if rsi_min is not None and rsi < rsi_min:
            return None
        if rsi_max is not None and rsi > rsi_max:
            return None

        if volume_surge and vol_ratio < 1.15:
            return None

        if golden_cross_only and not is_golden:
            return None

        # Setup scoring
        score = 50
        if dist_52w_high <= 5.0:
            score += 15
        if vol_ratio >= 1.4:
            score += 15
        if 50 <= rsi <= 68:
            score += 10
        if roe >= 18:
            score += 10
        score = min(score, 98)

        if dist_52w_high <= 4.0 and vol_ratio >= 1.4:
            setup_tag = "🔥 High-Volume 52W Breakout"
            tag_color = "bg-[#edf7ee] text-[#1e7e34] border-[#c6e8cc]"
        elif roe >= 20 and (0 < pe <= 30):
            setup_tag = "💎 Quality Compounder"
            tag_color = "bg-[#eff6ff] text-[#007aff] border-[#bfdbfe]"
        elif rsi < 42:
            setup_tag = "🎯 Oversold Dip / Rebound"
            tag_color = "bg-[#fef6ed] text-[#8a4500] border-[#fcdcb8]"
        else:
            setup_tag = "📈 Trend Continuation"
            tag_color = "bg-[#f5f5f7] text-[#1c1c1e] border-[#d1d1d6]"

        return {
            "symbol": sym,
            "code": item.get("code", sym),
            "name": item.get("name", sym),
            "sector": item.get("sector", "Equities"),
            "current_price": price,
            "day_change_pct": info.get("day_change_pct", 0.0),
            "pe_ratio": pe,
            "roe": roe,
            "rsi": rsi,
            "dist_52w_high_pct": dist_52w_high,
            "volume_ratio": vol_ratio,
            "is_golden_cross": is_golden,
            "setup_score": score,
            "setup_tag": setup_tag,
            "tag_color": tag_color
        }
    except Exception:
        return None


def run_stock_screener(
    pe_max: float = None,
    roe_min: float = None,
    rsi_min: float = None,
    rsi_max: float = None,
    near_52w_high: bool = False,
    volume_surge: bool = False,
    golden_cross_only: bool = False,
    sector: str = "All",
    limit: int = 25
) -> dict:
    """
    Filter Indian stocks using concurrent thread execution.
    """
    cache_key = f"scr_{pe_max}_{roe_min}_{rsi_min}_{rsi_max}_{near_52w_high}_{volume_surge}_{golden_cross_only}_{sector}"
    if cache_key in _screener_cache:
        return _screener_cache[cache_key]

    universe = NIFTY_50_STOCKS + POPULAR_ADDITIONAL_STOCKS
    if sector and sector != "All":
        universe = [s for s in universe if s.get("sector") == sector]

    candidates = universe
    matched_stocks = []

    with concurrent.futures.ThreadPoolExecutor(max_workers=12) as executor:
        futures = {
            executor.submit(
                _eval_stock,
                item, pe_max, roe_min, rsi_min, rsi_max, near_52w_high, volume_surge, golden_cross_only
            ): item for item in candidates
        }
        for future in concurrent.futures.as_completed(futures):
            try:
                res = future.result(timeout=2.5)
                if res:
                    matched_stocks.append(res)
            except Exception:
                pass

    matched_stocks.sort(key=lambda x: x["setup_score"], reverse=True)
    result = {
        "status": "success",
        "total_matches": len(matched_stocks),
        "results": matched_stocks[:limit]
    }
    if matched_stocks:
        _screener_cache[cache_key] = result
    return result

