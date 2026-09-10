"""
Ensemble Prediction Engine for BUY, HOLD, and SELL Signals.
Provides tailored signals for Intraday, Swing, Positional, and F&O trading styles
with plain-English explanations that any beginner can understand.
"""


def generate_signals(
    info: dict,
    technicals: dict,
    fundamentals: dict,
    shareholding: dict,
    style: str = "swing",
    options_summary: dict = None
) -> dict:
    """
    Generate transparent, multi-indicator consensus prediction based on chosen trading style.
    """
    current_price = info.get("current_price", 0.0)
    risk_levels = technicals.get("risk_levels", {})

    signals_list = []
    bullish_count = 0
    bearish_count = 0
    neutral_count = 0

    ma = technicals.get("moving_averages", {})
    rsi = technicals.get("rsi", {})
    macd = technicals.get("macd", {})
    bb = technicals.get("bollinger", {})
    vol = technicals.get("volume", {})
    adx = technicals.get("adx", {})
    vwap = technicals.get("vwap", {})
    f_grade = fundamentals.get("grade", "B")

    # -------------------------------------------------------------
    # 1. Moving Average Trend Signal
    # -------------------------------------------------------------
    if ma.get("status") == "bullish":
        signals_list.append({
            "name": "Moving Average Trend",
            "icon": "📈",
            "verdict": "BUY",
            "weight": 2,
            "color": "#10B981",
            "explanation": f"Price (₹{current_price}) is trading safely above the 50-day and 200-day moving averages. Long-term trend is upward."
        })
        bullish_count += 1
    elif ma.get("status") == "bearish":
        signals_list.append({
            "name": "Moving Average Trend",
            "icon": "📉",
            "verdict": "SELL",
            "weight": -2,
            "color": "#EF4444",
            "explanation": f"Price (₹{current_price}) is below major moving averages. Trend is downward."
        })
        bearish_count += 1
    else:
        signals_list.append({
            "name": "Moving Average Trend",
            "icon": "➡️",
            "verdict": "HOLD",
            "weight": 0,
            "color": "#F59E0B",
            "explanation": "Price is hovering around moving averages with no clear directional trend."
        })
        neutral_count += 1

    # -------------------------------------------------------------
    # 2. RSI (Momentum / Overbought / Oversold)
    # -------------------------------------------------------------
    rsi_val = rsi.get("value", 50)
    if rsi_val < 32:
        signals_list.append({
            "name": "RSI Momentum",
            "icon": "⚡",
            "verdict": "BUY",
            "weight": 2,
            "color": "#10B981",
            "explanation": f"RSI is {rsi_val} (Oversold). Panic selling is overdone, creating a prime bargain rebound opportunity."
        })
        bullish_count += 1
    elif rsi_val > 72:
        signals_list.append({
            "name": "RSI Momentum",
            "icon": "⚠️",
            "verdict": "SELL",
            "weight": -1,
            "color": "#EF4444",
            "explanation": f"RSI is {rsi_val} (Overbought). The rally is heated; avoid chasing and lock in profits or wait for a pullback."
        })
        bearish_count += 1
    elif 50 <= rsi_val <= 68:
        signals_list.append({
            "name": "RSI Momentum",
            "icon": "⚡",
            "verdict": "BUY",
            "weight": 1,
            "color": "#10B981",
            "explanation": f"RSI is {rsi_val} (Healthy Bullish). Price is advancing with steady, sustainable buying momentum."
        })
        bullish_count += 1
    else:
        signals_list.append({
            "name": "RSI Momentum",
            "icon": "➡️",
            "verdict": "HOLD",
            "weight": 0,
            "color": "#F59E0B",
            "explanation": f"RSI is {rsi_val} (Neutral). Momentum is balanced."
        })
        neutral_count += 1

    # -------------------------------------------------------------
    # 3. MACD Momentum
    # -------------------------------------------------------------
    if macd.get("status") == "bullish":
        signals_list.append({
            "name": "MACD Crossover",
            "icon": "🌊",
            "verdict": "BUY",
            "weight": 1,
            "color": "#10B981",
            "explanation": "MACD line crossed above the signal line. Short-term speed is outpacing long-term drift."
        })
        bullish_count += 1
    elif macd.get("status") == "bearish":
        signals_list.append({
            "name": "MACD Crossover",
            "icon": "🌊",
            "verdict": "SELL",
            "weight": -1,
            "color": "#EF4444",
            "explanation": "MACD is below signal line with negative histogram bars indicating selling pressure."
        })
        bearish_count += 1
    else:
        signals_list.append({
            "name": "MACD Crossover",
            "icon": "➡️",
            "verdict": "HOLD",
            "weight": 0,
            "color": "#F59E0B",
            "explanation": "MACD momentum is flat."
        })
        neutral_count += 1

    # -------------------------------------------------------------
    # 4. Volume & Institutional Action
    # -------------------------------------------------------------
    vol_status = vol.get("status", "neutral")
    vol_ratio = vol.get("ratio", 1.0)
    if vol_status == "bullish":
        signals_list.append({
            "name": "Institutional Volume",
            "icon": "🏢",
            "verdict": "BUY",
            "weight": 2,
            "color": "#10B981",
            "explanation": f"Volume exploded {vol_ratio}x above average on an advancing candle — Big money / institutions are actively accumulating!"
        })
        bullish_count += 1
    elif vol_status == "bearish":
        signals_list.append({
            "name": "Institutional Volume",
            "icon": "🏢",
            "verdict": "SELL",
            "weight": -2,
            "color": "#EF4444",
            "explanation": f"High volume selling ({vol_ratio}x average). Big funds are offloading shares."
        })
        bearish_count += 1
    else:
        signals_list.append({
            "name": "Institutional Volume",
            "icon": "➡️",
            "verdict": "HOLD",
            "weight": 0,
            "color": "#F59E0B",
            "explanation": f"Routine trading activity ({vol_ratio}x 20-day average volume)."
        })
        neutral_count += 1

    # -------------------------------------------------------------
    # 5. Volatility / Bollinger Bands
    # -------------------------------------------------------------
    bb_status = bb.get("status", "neutral")
    if bb_status == "bullish":
        signals_list.append({
            "name": "Bollinger Bands",
            "icon": "🎯",
            "verdict": "BUY",
            "weight": 1,
            "color": "#10B981",
            "explanation": f"Price dipped to Lower Bollinger Band (₹{bb.get('lower')}). Good mean-reversion risk-reward zone."
        })
        bullish_count += 1
    elif bb_status == "bearish":
        signals_list.append({
            "name": "Bollinger Bands",
            "icon": "🎯",
            "verdict": "SELL",
            "weight": -1,
            "color": "#EF4444",
            "explanation": f"Price is hitting Upper Bollinger Band resistance (₹{bb.get('upper')}). Stretched valuation."
        })
        bearish_count += 1
    else:
        signals_list.append({
            "name": "Bollinger Bands",
            "icon": "➡️",
            "verdict": "HOLD",
            "weight": 0,
            "color": "#F59E0B",
            "explanation": "Price is comfortably oscillating within standard volatility channels."
        })
        neutral_count += 1

    # -------------------------------------------------------------
    # 6. Style-Specific Factor:
    # - Intraday: VWAP
    # - Positional: Fundamental Grade & Promoter
    # - Swing: ADX Trend Strength
    # -------------------------------------------------------------
    if style == "intraday":
        vwap_status = vwap.get("status", "neutral")
        if vwap_status == "bullish":
            signals_list.append({
                "name": "Intraday VWAP Benchmark",
                "icon": "⚡",
                "verdict": "BUY",
                "weight": 2,
                "color": "#10B981",
                "explanation": f"Price is trading above VWAP (₹{vwap.get('value')}). Intraday bulls are dominant."
            })
            bullish_count += 1
        else:
            signals_list.append({
                "name": "Intraday VWAP Benchmark",
                "icon": "⚡",
                "verdict": "SELL",
                "weight": -2,
                "color": "#EF4444",
                "explanation": f"Price is trading below VWAP (₹{vwap.get('value')}). Intraday sellers are in charge."
            })
            bearish_count += 1
    elif style == "positional":
        if f_grade in ["A+", "A"]:
            signals_list.append({
                "name": "Business Health & Moat",
                "icon": "🛡️",
                "verdict": "BUY",
                "weight": 2,
                "color": "#10B981",
                "explanation": f"Elite Quality Grade '{f_grade}'. Strong return on capital and safe low debt balance sheet."
            })
            bullish_count += 1
        elif f_grade in ["B+", "B"]:
            signals_list.append({
                "name": "Business Health & Moat",
                "icon": "🛡️",
                "verdict": "HOLD",
                "weight": 0,
                "color": "#F59E0B",
                "explanation": f"Satisfactory Grade '{f_grade}'. Stable company with moderate valuation."
            })
            neutral_count += 1
        else:
            signals_list.append({
                "name": "Business Health & Moat",
                "icon": "🛡️",
                "verdict": "SELL",
                "weight": -2,
                "color": "#EF4444",
                "explanation": f"Weak Grade '{f_grade}'. Fragile balance sheet or deteriorating profitability."
            })
            bearish_count += 1
    else:  # Swing
        adx_status = adx.get("status", "neutral")
        adx_val = adx.get("value", 20)
        if adx_status == "bullish" and adx_val >= 22:
            signals_list.append({
                "name": "ADX Trend Strength",
                "icon": "🚀",
                "verdict": "BUY",
                "weight": 1,
                "color": "#10B981",
                "explanation": f"ADX is {adx_val} confirming high trending power in the upward direction."
            })
            bullish_count += 1
        elif adx_status == "bearish" and adx_val >= 22:
            signals_list.append({
                "name": "ADX Trend Strength",
                "icon": "🚀",
                "verdict": "SELL",
                "weight": -1,
                "color": "#EF4444",
                "explanation": f"ADX is {adx_val} confirming strong downward trend intensity."
            })
            bearish_count += 1
        else:
            signals_list.append({
                "name": "ADX Trend Strength",
                "icon": "➡️",
                "verdict": "HOLD",
                "weight": 0,
                "color": "#F59E0B",
                "explanation": f"ADX is {adx_val} (Weak Trend) — Stock is oscillating sideways."
            })
            neutral_count += 1

    # -------------------------------------------------------------
    # Calculate Total Ensemble Score & Final Verdict
    # -------------------------------------------------------------
    total_score = sum(s["weight"] for s in signals_list)
    total_signals = len(signals_list)

    if total_score >= 4:
        final_verdict = "STRONG BUY"
        final_color = "#10B981"
        pill_bg = "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
        summary_verdict = f"High-conviction BUY ({bullish_count} of {total_signals} indicators bullish). Setup favors strong upward continuation."
    elif total_score >= 1:
        final_verdict = "BUY"
        final_color = "#34D399"
        pill_bg = "bg-green-500/20 text-green-400 border-green-500/40"
        summary_verdict = f"Favorable BUY setup ({bullish_count} bullish indicators vs {bearish_count} bearish). Good entry point with disciplined stop-loss."
    elif total_score <= -4:
        final_verdict = "STRONG SELL"
        final_color = "#EF4444"
        pill_bg = "bg-red-500/20 text-red-400 border-red-500/40"
        summary_verdict = f"Bearish breakdown ({bearish_count} of {total_signals} indicators bearish). High risk of further decline; avoid new longs."
    elif total_score <= -1:
        final_verdict = "SELL / TAKE PROFIT"
        final_color = "#F87171"
        pill_bg = "bg-rose-500/20 text-rose-400 border-rose-500/40"
        summary_verdict = f"Weakening momentum. Consider tightening stop-losses, booking partial gains, or standing aside."
    else:
        final_verdict = "HOLD / WAIT"
        final_color = "#FBBF24"
        pill_bg = "bg-amber-500/20 text-amber-400 border-amber-500/40"
        summary_verdict = f"Neutral market equilibrium ({neutral_count} neutral signals). Wait for a decisive breakout before putting fresh capital to work."

    # -------------------------------------------------------------
    # AI Confidence Score & Conviction Level
    # -------------------------------------------------------------
    majority_count = max(bullish_count, bearish_count)
    consensus_ratio = (majority_count / max(total_signals, 1))
    base_confidence = int(consensus_ratio * 65)

    confidence_factors = []
    # Factor 1: Consensus
    if consensus_ratio >= 0.7:
        confidence_factors.append(f"Strong indicator agreement: {majority_count}/{total_signals} indicators align")
        base_confidence += 10
    elif consensus_ratio >= 0.5:
        confidence_factors.append(f"Majority agreement: {majority_count}/{total_signals} indicators align")
        base_confidence += 5

    # Factor 2: Volume confirmation
    vol_status = vol.get("status")
    vol_ratio = vol.get("ratio", 1.0)
    if (total_score > 0 and vol_status == "bullish") or (total_score < 0 and vol_status == "bearish"):
        base_confidence += 12
        confidence_factors.append(f"Volume confirms direction ({vol_ratio}x 20-DMA)")
    elif vol_ratio > 1.5:
        confidence_factors.append(f"Elevated volume ({vol_ratio}x 20-DMA)")

    # Factor 3: Trend & ADX
    adx_val = adx.get("value", 0)
    adx_status = adx.get("status")
    if adx_val >= 25 and ((total_score > 0 and adx_status == "bullish") or (total_score < 0 and adx_status == "bearish")):
        base_confidence += 10
        confidence_factors.append(f"Strong ADX trend momentum ({adx_val})")

    # Factor 4: Moving Average alignment
    ma_status = ma.get("status")
    if (total_score > 0 and ma_status == "bullish") or (total_score < 0 and ma_status == "bearish"):
        base_confidence += 8
        confidence_factors.append("Price aligned with key moving averages (50/200 DMA)")

    # Factor 5: Fundamental Grade
    if f_grade in ["A+", "A"]:
        if total_score > 0:
            base_confidence += 5
            confidence_factors.append(f"High-quality fundamentals (Grade {f_grade})")
    elif f_grade in ["D", "F"] and total_score > 0:
        base_confidence -= 8
        confidence_factors.append("Fundamental grade D/F dampens long-term safety")

    # Clamp confidence score
    confidence_score = max(35, min(96, base_confidence))

    if confidence_score >= 75:
        confidence_level = "High Conviction"
        confidence_badge = "bg-[#edf7ee] text-[#1e7e34] border-[#c6e8cc]"
    elif confidence_score >= 55:
        confidence_level = "Moderate Conviction"
        confidence_badge = "bg-[#fef6ed] text-[#8a4500] border-[#fcdcb8]"
    else:
        confidence_level = "Low / Speculative"
        confidence_badge = "bg-[#fdf0f0] text-[#b32020] border-[#f7c8c8]"

    # Stop Loss & Targets calculated tailored to style
    atr = risk_levels.get("atr", current_price * 0.02)
    if style == "intraday":
        stop_loss = round(max(current_price - (0.8 * atr), current_price * 0.99), 2)
        target1 = round(current_price + (1.2 * atr), 2)
        target2 = round(current_price + (2.0 * atr), 2)
        horizon = "Intraday (Square off before 3:15 PM)"
    elif style == "positional":
        stop_loss = round(max(current_price - (2.5 * atr), current_price * 0.92), 2)
        target1 = round(current_price + (4.0 * atr), 2)
        target2 = round(current_price + (7.0 * atr), 2)
        horizon = "2 to 6 Months"
    else:  # Swing
        stop_loss = round(max(current_price - (1.5 * atr), current_price * 0.96), 2)
        target1 = round(current_price + (2.5 * atr), 2)
        target2 = round(current_price + (4.5 * atr), 2)
        horizon = "5 to 20 Trading Days"

    sl_pct = round(((current_price - stop_loss) / current_price * 100), 2) if current_price else 0
    t1_pct = round(((target1 - current_price) / current_price * 100), 2) if current_price else 0

    return {
        "verdict": final_verdict,
        "color": final_color,
        "pill_bg": pill_bg,
        "score": total_score,
        "bullish_count": bullish_count,
        "bearish_count": bearish_count,
        "neutral_count": neutral_count,
        "summary": summary_verdict,
        "confidence": {
            "score": confidence_score,
            "level": confidence_level,
            "badge": confidence_badge,
            "factors": confidence_factors[:4]
        },
        "signals": signals_list,
        "trade_plan": {
            "style": style,
            "time_horizon": horizon,
            "entry_price": round(current_price, 2),
            "stop_loss": stop_loss,
            "stop_loss_pct": sl_pct,
            "target_1": target1,
            "target_1_pct": t1_pct,
            "target_2": target2,
            "risk_reward": f"1 : {round(t1_pct / sl_pct, 1) if sl_pct > 0 else 2.0}"
        }
    }


def calculate_position_size(capital: float, risk_pct: float, entry_price: float, stop_loss: float) -> dict:
    """
    Calculates exact share quantity, total position value, and capital at risk.
    """
    if entry_price <= 0 or stop_loss <= 0 or entry_price <= stop_loss:
        return {
            "status": "error",
            "message": "Entry price must be strictly greater than stop-loss."
        }
    
    risk_amount = round(capital * (risk_pct / 100.0), 2)
    risk_per_share = round(entry_price - stop_loss, 2)
    shares = int(risk_amount / risk_per_share) if risk_per_share > 0 else 0
    total_investment = round(shares * entry_price, 2)
    leverage_pct = round((total_investment / capital) * 100, 1) if capital > 0 else 0

    return {
        "status": "success",
        "capital": capital,
        "risk_pct": risk_pct,
        "risk_amount": risk_amount,
        "entry_price": entry_price,
        "stop_loss": stop_loss,
        "suggested_quantity": shares,
        "shares_qty": shares,
        "total_investment": total_investment,
        "capital_allocation_pct": min(leverage_pct, 100.0),
        "rule_note": f"Risking ₹{risk_amount} ({risk_pct}% of ₹{capital:,.0f}). If stopped out at ₹{stop_loss}, your loss is strictly capped."
    }

