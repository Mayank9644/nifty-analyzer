"""
Comprehensive Technical Analysis Engine.
Calculates indicators using pure Pandas & NumPy for high speed and reliability.
Includes plain-English interpretations for everyday investors.
"""

import pandas as pd
import numpy as np


def calculate_sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period).mean()


def calculate_ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def calculate_rsi(series: pd.Series, period: int = 14) -> pd.Series:
    delta = series.diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=period).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=period).mean()
    rs = gain / (loss.replace(0, np.nan))
    rsi = 100 - (100 / (1 + rs))
    return rsi.fillna(50)


def calculate_macd(series: pd.Series, fast: int = 12, slow: int = 26, signal: int = 9):
    ema_fast = calculate_ema(series, fast)
    ema_slow = calculate_ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = calculate_ema(macd_line, signal)
    histogram = macd_line - signal_line
    return macd_line, signal_line, histogram


def calculate_bollinger_bands(series: pd.Series, period: int = 20, num_std: float = 2.0):
    sma = calculate_sma(series, period)
    std = series.rolling(window=period).std()
    upper = sma + (std * num_std)
    lower = sma - (std * num_std)
    return upper, sma, lower


def calculate_atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = df["High"]
    low = df["Low"]
    close = df["Close"].shift(1)
    tr1 = high - low
    tr2 = (high - close).abs()
    tr3 = (low - close).abs()
    tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
    return tr.rolling(window=period).mean()


def calculate_obv(df: pd.DataFrame) -> pd.Series:
    close = df["Close"]
    volume = df["Volume"]
    direction = np.where(close > close.shift(1), 1, np.where(close < close.shift(1), -1, 0))
    obv = (volume * direction).cumsum()
    return obv


def calculate_vwap(df: pd.DataFrame) -> pd.Series:
    typical_price = (df["High"] + df["Low"] + df["Close"]) / 3
    tp_vol = typical_price * df["Volume"]
    vwap = tp_vol.cumsum() / df["Volume"].cumsum().replace(0, np.nan)
    return vwap.fillna(df["Close"])


def calculate_adx(df: pd.DataFrame, period: int = 14) -> tuple:
    high = df["High"]
    low = df["Low"]
    close = df["Close"]

    tr = calculate_atr(df, 1)
    up_move = high - high.shift(1)
    down_move = low.shift(1) - low

    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    tr_smooth = pd.Series(tr).rolling(window=period).mean()
    plus_di = 100 * (pd.Series(plus_dm, index=df.index).rolling(window=period).mean() / tr_smooth.replace(0, np.nan))
    minus_di = 100 * (pd.Series(minus_dm, index=df.index).rolling(window=period).mean() / tr_smooth.replace(0, np.nan))

    dx = (plus_di - minus_di).abs() / (plus_di + minus_di).replace(0, np.nan) * 100
    adx = dx.rolling(window=period).mean().fillna(20)
    return adx, plus_di.fillna(0), minus_di.fillna(0)


def calculate_stochastic(df: pd.DataFrame, period: int = 14, smooth_k: int = 3, smooth_d: int = 3):
    low_min = df["Low"].rolling(window=period).min()
    high_max = df["High"].rolling(window=period).max()
    k = 100 * ((df["Close"] - low_min) / (high_max - low_min).replace(0, np.nan))
    k = k.rolling(window=smooth_k).mean()
    d = k.rolling(window=smooth_d).mean()
    return k.fillna(50), d.fillna(50)


def analyze_technicals(df: pd.DataFrame) -> dict:
    """
    Run complete technical battery on an OHLCV dataframe.
    Returns comprehensive metrics with layman explanations.
    """
    if df.empty or len(df) < 20:
        return {"status": "insufficient_data"}

    # Normalize columns to standard Title case (Open, High, Low, Close, Volume)
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

    # Trend check
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
        rsi_text = f"RSI is {round(val_rsi, 1)} (Overbought) — Buyers have pushed hard; a temporary pullback or cooling off is likely."
    elif val_rsi < 30:
        rsi_status = "bullish"
        rsi_text = f"RSI is {round(val_rsi, 1)} (Oversold) — Selling pressure is exhausted; historically attractive entry zone for a bounce."
    elif val_rsi >= 50:
        rsi_status = "bullish"
        rsi_text = f"RSI is {round(val_rsi, 1)} (Bullish Momentum) — Price is rising with healthy positive momentum."
    else:
        rsi_status = "neutral"
        rsi_text = f"RSI is {round(val_rsi, 1)} (Mild Bearish/Neutral) — Balanced market, no extreme buying or selling."

    # MACD
    macd_line, sig_line, hist = calculate_macd(close)
    val_macd = float(macd_line.iloc[-1])
    val_sig = float(sig_line.iloc[-1])
    val_hist = float(hist.iloc[-1])
    prev_hist = float(hist.iloc[-2]) if len(hist) > 1 else val_hist

    if val_macd > val_sig and val_hist > 0:
        macd_status = "bullish"
        macd_text = "MACD line is above the Signal line with expanding green momentum — buyers in control."
    elif val_macd < val_sig and val_hist < 0:
        macd_status = "bearish"
        macd_text = "MACD line is below the Signal line — downward momentum dominates."
    elif val_hist > prev_hist:
        macd_status = "bullish"
        macd_text = "MACD histogram is turning upward — momentum is improving."
    else:
        macd_status = "neutral"
        macd_text = "MACD is flat or consolidating."

    # Bollinger Bands
    upper_bb, mid_bb, lower_bb = calculate_bollinger_bands(close, 20, 2.0)
    val_upper_bb = float(upper_bb.iloc[-1])
    val_mid_bb = float(mid_bb.iloc[-1])
    val_lower_bb = float(lower_bb.iloc[-1])
    bb_width = ((val_upper_bb - val_lower_bb) / val_mid_bb) * 100

    if latest_close >= val_upper_bb:
        bb_status = "bearish"
        bb_text = "Price is touching or above the Upper Bollinger Band (stretched valuation, short-term resistance)."
    elif latest_close <= val_lower_bb:
        bb_status = "bullish"
        bb_text = "Price is at the Lower Bollinger Band support (potential rebound zone)."
    else:
        bb_status = "neutral"
        bb_text = f"Price is comfortably inside the volatility bands (Bandwidth: {round(bb_width, 1)}%)."

    # Volume & OBV
    vol = df["Volume"]
    vol_sma20 = calculate_sma(vol, 20)
    current_vol = float(vol.iloc[-1]) if not pd.isna(vol.iloc[-1]) else 0
    avg_vol = float(vol_sma20.iloc[-1]) if not pd.isna(vol_sma20.iloc[-1]) and vol_sma20.iloc[-1] > 0 else current_vol
    vol_ratio = (current_vol / avg_vol) if avg_vol > 0 else 1.0

    obv_series = calculate_obv(df)
    obv_trend = "up" if obv_series.iloc[-1] > obv_series.iloc[-5] else "down"

    if vol_ratio > 1.8 and latest_close > float(close.iloc[-2]):
        vol_status = "bullish"
        vol_text = f"High Volume Surge ({round(vol_ratio, 1)}x average) on green day — Institutional accumulation detected!"
    elif vol_ratio > 1.8 and latest_close < float(close.iloc[-2]):
        vol_status = "bearish"
        vol_text = f"High Volume Dump ({round(vol_ratio, 1)}x average) on red day — Strong institutional selling."
    else:
        vol_status = "neutral"
        vol_text = f"Normal trading volume ({round(vol_ratio, 1)}x average volume)."

    # ADX & Trend Strength
    adx, plus_di, minus_di = calculate_adx(df)
    val_adx = float(adx.iloc[-1])
    val_plus = float(plus_di.iloc[-1])
    val_minus = float(minus_di.iloc[-1])
    if val_adx > 25:
        adx_strength = "Strong Trend"
        adx_status = "bullish" if val_plus > val_minus else "bearish"
        adx_text = f"ADX is {round(val_adx, 1)} — Strong directional trend in play ({'Up' if val_plus > val_minus else 'Down'})."
    else:
        adx_strength = "Weak/Ranging"
        adx_status = "neutral"
        adx_text = f"ADX is {round(val_adx, 1)} — Weak trend; stock is moving range-bound without clear leadership."

    # ATR & Suggested Stop-Loss
    atr_series = calculate_atr(df, 14)
    val_atr = float(atr_series.iloc[-1]) if not atr_series.empty else latest_close * 0.02
    swing_stop_loss = max(0.0, round(latest_close - (1.5 * val_atr), 2))
    intraday_stop_loss = max(0.0, round(latest_close - (0.8 * val_atr), 2))
    target_price_swing = round(latest_close + (3.0 * val_atr), 2)

    # VWAP
    vwap_series = calculate_vwap(df)
    val_vwap = float(vwap_series.iloc[-1])
    vwap_status = "bullish" if latest_close >= val_vwap else "bearish"

    # Support & Resistance levels
    pivot = (float(df["High"].iloc[-1]) + float(df["Low"].iloc[-1]) + latest_close) / 3
    r1 = (2 * pivot) - float(df["Low"].iloc[-1])
    s1 = (2 * pivot) - float(df["High"].iloc[-1])
    r2 = pivot + (float(df["High"].iloc[-1]) - float(df["Low"].iloc[-1]))
    s2 = pivot - (float(df["High"].iloc[-1]) - float(df["Low"].iloc[-1]))

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
        "adx": {
            "value": round(val_adx, 1),
            "strength": adx_strength,
            "status": adx_status,
            "explanation": adx_text
        },
        "vwap": {
            "value": round(val_vwap, 2),
            "status": vwap_status,
            "explanation": f"Price is {'above' if latest_close >= val_vwap else 'below'} today's volume-weighted average price."
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
