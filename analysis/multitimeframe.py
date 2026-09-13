"""
Multi-Timeframe Trend Confluence Matrix (MTF).
Evaluates trend alignment across 15-Minute (Intraday), 1-Hour (Swing),
Daily (Core), and Weekly (Macro) timeframes using persistent thread pooling
and authentic weekly resampling.
"""

from concurrent.futures import ThreadPoolExecutor
import pandas as pd
from data.fetcher import get_stock_history
from analysis.technical import calculate_ema, calculate_sma, calculate_rsi

# Persistent bounded executor for intraday & swing histories
_MTF_EXECUTOR = ThreadPoolExecutor(max_workers=6, thread_name_prefix="MTFWorker")


def evaluate_multitimeframe_confluence(symbol: str, daily_df: pd.DataFrame = None) -> dict:
    """
    Computes trend direction and momentum across 4 timeframes (15m, 1h, Daily, Weekly).
    Avoids redundant network calls by authentic weekly resampling from daily_df.
    """
    # 1. Daily Core Timeframe
    has_daily = False
    daily_tf = None
    df_1d = daily_df if (daily_df is not None and not daily_df.empty) else get_stock_history(symbol, period="1y", interval="1d")

    try:
        if df_1d is not None and not df_1d.empty and len(df_1d) >= 30:
            df_1d = df_1d.dropna(subset=["Close"])
            c = df_1d["Close"]
            sma50 = float(calculate_sma(c, min(50, len(c) - 1)).iloc[-1])
            sma200 = float(calculate_sma(c, min(200, len(c) - 1)).iloc[-1])
            rsi = float(calculate_rsi(c, 14).iloc[-1])
            latest = float(c.iloc[-1])

            is_bull = latest > sma50 and sma50 >= sma200
            is_bear = latest < sma50 and sma50 < sma200

            status = "BULLISH" if is_bull else ("BEARISH" if is_bear else "NEUTRAL")
            color = "#10B981" if is_bull else ("#EF4444" if is_bear else "#F59E0B")
            icon = "🟢" if is_bull else ("🔴" if is_bear else "🟡")

            daily_tf = {
                "timeframe": "Daily (Core)",
                "status": status,
                "color": color,
                "icon": icon,
                "detail": f"Price ₹{round(latest, 1)} > 50 SMA (₹{round(sma50, 1)})" if is_bull else f"Below 50 SMA (₹{round(sma50, 1)})",
                "is_bull": is_bull
            }
            has_daily = True
    except Exception:
        daily_tf = _fallback_timeframe("Daily (Core)")

    if not daily_tf:
        daily_tf = _fallback_timeframe("Daily (Core)")

    # 2. Fetch 15m and 1h intraday/swing histories concurrently via persistent executor
    f_15m = _MTF_EXECUTOR.submit(get_stock_history, symbol, "5d", "15m")
    f_1h = _MTF_EXECUTOR.submit(get_stock_history, symbol, "1mo", "1h")

    try:
        df_15m = f_15m.result(timeout=3.5)
    except Exception:
        df_15m = None

    try:
        df_1h = f_1h.result(timeout=3.5)
    except Exception:
        df_1h = None

    # 15-Minute Intraday Timeframe
    try:
        if df_15m is not None and not df_15m.empty and len(df_15m) >= 20:
            df_15m = df_15m.dropna(subset=["Close"])
            c_15m = df_15m["Close"]
            ema20 = float(calculate_ema(c_15m, 20).iloc[-1])
            ema50 = float(calculate_ema(c_15m, min(50, len(c_15m) - 1)).iloc[-1])
            rsi_15m = float(calculate_rsi(c_15m, 14).iloc[-1])
            latest_15m = float(c_15m.iloc[-1])

            is_bull_15m = latest_15m > ema20 and ema20 > ema50 and rsi_15m >= 48
            is_bear_15m = latest_15m < ema20 and ema20 < ema50 and rsi_15m <= 52

            status_15m = "BULLISH" if is_bull_15m else ("BEARISH" if is_bear_15m else "NEUTRAL")
            color_15m = "#10B981" if is_bull_15m else ("#EF4444" if is_bear_15m else "#F59E0B")
            icon_15m = "🟢" if is_bull_15m else ("🔴" if is_bear_15m else "🟡")
            summary_15m = f"₹{round(latest_15m, 1)} > 20 EMA, RSI {round(rsi_15m, 1)}" if is_bull_15m else f"RSI {round(rsi_15m, 1)}, 20 EMA ₹{round(ema20, 1)}"

            tf_15m = {
                "timeframe": "15M (Intraday)",
                "status": status_15m,
                "color": color_15m,
                "icon": icon_15m,
                "detail": summary_15m,
                "is_bull": is_bull_15m
            }
        else:
            tf_15m = _fallback_timeframe("15M (Intraday)")
    except Exception:
        tf_15m = _fallback_timeframe("15M (Intraday)")

    # 1-Hour Swing Timeframe
    try:
        if df_1h is not None and not df_1h.empty and len(df_1h) >= 20:
            df_1h = df_1h.dropna(subset=["Close"])
            c_1h = df_1h["Close"]
            ema20_1h = float(calculate_ema(c_1h, 20).iloc[-1])
            ema50_1h = float(calculate_ema(c_1h, min(50, len(c_1h) - 1)).iloc[-1])
            latest_1h = float(c_1h.iloc[-1])

            is_bull_1h = latest_1h > ema20_1h and ema20_1h > ema50_1h
            is_bear_1h = latest_1h < ema20_1h and ema20_1h < ema50_1h

            status_1h = "BULLISH" if is_bull_1h else ("BEARISH" if is_bear_1h else "NEUTRAL")
            color_1h = "#10B981" if is_bull_1h else ("#EF4444" if is_bear_1h else "#F59E0B")
            icon_1h = "🟢" if is_bull_1h else ("🔴" if is_bear_1h else "🟡")

            tf_1h = {
                "timeframe": "1H (Swing)",
                "status": status_1h,
                "color": color_1h,
                "icon": icon_1h,
                "detail": f"20 EMA (₹{round(ema20_1h, 1)}) vs 50 EMA",
                "is_bull": is_bull_1h
            }
        else:
            tf_1h = _fallback_timeframe("1H (Swing)")
    except Exception:
        tf_1h = _fallback_timeframe("1H (Swing)")

    # 4. Weekly Macro Timeframe (Authentic Weekly Resampling from daily_df)
    try:
        if df_1d is not None and not df_1d.empty and len(df_1d) >= 60:
            weekly_close = df_1d["Close"].resample("W-FRI").last().dropna()
            if len(weekly_close) >= 20:
                w_ema20 = float(calculate_ema(weekly_close, 20).iloc[-1])
                w_sma50 = float(calculate_sma(weekly_close, min(50, len(weekly_close) - 1)).iloc[-1])
                latest_w = float(weekly_close.iloc[-1])

                is_bull_w = latest_w > w_ema20 and w_ema20 >= w_sma50
                is_bear_w = latest_w < w_ema20

                status_w = "BULLISH" if is_bull_w else ("BEARISH" if is_bear_w else "NEUTRAL")
                color_w = "#10B981" if is_bull_w else ("#EF4444" if is_bear_w else "#F59E0B")
                icon_w = "🟢" if is_bull_w else ("🔴" if is_bear_w else "🟡")

                tf_1w = {
                    "timeframe": "Weekly (Macro)",
                    "status": status_w,
                    "color": color_w,
                    "icon": icon_w,
                    "detail": f"Macro Uptrend (Above 20 WMA ₹{round(w_ema20, 1)})" if is_bull_w else "Macro Pullback below 20 WMA",
                    "is_bull": is_bull_w
                }
            else:
                tf_1w = _fallback_timeframe("Weekly (Macro)")
        else:
            tf_1w = _fallback_timeframe("Weekly (Macro)")
    except Exception:
        tf_1w = _fallback_timeframe("Weekly (Macro)")

    timeframe_results = [tf_15m, tf_1h, daily_tf, tf_1w]

    # Overall Confluence Synthesis
    bull_count = sum([1 for t in timeframe_results if t.get("is_bull", False)])
    bear_count = sum([1 for t in timeframe_results if t.get("status") == "BEARISH"])

    if bull_count == 4:
        confluence_badge = "🔥 Quad-Bull Alignment (4/4)"
        confluence_color = "#10B981"
        verdict = "Maximum Trade Conviction: All 4 timeframes (15M, 1H, Daily, Weekly) point upwards in synchrony. High odds of rapid continuation."
    elif bull_count >= 3:
        confluence_badge = "🟢 Strong Multi-Timeframe Alignment (3/4)"
        confluence_color = "#007AFF"
        verdict = "Favorable Confluence: 3 out of 4 timeframes confirm trend direction. Suitable for standard swing and positional sizing."
    elif bear_count >= 3:
        confluence_badge = "🔴 Multi-Timeframe Breakdown (Bearish)"
        confluence_color = "#EF4444"
        verdict = "Downward Alignment: Higher timeframes are falling. Avoid buying dips until Daily and Weekly moving averages stabilize."
    else:
        confluence_badge = "🟡 Mixed / Timeframe Conflict"
        confluence_color = "#F59E0B"
        verdict = "Conflicting Signals: Intraday momentum differs from the Weekly macro trend. Trade with tighter stops or wait for breakout confirmation."

    return {
        "status": "success",
        "symbol": symbol,
        "confluence_badge": confluence_badge,
        "confluence_color": confluence_color,
        "confluence_score_pct": int((bull_count / 4) * 100),
        "bull_count": bull_count,
        "total_timeframes": 4,
        "verdict": verdict,
        "timeframes": timeframe_results
    }


def _fallback_timeframe(name: str) -> dict:
    return {
        "timeframe": name,
        "status": "NEUTRAL",
        "color": "#F59E0B",
        "icon": "⚪",
        "detail": "Data unavailable / Consolidation",
        "is_bull": False
    }
