"""
Options analytics engine: PCR, Max Pain, Black-Scholes Greeks, IV, and Strategy Suggestions.
"""

import math
import numpy as np
from scipy.stats import norm


def calculate_black_scholes_greeks(
    spot: float, strike: float, time_to_expiry_years: float,
    volatility: float, risk_free_rate: float = 0.07, option_type: str = "CE"
) -> dict:
    """
    Compute Delta, Gamma, Theta, and Vega using standard Black-Scholes formulas.
    """
    if spot <= 0 or strike <= 0 or time_to_expiry_years <= 0 or volatility <= 0:
        return {"delta": 0.5 if option_type == "CE" else -0.5, "gamma": 0.0, "theta": 0.0, "vega": 0.0}

    d1 = (math.log(spot / strike) + (risk_free_rate + 0.5 * volatility ** 2) * time_to_expiry_years) / (volatility * math.sqrt(time_to_expiry_years))
    d2 = d1 - volatility * math.sqrt(time_to_expiry_years)

    # Normal PDF and CDF
    pdf_d1 = norm.pdf(d1)
    cdf_d1 = norm.cdf(d1)
    cdf_d2 = norm.cdf(d2)

    if option_type == "CE":
        delta = cdf_d1
        theta = -(spot * pdf_d1 * volatility) / (2 * math.sqrt(time_to_expiry_years)) - risk_free_rate * strike * math.exp(-risk_free_rate * time_to_expiry_years) * cdf_d2
    else:
        delta = cdf_d1 - 1.0
        theta = -(spot * pdf_d1 * volatility) / (2 * math.sqrt(time_to_expiry_years)) + risk_free_rate * strike * math.exp(-risk_free_rate * time_to_expiry_years) * norm.cdf(-d2)

    gamma = pdf_d1 / (spot * volatility * math.sqrt(time_to_expiry_years))
    vega = (spot * math.sqrt(time_to_expiry_years) * pdf_d1) / 100.0  # per 1% change in vol
    theta_per_day = theta / 365.0  # daily decay in ₹

    return {
        "delta": round(float(delta), 3),
        "gamma": round(float(gamma), 4),
        "theta": round(float(theta_per_day), 2),
        "vega": round(float(vega), 2)
    }


def analyze_option_chain(chain_data: dict) -> dict:
    """
    Parse option chain records to extract:
    - PCR (Put Call Ratio)
    - Max Pain Strike
    - Major Call & Put OI Resistance and Support
    - Greeks per strike
    - Suggested Options Strategy
    """
    records = chain_data.get("chain", [])
    spot = chain_data.get("underlying_price", 0.0)
    symbol = chain_data.get("symbol", "NIFTY")

    if not records or spot <= 0:
        return {"status": "insufficient_data"}

    total_ce_oi = 0
    total_pe_oi = 0
    total_ce_vol = 0
    total_pe_vol = 0

    strikes = []
    pain_map = {}

    processed_chain = []

    for item in records:
        strike = item.get("strikePrice", 0)
        ce = item.get("CE", {})
        pe = item.get("PE", {})

        ce_oi = ce.get("openInterest", 0) or 0
        pe_oi = pe.get("openInterest", 0) or 0
        ce_ltp = ce.get("lastPrice", 0.0) or 0.0
        pe_ltp = pe.get("lastPrice", 0.0) or 0.0
        ce_iv = (ce.get("impliedVolatility", 13.0) or 13.0) / 100.0
        pe_iv = (pe.get("impliedVolatility", 13.0) or 13.0) / 100.0

        total_ce_oi += ce_oi
        total_pe_oi += pe_oi
        total_ce_vol += ce.get("totalTradedVolume", 0) or 0
        total_pe_vol += pe.get("totalTradedVolume", 0) or 0

        strikes.append(strike)

        # Greeks (assuming 7 days to expiry)
        time_to_exp = 7 / 365.0
        ce_greeks = calculate_black_scholes_greeks(spot, strike, time_to_exp, ce_iv, 0.07, "CE")
        pe_greeks = calculate_black_scholes_greeks(spot, strike, time_to_exp, pe_iv, 0.07, "PE")

        processed_chain.append({
            "strike": strike,
            "ce_oi": ce_oi,
            "ce_change_oi": ce.get("changeinOpenInterest", 0) or 0,
            "ce_ltp": round(float(ce_ltp), 2),
            "ce_iv": round(ce_iv * 100, 1),
            "ce_delta": ce_greeks["delta"],
            "pe_oi": pe_oi,
            "pe_change_oi": pe.get("changeinOpenInterest", 0) or 0,
            "pe_ltp": round(float(pe_ltp), 2),
            "pe_iv": round(pe_iv * 100, 1),
            "pe_delta": pe_greeks["delta"],
        })

    # Calculate Max Pain
    # For every strike X, calculate sum of losses option writers would have to pay
    sorted_strikes = sorted(list(set(strikes)))
    min_loss = float("inf")
    max_pain_strike = spot

    for target_strike in sorted_strikes:
        total_writer_payout = 0
        for item in records:
            k = item.get("strikePrice", 0)
            ce_oi = (item.get("CE", {}).get("openInterest", 0) or 0)
            pe_oi = (item.get("PE", {}).get("openInterest", 0) or 0)

            # In the money calls payoff
            if target_strike > k:
                total_writer_payout += (target_strike - k) * ce_oi
            # In the money puts payoff
            if target_strike < k:
                total_writer_payout += (k - target_strike) * pe_oi

        if total_writer_payout < min_loss:
            min_loss = total_writer_payout
            max_pain_strike = target_strike

    # Put Call Ratio
    pcr_oi = round(total_pe_oi / total_ce_oi, 2) if total_ce_oi > 0 else 1.0
    pcr_vol = round(total_pe_vol / total_ce_vol, 2) if total_ce_vol > 0 else 1.0

    if pcr_oi >= 1.25:
        pcr_sentiment = "Strong Bullish"
        pcr_desc = "Put writers are aggressively betting on market staying higher."
        pcr_color = "#10B981"
    elif pcr_oi >= 0.95:
        pcr_sentiment = "Mild Bullish / Balanced"
        pcr_desc = "Healthy balance of puts and calls; slightly favors upside."
        pcr_color = "#34D399"
    elif pcr_oi >= 0.70:
        pcr_sentiment = "Mild Bearish"
        pcr_desc = "Call writers are beginning to dominate."
        pcr_color = "#F59E0B"
    else:
        pcr_sentiment = "Oversold / Extreme Bearish"
        pcr_desc = "Excessive call writing. Historically vulnerable to a sharp short-covering rally."
        pcr_color = "#EF4444"

    # Find highest Call OI (Resistance) and highest Put OI (Support)
    highest_call = max(processed_chain, key=lambda x: x["ce_oi"], default=None)
    highest_put = max(processed_chain, key=lambda x: x["pe_oi"], default=None)

    res_strike = highest_call["strike"] if highest_call else spot * 1.02
    sup_strike = highest_put["strike"] if highest_put else spot * 0.98

    # Filter processed chain to strikes around spot (± 10 strikes)
    chain_around_spot = sorted(processed_chain, key=lambda x: abs(x["strike"] - spot))[:16]
    chain_around_spot = sorted(chain_around_spot, key=lambda x: x["strike"])

    # Strategy Suggestion Engine based on PCR, Max Pain, and Volatility
    diff_pain = max_pain_strike - spot
    diff_pct = (diff_pain / spot) * 100

    if pcr_oi > 1.1 and diff_pct >= -0.5:
        strategy_name = "Bull Call Spread"
        strategy_icon = "🐂"
        strategy_setup = f"Buy ATM Call (Strike {round(spot)}) + Sell OTM Call (Strike {round(res_strike)})"
        strategy_rationale = (
            f"PCR is bullish ({pcr_oi}) and Max Pain ({round(max_pain_strike)}) supports the market. "
            "A Bull Call Spread gives you upside participation while capping your risk and lowering cost."
        )
    elif pcr_oi < 0.8:
        strategy_name = "Bear Put Spread"
        strategy_icon = "🐻"
        strategy_setup = f"Buy ATM Put (Strike {round(spot)}) + Sell OTM Put (Strike {round(sup_strike)})"
        strategy_rationale = (
            f"PCR is low ({pcr_oi}) indicating heavy call resistance at {round(res_strike)}. "
            "A Bear Put Spread offers defined risk down to support."
        )
    else:
        strategy_name = "Iron Condor (Range-Bound)"
        strategy_icon = "🦅"
        strategy_setup = f"Sell OTM Put ({round(sup_strike)}) + Sell OTM Call ({round(res_strike)}) with wings for protection."
        strategy_rationale = (
            f"Market is range-bound between Support ({round(sup_strike)}) and Resistance ({round(res_strike)}). "
            "Iron Condor profits from time decay (Theta) as long as price remains within the boundary."
        )

    return {
        "status": "success",
        "symbol": symbol,
        "underlying_price": round(spot, 2),
        "is_modeled": chain_data.get("is_modeled", False),
        "pcr": {
            "pcr_oi": pcr_oi,
            "pcr_volume": pcr_vol,
            "sentiment": pcr_sentiment,
            "explanation": pcr_desc,
            "color": pcr_color
        },
        "max_pain": {
            "strike": round(max_pain_strike, 2),
            "distance_pts": round(diff_pain, 2),
            "distance_pct": round(diff_pct, 2),
            "explanation": f"Max Pain strike is {round(max_pain_strike)}. Expiry price historically gravitates toward this level."
        },
        "key_levels": {
            "major_resistance_strike": round(res_strike, 2),
            "max_call_oi": highest_call["ce_oi"] if highest_call else 0,
            "major_support_strike": round(sup_strike, 2),
            "max_put_oi": highest_put["pe_oi"] if highest_put else 0
        },
        "suggested_strategy": {
            "name": strategy_name,
            "icon": strategy_icon,
            "setup": strategy_setup,
            "rationale": strategy_rationale
        },
        "chain_table": chain_around_spot
    }
