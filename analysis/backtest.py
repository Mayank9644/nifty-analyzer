"""
Historical Backtesting Engine — Multi-Strategy Institutional Simulator.
Supports:
1. SEPA V3 (Mark Minervini Trend Template + VCP Breakout)
2. Supertrend (10, 3) Trend-Following
3. RSI Mean-Reversion Pullback (200 DMA + RSI < 35)
4. Donchian Channel Breakout (Turtle 20/10)

Applies Indian market frictions:
- STT (0.1% on delivery buy/sell)
- Brokerage (₹20 flat per executed order)
- Slippage (0.05% execution impact)
"""

import pandas as pd
import numpy as np
from data.fetcher import get_stock_history
from analysis.technical import calculate_sma, calculate_ema, calculate_atr, calculate_rsi


def calculate_supertrend(df: pd.DataFrame, period: int = 10, multiplier: float = 3.0):
    """Computes Supertrend indicator."""
    high = df["High"]
    low = df["Low"]
    close = df["Close"]
    atr = calculate_atr(df, period).fillna(0)

    hl2 = (high + low) / 2
    upper_band = hl2 + (multiplier * atr)
    lower_band = hl2 - (multiplier * atr)

    supertrend = pd.Series(index=df.index, dtype="float64")
    direction = pd.Series(index=df.index, dtype="int64")

    in_uptrend = True
    for i in range(period, len(df)):
        c = float(close.iloc[i])
        curr_upper = float(upper_band.iloc[i])
        curr_lower = float(lower_band.iloc[i])
        prev_upper = float(upper_band.iloc[i - 1])
        prev_lower = float(lower_band.iloc[i - 1])

        if c > prev_upper:
            in_uptrend = True
        elif c < prev_lower:
            in_uptrend = False

        if in_uptrend:
            supertrend.iloc[i] = max(curr_lower, prev_lower) if i > period else curr_lower
            direction.iloc[i] = 1
        else:
            supertrend.iloc[i] = min(curr_upper, prev_upper) if i > period else curr_upper
            direction.iloc[i] = -1

    return supertrend, direction


def run_strategy_backtest(symbol: str = "RELIANCE.NS", period: str = "3y", strategy: str = "sepa", capital: float = 100000.0) -> dict:
    """
    Simulates multi-strategy historical performance on Indian equities with exact friction deductions.
    """
    df = get_stock_history(symbol, period=period, interval="1d")
    if df.empty or len(df) < 60:
        return {"status": "error", "message": f"Insufficient historical data for {symbol}."}

    close = df["Close"]
    high = df["High"]
    low = df["Low"]
    dates = df.index

    sma50 = calculate_sma(close, 50)
    sma200 = calculate_sma(close, 200) if len(df) >= 200 else sma50
    ema21 = calculate_ema(close, 21)
    atr = calculate_atr(df, 14)
    rsi14 = calculate_rsi(close, 14)

    supertrend_val, supertrend_dir = calculate_supertrend(df, 10, 3.0)

    trades = []
    in_position = False
    entry_price = 0.0
    entry_date = None
    stop_loss = 0.0
    target_price = 0.0
    qty = 0

    # Start simulation after warmup period
    start_idx = 200 if len(df) >= 200 else 50
    equity = float(capital)
    equity_curve = [{"date": str(dates[start_idx])[:10], "equity": equity, "benchmark": equity}]
    initial_stock_price = float(close.iloc[start_idx])

    for i in range(start_idx, len(df)):
        c = float(close.iloc[i])
        h = float(high.iloc[i])
        l = float(low.iloc[i])
        d = dates[i].strftime("%Y-%m-%d") if hasattr(dates[i], "strftime") else str(dates[i])[:10]

        val_sma50 = float(sma50.iloc[i])
        val_sma200 = float(sma200.iloc[i])
        val_ema21 = float(ema21.iloc[i])
        val_atr = float(atr.iloc[i]) if not np.isnan(atr.iloc[i]) else c * 0.02
        val_rsi = float(rsi14.iloc[i])
        val_st_dir = int(supertrend_dir.iloc[i]) if not np.isnan(supertrend_dir.iloc[i]) else 0

        # Current stock benchmark value
        benchmark_val = round(capital * (c / initial_stock_price), 2)

        if not in_position:
            should_enter = False
            strat_name = "SEPA Breakout"

            if strategy == "supertrend":
                strat_name = "Supertrend (10, 3)"
                # Supertrend flipped to bullish + close above 50 SMA
                if val_st_dir == 1 and int(supertrend_dir.iloc[i - 1]) == -1 and c > val_sma50:
                    should_enter = True
                    stop_loss = float(supertrend_val.iloc[i])
                    target_price = c + (3.0 * val_atr)

            elif strategy == "rsi_pullback":
                strat_name = "RSI Pullback (Mean-Reversion)"
                # In long-term uptrend (close > 200 SMA) and short-term oversold pullback (RSI < 35)
                if c > val_sma200 and val_rsi < 35:
                    should_enter = True
                    stop_loss = c - (2.0 * val_atr)
                    target_price = c + (3.0 * val_atr)

            elif strategy == "donchian":
                strat_name = "Donchian 20-Day Breakout"
                donchian_high = float(high.iloc[max(0, i - 20):i].max())
                if c > donchian_high:
                    should_enter = True
                    stop_loss = float(low.iloc[max(0, i - 10):i].min())
                    target_price = c + (3.5 * val_atr)

            else:  # Default SEPA
                strat_name = "SEPA V3 Trend & VCP"
                prev_20_high = float(high.iloc[max(0, i - 20):i].max())
                if c > prev_20_high and c > val_sma50 and val_sma50 > val_sma200:
                    should_enter = True
                    stop_loss = c - (1.5 * val_atr)
                    target_price = c + (3.0 * val_atr)

            if should_enter:
                # Deduct 0.05% slippage on entry
                executed_entry = c * 1.0005
                qty = int(equity // executed_entry)
                if qty > 0:
                    in_position = True
                    entry_price = executed_entry
                    entry_date = d
        else:
            # Check exit conditions
            exit_trade = False
            exit_price = c
            reason = ""

            if l <= stop_loss:
                exit_trade = True
                exit_price = stop_loss * 0.9995  # 0.05% slippage
                reason = "Stop Loss Triggered"
            elif h >= target_price:
                exit_trade = True
                exit_price = target_price * 0.9995  # 0.05% slippage
                reason = "Target Achieved"
            elif strategy == "sepa" and c < val_ema21:
                exit_trade = True
                exit_price = c * 0.9995
                reason = "21 EMA Trailing Exit"
            elif strategy == "supertrend" and val_st_dir == -1:
                exit_trade = True
                exit_price = c * 0.9995
                reason = "Supertrend Flipped Bearish"
            elif strategy == "rsi_pullback" and val_rsi > 65:
                exit_trade = True
                exit_price = c * 0.9995
                reason = "RSI Overbought (Exit)"
            elif strategy == "donchian":
                donchian_10_low = float(low.iloc[max(0, i - 10):i].min())
                if c < donchian_10_low:
                    exit_trade = True
                    exit_price = c * 0.9995
                    reason = "Donchian 10-Day Low Break"

            if exit_trade:
                gross_ret_pct = ((exit_price - entry_price) / entry_price) * 100
                gross_pnl = (exit_price - entry_price) * qty

                # Indian Market Friction calculation:
                # STT: 0.1% on Buy value + 0.1% on Sell value
                buy_val = entry_price * qty
                sell_val = exit_price * qty
                stt = 0.001 * (buy_val + sell_val)
                brokerage = 40.0  # ₹20 on entry + ₹20 on exit
                friction = stt + brokerage

                net_pnl = round(gross_pnl - friction, 2)
                net_ret_pct = round((net_pnl / buy_val) * 100, 2) if buy_val > 0 else 0.0

                equity = round(equity + net_pnl, 2)
                trades.append({
                    "entry_date": entry_date,
                    "exit_date": d,
                    "entry_price": round(entry_price, 2),
                    "exit_price": round(exit_price, 2),
                    "quantity": qty,
                    "gross_pnl": round(gross_pnl, 2),
                    "friction_deducted": round(friction, 2),
                    "net_pnl": net_pnl,
                    "return_pct": net_ret_pct,
                    "is_win": net_pnl > 0,
                    "reason": reason
                })
                in_position = False

        equity_curve.append({
            "date": d,
            "equity": round(equity, 2),
            "benchmark": benchmark_val
        })

    # Summary Statistics
    total_trades = len(trades)
    wins = [t for t in trades if t["is_win"]]
    losses = [t for t in trades if not t["is_win"]]

    win_rate = round((len(wins) / total_trades * 100), 1) if total_trades > 0 else 0.0
    total_net_pnl = round(equity - capital, 2)
    total_return_pct = round((total_net_pnl / capital) * 100, 2)
    benchmark_return_pct = round(((float(close.iloc[-1]) - initial_stock_price) / initial_stock_price) * 100, 2)

    total_win_sum = sum(t["net_pnl"] for t in wins)
    total_loss_sum = abs(sum(t["net_pnl"] for t in losses))
    profit_factor = round(total_win_sum / total_loss_sum, 2) if total_loss_sum > 0 else (3.0 if total_win_sum > 0 else 1.0)

    avg_win = round(np.mean([t["return_pct"] for t in wins]), 2) if wins else 0.0
    avg_loss = round(np.mean([t["return_pct"] for t in losses]), 2) if losses else 0.0

    # Max Drawdown of strategy equity curve
    peak_eq = capital
    max_dd_inr = 0.0
    max_dd_pct = 0.0
    for pt in equity_curve:
        eq = pt["equity"]
        if eq > peak_eq:
            peak_eq = eq
        dd = peak_eq - eq
        if dd > max_dd_inr:
            max_dd_inr = dd
            max_dd_pct = round((dd / peak_eq) * 100, 2)

    # Strategy names dictionary
    strat_labels = {
        "sepa": "SEPA V3 · Trend Template & VCP Breakout",
        "supertrend": "Supertrend (10, 3) Trend-Following",
        "rsi_pullback": "RSI Mean-Reversion Pullback (200 DMA + RSI < 35)",
        "donchian": "Donchian 20/10 Turtle Breakout"
    }

    return {
        "status": "success",
        "symbol": symbol,
        "strategy": strategy,
        "strategy_name": strat_labels.get(strategy, "SEPA V3 Strategy"),
        "period": period,
        "initial_capital": capital,
        "final_equity": equity,
        "net_profit_inr": total_net_pnl,
        "total_trades": total_trades,
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "win_rate": win_rate,
        "total_return_pct": total_return_pct,
        "benchmark_return_pct": benchmark_return_pct,
        "alpha_pct": round(total_return_pct - benchmark_return_pct, 2),
        "profit_factor": profit_factor,
        "avg_win_pct": avg_win,
        "avg_loss_pct": avg_loss,
        "max_drawdown_pct": max_dd_pct,
        "frictions_applied": {
            "stt_rate": "0.10% (Delivery)",
            "brokerage": "₹20 flat / order",
            "slippage": "0.05% per execution"
        },
        "equity_curve": equity_curve[::3],  # Sample points for snappy chart rendering
        "trades": trades[-20:]  # Return last 20 trades
    }
