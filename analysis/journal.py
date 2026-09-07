"""
Trade Journal & Position Management Engine.
Allows taking trades directly from the scanner or stock analysis,
tracks live P&L, stop loss/target alerts, and computes performance analytics.
Backed by SQLite persistent database with automatic WAL concurrency.
"""

import time
from datetime import datetime
from data.fetcher import get_stock_info
from data.database import (
    db_get_active_trades,
    db_get_closed_trades,
    db_add_trade,
    db_close_trade,
    db_get_all_trades
)


def add_trade(symbol: str, entry_price: float, quantity: int, stop_loss: float, target_1: float, target_2: float, style: str = "Swing", notes: str = "", entry_date: str = None) -> dict:
    """Inserts a new open trade into SQLite journal."""
    code = symbol.replace(".NS", "").replace(".BO", "").replace("^", "")
    trade_id = f"trade_{int(time.time())}"
    new_trade = {
        "id": trade_id,
        "symbol": symbol,
        "code": code,
        "entry_date": entry_date if entry_date else datetime.now().strftime("%Y-%m-%d"),
        "entry_price": float(entry_price),
        "quantity": int(quantity),
        "stop_loss": float(stop_loss),
        "target_1": float(target_1),
        "target_2": float(target_2) if target_2 else None,
        "style": style,
        "status": "OPEN",
        "notes": notes,
        "is_manual": entry_date is not None
    }
    return db_add_trade(new_trade)


def get_active_trades() -> list:
    """Fetches all active trades with real-time mark-to-market valuations and P&L."""
    active = db_get_active_trades()
    results = []
    for t in active:
        info = get_stock_info(t["symbol"])
        current_price = info.get("current_price", t["entry_price"])
        pnl_per_share = current_price - t["entry_price"]
        total_pnl = round(pnl_per_share * t["quantity"], 2)
        pnl_pct = round((pnl_per_share / t["entry_price"]) * 100, 2) if t["entry_price"] else 0.0

        results.append({
            **t,
            "current_price": current_price,
            "pnl": total_pnl,
            "pnl_pct": pnl_pct,
            "is_profit": total_pnl >= 0
        })

    return results


def close_trade(trade_id: str, exit_price: float = None, reason: str = "Manual Exit") -> bool:
    """Closes an active trade in SQLite and calculates realized return."""
    active = db_get_active_trades()
    target = next((t for t in active if t["id"] == trade_id), None)
    if not target:
        return False

    if exit_price is None:
        info = get_stock_info(target["symbol"])
        exit_price = info.get("current_price", target["entry_price"])

    res = db_close_trade(trade_id, float(exit_price))
    return res.get("status") == "success"


def get_journal_stats() -> dict:
    """Computes closed-trade performance analytics from SQLite records."""
    closed = db_get_closed_trades()
    total_closed = len(closed)
    wins = [t for t in closed if (t.get("pnl") or 0) > 0]
    losses = [t for t in closed if (t.get("pnl") or 0) <= 0]

    win_rate = round((len(wins) / total_closed * 100), 1) if total_closed > 0 else 0.0
    total_profit = sum((t.get("pnl") or 0) for t in wins)
    total_loss = abs(sum((t.get("pnl") or 0) for t in losses))
    net_pnl = round(sum((t.get("pnl") or 0) for t in closed), 2)
    profit_factor = round(total_profit / total_loss, 2) if total_loss > 0 else (total_profit if total_profit > 0 else 1.0)

    return {
        "total_trades": total_closed,
        "winning_trades": len(wins),
        "losing_trades": len(losses),
        "win_rate": win_rate,
        "total_profit_inr": round(total_profit, 2),
        "total_loss_inr": round(total_loss, 2),
        "net_pnl_inr": net_pnl,
        "profit_factor": profit_factor,
        "closed_history": closed
    }
