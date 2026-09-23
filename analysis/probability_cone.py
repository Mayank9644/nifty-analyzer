"""
Probabilistic Target Cone & Barrier First-Passage Engine.
Calculates closed-form forward volatility cones and First-Passage hitting probabilities
for Stop Loss and Take Profit levels under Geometric Brownian Motion (GBM).
Zero external heavy ML dependencies; pure vectorized NumPy/Math routines.
"""

import math
import numpy as np
import pandas as pd


def compute_historical_volatility(df: pd.DataFrame, window: int = 30) -> tuple:
    """
    Computes annualized realized volatility and drift from price history.
    Uses Parkinson High-Low volatility if columns exist, otherwise close-to-close log returns.
    """
    if df is None or len(df) < 5:
        return 0.28, 0.12  # Benchmark Indian equity defaults (28% vol, 12% drift)

    try:
        if "Close" in df.columns:
            closes = df["Close"].dropna()
        else:
            closes = df.iloc[:, 0].dropna()

        if len(closes) < 5:
            return 0.28, 0.12

        # Log returns
        log_ret = np.log(closes / closes.shift(1)).dropna()
        tail = log_ret.iloc[-window:] if len(log_ret) >= window else log_ret

        daily_std = float(tail.std())
        daily_mean = float(tail.mean())

        ann_vol = daily_std * math.sqrt(252)
        ann_drift = daily_mean * 252

        # Parkinson volatility if High and Low are present for tighter estimates
        if "High" in df.columns and "Low" in df.columns and len(df) >= window:
            highs = df["High"].iloc[-window:]
            lows = df["Low"].iloc[-window:]
            hl_ratio = np.log(highs / lows)
            parkinson_daily = math.sqrt((1.0 / (4.0 * math.log(2.0))) * (hl_ratio ** 2).mean())
            parkinson_ann = parkinson_daily * math.sqrt(252)
            # Blend 50/50 close-to-close and Parkinson
            ann_vol = 0.5 * ann_vol + 0.5 * parkinson_ann

        # Sanity bound clamps
        ann_vol = max(0.08, min(ann_vol, 1.20))
        ann_drift = max(-0.60, min(ann_drift, 0.60))

        return round(ann_vol, 4), round(ann_drift, 4)
    except Exception:
        return 0.28, 0.12


def calculate_probability_cone(
    current_price: float,
    stop_loss: float,
    target_1: float,
    df: pd.DataFrame = None,
    is_short: bool = False
) -> dict:
    """
    Calculates:
    1. First-Passage probability of hitting Target 1 before Stop Loss.
    2. Forward price probability cones (5d, 10d, 20d) with 68% (1-sigma) and 95% (2-sigma) confidence bounds.
    """
    if current_price <= 0:
        return {
            "p_target_before_sl": 50.0,
            "annualized_volatility_pct": 28.0,
            "annualized_drift_pct": 12.0,
            "cones": {}
        }

    vol, drift = compute_historical_volatility(df)

    if not is_short:
        if stop_loss >= current_price or target_1 <= current_price:
            p_target = 0.50
        else:
            a = math.log(current_price / max(stop_loss, 0.001))
            b = math.log(target_1 / current_price)
            alpha = drift - 0.5 * (vol ** 2)
            gamma = 2.0 * alpha / (vol ** 2)
            if abs(gamma) < 1e-5:
                p_target = a / (a + b)
            else:
                try:
                    num = 1.0 - math.exp(-gamma * a)
                    den = math.exp(gamma * b) - math.exp(-gamma * a)
                    p_target = num / den if den != 0 else 0.5
                except OverflowError:
                    p_target = 0.95 if gamma > 0 else 0.05
    else:
        if stop_loss <= current_price or target_1 >= current_price:
            p_target = 0.50
        else:
            a = math.log(max(stop_loss, 0.001) / current_price)
            b = math.log(current_price / max(target_1, 0.001))
            alpha = -(drift - 0.5 * (vol ** 2))
            gamma = 2.0 * alpha / (vol ** 2)
            if abs(gamma) < 1e-5:
                p_target = a / (a + b)
            else:
                try:
                    num = 1.0 - math.exp(-gamma * a)
                    den = math.exp(gamma * b) - math.exp(-gamma * a)
                    p_target = num / den if den != 0 else 0.5
                except OverflowError:
                    p_target = 0.95 if gamma > 0 else 0.05

    # Safe bounds
    p_target = max(0.05, min(0.95, p_target))

    # Multi-horizon projection cones (5, 10, 20 trading days)
    cones = {}
    for days in [5, 10, 20]:
        t = days / 252.0
        drift_adj = (drift - 0.5 * (vol ** 2)) * t
        std_adj = vol * math.sqrt(t)

        cones[f"{days}d"] = {
            "days": days,
            "expected": round(current_price * math.exp(drift * t), 2),
            "upper_1sigma": round(current_price * math.exp(drift_adj + std_adj), 2),
            "lower_1sigma": round(current_price * math.exp(drift_adj - std_adj), 2),
            "upper_2sigma": round(current_price * math.exp(drift_adj + 2.0 * std_adj), 2),
            "lower_2sigma": round(current_price * math.exp(drift_adj - 2.0 * std_adj), 2)
        }

    return {
        "p_target_before_sl": round(p_target * 100.0, 1),
        "annualized_volatility_pct": round(vol * 100.0, 1),
        "annualized_drift_pct": round(drift * 100.0, 1),
        "cones": cones
    }
