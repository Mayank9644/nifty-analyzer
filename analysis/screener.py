"""
Operation Antigravity — High-Speed Multi-Metric Screener Engine.
Filters equities across P/E, ROE, RSI, Volume Surge, 52W High Breakouts,
and outputs Univest-grade actionable execution parameters.
"""

import concurrent.futures
from data.stock_list import NIFTY_50_STOCKS, POPULAR_ADDITIONAL_STOCKS
from data.fetcher import get_stock_info, get_stock_history
from analysis.technical import calculate_sma, calculate_rsi, calculate_atr
from data.institutional_flow import get_delivery_volume_analysis
from cachetools import TTLCache

_screener_cache = TTLCache(maxsize=100, ttl=900)
_SCREENER_EXECUTOR = concurrent.futures.ThreadPoolExecutor(max_workers=16, thread_name_prefix="ScreenerWorker")


def _eval_stock(item, pe_max, roe_min, rsi_min, rsi_max, near_52w_high, volume_surge, golden_cross_only):
    sym = item["symbol"]
    try:
        info = get_stock_info(sym)
        price = float(info.get("current_price") or info.get("previous_close") or 0.0)
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

        # Authentic delivery volume evaluation
        del_data = get_delivery_volume_analysis(sym, df, info)
        delivery_pct = del_data.get("delivery_pct", 50.0)

        # Univest-Grade Execution Action Parameters
        atr_series = calculate_atr(df, 14)
        atr_val = float(atr_series.iloc[-1]) if not atr_series.empty else price * 0.02
        stop_loss = round(max(price - (1.5 * atr_val), price * 0.94), 2)
        target_1 = round(price + (2.0 * atr_val), 2)
        target_2 = round(price + (3.5 * atr_val), 2)

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

        risk_per_share = max(price - stop_loss, price * 0.015)
        computed_qty = max(1, min(int(10000.0 / risk_per_share), int(150000.0 / price))) if price > 0 else 10

        from analysis.broker_bridge import generate_broker_order_links
        broker_ticket = generate_broker_order_links(
            symbol=sym,
            quantity=computed_qty,
            entry_price=price,
            stop_loss=stop_loss,
            target=target_1,
            order_type="LIMIT",
            product="CNC"
        )

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
            "delivery_pct": delivery_pct,
            "is_golden_cross": is_golden,
            "setup_score": score,
            "setup_tag": setup_tag,
            "tag_color": tag_color,
            "action_plan": {
                "entry_zone": f"₹{round(price * 0.995, 2)} – ₹{round(price * 1.005, 2)}",
                "stop_loss": stop_loss,
                "target_1": target_1,
                "target_2": target_2,
                "broker_ticket": broker_ticket
            }
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
    Filter Indian stocks using pooled concurrent execution.
    Prioritizes liquid index constituents and caches query results.
    """
    cache_key = f"scr_{pe_max}_{roe_min}_{rsi_min}_{rsi_max}_{near_52w_high}_{volume_surge}_{golden_cross_only}_{sector}"
    if cache_key in _screener_cache:
        return _screener_cache[cache_key]

    if sector and sector != "All":
        raw_univ = [s for s in (NIFTY_50_STOCKS + POPULAR_ADDITIONAL_STOCKS) if s.get("sector") == sector]
    else:
        raw_univ = NIFTY_50_STOCKS + POPULAR_ADDITIONAL_STOCKS[:25]

    seen_syms = set()
    universe = []
    for s in raw_univ:
        sym = s.get("symbol")
        if sym and sym not in seen_syms:
            seen_syms.add(sym)
            universe.append(s)

    matched_stocks = []
    futures = {
        _SCREENER_EXECUTOR.submit(
            _eval_stock,
            item, pe_max, roe_min, rsi_min, rsi_max, near_52w_high, volume_surge, golden_cross_only
        ): item for item in universe
    }

    timed_out = False
    try:
        for future in concurrent.futures.as_completed(futures, timeout=15.0):
            try:
                res = future.result()
                if res:
                    matched_stocks.append(res)
            except Exception:
                pass
    except concurrent.futures.TimeoutError:
        timed_out = True
        for f in futures:
            f.cancel()

    matched_stocks.sort(key=lambda x: x["setup_score"], reverse=True)
    result = {
        "status": "success",
        "total_matches": len(matched_stocks),
        "results": matched_stocks[:limit]
    }
    if matched_stocks and not timed_out:
        _screener_cache[cache_key] = result
    return result
