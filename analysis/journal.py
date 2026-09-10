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


def add_trade(symbol: str, entry_price: float, quantity: int, stop_loss: float, target_1: float, target_2: float, style: str = "Swing", notes: str = "", entry_date: str = None, tags: str = "") -> dict:
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
        "tags": tags,
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

        # Risk amount based on stop loss
        sl = float(t.get("stop_loss") or 0.0)
        risk_per_share = max(0.0, t["entry_price"] - sl) if sl > 0 else 0.0
        total_risk = round(risk_per_share * t["quantity"], 2)

        results.append({
            **t,
            "current_price": current_price,
            "pnl": total_pnl,
            "pnl_pct": pnl_pct,
            "is_profit": total_pnl >= 0,
            "total_risk": total_risk
        })

    return results


def close_trade(trade_id: str, exit_price: float = None, reason: str = "Manual Exit", exit_tags: str = None) -> bool:
    """Closes an active trade in SQLite and calculates realized return."""
    active = db_get_active_trades()
    target = next((t for t in active if t["id"] == trade_id), None)
    if not target:
        return False

    if exit_price is None:
        info = get_stock_info(target["symbol"])
        exit_price = info.get("current_price", target["entry_price"])

    res = db_close_trade(trade_id, float(exit_price), exit_tags=exit_tags)
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


def get_journal_analytics() -> dict:
    """
    Computes institutional-grade journal analytics:
    - Chronological Cumulative Equity Curve
    - Max Drawdown (INR & %)
    - Trade Expectancy (₹/trade)
    - Profit Factor & Win/Loss Averages
    - Calendar P&L Heatmap daily aggregates
    - Behavioral Discipline / Mistake Tag Breakdown
    """
    closed = db_get_closed_trades()
    # Sort chronologically ascending for equity curve
    chronological = sorted(closed, key=lambda x: (x.get("exit_date") or x.get("entry_date") or "2000-01-01"))

    equity_curve = []
    cum_pnl = 0.0
    peak_pnl = 0.0
    max_drawdown = 0.0
    max_drawdown_pct = 0.0

    daily_calendar = {}
    tag_counts = {}

    wins = []
    losses = []

    for t in chronological:
        pnl = float(t.get("pnl") or 0.0)
        cum_pnl = round(cum_pnl + pnl, 2)
        if cum_pnl > peak_pnl:
            peak_pnl = cum_pnl
        dd = round(peak_pnl - cum_pnl, 2)
        if dd > max_drawdown:
            max_drawdown = dd
        
        exit_d = t.get("exit_date") or t.get("entry_date") or datetime.now().strftime("%Y-%m-%d")
        equity_curve.append({
            "date": exit_d,
            "trade_pnl": pnl,
            "cum_pnl": cum_pnl,
            "code": t.get("code", ""),
            "pnl_pct": float(t.get("pnl_pct") or 0.0)
        })

        if pnl > 0:
            wins.append(pnl)
        else:
            losses.append(abs(pnl))

        # Calendar aggregation
        if exit_d not in daily_calendar:
            daily_calendar[exit_d] = {"pnl": 0.0, "trades": 0, "wins": 0, "losses": 0, "symbols": []}
        daily_calendar[exit_d]["pnl"] = round(daily_calendar[exit_d]["pnl"] + pnl, 2)
        daily_calendar[exit_d]["trades"] += 1
        if pnl > 0:
            daily_calendar[exit_d]["wins"] += 1
        else:
            daily_calendar[exit_d]["losses"] += 1
        daily_calendar[exit_d]["symbols"].append(t.get("code", ""))

        # Tag breakdown
        tags_raw = t.get("tags") or "Followed Plan"
        tag_list = [tag.strip() for tag in tags_raw.split(",") if tag.strip()]
        if not tag_list:
            tag_list = ["Uncategorized"]
        for tag in tag_list:
            if tag not in tag_counts:
                tag_counts[tag] = {"trades": 0, "pnl": 0.0, "wins": 0, "losses": 0}
            tag_counts[tag]["trades"] += 1
            tag_counts[tag]["pnl"] = round(tag_counts[tag]["pnl"] + pnl, 2)
            if pnl > 0:
                tag_counts[tag]["wins"] += 1
            else:
                tag_counts[tag]["losses"] += 1

    total_closed = len(closed)
    win_count = len(wins)
    loss_count = len(losses)
    win_rate = round((win_count / total_closed * 100), 1) if total_closed > 0 else 0.0
    total_profit = sum(wins)
    total_loss = sum(losses)
    profit_factor = round(total_profit / total_loss, 2) if total_loss > 0 else (total_profit if total_profit > 0 else 1.0)

    avg_win = round(total_profit / win_count, 2) if win_count > 0 else 0.0
    avg_loss = round(total_loss / loss_count, 2) if loss_count > 0 else 0.0
    win_rate_dec = win_count / total_closed if total_closed > 0 else 0.0
    loss_rate_dec = loss_count / total_closed if total_closed > 0 else 0.0
    expectancy = round((win_rate_dec * avg_win) - (loss_rate_dec * avg_loss), 2)

    # Convert tag stats to sorted list
    tag_breakdown = []
    for tag_name, data in tag_counts.items():
        w_rate = round((data["wins"] / data["trades"] * 100), 1) if data["trades"] > 0 else 0.0
        tag_breakdown.append({
            "tag": tag_name,
            "trades": data["trades"],
            "pnl": data["pnl"],
            "win_rate": w_rate
        })
    tag_breakdown.sort(key=lambda x: x["pnl"], reverse=True)

    # Active exposure calculation
    active = get_active_trades()
    total_unrealized_pnl = round(sum(t.get("pnl", 0.0) for t in active), 2)
    total_capital_deployed = round(sum(float(t.get("entry_price", 0.0)) * int(t.get("quantity", 1)) for t in active), 2)
    total_open_risk = round(sum(t.get("total_risk", 0.0) for t in active), 2)

    return {
        "status": "success",
        "summary": {
            "total_trades": total_closed,
            "winning_trades": win_count,
            "losing_trades": loss_count,
            "win_rate": win_rate,
            "total_profit_inr": round(total_profit, 2),
            "total_loss_inr": round(total_loss, 2),
            "net_pnl_inr": round(cum_pnl, 2),
            "profit_factor": profit_factor,
            "avg_win_inr": avg_win,
            "avg_loss_inr": avg_loss,
            "expectancy_inr": expectancy,
            "max_drawdown_inr": round(max_drawdown, 2),
            "unrealized_pnl_inr": total_unrealized_pnl,
            "capital_deployed_inr": total_capital_deployed,
            "total_open_risk_inr": total_open_risk
        },
        "equity_curve": equity_curve,
        "daily_calendar": daily_calendar,
        "tag_breakdown": tag_breakdown
    }
