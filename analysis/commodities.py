"""
Commodity-specific analytics and macro relationship engine.
Includes Gold-Silver ratio, USD/INR impact, and commodity buy/sell signals.
"""

from data.commodity_fetcher import get_commodity_info, get_all_commodities_overview, get_commodity_history, get_usd_inr_rate
from analysis.technical import analyze_technicals
import pandas as pd


def analyze_commodity(symbol: str) -> dict:
    """
    Complete analysis of a commodity:
    - Current price in USD and INR
    - Technical indicators
    - Gold-Silver ratio (if gold or silver)
    - Currency sensitivity analysis
    - Signal (Buy / Hold / Sell) with layman reasoning
    """
    info = get_commodity_info(symbol)
    history = get_commodity_history(symbol, period="1y", interval="1d")

    if not history or len(history) < 20:
        return {"status": "error", "message": "Insufficient price data"}

    df = pd.DataFrame(history)
    technicals = analyze_technicals(df)

    # Commodity Specific Signal Engine
    score = 0
    reasons = []

    # 1. Moving Averages
    ma = technicals.get("moving_averages", {})
    if ma.get("status") == "bullish":
        score += 2
        reasons.append("Price is trading above key long-term moving averages (strong uptrend).")
    elif ma.get("status") == "bearish":
        score -= 2
        reasons.append("Price is trading below key moving averages (downtrend).")

    # 2. RSI
    rsi = technicals.get("rsi", {})
    rsi_val = rsi.get("value", 50)
    if rsi_val < 35:
        score += 2
        reasons.append(f"RSI is oversold at {rsi_val} — selling pressure has dried up.")
    elif rsi_val > 70:
        score -= 1
        reasons.append(f"RSI is overbought at {rsi_val} — temporary pullback likely.")
    elif 50 <= rsi_val <= 65:
        score += 1
        reasons.append(f"RSI is {rsi_val} showing sustained positive momentum.")

    # 3. MACD
    macd = technicals.get("macd", {})
    if macd.get("status") == "bullish":
        score += 1
        reasons.append("MACD momentum is positive with green histogram bars.")
    elif macd.get("status") == "bearish":
        score -= 1
        reasons.append("MACD momentum is negative.")

    # 4. Currency Impact (INR)
    usd_inr = get_usd_inr_rate()
    if usd_inr > 83.0:
        score += 1
        reasons.append(f"USD/INR is at ₹{round(usd_inr, 2)} — currency depreciation acts as a floor for Indian domestic commodity prices.")

    # Verdict
    if score >= 3:
        verdict = "BUY"
        verdict_color = "#10B981"
        summary = "Favorable technical setup with upward price momentum and supportive currency trends."
    elif score <= -2:
        verdict = "SELL / AVOID"
        verdict_color = "#EF4444"
        summary = "Technical breakdown — price under pressure from moving averages and negative momentum."
    else:
        verdict = "HOLD / NEUTRAL"
        verdict_color = "#F59E0B"
        summary = "Consolidation phase — wait for a clearer breakout before entering fresh positions."

    # Gold-Silver Ratio Calculation
    ratio_data = None
    if info.get("code") in ["GOLD", "SILVER"]:
        gold_info = get_commodity_info("GC=F")
        silver_info = get_commodity_info("SI=F")
        if gold_info["price_usd"] > 0 and silver_info["price_usd"] > 0:
            gs_ratio = round(gold_info["price_usd"] / silver_info["price_usd"], 1)
            if gs_ratio > 82:
                ratio_verdict = "Silver is historically undervalued relative to Gold (Silver outperformance expected)."
            elif gs_ratio < 65:
                ratio_verdict = "Gold is historically undervalued relative to Silver."
            else:
                ratio_verdict = "Gold/Silver ratio is in a normal historical equilibrium band (65-80)."
            ratio_data = {
                "ratio": gs_ratio,
                "verdict": ratio_verdict
            }

    return {
        "status": "success",
        "info": info,
        "signal": {
            "verdict": verdict,
            "score": score,
            "color": verdict_color,
            "summary": summary,
            "reasons": reasons
        },
        "technicals": technicals,
        "gold_silver_ratio": ratio_data
    }
