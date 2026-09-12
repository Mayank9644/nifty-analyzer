"""
Options analytics engine: PCR, Max Pain, Black-Scholes Greeks, IV, and Strategy Suggestions.
Synchronized with config.py institutional rates and vectorized Max Pain computation.
"""

import math
import numpy as np
from scipy.stats import norm
from config import RISK_FREE_RATE


def calculate_black_scholes_greeks(
    spot: float, strike: float, time_to_expiry_years: float,
    volatility: float, risk_free_rate: float = None, option_type: str = "CE"
) -> dict:
    """
    Compute Delta, Gamma, Theta, and Vega using standard Black-Scholes formulas.
    """
    r = float(RISK_FREE_RATE) if risk_free_rate is None else float(risk_free_rate)

    if spot <= 0 or strike <= 0 or time_to_expiry_years <= 0 or volatility <= 0:
        return {"delta": 0.5 if option_type == "CE" else -0.5, "gamma": 0.0, "theta": 0.0, "vega": 0.0}

    d1 = (math.log(spot / strike) + (r + 0.5 * volatility ** 2) * time_to_expiry_years) / (volatility * math.sqrt(time_to_expiry_years))
    d2 = d1 - volatility * math.sqrt(time_to_expiry_years)

    pdf_d1 = norm.pdf(d1)
    cdf_d1 = norm.cdf(d1)
    cdf_d2 = norm.cdf(d2)

    if option_type == "CE":
        delta = cdf_d1
        theta = -(spot * pdf_d1 * volatility) / (2 * math.sqrt(time_to_expiry_years)) - r * strike * math.exp(-r * time_to_expiry_years) * cdf_d2
    else:
        delta = cdf_d1 - 1.0
        theta = -(spot * pdf_d1 * volatility) / (2 * math.sqrt(time_to_expiry_years)) + r * strike * math.exp(-r * time_to_expiry_years) * norm.cdf(-d2)

    gamma = pdf_d1 / (spot * volatility * math.sqrt(time_to_expiry_years))
    vega = (spot * math.sqrt(time_to_expiry_years) * pdf_d1) / 100.0  # per 1% change in vol
    theta_per_day = theta / 365.0  # daily decay in INR

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
    - Vector-calculated Max Pain Strike
    - Major Call & Put OI Resistance and Support
    - Greeks per strike
    - Suggested Options Strategy
    """
    records = chain_data.get("chain", [])
    spot = float(chain_data.get("underlying_price", 0.0) or 0.0)
    symbol = chain_data.get("symbol", "NIFTY")

    if not records or spot <= 0:
        return {"status": "insufficient_data"}

    total_ce_oi = 0
    total_pe_oi = 0
    total_ce_vol = 0
    total_pe_vol = 0

    strikes = []
    ce_ois = []
    pe_ois = []

    processed_chain = []
    time_to_exp = 7 / 365.0

    for item in records:
        strike = float(item.get("strikePrice", 0) or 0)
        ce = item.get("CE", {}) or {}
        pe = item.get("PE", {}) or {}

        ce_oi = int(ce.get("openInterest", 0) or 0)
        pe_oi = int(pe.get("openInterest", 0) or 0)
        ce_ltp = float(ce.get("lastPrice", 0.0) or 0.0)
        pe_ltp = float(pe.get("lastPrice", 0.0) or 0.0)
        ce_iv = float(ce.get("impliedVolatility", 13.0) or 13.0) / 100.0
        pe_iv = float(pe.get("impliedVolatility", 13.0) or 13.0) / 100.0

        total_ce_oi += ce_oi
        total_pe_oi += pe_oi
        total_ce_vol += int(ce.get("totalTradedVolume", 0) or 0)
        total_pe_vol += int(pe.get("totalTradedVolume", 0) or 0)

        strikes.append(strike)
        ce_ois.append(ce_oi)
        pe_ois.append(pe_oi)

        ce_greeks = calculate_black_scholes_greeks(spot, strike, time_to_exp, ce_iv, option_type="CE")
        pe_greeks = calculate_black_scholes_greeks(spot, strike, time_to_exp, pe_iv, option_type="PE")

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

    # 100% Vectorized Max Pain Calculation via NumPy broadcasting
    strikes_arr = np.array(strikes, dtype="float64")
    ce_oi_arr = np.array(ce_ois, dtype="float64")
    pe_oi_arr = np.array(pe_ois, dtype="float64")

    # Shape: (num_strikes, num_strikes)
    # diff[i, j] = candidate_strike[i] - strike[j]
    diffs = strikes_arr[:, np.newaxis] - strikes_arr[np.newaxis, :]
    ce_losses = np.maximum(0.0, diffs) * ce_oi_arr[np.newaxis, :]
    pe_losses = np.maximum(0.0, -diffs) * pe_oi_arr[np.newaxis, :]
    total_writer_losses = np.sum(ce_losses + pe_losses, axis=1)

    min_idx = int(np.argmin(total_writer_losses))
    max_pain_strike = float(strikes_arr[min_idx])

    # Put Call Ratio with zero-division protection
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
    diff_pct = (diff_pain / spot) * 100.0 if spot > 0 else 0.0

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
