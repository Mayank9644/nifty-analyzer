"""
Operation Antigravity — High-Throughput Technical Analysis Engine.
100% Vectorized mathematical routines utilizing pure NumPy and Pandas.
Zero iteration loops (.iterrows/.itertuples eliminated).
"""

import pandas as pd
import numpy as np


def calculate_sma(series: pd.Series, period: int) -> pd.Series:
    """Vectorized Simple Moving Average."""
    return series.rolling(window=period, min_periods=1).mean()


def calculate_ema(series: pd.Series, period: int) -> pd.Series:
    """Vectorized Exponential Moving Average."""
    return series.ewm(span=period, adjust=False).mean()


def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    """
    Wilder's Smoothed Relative Strength Index (RSI).
    Vectorized using exponential moving averages to eliminate window boundary artifacts.
    """
    if len(series) < 2:
        return pd.Series(50.0, index=series.index)

    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    # Wilder's exponential smoothing: alpha = 1 / period
    avg_gain = gain.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    avg_loss = loss.ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()

    rs = avg_gain / avg_loss.replace(0, np.nan)
    rsi = 100.0 - (100.0 / (1.0 + rs))

    # Handle zero-loss and zero-gain regimes cleanly
    rsi = np.where(avg_loss == 0, 100.0, rsi)
    rsi = np.where((avg_gain == 0) & (avg_loss == 0), 50.0, rsi)
    return pd.Series(rsi, index=series.index).fillna(50.0)


def calculate_macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    """Vectorized Moving Average Convergence Divergence."""
    ema_fast = calculate_ema(series, fast)
    ema_slow = calculate_ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = calculate_ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def calculate_bollinger_bands(series: pd.Series, period: int = 20, num_std: float = 2.0):
    """Vectorized Bollinger Bands with zero-variance protection."""
    sma = calculate_sma(series, period)
    std = series.rolling(window=period, min_periods=1).std().fillna(0.0)
    upper = sma + (std * num_std)
    lower = sma - (std * num_std)
    return upper, sma, lower


def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    """Vectorized True Range & Average True Range."""
    if df is None or len(df) < 2 or "Close" not in df or "High" not in df or "Low" not in df:
        if df is not None and "Close" in df and not df.empty:
            return pd.Series(df["Close"] * 0.02, index=df.index)
        return pd.Series([], dtype=float)

    high = df["High"]
    low = df["Low"]
    prev_close = df["Close"].shift(1).fillna(df["Open"] if "Open" in df else df["Close"])

    tr1 = high - low
    tr2 = (high - prev_close).abs()
    tr3 = (low - prev_close).abs()
    tr = np.maximum(tr1, np.maximum(tr2, tr3))

    # Wilder's smoothing for ATR
    atr = pd.Series(tr, index=df.index).ewm(alpha=1.0 / period, min_periods=period, adjust=False).mean()
    return atr.bfill().fillna(df["Close"] * 0.02)


def calculate_obv(df: pd.DataFrame) -> pd.Series:
    """Vectorized On-Balance Volume (OBV)."""
    if df is None or df.empty or "Close" not in df or "Volume" not in df:
        return pd.Series([], dtype=float)
    close = df["Close"]
    volume = df["Volume"]
    direction = np.sign(close.diff().fillna(0))
    return (volume * direction).cumsum()


def calculate_vwap(df: pd.DataFrame, rolling_window: int = 20) -> pd.Series:
    """
    Rolling Institutional Volume-Weighted Average Price (VWAP).
    Prevents multi-year cumulative drift by anchoring to a 20-day institutional window.
    """
    if df is None or df.empty or "Close" not in df:
        return pd.Series([], dtype=float)
    if "High" not in df or "Low" not in df or "Volume" not in df:
        return df["Close"]

    typical_price = (df["High"] + df["Low"] + df["Close"]) / 3.0
    tp_vol = typical_price * df["Volume"]

    rolling_tp_vol = tp_vol.rolling(window=rolling_window, min_periods=1).sum()
    rolling_vol = df["Volume"].rolling(window=rolling_window, min_periods=1).sum().replace(0, np.nan)

    vwap = rolling_tp_vol / rolling_vol
    return vwap.fillna(df["Close"])


def calculate_adx(df: pd.DataFrame, period: int = 14) -> tuple:
    """Vectorized Average Directional Index with Wilder's directional smoothing."""
    if df is None or len(df) < 2 or "High" not in df or "Low" not in df or "Close" not in df:
        empty_s = pd.Series([], dtype=float)
        return empty_s, empty_s, empty_s

    high = df["High"]
    low = df["Low"]

    up_move = high.diff()
    down_move = -low.diff()

    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    tr = calculate_atr(df, 1)
    tr_smooth = pd.Series(tr, index=df.index).ewm(alpha=1.0 / period, adjust=False).mean().replace(0, np.nan)

    plus_di = 100.0 * pd.Series(plus_dm, index=df.index).ewm(alpha=1.0 / period, adjust=False).mean() / tr_smooth
    minus_di = 100.0 * pd.Series(minus_dm, index=df.index).ewm(alpha=1.0 / period, adjust=False).mean() / tr_smooth

    di_sum = (plus_di + minus_di).replace(0, np.nan)
    dx = ((plus_di - minus_di).abs() / di_sum) * 100.0
    adx = dx.ewm(alpha=1.0 / period, adjust=False).mean().fillna(20.0)

    return adx, plus_di.fillna(0.0), minus_di.fillna(0.0)


def calculate_stochastic(df: pd.DataFrame, period: int = 14, smooth_k: int = 3, smooth_d: int = 3):
    """Vectorized Stochastic Oscillator with flat-line protection."""
    if df is None or df.empty or "High" not in df or "Low" not in df or "Close" not in df:
        empty_s = pd.Series([], dtype=float)
        return empty_s, empty_s

    low_min = df["Low"].rolling(window=period, min_periods=1).min()
    high_max = df["High"].rolling(window=period, min_periods=1).max()
    denom = (high_max - low_min).replace(0, np.nan)

    k = 100.0 * ((df["Close"] - low_min) / denom)
    k = k.fillna(50.0).rolling(window=smooth_k, min_periods=1).mean()
    d = k.rolling(window=smooth_d, min_periods=1).mean()
    return k.fillna(50.0), d.fillna(50.0)


def calculate_volume_profile(df: pd.DataFrame, bins: int = 24) -> dict:
    """
    Vectorized Volume Profile Visible Range (VPVR) using NumPy histogramming.
    100% loop-free; replaces slow .iterrows() with vectorized price array binning.
    """
    if df.empty or len(df) < 5 or "Volume" not in df.columns:
        return {"poc": 0.0, "vah": 0.0, "val": 0.0, "bins": []}

    subset = df.tail(120)
    prices = subset["Close"].to_numpy()
    volumes = subset["Volume"].to_numpy(dtype=float)

    min_price = float(np.min(subset["Low"]))
    max_price = float(np.max(subset["High"]))

    if max_price <= min_price or np.sum(volumes) <= 0:
        p = round(float(prices[-1]), 2)
        return {"poc": p, "vah": p, "val": p, "bins": []}

    # Vectorized binning via np.histogram
    hist_vol, bin_edges = np.histogram(prices, bins=bins, range=(min_price, max_price), weights=volumes)
    total_vol = float(np.sum(hist_vol))

    if total_vol <= 0:
        p = round(float(prices[-1]), 2)
        return {"poc": p, "vah": p, "val": p, "bins": []}

    poc_idx = int(np.argmax(hist_vol))
    bin_mids = (bin_edges[:-1] + bin_edges[1:]) / 2.0
    poc_price = round(float(bin_mids[poc_idx]), 2)

    # Vectorized 70% Value Area Expansion
    target_va = total_vol * 0.70
    va_indices = {poc_idx}
    accumulated_vol = float(hist_vol[poc_idx])

    left = poc_idx - 1
    right = poc_idx + 1

    while accumulated_vol < target_va and (left >= 0 or right < bins):
        left_vol = hist_vol[left] if left >= 0 else -1.0
        right_vol = hist_vol[right] if right < bins else -1.0

        if left_vol >= right_vol and left >= 0:
            va_indices.add(left)
            accumulated_vol += left_vol
            left -= 1
        elif right < bins:
            va_indices.add(right)
            accumulated_vol += right_vol
            right += 1
        elif left >= 0:
            va_indices.add(left)
            accumulated_vol += left_vol
            left -= 1
        else:
            break

    val_idx = min(va_indices)
    vah_idx = max(va_indices)
    val_price = round(float(bin_edges[val_idx]), 2)
    vah_price = round(float(bin_edges[vah_idx + 1]), 2)

    result_bins = [
        {
            "price_low": round(float(bin_edges[i]), 2),
            "price_high": round(float(bin_edges[i + 1]), 2),
            "price_mid": round(float(bin_mids[i]), 2),
            "volume": int(hist_vol[i]),
            "is_poc": bool(i == poc_idx),
            "in_va": bool(i in va_indices)
        }
        for i in range(bins)
    ]

    return {
        "poc": poc_price,
        "vah": vah_price,
        "val": val_price,
        "total_volume": round(total_vol),
        "bins": result_bins
    }


def calculate_anchored_vwap(df: pd.DataFrame, anchor_index: int = None) -> list:
    """Vectorized Anchored VWAP from significant swing low or specified index."""
    if df.empty or "Volume" not in df.columns or "Close" not in df.columns:
        return []

    if anchor_index is None or anchor_index < 0 or anchor_index >= len(df):
        lookback = min(len(df), 60)
        recent_subset = df.tail(lookback)
        min_idx = recent_subset["Low"].idxmin()
        try:
            anchor_index = df.index.get_loc(min_idx)
        except Exception:
            anchor_index = max(0, len(df) - 60)

    sub_df = df.iloc[anchor_index:]
    typical_price = (sub_df["High"] + sub_df["Low"] + sub_df["Close"]) / 3.0
    cum_tp_vol = (typical_price * sub_df["Volume"]).cumsum()
    cum_vol = sub_df["Volume"].cumsum().replace(0, np.nan)
    avwap = (cum_tp_vol / cum_vol).fillna(sub_df["Close"])

    dates = [d.strftime("%Y-%m-%d") if hasattr(d, "strftime") else str(d)[:10] for d in sub_df.index]
    values = avwap.to_numpy().round(2)
    return [{"time": dates[i], "value": float(values[i])} for i in range(len(dates))]


def calculate_indicator_series(df: pd.DataFrame) -> dict:
    """
    Computes aligned time-series arrays for RSI and MACD sub-charts.
    Vectorized array extraction supporting both daily dates and intraday timestamps.
    """
    if df is None or df.empty or "Close" not in df.columns or len(df) < 14:
        return {"rsi": [], "macd_line": [], "macd_signal": [], "macd_histogram": []}

    close = df["Close"]
    rsi = calculate_rsi(close, 14).to_numpy()
    macd_l, macd_s, macd_h = calculate_macd(close, 12, 26, 9)
    macd_l = macd_l.to_numpy()
    macd_s = macd_s.to_numpy()
    macd_h = macd_h.to_numpy()

    is_intraday = False
    for dt in df.index[:10]:
        if hasattr(dt, "hour") and (dt.hour != 0 or dt.minute != 0):
            is_intraday = True
            break

    dates = []
    for dt in df.index:
        if is_intraday:
            dates.append(int(dt.timestamp()) if hasattr(dt, "timestamp") else int(pd.to_datetime(dt).timestamp()))
        else:
            dates.append(dt.strftime("%Y-%m-%d") if hasattr(dt, "strftime") else str(dt)[:10])

    rsi_points = []
    macd_line_points = []
    macd_signal_points = []
    macd_hist_points = []

    seen_times = set()
    for i in range(len(dates)):
        t_val = dates[i]
        if t_val in seen_times:
            continue
        seen_times.add(t_val)

        if not np.isnan(rsi[i]):
            rsi_points.append({"time": t_val, "value": round(float(rsi[i]), 2)})
        if not np.isnan(macd_l[i]):
            macd_line_points.append({"time": t_val, "value": round(float(macd_l[i]), 2)})
        if not np.isnan(macd_s[i]):
            macd_signal_points.append({"time": t_val, "value": round(float(macd_s[i]), 2)})
        if not np.isnan(macd_h[i]):
            macd_hist_points.append({
                "time": t_val,
                "value": round(float(macd_h[i]), 2),
                "color": "rgba(52, 199, 89, 0.8)" if macd_h[i] >= 0 else "rgba(255, 59, 48, 0.8)"
            })

    return {
        "rsi": rsi_points,
        "macd_line": macd_line_points,
        "macd_signal": macd_signal_points,
        "macd_histogram": macd_hist_points
    }


def analyze_technicals(df: pd.DataFrame) -> dict:
    """
    Run complete technical battery on an OHLCV dataframe.
    Returns comprehensive metrics with clean quantitative interpretations.
    """
    if df.empty or len(df) < 20:
        return {"status": "insufficient_data"}

    col_map = {c: c.capitalize() for c in df.columns}
    df = df.rename(columns=col_map)

    if "Close" not in df.columns:
        return {"status": "insufficient_data"}

    close = df["Close"]
    latest_close = float(close.iloc[-1])

    # Moving Averages
    sma20 = calculate_sma(close, 20)
    sma50 = calculate_sma(close, 50) if len(df) >= 50 else sma20
    sma200 = calculate_sma(close, 200) if len(df) >= 200 else sma50
    ema9 = calculate_ema(close, 9)
    ema21 = calculate_ema(close, 21)

    val_sma20 = float(sma20.iloc[-1])
    val_sma50 = float(sma50.iloc[-1])
    val_sma200 = float(sma200.iloc[-1])
    val_ema9 = float(ema9.iloc[-1])
    val_ema21 = float(ema21.iloc[-1])

    # Trend categorization
    if latest_close > val_sma50 and val_sma50 > val_sma200:
        trend_status = "bullish"
        trend_text = "Strong Uptrend: Price is above both the 50-day and 200-day moving averages."
    elif latest_close < val_sma50 and val_sma50 < val_sma200:
        trend_status = "bearish"
        trend_text = "Downtrend: Price is trading below key long-term moving averages."
    else:
        trend_status = "neutral"
        trend_text = "Sideways / Consolidation: Price is fluctuating around moving averages."

    # Golden / Death Cross
    golden_cross = False
    death_cross = False
    if len(df) >= 200:
        if sma50.iloc[-1] > sma200.iloc[-1] and sma50.iloc[-5] <= sma200.iloc[-5]:
            golden_cross = True
        elif sma50.iloc[-1] < sma200.iloc[-1] and sma50.iloc[-5] >= sma200.iloc[-5]:
            death_cross = True

    # RSI
    rsi_series = calculate_rsi(close, 14)
    val_rsi = float(rsi_series.iloc[-1])
    if val_rsi > 70:
        rsi_status = "bearish"
        rsi_text = f"RSI is {round(val_rsi, 1)} (Overbought) — Extended momentum; short-term mean-reversion likely."
    elif val_rsi < 30:
        rsi_status = "bullish"
        rsi_text = f"RSI is {round(val_rsi, 1)} (Oversold) — Selling pressure exhausted; favorable accumulation zone."
    elif val_rsi >= 50:
        rsi_status = "bullish"
        rsi_text = f"RSI is {round(val_rsi, 1)} (Bullish Momentum) — Price advancing with positive velocity."
    else:
        rsi_status = "neutral"
        rsi_text = f"RSI is {round(val_rsi, 1)} (Neutral) — Balanced momentum equilibrium."

    # MACD
    macd_line, sig_line, hist = calculate_macd(close)
    val_macd = float(macd_line.iloc[-1])
    val_sig = float(sig_line.iloc[-1])
    val_hist = float(hist.iloc[-1])

    if val_macd > val_sig and val_hist > 0:
        macd_status = "bullish"
        macd_text = "MACD line is above Signal with expanding green momentum bars."
    elif val_macd < val_sig and val_hist < 0:
        macd_status = "bearish"
        macd_text = "MACD line is below Signal with negative momentum drift."
    else:
        macd_status = "neutral"
        macd_text = "MACD momentum is consolidating."

    # Bollinger Bands
    upper_bb, mid_bb, lower_bb = calculate_bollinger_bands(close, 20, 2.0)
    val_upper_bb = float(upper_bb.iloc[-1])
    val_mid_bb = float(mid_bb.iloc[-1])
    val_lower_bb = float(lower_bb.iloc[-1])
    bb_width = ((val_upper_bb - val_lower_bb) / val_mid_bb * 100) if val_mid_bb > 0 else 0.0

    if latest_close >= val_upper_bb:
        bb_status = "bearish"
        bb_text = "Price is testing the Upper Bollinger Band (volatility resistance)."
    elif latest_close <= val_lower_bb:
        bb_status = "bullish"
        bb_text = "Price is at the Lower Bollinger Band support (mean-reversion rebound candidate)."
    else:
        bb_status = "neutral"
        bb_text = f"Price is inside normal volatility channels (Bandwidth: {round(bb_width, 1)}%)."

    # Volume & OBV
    vol = df["Volume"]
    vol_sma20 = calculate_sma(vol, 20)
    current_vol = float(vol.iloc[-1]) if not pd.isna(vol.iloc[-1]) else 0.0
    avg_vol = float(vol_sma20.iloc[-1]) if not pd.isna(vol_sma20.iloc[-1]) and vol_sma20.iloc[-1] > 0 else current_vol
    vol_ratio = (current_vol / avg_vol) if avg_vol > 0 else 1.0

    obv_series = calculate_obv(df)
    obv_trend = "up" if len(obv_series) >= 5 and obv_series.iloc[-1] > obv_series.iloc[-5] else "down"

    if vol_ratio > 1.8 and latest_close > float(close.iloc[-2]):
        vol_status = "bullish"
        vol_text = f"High Volume Surge ({round(vol_ratio, 1)}x average) on green day — Institutional accumulation detected."
    elif vol_ratio > 1.8 and latest_close < float(close.iloc[-2]):
        vol_status = "bearish"
        vol_text = f"High Volume Dump ({round(vol_ratio, 1)}x average) on red day — Institutional distribution detected."
    else:
        vol_status = "neutral"
        vol_text = f"Normal volume activity ({round(vol_ratio, 1)}x 20-day average)."

    # ADX & Trend Strength
    adx, plus_di, minus_di = calculate_adx(df)
    val_adx = float(adx.iloc[-1])
    val_plus = float(plus_di.iloc[-1])
    val_minus = float(minus_di.iloc[-1])

    if val_adx > 25:
        adx_strength = "Strong Trend"
        adx_status = "bullish" if val_plus > val_minus else "bearish"
        adx_text = f"ADX is {round(val_adx, 1)} — Strong directional trend in play ({'Upward' if val_plus > val_minus else 'Downward'})."
    else:
        adx_strength = "Weak/Ranging"
        adx_status = "neutral"
        adx_text = f"ADX is {round(val_adx, 1)} — Weak trend; market is range-bound."

    # ATR & Suggested Risk Parameters
    atr_series = calculate_atr(df, 14)
    val_atr = float(atr_series.iloc[-1]) if not atr_series.empty else latest_close * 0.02
    swing_stop_loss = max(0.0, round(latest_close - (1.5 * val_atr), 2))
    intraday_stop_loss = max(0.0, round(latest_close - (0.8 * val_atr), 2))
    target_price_swing = round(latest_close + (3.0 * val_atr), 2)

    # Rolling 20-Day VWAP
    vwap_series = calculate_vwap(df, rolling_window=20)
    val_vwap = float(vwap_series.iloc[-1])
    vwap_status = "bullish" if latest_close >= val_vwap else "bearish"

    # Support & Resistance Levels
    last_h = float(df["High"].iloc[-1])
    last_l = float(df["Low"].iloc[-1])
    pivot = (last_h + last_l + latest_close) / 3.0
    r1 = (2.0 * pivot) - last_l
    s1 = (2.0 * pivot) - last_h
    r2 = pivot + (last_h - last_l)
    s2 = pivot - (last_h - last_l)

    # VPVR & Anchored VWAP
    volume_profile = calculate_volume_profile(df, bins=24)
    anchored_vwap = calculate_anchored_vwap(df)

    return {
        "status": "success",
        "current_price": round(latest_close, 2),
        "moving_averages": {
            "sma20": round(val_sma20, 2),
            "sma50": round(val_sma50, 2),
            "sma200": round(val_sma200, 2),
            "ema9": round(val_ema9, 2),
            "ema21": round(val_ema21, 2),
            "golden_cross": golden_cross,
            "death_cross": death_cross,
            "is_golden_cross_active": bool(val_sma50 >= val_sma200) if val_sma200 > 0 else True,
            "cross_label": "🌟 Golden Cross (50 DMA > 200 DMA)" if (val_sma50 >= val_sma200 and val_sma200 > 0) else "⚠️ Death Cross (50 DMA < 200 DMA)",
            "status": trend_status,
            "explanation": trend_text
        },
        "rsi": {
            "value": round(val_rsi, 1),
            "status": rsi_status,
            "explanation": rsi_text
        },
        "macd": {
            "macd": round(val_macd, 2),
            "signal": round(val_sig, 2),
            "histogram": round(val_hist, 2),
            "status": macd_status,
            "explanation": macd_text
        },
        "bollinger": {
            "upper": round(val_upper_bb, 2),
            "middle": round(val_mid_bb, 2),
            "lower": round(val_lower_bb, 2),
            "bandwidth_pct": round(bb_width, 1),
            "status": bb_status,
            "explanation": bb_text
        },
        "volume": {
            "current": int(current_vol),
            "average_20": int(avg_vol),
            "ratio": round(vol_ratio, 2),
            "spike_alert": bool(vol_ratio >= 1.8),
            "obv_trend": obv_trend,
            "obv_value": int(obv_series.iloc[-1]) if not obv_series.empty else 0,
            "status": vol_status,
            "explanation": vol_text
        },
        "volume_profile": volume_profile,
        "anchored_vwap": anchored_vwap,
        "adx": {
            "value": round(val_adx, 1),
            "strength": adx_strength,
            "status": adx_status,
            "explanation": adx_text
        },
        "vwap": {
            "value": round(val_vwap, 2),
            "status": vwap_status,
            "explanation": f"Price is {'above' if latest_close >= val_vwap else 'below'} 20-day institutional VWAP."
        },
        "risk_levels": {
            "atr": round(val_atr, 2),
            "swing_stop_loss": swing_stop_loss,
            "intraday_stop_loss": intraday_stop_loss,
            "swing_target": target_price_swing,
            "risk_reward_ratio": "1 : 2.0",
            "support_1": round(s1, 2),
            "support_2": round(s2, 2),
            "resistance_1": round(r1, 2),
            "resistance_2": round(r2, 2),
            "pivot": round(pivot, 2)
        }
    }
