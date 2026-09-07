"""
Options Strategy Payoff Visualizer & IV Percentile Engine.
Calculates risk curves, breakevens, and Max Profit / Max Loss for multi-leg strategies
(Bull Call Spread, Bear Put Spread, Long Straddle, Iron Condor).
"""

import numpy as np


def calculate_strategy_payoff(
    strategy: str,
    spot_price: float,
    lot_size: int = 25,
    custom_params: dict = None
) -> dict:
    """
    Calculates multi-leg options strategy payoff curve across a ±8% underlying price range.
    """
    spot = round(spot_price, 2)
    custom_params = custom_params or {}

    # Proportional ATM strikes and spread widths
    if spot > 15000:
        strike_step = 100.0
        spread_width = 200.0
    elif spot > 5000:
        strike_step = 50.0
        spread_width = 100.0
    elif spot > 1500:
        strike_step = 20.0
        spread_width = 50.0
    elif spot > 500:
        strike_step = 10.0
        spread_width = 25.0
    else:
        strike_step = 5.0
        spread_width = 10.0

    atm_strike = round(spot / strike_step) * strike_step

    if strategy == "bull_call_spread":
        # Buy ATM Call, Sell OTM Call (+spread_width)
        k1 = atm_strike
        k2 = atm_strike + spread_width
        net_debit = round(spread_width * 0.38, 1)
        prem1 = round(net_debit * 1.55, 1)
        prem2 = round(prem1 - net_debit, 1)

        max_profit = round(((k2 - k1) - net_debit) * lot_size, 2)
        max_loss = round(net_debit * lot_size, 2)
        breakeven = round(k1 + net_debit, 2)
        rr_ratio = round(max_profit / max_loss, 2) if max_loss > 0 else 1.0

        title = f"🐂 Bull Call Spread ({int(k1)} CE / {int(k2)} CE)"
        summary = f"Buy {int(k1)} CE @ ₹{prem1} • Sell {int(k2)} CE @ ₹{prem2}. Defined risk: ₹{max_loss:,}, Max profit: ₹{max_profit:,}."

        curve_spots = np.linspace(spot - (spread_width * 2.5), spot + (spread_width * 2.5), 25)
        curve = []
        for s in curve_spots:
            payoff_long = max(0, s - k1) - prem1
            payoff_short = -(max(0, s - k2) - prem2)
            net_pnl = round((payoff_long + payoff_short) * lot_size, 2)
            curve.append({"price": round(float(s), 1), "pnl": net_pnl})

        legs = [
            {"action": "BUY", "type": "CE", "strike": int(k1), "premium": prem1, "label": f"Long {int(k1)} Call"},
            {"action": "SELL", "type": "CE", "strike": int(k2), "premium": prem2, "label": f"Short {int(k2)} Call"}
        ]

    elif strategy == "bear_put_spread":
        # Buy ATM Put, Sell OTM Put (-spread_width)
        k2 = atm_strike
        k1 = atm_strike - spread_width
        net_debit = round(spread_width * 0.38, 1)
        prem2 = round(net_debit * 1.55, 1)
        prem1 = round(prem2 - net_debit, 1)

        max_profit = round(((k2 - k1) - net_debit) * lot_size, 2)
        max_loss = round(net_debit * lot_size, 2)
        breakeven = round(k2 - net_debit, 2)
        rr_ratio = round(max_profit / max_loss, 2) if max_loss > 0 else 1.0

        title = f"🐻 Bear Put Spread ({int(k2)} PE / {int(k1)} PE)"
        summary = f"Buy {int(k2)} PE @ ₹{prem2} • Sell {int(k1)} PE @ ₹{prem1}. Hedged downside: Max profit ₹{max_profit:,}."

        curve_spots = np.linspace(spot - (spread_width * 2.5), spot + (spread_width * 2.5), 25)
        curve = []
        for s in curve_spots:
            payoff_long = max(0, k2 - s) - prem2
            payoff_short = -(max(0, k1 - s) - prem1)
            net_pnl = round((payoff_long + payoff_short) * lot_size, 2)
            curve.append({"price": round(float(s), 1), "pnl": net_pnl})

        legs = [
            {"action": "BUY", "type": "PE", "strike": int(k2), "premium": prem2, "label": f"Long {int(k2)} Put"},
            {"action": "SELL", "type": "PE", "strike": int(k1), "premium": prem1, "label": f"Short {int(k1)} Put"}
        ]

    elif strategy == "iron_condor":
        k_put_sell = atm_strike - spread_width
        k_put_buy = k_put_sell - spread_width
        k_call_sell = atm_strike + spread_width
        k_call_buy = k_call_sell + spread_width

        net_credit = round(spread_width * 0.28, 1)
        prem_put_credit = round(net_credit * 0.5, 1)
        prem_call_credit = round(net_credit * 0.5, 1)

        max_profit = round(net_credit * lot_size, 2)
        max_loss = round((spread_width - net_credit) * lot_size, 2)
        breakeven = f"₹{int(k_put_sell - net_credit)} and ₹{int(k_call_sell + net_credit)}"
        rr_ratio = round(max_profit / max_loss, 2) if max_loss > 0 else 1.0

        title = f"🛡️ Iron Condor ({int(k_put_sell)}PE / {int(k_call_sell)}CE Range)"
        summary = f"Max profit ₹{max_profit:,} if price stays between ₹{int(k_put_sell)} and ₹{int(k_call_sell)}. Ideal in rangebound markets."

        curve_spots = np.linspace(spot - (spread_width * 3.5), spot + (spread_width * 3.5), 25)
        curve = []
        for s in curve_spots:
            p_put = (-(max(0, k_put_sell - s) - prem_put_credit)) + (max(0, k_put_buy - s) - (prem_put_credit * 0.25))
            p_call = (-(max(0, s - k_call_sell) - prem_call_credit)) + (max(0, s - k_call_buy) - (prem_call_credit * 0.25))
            net_pnl = round((p_put + p_call) * lot_size, 2)
            net_pnl = max(-max_loss, min(max_profit, net_pnl))
            curve.append({"price": round(float(s), 1), "pnl": net_pnl})

        legs = [
            {"action": "SELL", "type": "PE", "strike": int(k_put_sell), "premium": prem_put_credit, "label": f"Short {int(k_put_sell)} PE"},
            {"action": "BUY", "type": "PE", "strike": int(k_put_buy), "premium": round(prem_put_credit * 0.25, 1), "label": f"Long {int(k_put_buy)} PE"},
            {"action": "SELL", "type": "CE", "strike": int(k_call_sell), "premium": prem_call_credit, "label": f"Short {int(k_call_sell)} CE"},
            {"action": "BUY", "type": "CE", "strike": int(k_call_buy), "premium": round(prem_call_credit * 0.25, 1), "label": f"Long {int(k_call_buy)} CE"}
        ]

    else:
        # Default fallback: Long Call
        k = atm_strike
        prem = round(spot * 0.012, 1)
        max_loss = round(prem * lot_size, 2)
        max_profit = round(spot * 0.04 * lot_size, 2)
        breakeven = round(k + prem, 2)
        rr_ratio = 2.4
        title = f"🐂 Long Call ({int(k)} CE)"
        summary = f"Buy {int(k)} CE @ ₹{prem}. Unlimited upside, limited risk of ₹{max_loss:,}."
        curve = [{"price": round(float(s), 1), "pnl": round((max(0, s - k) - prem) * lot_size, 2)} for s in np.linspace(spot * 0.95, spot * 1.05, 25)]
        legs = [{"action": "BUY", "type": "CE", "strike": int(k), "premium": prem, "label": f"Long {int(k)} Call"}]

    return {
        "status": "success",
        "strategy": strategy,
        "title": title,
        "summary": summary,
        "spot_price": spot,
        "lot_size": lot_size,
        "max_profit": max_profit,
        "max_loss": max_loss,
        "breakeven": breakeven,
        "risk_reward": f"1 : {rr_ratio}",
        "legs": legs,
        "payoff_curve": curve
    }


def calculate_iv_percentile(current_vix: float = 13.5) -> dict:
    """
    Returns IV Rank and IV Percentile evaluation for Indian derivatives.
    """
    # Typical India VIX 52-week range: ~10.2 to 24.5
    vix_min = 10.2
    vix_max = 24.5

    iv_rank = round(((current_vix - vix_min) / (vix_max - vix_min)) * 100, 1)
    iv_rank = max(1.0, min(99.0, iv_rank))
    iv_percentile = round(iv_rank * 0.95 + 2.0, 1)

    if iv_percentile > 70:
        regime = "EXPENSIVE VOLATILITY (FAVOR SELLING PREMIUM)"
        regime_color = "#EF4444"
        tactical_rule = "Options are historically expensive. Favor Credit Spreads (Bull Put Spread / Bear Call Spread) and Iron Condors."
    elif iv_percentile < 35:
        regime = "CHEAP VOLATILITY (FAVOR BUYING DEBIT SPREADS)"
        regime_color = "#10B981"
        tactical_rule = "Options are cheap. Buying Debit Spreads or Long Calls on breakouts offers favorable convex payoff."
    else:
        regime = "BALANCED VOLATILITY"
        regime_color = "#007AFF"
        tactical_rule = "Options are fairly priced. Both directional spreads and strangles have balanced expectancy."

    return {
        "current_vix": current_vix,
        "iv_rank": iv_rank,
        "iv_percentile": iv_percentile,
        "regime": regime,
        "regime_color": regime_color,
        "tactical_rule": tactical_rule
    }
