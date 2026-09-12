"""
Position Advisor Engine — Deep Analysis for Active Journal Positions.
Given a position (symbol, entry price, quantity, SL, target), fetches current
market data and runs a multi-factor analysis to generate a precise
BUY MORE / HOLD / PARTIAL EXIT / SELL recommendation with full calculations.

Factors analyzed:
1. Price vs Entry (unrealized P&L %, drawdown)
2. Distance to Stop Loss vs Target (R:R remaining)
3. RSI (14) — overbought/oversold
4. MACD momentum direction
5. 50 DMA and 200 DMA trend regime
6. Volume trend (accumulation vs distribution)
7. ATR-based volatility (is SL still valid?)
8. Fundamental health grade (P/E, ROE, D/E)
9. Shareholding — promoter trend
10. Days held — time in trade analysis
"""

import pandas as pd
import numpy as np
from datetime import datetime, date
from data.fetcher import get_stock_history, get_stock_info, get_shareholding
from analysis.technical import (
    calculate_sma, calculate_rsi, calculate_macd,
    calculate_bollinger_bands, calculate_atr, calculate_adx
)
from analysis.fundamental import evaluate_fundamentals
from config import STYLE_EXECUTION_PARAMS


def _safe_float(val, default=0.0):
    try:
        v = float(val)
        return v if not (np.isnan(v) or np.isinf(v)) else default
    except Exception:
        return default


def analyze_position(trade: dict) -> dict:
    """
    Returns a full advice report for one journal position.
    """
    symbol    = trade.get("symbol", "RELIANCE.NS")
    entry     = _safe_float(trade.get("entry_price", 0))
    quantity  = int(trade.get("quantity", 1))
    sl        = _safe_float(trade.get("stop_loss", 0))
    target1   = _safe_float(trade.get("target_1", 0))
    target2   = _safe_float(trade.get("target_2", 0))
    entry_date_str = trade.get("entry_date", "")

    # ── Days in trade ──
    days_held = 0
    try:
        edt = datetime.strptime(entry_date_str, "%Y-%m-%d").date()
        days_held = (date.today() - edt).days
    except Exception:
        pass

    # ── Fetch market data ──
    info        = get_stock_info(symbol)
    shareholding = get_shareholding(symbol)
    fundamentals = evaluate_fundamentals(info, shareholding)
    hist_df     = get_stock_history(symbol, period="1y", interval="1d")

    current_price = _safe_float(info.get("current_price", entry), entry)

    scores   = {}   # factor_name → numeric score -3..+3
    details  = []   # list of detail strings shown to user

    # ── 1. Unrealized P&L ──
    pnl_pct = ((current_price - entry) / entry * 100) if entry else 0
    investment = entry * quantity
    unrealized_pnl = (current_price - entry) * quantity
    details.append({"factor": "Unrealized P&L", "value": f"{'+' if pnl_pct >= 0 else ''}{pnl_pct:.2f}%  (₹{unrealized_pnl:+,.0f})", "icon": "📊"})

    # ── 2. R:R Remaining (how much upside vs downside left) ──
    remaining_upside  = ((target1 - current_price) / current_price * 100) if target1 and current_price else 0
    remaining_risk    = ((current_price - sl)   / current_price * 100) if sl and current_price else 0
    rr_remaining = (remaining_upside / remaining_risk) if remaining_risk > 0.1 else (remaining_upside * 10)

    if rr_remaining >= 2.5:
        scores["rr"] = +3
        rr_label = f"Excellent — {rr_remaining:.1f}:1 (Target has {remaining_upside:.1f}% upside, only {remaining_risk:.1f}% to SL)"
    elif rr_remaining >= 1.5:
        scores["rr"] = +2
        rr_label = f"Good — {rr_remaining:.1f}:1 R:R remaining"
    elif rr_remaining >= 0.8:
        scores["rr"] = 0
        rr_label = f"Neutral — {rr_remaining:.1f}:1 R:R (borderline)"
    elif rr_remaining >= 0:
        scores["rr"] = -2
        rr_label = f"Poor — {rr_remaining:.1f}:1 R:R (target far, SL near)"
    else:
        scores["rr"] = -3
        rr_label = f"Danger — Price below entry, SL at risk"
    details.append({"factor": "Risk:Reward Remaining", "value": rr_label, "icon": "⚖️"})

    # ── 3. Technicals ──
    if hist_df is not None and not hist_df.empty and len(hist_df) >= 20:
        hist_df = hist_df.dropna(subset=["Close"])
        close = hist_df["Close"]
        volume = hist_df["Volume"] if "Volume" in hist_df else None

        rsi = _safe_float(calculate_rsi(close, 14).iloc[-1], 50)
        sma50 = _safe_float(calculate_sma(close, 50).iloc[-1], current_price)
        sma200_series = calculate_sma(close, 200) if len(close) >= 200 else calculate_sma(close, min(len(close)-1, 100))
        sma200 = _safe_float(sma200_series.iloc[-1], current_price)

        macd_line, signal_line, histogram = calculate_macd(close)
        macd_val  = _safe_float(macd_line.iloc[-1], 0)
        signal_val= _safe_float(signal_line.iloc[-1], 0)
        hist_val  = _safe_float(histogram.iloc[-1], 0)
        prev_hist = _safe_float(histogram.iloc[-2] if len(histogram) >= 2 else 0, 0)

        atr = _safe_float(calculate_atr(hist_df, 14).iloc[-1], current_price * 0.02)

        # RSI score
        if rsi < 30:
            scores["rsi"] = +2
            rsi_comment = f"Oversold ({rsi:.0f}) — potential bounce / accumulation zone"
        elif rsi < 45:
            scores["rsi"] = +1
            rsi_comment = f"Mild oversold ({rsi:.0f}) — recovering momentum"
        elif rsi < 55:
            scores["rsi"] = 0
            rsi_comment = f"Neutral ({rsi:.0f}) — no directional bias"
        elif rsi < 70:
            scores["rsi"] = +1
            rsi_comment = f"Bullish momentum ({rsi:.0f}) — trend intact"
        else:
            scores["rsi"] = -1
            rsi_comment = f"Overbought ({rsi:.0f}) — take partial profits, watch for reversal"
        details.append({"factor": "RSI (14)", "value": f"{rsi:.1f} — {rsi_comment}", "icon": "📈"})

        # MACD score
        macd_bullish = macd_val > signal_val
        hist_expanding = hist_val > prev_hist if macd_bullish else hist_val < prev_hist
        if macd_bullish and hist_expanding:
            scores["macd"] = +2
            macd_comment = f"Bullish crossover with expanding histogram — strong momentum"
        elif macd_bullish:
            scores["macd"] = +1
            macd_comment = f"MACD above signal — bullish but momentum softening"
        elif not macd_bullish and not hist_expanding:
            scores["macd"] = -2
            macd_comment = f"Bearish crossover with expanding bearish histogram — exit pressure"
        else:
            scores["macd"] = -1
            macd_comment = f"MACD below signal — weak momentum, caution"
        details.append({"factor": "MACD", "value": macd_comment, "icon": "🌊"})

        # Trend regime (200 DMA)
        above_200 = current_price > sma200
        above_50  = current_price > sma50
        if above_200 and above_50:
            scores["trend"] = +3
            trend_comment = f"Stage 2 Uptrend — price above both 50 DMA (₹{sma50:.0f}) and 200 DMA (₹{sma200:.0f})"
        elif above_200 and not above_50:
            scores["trend"] = +1
            trend_comment = f"Consolidating — above 200 DMA (₹{sma200:.0f}) but below 50 DMA (₹{sma50:.0f})"
        elif not above_200 and above_50:
            scores["trend"] = -1
            trend_comment = f"Caution — above 50 DMA but below 200 DMA (₹{sma200:.0f}) — potential distribution"
        else:
            scores["trend"] = -3
            trend_comment = f"Stage 4 Downtrend — price below both MAs. 200 DMA: ₹{sma200:.0f}"
        details.append({"factor": "Trend Regime (DMA)", "value": trend_comment, "icon": "📉"})

        # Volume score
        if volume is not None and len(volume) >= 20:
            avg_vol = float(volume.tail(20).mean())
            recent_vol = float(volume.iloc[-1])
            vol_ratio = recent_vol / avg_vol if avg_vol > 0 else 1.0
            if vol_ratio >= 1.5 and pnl_pct >= 0:
                scores["volume"] = +2
                vol_comment = f"Volume surge {vol_ratio:.1f}x avg — institutional buying confirmed"
            elif vol_ratio >= 1.2:
                scores["volume"] = +1
                vol_comment = f"Above average volume {vol_ratio:.1f}x — moderate interest"
            elif vol_ratio >= 0.7:
                scores["volume"] = 0
                vol_comment = f"Normal volume {vol_ratio:.1f}x average"
            else:
                scores["volume"] = -1
                vol_comment = f"Low volume ({vol_ratio:.1f}x avg) — weak conviction, possible false move"
        else:
            scores["volume"] = 0
            vol_comment = "Volume data unavailable"
        details.append({"factor": "Volume Pattern", "value": vol_comment, "icon": "📊"})

        # ATR-based SL validity
        atr_pct = (atr / current_price * 100) if current_price else 2.0
        sl_distance_pct = ((current_price - sl) / current_price * 100) if sl and current_price else 0
        if sl_distance_pct > 0 and sl_distance_pct < atr_pct * 0.5:
            scores["sl_valid"] = -2
            sl_comment = f"SL too tight! SL is ₹{sl:.0f} ({sl_distance_pct:.1f}% away) but ATR = ₹{atr:.0f} ({atr_pct:.1f}%). Risk of being stopped out by noise."
        elif sl_distance_pct <= 0:
            scores["sl_valid"] = -3
            sl_comment = f"⚠️ SL BREACHED — price (₹{current_price:.0f}) is below your stop loss (₹{sl:.0f}). Consider exiting."
        else:
            scores["sl_valid"] = +1
            sl_comment = f"SL at ₹{sl:.0f} is {sl_distance_pct:.1f}% away (ATR-based cushion: {atr_pct:.1f}%) — valid"
        details.append({"factor": "Stop Loss Validity", "value": sl_comment, "icon": "🛡️"})

    else:
        scores.update({"rsi": 0, "macd": 0, "trend": 0, "volume": 0, "sl_valid": 0})
        rsi = 50

    # ── 4. Fundamentals ──
    fund_score_raw = _safe_float(fundamentals.get("score", 50), 50)
    fund_grade = fundamentals.get("grade", "C")
    roe = _safe_float(fundamentals.get("roe", 0), 0)
    pe  = _safe_float(fundamentals.get("pe_ratio", 20), 20)
    de  = _safe_float(fundamentals.get("debt_to_equity", 1), 1)

    if fund_score_raw >= 75:
        scores["fundamentals"] = +2
        fund_comment = f"Grade {fund_grade} ({fund_score_raw:.0f}/100) — Strong quality. ROE {roe:.1f}%, P/E {pe:.1f}x"
    elif fund_score_raw >= 55:
        scores["fundamentals"] = +1
        fund_comment = f"Grade {fund_grade} ({fund_score_raw:.0f}/100) — Decent quality. ROE {roe:.1f}%"
    elif fund_score_raw >= 35:
        scores["fundamentals"] = -1
        fund_comment = f"Grade {fund_grade} ({fund_score_raw:.0f}/100) — Below average. D/E: {de:.2f}"
    else:
        scores["fundamentals"] = -2
        fund_comment = f"Grade {fund_grade} ({fund_score_raw:.0f}/100) — Weak fundamentals. High risk."
    details.append({"factor": "Fundamental Health", "value": fund_comment, "icon": "🏢"})

    # ── 5. Promoter holding trend ──
    promoter_pct = _safe_float(shareholding.get("promoter", 0), 0)
    fii_pct      = _safe_float(shareholding.get("fii", 0), 0)
    if promoter_pct >= 55:
        scores["promoter"] = +2
        prom_comment = f"Strong promoter confidence — {promoter_pct:.1f}% held. FII: {fii_pct:.1f}%"
    elif promoter_pct >= 40:
        scores["promoter"] = +1
        prom_comment = f"Good promoter holding {promoter_pct:.1f}% — institutional confidence present"
    elif promoter_pct > 0:
        scores["promoter"] = 0
        prom_comment = f"Low promoter holding ({promoter_pct:.1f}%) — watch for dilution risk"
    else:
        scores["promoter"] = 0
        prom_comment = "Shareholding data not available"
    details.append({"factor": "Promoter / Shareholding", "value": prom_comment, "icon": "👥"})

    # ── 6. Days held analysis ──
    if days_held <= 2:
        scores["time"] = 0
        time_comment = f"Just entered ({days_held}d) — too early to judge, let it work"
    elif days_held <= 10:
        scores["time"] = 0
        time_comment = f"{days_held} days in trade — within normal swing timeframe"
    elif days_held <= 30:
        if pnl_pct >= 5:
            scores["time"] = +1
            time_comment = f"{days_held} days — delivering returns (+{pnl_pct:.1f}%), on track"
        elif pnl_pct >= 0:
            scores["time"] = 0
            time_comment = f"{days_held} days — flat performance, consider if thesis still holds"
        else:
            scores["time"] = -1
            time_comment = f"{days_held} days — still losing after 10+ days, re-evaluate thesis"
    else:
        if pnl_pct >= 15:
            scores["time"] = +2
            time_comment = f"{days_held} days — excellent holding, compounding gains (+{pnl_pct:.1f}%)"
        elif pnl_pct >= 0:
            scores["time"] = -1
            time_comment = f"{days_held} days — {pnl_pct:.1f}% gain, consider if capital better deployed elsewhere"
        else:
            scores["time"] = -2
            time_comment = f"{days_held} days losing — capital being eroded, exit risk high"
    details.append({"factor": "Time in Trade", "value": time_comment, "icon": "⏱️"})

    # ── TOTAL SCORE ──
    total_score = sum(scores.values())
    max_possible = len(scores) * 3

    # ── Volatility-Adjusted Trailing Stop & Breakeven Rule ──
    trade_style = str(trade.get("style") or "swing").lower()
    style_cfg = STYLE_EXECUTION_PARAMS.get(trade_style, STYLE_EXECUTION_PARAMS["swing"])
    stop_mult = style_cfg.get("stop_atr_mult", 1.5)
    pos_atr = atr if "atr" in locals() and atr > 0 else (current_price * 0.02)
    trailing_stop_atr = round(current_price - (stop_mult * pos_atr), 2)

    hit_target1 = target1 > 0 and current_price >= target1
    breakeven_sl = max(sl, entry)

    # ── FINAL VERDICT & UNIVEST 3-TIER MULTI-TRANCHE GUIDANCE ──
    if total_score >= 10:
        verdict   = "BUY MORE"
        verdict_icon = "🟢"
        verdict_color = "#059669"
        advice_class = "advice-badge-buy"
        confidence = min(99, int(70 + (total_score / max_possible) * 30))
        explanation = (
            f"All major technical and flow signals align bullishly. The stock is in an uptrend, "
            f"technicals are strong (RSI {rsi:.0f}), fundamentals are solid "
            f"(Grade {fund_grade}), and your R:R is still favourable. "
            f"Averaging up (adding {max(1, quantity // 2)} more units near ₹{current_price:.0f}) "
            f"can compound returns toward Target ₹{target1:.0f}."
        )
        action_steps = [
            f"Add {max(1, quantity // 2)} units near CMP ₹{current_price:.0f}",
            f"Anchor stop loss at ₹{max(sl, trailing_stop_atr):.0f} (ATR-adjusted)",
            f"Tranche 1: Book 50% at Target 1 (₹{target1:.0f}) & shift SL to Entry (₹{entry:.0f})",
            f"Tranche 2: Target 2 (₹{target2:.0f})" if target2 else f"Tranche 2: Target 2 (+{remaining_upside * 1.5:.1f}%)"
        ]
    elif total_score >= 5:
        verdict   = "HOLD"
        verdict_icon = "🟡"
        verdict_color = "#d97706"
        advice_class = "advice-badge-hold"
        confidence = min(90, int(50 + (total_score / max_possible) * 30))
        explanation = (
            f"The trade thesis is intact with steady progress. Trend regime is "
            f"{'favourable' if scores.get('trend', 0) > 0 else 'neutral'}. "
            f"{'Target 1 reached: Lock stop loss to Breakeven (₹' + str(int(entry)) + '). ' if hit_target1 else ''}"
            f"Hold current {quantity} units with stop at ₹{breakeven_sl if hit_target1 else max(sl, trailing_stop_atr):.0f}. "
            f"Do NOT add new capital until breakout score improves to 10+."
        )
        recommended_sl = breakeven_sl if hit_target1 else max(sl, trailing_stop_atr)
        action_steps = [
            f"Hold {quantity} units — no new capital addition",
            f"Lock stop loss at ₹{recommended_sl:.0f} {'(Breakeven Activated)' if hit_target1 else '(Trailing ATR)'}",
            f"Tranche 1: De-risk 50% at Target 1 (₹{target1:.0f})" if target1 else None,
            f"Tranche 3 Runner: Trail along 21 EMA or ATR stop"
        ]
    elif total_score >= 0:
        verdict   = "PARTIAL EXIT"
        verdict_icon = "🟠"
        verdict_color = "#ea580c"
        advice_class = "advice-badge-hold"
        confidence = min(85, int(40 + abs(total_score / max_possible) * 30))
        exit_qty = max(1, quantity // 2)
        realized_lock = (current_price - entry) * exit_qty
        explanation = (
            f"Momentum signals are deteriorating (Score: {total_score}). The remaining risk exceeds upside. "
            f"Selling half ({exit_qty} units) at ₹{current_price:.0f} locks in P&L "
            f"of ₹{realized_lock:+,.0f} while keeping partial exposure."
        )
        action_steps = [
            f"Sell {exit_qty} of {quantity} units immediately at CMP ₹{current_price:.0f}",
            f"Lock in ₹{realized_lock:+,.0f} net realized P&L",
            f"Tighten stop loss on remaining {quantity - exit_qty} units to ₹{max(sl, trailing_stop_atr):.0f}",
            "Review full liquidation if price breaks below 50 DMA"
        ]
    else:
        verdict   = "EXIT / SELL"
        verdict_icon = "🔴"
        verdict_color = "#dc2626"
        advice_class = "advice-badge-sell"
        confidence = min(95, int(60 + abs(total_score / max_possible) * 30))
        loss_at_exit = (current_price - entry) * quantity
        explanation = (
            f"Multiple quantitative factors are against this position (Score: {total_score}). "
            f"{'Stop loss has been breached! ' if scores.get('sl_valid', 0) <= -3 else ''}"
            f"Technicals show bearish breakdown. Exit now at ₹{current_price:.0f} to limit loss to ₹{loss_at_exit:+,.0f}. "
            f"Capital can be redeployed into higher-conviction setups."
        )
        action_steps = [
            f"Exit ALL {quantity} units at market price ₹{current_price:.0f}",
            f"Final realized P&L on exit: ₹{loss_at_exit:+,.0f}",
            "Do NOT average down — this trade has failed its thesis",
            "Preserve remaining capital for setups meeting 10+ score"
        ]

    action_steps = [s for s in action_steps if s]

    # ── Score breakdown for display ──
    score_breakdown = [
        {"name": "R:R Remaining",          "score": scores.get("rr", 0),           "max": 3},
        {"name": "RSI Momentum",            "score": scores.get("rsi", 0),          "max": 2},
        {"name": "MACD Direction",          "score": scores.get("macd", 0),         "max": 2},
        {"name": "Trend Regime (DMA)",      "score": scores.get("trend", 0),        "max": 3},
        {"name": "Volume Pattern",          "score": scores.get("volume", 0),       "max": 2},
        {"name": "SL Validity",             "score": scores.get("sl_valid", 0),     "max": 1},
        {"name": "Fundamental Quality",     "score": scores.get("fundamentals", 0), "max": 2},
        {"name": "Promoter Confidence",     "score": scores.get("promoter", 0),     "max": 2},
        {"name": "Time in Trade",           "score": scores.get("time", 0),         "max": 2},
    ]

    return {
        "status": "success",
        "symbol": symbol,
        "code": symbol.replace(".NS", "").replace(".BO", ""),
        "verdict": verdict,
        "verdict_icon": verdict_icon,
        "verdict_color": verdict_color,
        "advice_class": advice_class,
        "confidence": confidence,
        "total_score": total_score,
        "max_score": max_possible,
        "explanation": explanation,
        "action_steps": action_steps,
        "details": details,
        "score_breakdown": score_breakdown,
        "metrics": {
            "current_price": round(current_price, 2),
            "entry_price": round(entry, 2),
            "pnl_pct": round(pnl_pct, 2),
            "unrealized_pnl": round(unrealized_pnl, 2),
            "investment": round(investment, 2),
            "days_held": days_held,
            "remaining_upside_pct": round(remaining_upside, 2),
            "remaining_risk_pct": round(remaining_risk, 2),
            "rr_remaining": round(rr_remaining, 2),
            "trailing_stop_atr": round(trailing_stop_atr, 2),
            "breakeven_active": hit_target1
        }
    }
