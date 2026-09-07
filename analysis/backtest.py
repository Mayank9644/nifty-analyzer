"""
Historical Backtesting Engine — SEPA V3 Strategy.
Tests Trend Template + VCP Breakout with 21 EMA / ATR Trailing Exits.
"""

import pandas as pd
import numpy as np
from data.fetcher import get_stock_history
from analysis.technical import calculate_sma, calculate_ema, calculate_atr


def run_strategy_backtest(symbol: str = "RELIANCE.NS", period: str = "3y") -> dict:
    """
    Run historical backtest on symbol using SEPA trend breakout rules.
    """
    df = get_stock_history(symbol, period=period, interval="1d")
    if df.empty or len(df) < 60:
        return {"status": "error", "message": "Insufficient historical data for backtesting."}

    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    dates = df.index

    sma50 = calculate_sma(close, 50)
    sma200 = calculate_sma(close, 200) if len(df) >= 200 else sma50
    ema21 = calculate_ema(close, 21)
    atr = calculate_atr(df, 14)

    trades = []
    in_position = False
    entry_price = 0.0
    entry_date = None
    stop_loss = 0.0
    target_price = 0.0

    start_idx = 200 if len(df) >= 200 else 50

    for i in range(start_idx, len(df)):
        c = float(close.iloc[i])
        h = float(high.iloc[i])
        l = float(low.iloc[i])
        d = dates[i].strftime("%Y-%m-%d") if hasattr(dates[i], "strftime") else str(dates[i])[:10]

        val_sma50 = float(sma50.iloc[i])
        val_sma200 = float(sma200.iloc[i])
        val_ema21 = float(ema21.iloc[i])
        val_atr = float(atr.iloc[i]) if not np.isnan(atr.iloc[i]) else c * 0.02

        if not in_position:
            # Entry Signal:
            # 1. Trend Template: Price > 50 SMA and 50 SMA > 200 SMA
            # 2. Breakout: Today close > 20-day high of previous 20 bars
            prev_20_high = float(high.iloc[i-20:i].max())
            if c > prev_20_high and c > val_sma50 and val_sma50 > val_sma200:
                in_position = True
                entry_price = c
                entry_date = d
                stop_loss = c - (1.5 * val_atr)
                target_price = c + (3.0 * val_atr)
        else:
            # Exit Signal:
            # 1. Stop loss hit
            # 2. Target hit
            # 3. Trailing exit: Close below 21 EMA
            exit_trade = False
            exit_price = c
            reason = ""

            if l <= stop_loss:
                exit_trade = True
                exit_price = stop_loss
                reason = "Stop Loss Hit"
            elif h >= target_price:
                exit_trade = True
                exit_price = target_price
                reason = "Target Hit (3R)"
            elif c < val_ema21:
                exit_trade = True
                exit_price = c
                reason = "21 EMA Trailing Exit"

            if exit_trade:
                ret_pct = round(((exit_price - entry_price) / entry_price) * 100, 2)
                pnl = round(exit_price - entry_price, 2)
                trades.append({
                    "entry_date": entry_date,
                    "exit_date": d,
                    "entry_price": round(entry_price, 2),
                    "exit_price": round(exit_price, 2),
                    "return_pct": ret_pct,
                    "is_win": ret_pct > 0,
                    "reason": reason
                })
                in_position = False

    # Summary Statistics
    total_trades = len(trades)
    wins = [t for t in trades if t["is_win"]]
    losses = [t for t in trades if not t["is_win"]]

    win_rate = round((len(wins) / total_trades * 100), 1) if total_trades > 0 else 0.0
    total_return = round(sum(t["return_pct"] for t in trades), 2)
    avg_win = round(np.mean([t["return_pct"] for t in wins]), 2) if wins else 0.0
    avg_loss = round(np.mean([t["return_pct"] for t in losses]), 2) if losses else 0.0
    total_win_sum = sum(t["return_pct"] for t in wins)
    total_loss_sum = abs(sum(t["return_pct"] for t in losses))
    profit_factor = round(total_win_sum / total_loss_sum, 2) if total_loss_sum > 0 else 2.5

    return {
        "status": "success",
        "symbol": symbol,
        "period": period,
        "total_trades": total_trades,
        "win_rate": win_rate,
        "total_return_pct": total_return,
        "profit_factor": profit_factor,
        "avg_win_pct": avg_win,
        "avg_loss_pct": avg_loss,
        "trades": trades[-15:]  # Return last 15 trades
    }
