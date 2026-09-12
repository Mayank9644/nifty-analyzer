"""
Relative Strength & Mark Minervini SEPA Trend Template Module.
Calculates Mansfield Relative Strength against NIFTY 50 (normalized 0–99),
evaluates the 8-point Stage 2 Trend Template, and detects Volatility Contraction Patterns (VCP).
"""

import pandas as pd
import numpy as np
from analysis.technical import calculate_sma, calculate_atr


def calculate_mansfield_rs(stock_close: pd.Series, benchmark_close: pd.Series, lookback: int = 55) -> dict:
    """
    Computes Mansfield Relative Strength and normalized RS Score (0–99).
    Uses outer date alignment with forward-fill to prevent holiday data drops.
    """
    default_res = {
        "mansfield_value": 0.0,
        "rs_value": 0.0,
        "rs_rating": 50,
        "rating_badge": "⚪ Neutral RS (RS: 50)",
        "rating_color": "#6E6E73",
        "summary": "Performing in-line with Nifty 50."
    }

    if stock_close is None or benchmark_close is None or len(stock_close) < 20 or len(benchmark_close) < 20:
        return default_res

    # Robust date alignment: outer join with forward fill
    df = pd.DataFrame({"stock": stock_close, "bench": benchmark_close}).sort_index().ffill().dropna()
    if len(df) < 20:
        return default_res

    ratio = df["stock"] / df["bench"]
    actual_lookback = min(lookback, len(ratio))
    ratio_sma = ratio.rolling(window=actual_lookback, min_periods=max(5, actual_lookback // 2)).mean()

    try:
        last_ratio = float(ratio.iloc[-1])
        last_sma = float(ratio_sma.iloc[-1])
        if last_sma <= 0 or np.isnan(last_sma) or np.isnan(last_ratio):
            mansfield_val = 0.0
        else:
            val = ((last_ratio / last_sma) - 1.0) * 100.0
            mansfield_val = 0.0 if (np.isnan(val) or np.isinf(val)) else round(float(val), 2)
    except Exception:
        mansfield_val = 0.0

    # Multi-lookback performance vs benchmark (3M, 6M, 1Y)
    min_len = len(df)
    idx_3m = min(63, min_len - 1)
    idx_6m = min(126, min_len - 1)

    s_base_3m = float(df["stock"].iloc[-idx_3m])
    s_base_6m = float(df["stock"].iloc[-idx_6m])
    b_base_3m = float(df["bench"].iloc[-idx_3m])
    b_base_6m = float(df["bench"].iloc[-idx_6m])

    stock_ret_3m = ((float(df["stock"].iloc[-1]) - s_base_3m) / s_base_3m) if s_base_3m > 0 else 0.0
    bench_ret_3m = ((float(df["bench"].iloc[-1]) - b_base_3m) / b_base_3m) if b_base_3m > 0 else 0.0
    alpha_3m = stock_ret_3m - bench_ret_3m

    stock_ret_6m = ((float(df["stock"].iloc[-1]) - s_base_6m) / s_base_6m) if s_base_6m > 0 else 0.0
    bench_ret_6m = ((float(df["bench"].iloc[-1]) - b_base_6m) / b_base_6m) if b_base_6m > 0 else 0.0
    alpha_6m = stock_ret_6m - bench_ret_6m

    # Weighted composite alpha: 60% 3M + 40% 6M
    composite_alpha = (alpha_3m * 0.6) + (alpha_6m * 0.4)
    if np.isnan(composite_alpha) or np.isinf(composite_alpha):
        composite_alpha = 0.0

    # Normalize into 1-99 RS Rating scale (centered at 50)
    norm_score = int(np.clip(round(50 + (composite_alpha * 180)), 1, 99))

    if norm_score >= 80:
        badge = f"🏆 Market Leader (RS: {norm_score})"
        color = "#10B981"
        summary = f"Outperforming {norm_score}% of Indian equities. Institutional accumulation favorite."
    elif norm_score >= 60:
        badge = f"🟢 Strong RS (RS: {norm_score})"
        color = "#007AFF"
        summary = f"Outperforming {norm_score}% of the market. Solid momentum candidate."
    elif norm_score >= 40:
        badge = f"⚪ Neutral RS (RS: {norm_score})"
        color = "#6E6E73"
        summary = f"Performing in-line with Nifty 50 (Score: {norm_score})."
    else:
        badge = f"⚠️ Lagging RS (RS: {norm_score})"
        color = "#EF4444"
        summary = f"Lagging the broader market (Score: {norm_score}). Weak relative demand."

    return {
        "mansfield_value": mansfield_val,
        "rs_value": mansfield_val,
        "rs_rating": norm_score,
        "rating_badge": badge,
        "rating_color": color,
        "summary": summary
    }


def evaluate_minervini_trend_template(df: pd.DataFrame, rs_score: int = 75) -> dict:
    """
    Evaluates Mark Minervini's 8-Point Stage 2 Uptrend Template with vectorization.
    """
    if df.empty or len(df) < 200:
        return {
            "stage_2_confirmed": False,
            "passed_count": 0,
            "total_rules": 8,
            "verdict": "Insufficient historical data for 200 DMA trend",
            "verdict_color": "#6E6E73",
            "summary": "Requires at least 200 daily sessions to compute Stage 2 criteria.",
            "checklist": []
        }

    close = df["Close"]
    latest = float(close.iloc[-1])
    sma50 = float(calculate_sma(close, 50).iloc[-1])
    sma150 = float(calculate_sma(close, 150).iloc[-1])
    sma200 = float(calculate_sma(close, 200).iloc[-1])
    sma200_series = calculate_sma(close, 200)
    sma200_20d_ago = float(sma200_series.iloc[-20]) if len(sma200_series) >= 20 else sma200

    high_52w = float(df["High"].max())
    low_52w = float(df["Low"].min())

    dist_from_52w_low_pct = ((latest - low_52w) / low_52w) * 100.0 if low_52w > 0 else 0.0
    dist_from_52w_high_pct = ((high_52w - latest) / high_52w) * 100.0 if high_52w > 0 else 0.0

    # 8 Minervini Criteria
    c1 = latest > sma150 and latest > sma200  # Price above 150 & 200 DMA
    c2 = sma150 > sma200                     # 150 DMA above 200 DMA
    c3 = sma200 > sma200_20d_ago             # 200 DMA trending upward
    c4 = sma50 > sma150 and sma50 > sma200   # 50 DMA above 150 & 200 DMA
    c5 = latest > sma50                      # Price above 50 DMA
    c6 = dist_from_52w_low_pct >= 25.0       # At least 25% above 52W low
    c7 = dist_from_52w_high_pct <= 25.0      # Within 25% of 52W high
    c8 = rs_score >= 70                      # RS rating >= 70 threshold

    checklist = [
        {"rule": "Price above 150 & 200 DMA", "passed": c1, "detail": f"₹{round(latest, 1)} > ₹{round(sma200, 1)}"},
        {"rule": "150 DMA > 200 DMA", "passed": c2, "detail": f"₹{round(sma150, 1)} > ₹{round(sma200, 1)}"},
        {"rule": "200 DMA trending upward", "passed": c3, "detail": "Rising over last 20 sessions" if c3 else "Flat/Falling"},
        {"rule": "50 DMA > 150 & 200 DMA", "passed": c4, "detail": f"₹{round(sma50, 1)} > ₹{round(sma150, 1)}"},
        {"rule": "Current Price > 50 DMA", "passed": c5, "detail": f"₹{round(latest, 1)} > ₹{round(sma50, 1)}"},
        {"rule": "At least 25% above 52W Low", "passed": c6, "detail": f"+{round(dist_from_52w_low_pct, 1)}% from Low"},
        {"rule": "Within 25% of 52W High", "passed": c7, "detail": f"-{round(dist_from_52w_high_pct, 1)}% from High"},
        {"rule": "Relative Strength Rating >= 70", "passed": c8, "detail": f"RS Rating: {rs_score}/99"}
    ]

    passed_count = sum([1 for item in checklist if item["passed"]])
    stage_2_active = passed_count >= 7

    if stage_2_active:
        verdict = f"✅ Minervini Stage 2 Confirmed ({passed_count}/8 Rules Passed)"
        verdict_color = "#10B981"
        summary = "Classic institutional mark-up stage. High odds of successful breakouts and continuation."
    elif passed_count >= 5:
        verdict = f"🟡 Stage 1 Accumulation / Transition ({passed_count}/8 Passed)"
        verdict_color = "#F59E0B"
        summary = "Consolidating or emerging into Stage 2. Wait for full moving average alignment."
    else:
        verdict = f"🔴 Stage 4 Downtrend / Distribution ({passed_count}/8 Passed)"
        verdict_color = "#EF4444"
        summary = "Fails Minervini trend template. Avoid buying breakouts until Stage 2 forms."

    return {
        "stage_2_confirmed": stage_2_active,
        "passed_count": passed_count,
        "total_rules": 8,
        "verdict": verdict,
        "verdict_color": verdict_color,
        "summary": summary,
        "checklist": checklist
    }


def detect_vcp_pattern(df: pd.DataFrame) -> dict:
    """
    Detects Volatility Contraction Pattern (VCP) across 3 successive market phases.
    """
    if len(df) < 60:
        return {"has_vcp": False, "contractions": 0, "status": "No VCP", "pivot_price": 0.0, "waves_pct": [], "badge": "Normal Range", "summary": "Insufficient data for VCP."}

    # High-low depth across 3 successive waves (W1: 40-60d ago, W2: 20-40d ago, W3: recent 20d)
    w1_low = float(df["Low"].iloc[-60:-40].min())
    w2_low = float(df["Low"].iloc[-40:-20].min())
    w3_low = float(df["Low"].iloc[-20:].min())

    w1_range = ((float(df["High"].iloc[-60:-40].max()) - w1_low) / w1_low) * 100.0 if w1_low > 0 else 0.0
    w2_range = ((float(df["High"].iloc[-40:-20].max()) - w2_low) / w2_low) * 100.0 if w2_low > 0 else 0.0
    w3_range = ((float(df["High"].iloc[-20:].max()) - w3_low) / w3_low) * 100.0 if w3_low > 0 else 0.0

    is_contracting = w1_range > w2_range > w3_range and w3_range <= 9.0
    pivot_price = round(float(df["High"].iloc[-15:].max()), 2)

    if is_contracting:
        return {
            "has_vcp": True,
            "contractions": 3,
            "waves_pct": [round(w1_range, 1), round(w2_range, 1), round(w3_range, 1)],
            "pivot_price": pivot_price,
            "badge": "🎯 VCP Wave 3 Setup (T3)",
            "summary": f"Volatility has contracted from {round(w1_range, 1)}% ➔ {round(w2_range, 1)}% ➔ {round(w3_range, 1)}%. Pivot: ₹{pivot_price}."
        }
    else:
        return {
            "has_vcp": False,
            "contractions": 1,
            "waves_pct": [],
            "pivot_price": pivot_price,
            "badge": "Normal Range",
            "summary": "No active multi-wave volatility contraction."
        }
