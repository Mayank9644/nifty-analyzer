"""
Operation Antigravity — Ensemble Prediction & Univest-Grade Execution Engine.
Calculates transparent BUY, HOLD, SELL recommendations with Volatility-Adjusted
Entry Ranges, 3-Tier Target Profit Matrices, and Portfolio Risk Guards.
"""

from config import STYLE_EXECUTION_PARAMS, MAX_SINGLE_STOCK_CAP_PCT, MAX_PORTFOLIO_RISK_PCT
from analysis.probability_cone import calculate_probability_cone


def generate_signals(
    info: dict,
    technicals: dict,
    fundamentals: dict,
    shareholding: dict,
    style: str = "swing",
    options_summary: dict = None
) -> dict:
    """
    Generate transparent multi-indicator consensus prediction adhering to Univest standards:
    - Exact Volatility-Adjusted Entry Range [Entry Low, Entry High]
    - ATR-Anchored Stop Loss
    - 3-Tier Take-Profit Tranches (1.5R, 2.5R, 4.0R)
    """
    current_price = float(info.get("current_price") or info.get("previous_close") or 0.0)
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

    # 1. Moving Average Trend Signal
    if ma.get("status") == "bullish":
        signals_list.append({
            "name": "Moving Average Trend",
            "icon": "📈",
            "verdict": "BUY",
            "weight": 2,
            "color": "#10B981",
            "explanation": f"Price (₹{current_price:.2f}) is above 50 & 200 DMA. Primary secular trend is bullish."
        })
        bullish_count += 1
    elif ma.get("status") == "bearish":
        signals_list.append({
            "name": "Moving Average Trend",
            "icon": "📉",
            "verdict": "SELL",
            "weight": -2,
            "color": "#EF4444",
            "explanation": f"Price (₹{current_price:.2f}) is below key moving averages. Primary trend is downward."
        })
        bearish_count += 1
    else:
        signals_list.append({
            "name": "Moving Average Trend",
            "icon": "➡️",
            "verdict": "HOLD",
            "weight": 0,
            "color": "#F59E0B",
            "explanation": "Price is oscillating around moving averages in sideways consolidation."
        })
        neutral_count += 1

    # 2. RSI Momentum
    rsi_val = rsi.get("value", 50.0)
    if rsi_val < 32:
        signals_list.append({
            "name": "RSI Momentum",
            "icon": "⚡",
            "verdict": "BUY",
            "weight": 2,
            "color": "#10B981",
            "explanation": f"RSI is {rsi_val} (Oversold). Selling exhaustion favors high-probability mean reversion."
        })
        bullish_count += 1
    elif rsi_val > 72:
        signals_list.append({
            "name": "RSI Momentum",
            "icon": "⚠️",
            "verdict": "SELL",
            "weight": -1,
            "color": "#EF4444",
            "explanation": f"RSI is {rsi_val} (Overbought). Upward velocity is overextended; protect gains."
        })
        bearish_count += 1
    elif 50 <= rsi_val <= 68:
        signals_list.append({
            "name": "RSI Momentum",
            "icon": "⚡",
            "verdict": "BUY",
            "weight": 1,
            "color": "#10B981",
            "explanation": f"RSI is {rsi_val} (Healthy Bullish). Advancing with sustainable buying velocity."
        })
        bullish_count += 1
    else:
        signals_list.append({
            "name": "RSI Momentum",
            "icon": "➡️",
            "verdict": "HOLD",
            "weight": 0,
            "color": "#F59E0B",
            "explanation": f"RSI is {rsi_val} (Neutral). Momentum equilibrium."
        })
        neutral_count += 1

    # 3. MACD Crossover
    if macd.get("status") == "bullish":
        signals_list.append({
            "name": "MACD Crossover",
            "icon": "🌊",
            "verdict": "BUY",
            "weight": 1,
            "color": "#10B981",
            "explanation": "MACD line is above Signal with expanding positive momentum bars."
        })
        bullish_count += 1
    elif macd.get("status") == "bearish":
        signals_list.append({
            "name": "MACD Crossover",
            "icon": "🌊",
            "verdict": "SELL",
            "weight": -1,
            "color": "#EF4444",
            "explanation": "MACD line is below Signal with negative momentum drift."
        })
        bearish_count += 1
    else:
        signals_list.append({
            "name": "MACD Crossover",
            "icon": "➡️",
            "verdict": "HOLD",
            "weight": 0,
            "color": "#F59E0B",
            "explanation": "MACD histogram is flat."
        })
        neutral_count += 1

    # 4. Volume & Institutional Footprint
    vol_status = vol.get("status", "neutral")
    vol_ratio = vol.get("ratio", 1.0)
    if vol_status == "bullish":
        signals_list.append({
            "name": "Institutional Volume",
            "icon": "🏢",
            "verdict": "BUY",
            "weight": 2,
            "color": "#10B981",
            "explanation": f"Volume surge ({vol_ratio}x 20-DMA) on advancing candle confirms institutional accumulation."
        })
        bullish_count += 1
    elif vol_status == "bearish":
        signals_list.append({
            "name": "Institutional Volume",
            "icon": "🏢",
            "verdict": "SELL",
            "weight": -2,
            "color": "#EF4444",
            "explanation": f"High volume distribution ({vol_ratio}x 20-DMA) on declining candle."
        })
        bearish_count += 1
    else:
        signals_list.append({
            "name": "Institutional Volume",
            "icon": "➡️",
            "verdict": "HOLD",
            "weight": 0,
            "color": "#F59E0B",
            "explanation": f"Normal volume flow ({vol_ratio}x 20-DMA)."
        })
        neutral_count += 1

    # 5. Volatility Channels (Bollinger)
    bb_status = bb.get("status", "neutral")
    if bb_status == "bullish":
        signals_list.append({
            "name": "Bollinger Bands",
            "icon": "🎯",
            "verdict": "BUY",
            "weight": 1,
            "color": "#10B981",
            "explanation": f"Price at Lower Bollinger Band support (₹{bb.get('lower', 0)}). Favorable rebound setup."
        })
        bullish_count += 1
    elif bb_status == "bearish":
        signals_list.append({
            "name": "Bollinger Bands",
            "icon": "🎯",
            "verdict": "SELL",
            "weight": -1,
            "color": "#EF4444",
            "explanation": f"Price touching Upper Bollinger Band resistance (₹{bb.get('upper', 0)})."
        })
        bearish_count += 1
    else:
        signals_list.append({
            "name": "Bollinger Bands",
            "icon": "➡️",
            "verdict": "HOLD",
            "weight": 0,
            "color": "#F59E0B",
            "explanation": "Price comfortably oscillating inside standard deviation channel."
        })
        neutral_count += 1

    # 6. Style-Specific Factor
    if style == "intraday":
        vwap_status = vwap.get("status", "neutral")
        if vwap_status == "bullish":
            signals_list.append({
                "name": "Intraday VWAP Benchmark",
                "icon": "⚡",
                "verdict": "BUY",
                "weight": 2,
                "color": "#10B981",
                "explanation": f"Price is above VWAP (₹{vwap.get('value', 0)}). Buyers control the session."
            })
            bullish_count += 1
        else:
            signals_list.append({
                "name": "Intraday VWAP Benchmark",
                "icon": "⚡",
                "verdict": "SELL",
                "weight": -2,
                "color": "#EF4444",
                "explanation": f"Price is below VWAP (₹{vwap.get('value', 0)}). Sellers dominate session."
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
                "explanation": f"Top Quality Grade '{f_grade}'. Robust return on capital and low financial leverage."
            })
            bullish_count += 1
        elif f_grade in ["B+", "B"]:
            signals_list.append({
                "name": "Business Health & Moat",
                "icon": "🛡️",
                "verdict": "HOLD",
                "weight": 0,
                "color": "#F59E0B",
                "explanation": f"Satisfactory Grade '{f_grade}'. Stable balance sheet with moderate valuation."
            })
            neutral_count += 1
        else:
            signals_list.append({
                "name": "Business Health & Moat",
                "icon": "🛡️",
                "verdict": "SELL",
                "weight": -2,
                "color": "#EF4444",
                "explanation": f"Fragile Grade '{f_grade}'. Elevated debt or compressing profit margins."
            })
            bearish_count += 1
    else:  # Swing
        adx_status = adx.get("status", "neutral")
        adx_val = adx.get("value", 20.0)
        if adx_status == "bullish" and adx_val >= 22:
            signals_list.append({
                "name": "ADX Trend Strength",
                "icon": "🚀",
                "verdict": "BUY",
                "weight": 1,
                "color": "#10B981",
                "explanation": f"ADX is {adx_val} confirming strong directional power in the upward direction."
            })
            bullish_count += 1
        elif adx_status == "bearish" and adx_val >= 22:
            signals_list.append({
                "name": "ADX Trend Strength",
                "icon": "🚀",
                "verdict": "SELL",
                "weight": -1,
                "color": "#EF4444",
                "explanation": f"ADX is {adx_val} confirming high downward trend acceleration."
            })
            bearish_count += 1
        else:
            signals_list.append({
                "name": "ADX Trend Strength",
                "icon": "➡️",
                "verdict": "HOLD",
                "weight": 0,
                "color": "#F59E0B",
                "explanation": f"ADX is {adx_val} (Weak/Ranging). Market consolidating without trend leadership."
            })
            neutral_count += 1

    # Final Ensemble Verdict
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
        summary_verdict = f"Favorable BUY setup ({bullish_count} bullish vs {bearish_count} bearish). Good entry point with disciplined stop-loss."
    elif total_score <= -4:
        final_verdict = "STRONG SELL"
        final_color = "#EF4444"
        pill_bg = "bg-red-500/20 text-red-400 border-red-500/40"
        summary_verdict = f"Bearish breakdown ({bearish_count} of {total_signals} indicators bearish). Elevated downside risk; exit long exposure."
    elif total_score <= -1:
        final_verdict = "SELL / TAKE PROFIT"
        final_color = "#F87171"
        pill_bg = "bg-rose-500/20 text-rose-400 border-rose-500/40"
        summary_verdict = "Momentum is weakening. Consider tightening stop-losses or taking profits."
    else:
        final_verdict = "HOLD / WAIT"
        final_color = "#FBBF24"
        pill_bg = "bg-amber-500/20 text-amber-400 border-amber-500/40"
        summary_verdict = f"Market equilibrium ({neutral_count} neutral signals). Await decisive breakout confirmation."

    # AI Confidence Scoring
    majority_count = max(bullish_count, bearish_count)
    consensus_ratio = (majority_count / max(total_signals, 1))
    base_confidence = int(consensus_ratio * 65)

    confidence_factors = []
    if consensus_ratio >= 0.7:
        confidence_factors.append(f"Strong indicator agreement: {majority_count}/{total_signals} indicators align")
        base_confidence += 10
    elif consensus_ratio >= 0.5:
        confidence_factors.append(f"Majority agreement: {majority_count}/{total_signals} indicators align")
        base_confidence += 5

    if (total_score > 0 and vol_status == "bullish") or (total_score < 0 and vol_status == "bearish"):
        base_confidence += 12
        confidence_factors.append(f"Volume confirms direction ({vol_ratio}x 20-DMA)")
    elif vol_ratio > 1.5:
        confidence_factors.append(f"Elevated volume ({vol_ratio}x 20-DMA)")

    adx_val = adx.get("value", 0.0)
    adx_status = adx.get("status")
    if adx_val >= 25 and ((total_score > 0 and adx_status == "bullish") or (total_score < 0 and adx_status == "bearish")):
        base_confidence += 10
        confidence_factors.append(f"Strong ADX trend momentum ({adx_val})")

    if ma.get("status") == "bullish" and total_score > 0:
        base_confidence += 8
        confidence_factors.append("Price aligned with key moving averages (50/200 DMA)")

    if f_grade in ["A+", "A"] and total_score > 0:
        base_confidence += 5
        confidence_factors.append(f"Elite fundamentals (Grade {f_grade})")

    confidence_score = max(35, min(96, base_confidence))
    confidence_level = "High Conviction" if confidence_score >= 75 else ("Moderate Conviction" if confidence_score >= 55 else "Low / Speculative")
    confidence_badge = "bg-[#edf7ee] text-[#1e7e34] border-[#c6e8cc]" if confidence_score >= 75 else ("bg-[#fef6ed] text-[#8a4500] border-[#fcdcb8]" if confidence_score >= 55 else "bg-[#fdf0f0] text-[#b32020] border-[#f7c8c8]")

    # Univest-Grade Volatility-Adjusted Execution Parameters
    style_key = style if style in STYLE_EXECUTION_PARAMS else "swing"
    params = STYLE_EXECUTION_PARAMS[style_key]

    atr = float(risk_levels.get("atr") or (current_price * 0.02))
    atr = max(atr, current_price * 0.005)

    is_short = total_score < 0

    if is_short:
        # Bearish / Short Setup
        stop_loss = round(current_price + (params["stop_atr_mult"] * atr), 2)
        entry_low = round(max(0.01, current_price - (params["entry_range_atr"] * atr)), 2)
        entry_high = round(current_price + (params["entry_range_atr"] * atr), 2)
        target1 = round(max(0.01, current_price - (params["target1_mult"] * atr)), 2)
        target2 = round(max(0.01, current_price - (params["target2_mult"] * atr)), 2)
        target3 = round(max(0.01, current_price - (params["target3_mult"] * atr)), 2)

        sl_pct = round(((stop_loss - current_price) / current_price * 100), 2) if current_price > 0 else 0.0
        t1_pct = round(((current_price - target1) / current_price * 100), 2) if current_price > 0 else 0.0
        t2_pct = round(((current_price - target2) / current_price * 100), 2) if current_price > 0 else 0.0
        t3_pct = round(((current_price - target3) / current_price * 100), 2) if current_price > 0 else 0.0
        direction = "SHORT / SELL"
    else:
        # Bullish / Long Setup
        stop_loss = round(max(0.01, current_price - (params["stop_atr_mult"] * atr)), 2)
        entry_low = round(max(0.01, current_price - (params["entry_range_atr"] * atr)), 2)
        entry_high = round(current_price + (params["entry_range_atr"] * atr), 2)
        target1 = round(current_price + (params["target1_mult"] * atr), 2)
        target2 = round(current_price + (params["target2_mult"] * atr), 2)
        target3 = round(current_price + (params["target3_mult"] * atr), 2)

        sl_pct = round(((current_price - stop_loss) / current_price * 100), 2) if current_price > 0 else 0.0
        t1_pct = round(((target1 - current_price) / current_price * 100), 2) if current_price > 0 else 0.0
        t2_pct = round(((target2 - current_price) / current_price * 100), 2) if current_price > 0 else 0.0
        t3_pct = round(((target3 - current_price) / current_price * 100), 2) if current_price > 0 else 0.0
        direction = "LONG / BUY"

    t1_r = round(params.get("target1_mult", 1.5) / max(params.get("stop_atr_mult", 1.0), 0.01), 1)
    t2_r = round(params.get("target2_mult", 2.5) / max(params.get("stop_atr_mult", 1.0), 0.01), 1)

    # Compute Probabilistic Target Cone & First-Passage Likelihood
    hist_df = technicals.get("df") if isinstance(technicals, dict) else None
    prob_cone = calculate_probability_cone(
        current_price=current_price,
        stop_loss=stop_loss,
        target_1=target1,
        df=hist_df,
        is_short=is_short
    )

    # Compute Transparent Signal Factor Attribution (SHAP-style decomposition)
    category_map = {
        "Trend Structure": [s for s in signals_list if "Moving Average" in s["name"] or "ADX" in s["name"]],
        "Momentum Velocity": [s for s in signals_list if "RSI" in s["name"] or "MACD" in s["name"]],
        "Volatility & Range": [s for s in signals_list if "Bollinger" in s["name"] or "VWAP" in s["name"]],
        "Institutional Volume": [s for s in signals_list if "Volume" in s["name"]],
        "Fundamental Quality": [s for s in signals_list if "Business Health" in s["name"]],
        "Options Sentiment": [s for s in signals_list if "Options" in s["name"] or "PCR" in s["name"]]
    }
    attribution_factors = []
    for cat_name, items in category_map.items():
        if items:
            cat_pts = sum(i.get("weight", 0) for i in items)
            cat_verdict = "BULLISH" if cat_pts > 0 else ("BEARISH" if cat_pts < 0 else "NEUTRAL")
            attribution_factors.append({
                "category": cat_name,
                "points": cat_pts,
                "verdict": cat_verdict,
                "indicators": [i["name"] for i in items],
                "summary": items[0].get("explanation", "")
            })

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
        "attribution_breakdown": attribution_factors,
        "probability_cone": prob_cone,
        "trade_plan": {
            "direction": direction,
            "style": style,
            "time_horizon": params["horizon"],
            "entry_price": round(current_price, 2),
            "entry_range": [entry_low, entry_high],
            "stop_loss": stop_loss,
            "stop_loss_pct": sl_pct,
            "target_1": target1,
            "target_1_pct": t1_pct,
            "target_2": target2,
            "target_2_pct": t2_pct,
            "target_3": target3,
            "target_3_pct": t3_pct,
            "targets_tranches": [
                {"tranche": f"T1 ({t1_r}R - 50% De-Risk)", "price": target1, "gain_pct": t1_pct, "allocation_pct": 50},
                {"tranche": f"T2 ({t2_r}R - 30% Profit)", "price": target2, "gain_pct": t2_pct, "allocation_pct": 30},
                {"tranche": "T3 (Runner - 20% Trailing)", "price": target3, "gain_pct": t3_pct, "allocation_pct": 20}
            ],
            "risk_reward": f"1 : {round(t1_pct / sl_pct, 1) if sl_pct > 0 else 2.0}"
        }
    }


def calculate_position_size(capital: float, risk_pct: float, entry_price: float, stop_loss: float) -> dict:
    """
    Univest-Grade Position Sizing with Institutional Portfolio Caps.
    Enforces maximum portfolio capital at risk and enforces a 15% single-stock capital allocation ceiling.
    """
    if entry_price <= 0 or stop_loss <= 0 or entry_price <= stop_loss:
        return {
            "status": "error",
            "message": "Entry price must be strictly greater than stop-loss."
        }

    # Bounded risk percentage (default max 2.0%)
    effective_risk_pct = min(risk_pct, MAX_PORTFOLIO_RISK_PCT)
    risk_amount = round(capital * (effective_risk_pct / 100.0), 2)
    risk_per_share = round(entry_price - stop_loss, 2)

    raw_shares = int(risk_amount / risk_per_share) if risk_per_share > 0 else 0

    # Institutional Single-Stock Cap (Max 15% of total capital)
    max_capital_allowed = capital * (MAX_SINGLE_STOCK_CAP_PCT / 100.0)
    capped_shares_by_allocation = int(max_capital_allowed / entry_price) if entry_price > 0 else raw_shares

    # If entry_price exceeds total allowed capital allocation, 0 shares can be safely bought
    if capped_shares_by_allocation < 1:
        shares = 0
    else:
        shares = min(raw_shares, capped_shares_by_allocation)
        shares = max(1, shares) if (capital >= entry_price and shares > 0) else 0

    total_investment = round(shares * entry_price, 2)
    actual_risk = round(shares * risk_per_share, 2)
    capital_allocation_pct = round((total_investment / capital) * 100.0, 1) if capital > 0 else 0.0
    risk_pct_of_capital = round((actual_risk / capital) * 100.0, 2) if capital > 0 else 0.0

    allocation_capped = bool(shares < raw_shares)

    return {
        "status": "success",
        "capital": capital,
        "risk_pct": effective_risk_pct,
        "risk_amount": actual_risk,
        "entry_price": entry_price,
        "stop_loss": stop_loss,
        "suggested_quantity": shares,
        "shares_qty": shares,
        "total_investment": total_investment,
        "capital_allocation_pct": capital_allocation_pct,
        "allocation_capped": allocation_capped,
        "rule_note": f"Risking ₹{actual_risk:,.2f} ({risk_pct_of_capital}% of capital). Capped at {capital_allocation_pct}% portfolio exposure."
    }
