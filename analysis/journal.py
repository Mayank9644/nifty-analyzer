"""
Trade Journal & Position Management Engine.
Allows taking trades directly from the scanner or stock analysis,
tracks live P&L, stop loss/target alerts, and computes performance analytics.
Backed by SQLite persistent database with automatic WAL concurrency
and parallelized live quote resolution.
"""

import time
import uuid
from datetime import datetime
from concurrent.futures import ThreadPoolExecutor, as_completed
from data.fetcher import get_stock_info
from data.database import (
    db_get_active_trades,
    db_get_closed_trades,
    db_add_trade,
    db_close_trade,
    db_get_all_trades,
    db_clear_journal,
    db_update_trade,
    db_partial_exit,
    db_get_trade_by_id
)
from config import (
    STT_DELIVERY_BPS,
    BROKERAGE_PER_ORDER_INR,
    EXCHANGE_TURNOVER_BPS
)

# Persistent bounded executor for parallel quote fetching
_JOURNAL_EXECUTOR = ThreadPoolExecutor(max_workers=8, thread_name_prefix="JournalMTM")


def add_trade(symbol: str, entry_price: float, quantity: int, stop_loss: float, target_1: float, target_2: float, style: str = "Swing", notes: str = "", entry_date: str = None, tags: str = "") -> dict:
    """Inserts a new open trade into SQLite journal."""
    code = symbol.replace(".NS", "").replace(".BO", "").replace("^", "")
    trade_id = f"trade_{int(time.time()*1000)}_{uuid.uuid4().hex[:6]}"
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


def _fetch_single_trade_mtm(t: dict) -> dict:
    """Worker task to fetch live quote and compute MTM metrics for a single trade."""
    sym = t.get("symbol", "")
    entry = float(t.get("entry_price") or 0.0)
    qty = int(t.get("quantity") or 1)

    try:
        info = get_stock_info(sym)
        curr = float(info.get("current_price") or entry)
        sector = info.get("sector") or "Diversified"
    except Exception:
        curr = entry
        sector = "Diversified"

    pnl_per_share = curr - entry
    total_pnl = round(pnl_per_share * qty, 2)
    pnl_pct = round((pnl_per_share / entry) * 100.0, 2) if entry > 0 else 0.0

    sl = float(t.get("stop_loss") or 0.0)
    risk_per_share = max(0.0, entry - sl) if sl > 0 else 0.0
    total_risk = round(risk_per_share * qty, 2)

    return {
        **t,
        "current_price": curr,
        "sector": sector,
        "pnl": total_pnl,
        "pnl_pct": pnl_pct,
        "is_profit": total_pnl >= 0,
        "total_risk": total_risk
    }


def get_active_trades() -> list:
    """Fetches all active trades with parallelized real-time mark-to-market valuations and P&L."""
    active = db_get_active_trades()
    if not active:
        return []

    results = []
    futures = [_JOURNAL_EXECUTOR.submit(_fetch_single_trade_mtm, t) for t in active]
    for future in as_completed(futures):
        try:
            results.append(future.result())
        except Exception:
            pass

    return results


def _calculate_trade_friction(symbol: str, code: str, buy_val: float, sell_val: float) -> tuple:
    """Computes exact statutory Indian trade friction with differentiated ETF treatment."""
    sym_upper = str(symbol or "").upper()
    code_upper = str(code or "").upper()
    is_etf = sym_upper.endswith("BEES.NS") or "BEES" in code_upper or sym_upper.endswith("ETF.NS")

    if is_etf:
        # Indian Finance Act: ETFs incur 0.001% (0.1 bps) STT on Sell side only (0% on buy)
        stt = (0.1 / 10000.0) * sell_val
    else:
        # Standard NSE Delivery STT: 0.10% (10 bps) on both buy and sell
        stt = (STT_DELIVERY_BPS / 10000.0) * (buy_val + sell_val)

    turnover_fee = (EXCHANGE_TURNOVER_BPS / 10000.0) * (buy_val + sell_val)
    brokerage = BROKERAGE_PER_ORDER_INR * 2.0  # Buy + Sell
    friction = stt + turnover_fee + brokerage
    return friction, stt


def close_trade(trade_id: str, exit_price: float = None, reason: str = "Manual Exit", exit_tags: str = None) -> bool:
    """Closes an active trade in SQLite with institutional friction deduction."""
    active = db_get_active_trades()
    target = next((t for t in active if t["id"] == trade_id), None)
    if not target:
        return False

    entry = float(target["entry_price"])
    qty = int(target["quantity"])
    buy_val = entry * qty
    sell_val = float(exit_price) * qty
    gross_pnl = (float(exit_price) - entry) * qty

    friction, _ = _calculate_trade_friction(target.get("symbol"), target.get("code"), buy_val, sell_val)

    net_pnl = round(gross_pnl - friction, 2)
    net_pnl_pct = round((net_pnl / buy_val) * 100.0, 2) if buy_val > 0 else 0.0

    res = db_close_trade(trade_id, float(exit_price), exit_tags=exit_tags, realized_pnl=net_pnl, realized_pct=net_pnl_pct)
    return res.get("status") == "success"


def update_trade_details(trade_id: str, data: dict) -> dict:
    """Updates fields of an open trade in SQLite with validation."""
    clean = {}
    if "entry_price" in data and data["entry_price"] is not None:
        try:
            clean["entry_price"] = round(float(data["entry_price"]), 2)
        except (ValueError, TypeError):
            pass
    if "quantity" in data and data["quantity"] is not None:
        try:
            clean["quantity"] = max(1, int(data["quantity"]))
        except (ValueError, TypeError):
            pass
    if "stop_loss" in data and data["stop_loss"] is not None:
        try:
            clean["stop_loss"] = round(float(data["stop_loss"]), 2)
        except (ValueError, TypeError):
            pass
    if "target_1" in data and data["target_1"] is not None:
        try:
            clean["target_1"] = round(float(data["target_1"]), 2)
        except (ValueError, TypeError):
            pass
    if "target_2" in data and data["target_2"] is not None:
        try:
            val = float(data["target_2"])
            clean["target_2"] = round(val, 2) if val > 0 else None
        except (ValueError, TypeError):
            clean["target_2"] = None
    if "style" in data and data["style"]:
        clean["style"] = str(data["style"]).strip()
    if "notes" in data:
        clean["notes"] = str(data["notes"] or "").strip()
    if "tags" in data:
        clean["tags"] = str(data["tags"] or "").strip()
    if "entry_date" in data and data["entry_date"]:
        clean["entry_date"] = str(data["entry_date"]).strip()

    return db_update_trade(trade_id, clean)


def execute_partial_exit(trade_id: str, exit_qty: int, exit_price: float = None, exit_tags: str = None) -> dict:
    """Closes a partial portion of an active trade with prorated friction deduction."""
    active = db_get_active_trades()
    target = next((t for t in active if t["id"] == trade_id), None)
    if not target:
        return {"status": "error", "message": f"Active trade {trade_id} not found."}

    total_qty = int(target["quantity"])
    try:
        exit_qty = int(exit_qty)
    except (ValueError, TypeError):
        return {"status": "error", "message": "Exit quantity must be an integer."}

    if exit_qty <= 0 or exit_qty > total_qty:
        return {"status": "error", "message": f"Invalid exit quantity {exit_qty} (must be between 1 and {total_qty})."}

    if exit_price is None or float(exit_price) <= 0:
        info = get_stock_info(target["symbol"])
        exit_price = float(info.get("current_price") or target["entry_price"])
    else:
        exit_price = float(exit_price)

    entry = float(target["entry_price"])
    buy_val = entry * exit_qty
    sell_val = exit_price * exit_qty
    gross_pnl = (exit_price - entry) * exit_qty

    friction, _ = _calculate_trade_friction(target.get("symbol"), target.get("code"), buy_val, sell_val)

    net_pnl = round(gross_pnl - friction, 2)
    net_pnl_pct = round((net_pnl / buy_val) * 100.0, 2) if buy_val > 0 else 0.0

    res = db_partial_exit(
        trade_id=trade_id,
        exit_qty=exit_qty,
        exit_price=round(exit_price, 2),
        exit_tags=exit_tags or "Partial Profit Booking",
        realized_pnl=net_pnl,
        realized_pct=net_pnl_pct
    )
    if isinstance(res, dict) and res.get("status") == "success":
        res["realized_pnl"] = net_pnl
        res["realized_pct"] = net_pnl_pct
        res["friction_deducted"] = round(friction, 2)
        res["remaining_quantity"] = total_qty - exit_qty
    return res


def auto_calculate_risk_parameters(trade_id: str = None) -> dict:
    """
    Automatically calculates and applies technical Stop Loss and Target 1 & 2
    for active trades where Stop Loss is currently 0.0 (or for a specific trade).
    Uses standard parameters: -5.5% SL, +11% T1 (1:2 R:R), +20% T2 for Stocks,
    and -4.5% SL, +8% T1, +15% T2 for ETFs.
    """
    active = db_get_active_trades()
    if not active:
        return {"status": "error", "message": "No active trades in journal."}

    targets = [t for t in active if t["id"] == trade_id] if trade_id else active
    updated = []

    for t in targets:
        sl = float(t.get("stop_loss") or 0.0)
        # If trade_id is specified or sl is 0:
        if trade_id or sl <= 0.01:
            sym = t.get("symbol", "")
            code = t.get("code") or sym.replace(".NS", "")
            style = t.get("style", "Swing")

            try:
                info = get_stock_info(sym)
                cmp_val = float(info.get("current_price") or t.get("entry_price") or 100.0)
            except Exception:
                cmp_val = float(t.get("entry_price") or 100.0)

            is_etf = "BEES" in code or "ETF" in code or "GOLD" in code or style == "ETF"

            if is_etf:
                new_sl = round(cmp_val * 0.955, 2)
                new_t1 = round(cmp_val * 1.080, 2)
                new_t2 = round(cmp_val * 1.150, 2)
                notes_tag = "Risk Shield: 4.5% ETF buffer"
            else:
                new_sl = round(cmp_val * 0.945, 2)
                new_t1 = round(cmp_val * 1.110, 2)
                new_t2 = round(cmp_val * 1.200, 2)
                notes_tag = "Risk Shield: 5.5% swing stop (1:2 R:R)"

            existing_notes = t.get("notes") or ""
            new_notes = f"{existing_notes} [{notes_tag}]".strip() if notes_tag not in existing_notes else existing_notes

            res = db_update_trade(t["id"], {
                "stop_loss": new_sl,
                "target_1": new_t1,
                "target_2": new_t2,
                "notes": new_notes
            })
            if res.get("status") == "success":
                updated.append({
                    "id": t["id"],
                    "code": code,
                    "cmp": cmp_val,
                    "stop_loss": new_sl,
                    "target_1": new_t1,
                    "target_2": new_t2
                })

    return {
        "status": "success",
        "updated_count": len(updated),
        "updated_trades": updated,
        "message": f"Successfully calculated and applied risk shield to {len(updated)} position(s)."
    }


def bulk_import_trades_from_csv(csv_content: str) -> dict:
    """
    Parses CSV text and imports trades into SQLite journal.
    Supports flexible column names from Zerodha, Groww, or Excel sheets.
    """
    import csv
    import io

    if not csv_content or not csv_content.strip():
        return {"status": "error", "message": "CSV content cannot be empty."}

    f = io.StringIO(csv_content.strip())
    reader = csv.reader(f)
    try:
        header = [h.strip().lower() for h in next(reader)]
    except Exception as e:
        return {"status": "error", "message": f"Failed to read CSV header: {e}"}

    def find_col(candidates):
        for c in candidates:
            for idx, h in enumerate(header):
                if c in h:
                    return idx
        return -1

    idx_sym   = find_col(["symbol", "ticker", "trading symbol", "code", "stock"])
    idx_price = find_col(["entry price", "buy price", "price", "entry_price", "cost"])
    idx_qty   = find_col(["quantity", "qty", "units", "shares"])
    idx_date  = find_col(["entry date", "date", "entry_date", "trade date"])
    idx_sl    = find_col(["stop loss", "stop_loss", "sl", "stop"])
    idx_t1    = find_col(["target 1", "target_1", "target", "t1"])
    idx_t2    = find_col(["target 2", "target_2", "t2"])
    idx_style = find_col(["style", "type", "trade style"])
    idx_notes = find_col(["notes", "rationale", "remarks", "comment"])
    idx_tags  = find_col(["tags", "tag", "discipline"])

    if idx_sym == -1 or idx_price == -1 or idx_qty == -1:
        return {
            "status": "error",
            "message": "CSV must contain at least Symbol, Entry Price, and Quantity columns."
        }

    imported = []
    errors = []

    for row_num, row in enumerate(reader, start=2):
        if not row or not any(row):
            continue
        try:
            raw_sym = row[idx_sym].strip().upper()
            if not raw_sym:
                continue
            if not raw_sym.endswith(".NS") and not raw_sym.endswith(".BO") and not raw_sym.startswith("^"):
                raw_sym = f"{raw_sym}.NS"

            price = float(row[idx_price].replace(",", "").replace("₹", "").strip())
            qty   = int(float(row[idx_qty].replace(",", "").strip()))

            entry_d = row[idx_date].strip() if idx_date != -1 and len(row) > idx_date else datetime.now().strftime("%Y-%m-%d")
            sl      = float(row[idx_sl].replace(",", "").strip()) if idx_sl != -1 and len(row) > idx_sl and row[idx_sl].strip() else 0.0
            t1      = float(row[idx_t1].replace(",", "").strip()) if idx_t1 != -1 and len(row) > idx_t1 and row[idx_t1].strip() else 0.0
            t2      = float(row[idx_t2].replace(",", "").strip()) if idx_t2 != -1 and len(row) > idx_t2 and row[idx_t2].strip() else 0.0
            style   = row[idx_style].strip() if idx_style != -1 and len(row) > idx_style and row[idx_style].strip() else ("ETF" if "BEES" in raw_sym or "ETF" in raw_sym else "Swing")
            notes   = row[idx_notes].strip() if idx_notes != -1 and len(row) > idx_notes else "Bulk imported from spreadsheet"
            tags    = row[idx_tags].strip() if idx_tags != -1 and len(row) > idx_tags else "Imported"

            trade = add_trade(
                symbol=raw_sym,
                entry_price=price,
                quantity=qty,
                stop_loss=sl,
                target_1=t1,
                target_2=t2,
                style=style,
                notes=notes,
                entry_date=entry_d,
                tags=tags
            )
            imported.append(trade)
        except Exception as err:
            errors.append(f"Row {row_num}: {err}")

    return {
        "status": "success",
        "imported_count": len(imported),
        "imported_trades": imported,
        "errors": errors,
        "message": f"Successfully imported {len(imported)} trade(s) into journal."
    }


def get_active_portfolio_summary() -> dict:
    """Computes high-level KPI metrics across all active open positions."""
    active = get_active_trades()
    if not active:
        return {
            "total_positions": 0,
            "total_invested": 0.0,
            "total_current_value": 0.0,
            "total_unrealized_pnl": 0.0,
            "unrealized_pnl_pct": 0.0,
            "total_open_risk": 0.0,
            "gainers_count": 0,
            "losers_count": 0,
            "etf_count": 0,
            "stock_count": 0,
            "top_gainer": None,
            "top_loser": None
        }

    total_invested = 0.0
    total_current_val = 0.0
    total_open_risk = 0.0
    gainers = []
    losers = []
    etf_count = 0
    stock_count = 0

    for t in active:
        entry = float(t.get("entry_price") or 0.0)
        curr = float(t.get("current_price") or entry)
        qty = int(t.get("quantity") or 1)
        pnl = float(t.get("pnl") or 0.0)
        pnl_pct = float(t.get("pnl_pct") or 0.0)
        sl = float(t.get("stop_loss") or 0.0)

        cost = entry * qty
        mkt_val = curr * qty
        total_invested += cost
        total_current_val += mkt_val

        if sl > 0 and sl < curr:
            total_open_risk += (curr - sl) * qty

        code = t.get("code", "")
        style = t.get("style", "")
        if "BEES" in code or "ETF" in code or style == "ETF":
            etf_count += 1
        else:
            stock_count += 1

        item = {"code": code, "pnl": round(pnl, 2), "pnl_pct": round(pnl_pct, 2), "current_price": round(curr, 2)}
        if pnl > 0:
            gainers.append(item)
        else:
            losers.append(item)

    gainers.sort(key=lambda x: x["pnl_pct"], reverse=True)
    losers.sort(key=lambda x: x["pnl_pct"])

    unrealized_pnl = round(total_current_val - total_invested, 2)
    unrealized_pct = round((unrealized_pnl / total_invested) * 100.0, 2) if total_invested > 0 else 0.0

    return {
        "total_positions": len(active),
        "total_invested": round(total_invested, 2),
        "total_current_value": round(total_current_val, 2),
        "total_unrealized_pnl": unrealized_pnl,
        "unrealized_pnl_pct": unrealized_pct,
        "total_open_risk": round(total_open_risk, 2),
        "gainers_count": len(gainers),
        "losers_count": len(losers),
        "etf_count": etf_count,
        "stock_count": stock_count,
        "top_gainer": gainers[0] if gainers else None,
        "top_loser": losers[0] if losers else None
    }


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
    - Recovery Factor (Net P&L / Max Drawdown)
    - Calendar P&L Heatmap daily aggregates
    - Behavioral Discipline / Mistake Tag Breakdown
    """
    closed = db_get_closed_trades()
    chronological = sorted(closed, key=lambda x: (x.get("exit_date") or x.get("entry_date") or "2000-01-01"))

    equity_curve = []
    cum_pnl = 0.0
    peak_pnl = 0.0
    max_drawdown = 0.0

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

    recovery_factor = round(cum_pnl / max_drawdown, 2) if max_drawdown > 0 else (cum_pnl if cum_pnl > 0 else 0.0)

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
            "recovery_factor": recovery_factor,
            "unrealized_pnl_inr": total_unrealized_pnl,
            "capital_deployed_inr": total_capital_deployed,
            "total_open_risk_inr": total_open_risk
        },
        "equity_curve": equity_curve,
        "daily_calendar": daily_calendar,
        "tag_breakdown": tag_breakdown
    }


def get_journal_etf_status() -> dict:
    """
    Analyzes active open ETF trades in the SQLite journal.
    Calculates the user's actual portfolio ETF allocation (% Equity, % Gold, % Liquid),
    compares against current market regime recommendations, and generates actionable shift guidance.
    """
    active_trades = get_active_trades()

    KNOWN_EQUITY_ETFS = {
        "NIFTYBEES", "BANKBEES", "JUNIORBEES", "MID150BEES", "ITBEES", "PHARMABEES",
        "AUTOBEES", "PSUBNKBEES", "CPSEETF", "INFRABEES", "MON100", "HNGSNGBEES", "SETFNIF50", "KOTAKNIFTY"
    }
    KNOWN_GOLD_ETFS = {"GOLDBEES", "SILVERBEES"}
    KNOWN_LIQUID_ETFS = {"LIQUIDBEES", "LIQUIDETF"}

    etf_trades = []
    equity_val = 0.0
    gold_val = 0.0
    liquid_val = 0.0

    for t in active_trades:
        sym = (t.get("symbol") or "").upper().replace(".NS", "").replace(".BO", "")
        code = (t.get("code") or sym).upper()
        style = (t.get("style") or "").upper()
        tags = (t.get("tags") or "").upper()

        is_etf = False
        cat = "EQUITY"

        if "GOLD" in code or "SILVER" in code or code in KNOWN_GOLD_ETFS:
            is_etf = True
            cat = "GOLD"
        elif "LIQUID" in code or code in KNOWN_LIQUID_ETFS:
            is_etf = True
            cat = "LIQUID"
        elif "BEES" in code or "ETF" in code or code in KNOWN_EQUITY_ETFS or style == "ETF" or "ETF" in tags:
            is_etf = True
            cat = "EQUITY"

        if is_etf:
            qty = int(t.get("quantity") or 1)
            cmp = float(t.get("current_price") or t.get("entry_price") or 0.0)
            val = round(qty * cmp, 2)
            trade_item = {
                "id": t.get("id"),
                "symbol": t.get("symbol"),
                "code": code,
                "category": cat,
                "quantity": qty,
                "entry_price": round(float(t.get("entry_price") or 0.0), 2),
                "current_price": round(cmp, 2),
                "market_value": val,
                "pnl": round(float(t.get("pnl") or 0.0), 2),
                "pnl_pct": round(float(t.get("pnl_pct") or 0.0), 2)
            }
            etf_trades.append(trade_item)
            if cat == "GOLD":
                gold_val += val
            elif cat == "LIQUID":
                liquid_val += val
            else:
                equity_val += val

    total_etf_value = round(equity_val + gold_val + liquid_val, 2)
    has_holdings = total_etf_value > 0

    if has_holdings:
        equity_pct = round((equity_val / total_etf_value) * 100.0, 1)
        gold_pct = round((gold_val / total_etf_value) * 100.0, 1)
        liquid_pct = round((liquid_val / total_etf_value) * 100.0, 1)
    else:
        equity_pct = 0.0
        gold_pct = 0.0
        liquid_pct = 0.0

    # Retrieve live market regime from bees_strategy
    recommended_etf = "NIFTYBEES"
    summary_text = "Market regime favors Equities."
    nifty_price = 272.0
    gold_price = 126.0
    try:
        from analysis.bees_strategy import evaluate_single_etf_strategy
        bees_res = evaluate_single_etf_strategy(investment_amount=100000.0, current_holding="NONE")
        recommended_etf = bees_res.get("recommended_etf", "NIFTYBEES")
        summary_text = bees_res.get("summary", "")
        nifty_price = bees_res.get("ratio", {}).get("nifty_price", 272.0)
        gold_price = bees_res.get("ratio", {}).get("gold_price", 126.0)
    except Exception:
        pass

    # Build shift recommendation based on actual holdings vs recommended regime
    if not has_holdings:
        shift_recommendation = {
            "signal": "NO_ETF_HOLDINGS",
            "badge": f"💡 RECOMMENDED TO START: {recommended_etf}",
            "badge_color": "#007aff",
            "title": f"No Active ETF Trades in Journal — Market Favors {recommended_etf}",
            "description": f"The Donchian rotation engine is currently in an **{'Equity Outperformance' if recommended_etf == 'NIFTYBEES' else 'Gold Safe-Haven'}** regime. Add an ETF position to your journal to activate live portfolio tracking and shift alerts.",
            "action_text": f"+ Log {recommended_etf} to Journal",
            "action_symbol": f"{recommended_etf}.NS",
            "suggested_price": round(nifty_price if recommended_etf == "NIFTYBEES" else gold_price, 2),
            "can_shift": False
        }
    elif recommended_etf == "NIFTYBEES":
        if gold_val > 0 and gold_pct >= 25.0:
            shift_amount = round(gold_val * 0.5, 2)
            suggested_nifty_units = int(shift_amount / nifty_price) if nifty_price > 0 else 10
            shift_recommendation = {
                "signal": "SHIFT_TO_NIFTYBEES",
                "badge": "🔄 SHIFT ALERT: GOLDBEES ➔ NIFTYBEES",
                "badge_color": "#10B981",
                "title": "Shift Capital from Gold to Equities (Bull Market Trend)",
                "description": f"You currently hold ₹{gold_val:,.2f} ({gold_pct}%) in Gold ETFs. Equities are currently outperforming Gold. Consider shifting ~₹{shift_amount:,.2f} into NIFTYBEES (~{suggested_nifty_units} units @ ₹{nifty_price:.2f}) to maximize compounding.",
                "action_text": "Shift to NIFTYBEES",
                "action_symbol": "NIFTYBEES.NS",
                "from_symbol": "GOLDBEES.NS",
                "suggested_price": round(nifty_price, 2),
                "can_shift": True
            }
        else:
            shift_recommendation = {
                "signal": "HOLD_NIFTYBEES",
                "badge": "✅ OPTIMAL ALLOCATION (HOLD NIFTYBEES)",
                "badge_color": "#10B981",
                "title": "Your Portfolio is Well-Positioned in Equities",
                "description": f"You are holding {equity_pct}% in Equity ETFs during this bullish expansion regime. Continue holding with a trailing stop at the 50-day average.",
                "action_text": "Hold Current Positions",
                "action_symbol": "NIFTYBEES.NS",
                "can_shift": False
            }
    else:  # recommended_etf == "GOLDBEES"
        if equity_val > 0 and equity_pct >= 25.0:
            shift_amount = round(equity_val * 0.5, 2)
            suggested_gold_units = int(shift_amount / gold_price) if gold_price > 0 else 10
            shift_recommendation = {
                "signal": "SHIFT_TO_GOLDBEES",
                "badge": "🛡️ RISK ALERT: NIFTYBEES ➔ GOLDBEES",
                "badge_color": "#F59E0B",
                "title": "Shift Capital from Equities to Gold (Safe-Haven Mode)",
                "description": f"You currently hold ₹{equity_val:,.2f} ({equity_pct}%) in Equity ETFs. Markets have entered a defensive correction where Gold is outperforming. Consider shifting ~₹{shift_amount:,.2f} into GOLDBEES (~{suggested_gold_units} units @ ₹{gold_price:.2f}) to protect your gains.",
                "action_text": "Shift to GOLDBEES",
                "action_symbol": "GOLDBEES.NS",
                "from_symbol": "NIFTYBEES.NS",
                "suggested_price": round(gold_price, 2),
                "can_shift": True
            }
        else:
            shift_recommendation = {
                "signal": "HOLD_GOLDBEES",
                "badge": "🛡️ SAFE-HAVEN ACTIVE (HOLD GOLDBEES)",
                "badge_color": "#F59E0B",
                "title": "Your Capital is Protected in Gold",
                "description": f"You are holding {gold_pct}% in Gold ETFs. Gold is defending your capital while equities correct. Remain in GOLDBEES until equities signal a new breakout.",
                "action_text": "Hold Safe-Haven",
                "action_symbol": "GOLDBEES.NS",
                "can_shift": False
            }

    return {
        "status": "success",
        "has_holdings": has_holdings,
        "total_etf_value": total_etf_value,
        "actual_allocation": {
            "equity_val": round(equity_val, 2),
            "gold_val": round(gold_val, 2),
            "liquid_val": round(liquid_val, 2),
            "equity_pct": equity_pct,
            "gold_pct": gold_pct,
            "liquid_pct": liquid_pct
        },
        "target_allocation": {
            "equity_pct": 60 if recommended_etf == "NIFTYBEES" else 25,
            "gold_pct": 25 if recommended_etf == "NIFTYBEES" else 65,
            "liquid_pct": 15 if recommended_etf == "NIFTYBEES" else 10
        },
        "market_regime": {
            "recommended_etf": recommended_etf,
            "summary": summary_text,
            "nifty_price": round(nifty_price, 2),
            "gold_price": round(gold_price, 2)
        },
        "shift_recommendation": shift_recommendation,
        "etf_trades": etf_trades
    }


def clear_journal(scope: str = "all") -> dict:
    """
    Clears trade journal records based on scope:
    - 'all': wipes both active and closed trades and zeroes out P&L
    - 'closed': resets closed trades and realized P&L, keeping active trades
    - 'active': clears open positions, preserving closed trade history
    """
    deleted = db_clear_journal(scope)
    return {
        "status": "success",
        "deleted_count": deleted,
        "scope": scope,
        "message": f"Successfully reset {deleted} trade(s) from journal (scope: {scope})."
    }


def get_trade_recommendation(symbol: str) -> dict:
    """
    Given a Stock or ETF symbol, fetches live market quote and computes
    recommended trade parameters: CMP, Stop Loss, Target 1, Target 2, Style, and Sizing.
    Guarantees maximum 2 decimal places for all prices.
    """
    if not symbol:
        return {"status": "error", "message": "Symbol is required"}

    clean_sym = symbol.strip().upper()
    if not (clean_sym.endswith(".NS") or clean_sym.endswith(".BO") or clean_sym.startswith("^")):
        lookup_sym = f"{clean_sym}.NS"
    else:
        lookup_sym = clean_sym

    try:
        info = get_stock_info(lookup_sym)
        cmp_val = float(info.get("current_price") or info.get("price") or 0.0) if info else 0.0
        if cmp_val <= 0.0:
            lookup_sym = clean_sym
            info = get_stock_info(lookup_sym)
    except Exception as e:
        return {"status": "error", "message": f"Failed to fetch market data: {str(e)}"}

    cmp_price = round(float(info.get("current_price") or info.get("price") or 0.0), 2) if info else 0.0
    if cmp_price <= 0.0:
        return {"status": "error", "message": f"Could not find live quote for {clean_sym}"}

    change_pct = round(float(info.get("day_change_pct") or info.get("change_pct") or 0.0), 2)
    name = info.get("name") or clean_sym
    clean_code = clean_sym.replace(".NS", "").replace(".BO", "").replace("^", "")

    # Detect if ETF
    is_etf = any(sub in clean_code for sub in ["BEES", "ETF", "LIQUID", "GOLD", "SILVER", "NIFTY50", "JUNIORBEES", "BANKBEES"])

    if is_etf:
        style = "ETF"
        # ETFs have lower volatility: SL ~ -4.5%, Tgt1 ~ +8.0%, Tgt2 ~ +15.0%
        stop_loss = round(cmp_price * 0.955, 2)
        target_1 = round(cmp_price * 1.08, 2)
        target_2 = round(cmp_price * 1.15, 2)
        target_alloc = 30000.0
        quantity = max(1, int(target_alloc / cmp_price)) if cmp_price > 0 else 10
        rationale = f"All-Weather ETF Asset Allocation ({name}). Conservative index/commodity exposure with ~4.5% risk buffer."
    else:
        style = "Swing"
        # Standard swing trade: SL ~ -5.5%, Tgt1 ~ +11.0% (1:2 R:R), Tgt2 ~ +20.0% (1:3.5 R:R)
        stop_loss = round(cmp_price * 0.945, 2)
        target_1 = round(cmp_price * 1.11, 2)
        target_2 = round(cmp_price * 1.20, 2)
        target_alloc = 25000.0
        quantity = max(1, int(target_alloc / cmp_price)) if cmp_price > 0 else 5
        rationale = f"Swing momentum setup on {name} @ CMP ₹{cmp_price:.2f}. Risk/Reward 1:2 on Target 1, trailing to Target 2."

    risk_per_share = round(max(0.01, cmp_price - stop_loss), 2)
    reward_t1_per_share = round(max(0.01, target_1 - cmp_price), 2)
    rr_ratio = round(reward_t1_per_share / risk_per_share, 2) if risk_per_share > 0 else 2.0

    return {
        "status": "success",
        "symbol": lookup_sym,
        "code": clean_code,
        "name": name,
        "is_etf": is_etf,
        "cmp": cmp_price,
        "change_pct": change_pct,
        "recommended": {
            "entry_price": cmp_price,
            "quantity": quantity,
            "stop_loss": stop_loss,
            "target_1": target_1,
            "target_2": target_2,
            "style": style,
            "risk_per_share": risk_per_share,
            "reward_per_share": reward_t1_per_share,
            "rr_ratio": f"1:{rr_ratio}",
            "risk_inr": round(risk_per_share * quantity, 2),
            "reward_t1_inr": round(reward_t1_per_share * quantity, 2),
            "reward_t2_inr": round((target_2 - cmp_price) * quantity, 2),
            "notes": rationale
        }
    }


def compute_trader_behavior_diagnostics() -> dict:
    """
    Computes deep behavioral analytics across active and historical journal trades:
    - Average holding duration of winning vs losing trades (Disposition Effect)
    - Exit efficiency vs planned Target 1 and Target 2
    - Performance breakdown by trading style (Swing vs Positional vs Intraday)
    - Automated behavioral coaching nudges
    """
    data = db_get_all_trades()
    active = data.get("active_trades", [])
    closed = data.get("closed_trades", [])

    total_closed = len(closed)
    total_active = len(active)

    def _parse_days(d1_str, d2_str):
        try:
            d1 = datetime.strptime(d1_str, "%Y-%m-%d")
            d2 = datetime.strptime(d2_str, "%Y-%m-%d")
            return max(0, (d2 - d1).days)
        except Exception:
            return 1

    win_days = []
    loss_days = []
    style_stats = {}
    exit_efficiencies = []

    today_str = datetime.now().strftime("%Y-%m-%d")

    for t in closed:
        pnl = float(t.get("pnl") or 0.0)
        entry_d = t.get("entry_date") or today_str
        exit_d = t.get("exit_date") or today_str
        days = _parse_days(entry_d, exit_d)

        style = t.get("style", "Swing")
        if style not in style_stats:
            style_stats[style] = {"total": 0, "wins": 0, "losses": 0, "pnl": 0.0}
        style_stats[style]["total"] += 1
        style_stats[style]["pnl"] = round(style_stats[style]["pnl"] + pnl, 2)

        if pnl > 0:
            win_days.append(days)
            style_stats[style]["wins"] += 1
            entry_p = float(t.get("entry_price") or 1.0)
            exit_p = float(t.get("exit_price") or entry_p)
            target1 = float(t.get("target_1") or entry_p)
            if target1 > entry_p:
                planned_gain = target1 - entry_p
                actual_gain = exit_p - entry_p
                efficiency = min(200.0, max(0.0, (actual_gain / planned_gain) * 100.0))
                exit_efficiencies.append(efficiency)
        else:
            loss_days.append(days)
            style_stats[style]["losses"] += 1

    # Active hold duration
    active_days = [_parse_days(t.get("entry_date") or today_str, today_str) for t in active]
    avg_active_days = round(sum(active_days) / len(active_days), 1) if active_days else 0.0

    avg_win_hold = round(sum(win_days) / len(win_days), 1) if win_days else 0.0
    avg_loss_hold = round(sum(loss_days) / len(loss_days), 1) if loss_days else 0.0
    avg_exit_efficiency = round(sum(exit_efficiencies) / len(exit_efficiencies), 1) if exit_efficiencies else 100.0

    # Behavioral nudges
    nudges = []
    if avg_loss_hold > (avg_win_hold * 1.5) and len(loss_days) >= 2:
        nudges.append({
            "type": "warning",
            "title": "Disposition Effect Detected",
            "message": f"You hold losing positions for an average of {avg_loss_hold} days vs {avg_win_hold} days for winners. Cut losing trades faster at planned Stop Loss.",
            "icon": "⚠️"
        })
    elif avg_win_hold >= avg_loss_hold and len(win_days) >= 2:
        nudges.append({
            "type": "success",
            "title": "Disciplined Hold Duration",
            "message": f"You give winners room to run ({avg_win_hold} days avg hold) and cut losers promptly ({avg_loss_hold} days).",
            "icon": "🛡️"
        })

    if avg_exit_efficiency < 70.0 and len(exit_efficiencies) >= 2:
        nudges.append({
            "type": "caution",
            "title": "Early Profit Taking",
            "message": f"Your average exit captures {avg_exit_efficiency}% of Target 1. Trailing stops could help you capture more trend extension.",
            "icon": "📈"
        })
    else:
        nudges.append({
            "type": "info",
            "title": "Target Discipline",
            "message": "Continue using 3-tier tranches (T1 50% de-risk, T2 30% profit, T3 20% runner) to maximize risk-reward.",
            "icon": "🎯"
        })

    formatted_styles = []
    for s_name, s_data in style_stats.items():
        wr = round((s_data["wins"] / s_data["total"]) * 100.0, 1) if s_data["total"] > 0 else 0.0
        formatted_styles.append({
            "style": s_name,
            "total_trades": s_data["total"],
            "win_rate": wr,
            "net_pnl": s_data["pnl"]
        })

    return {
        "status": "success",
        "total_active_trades": total_active,
        "total_closed_trades": total_closed,
        "avg_active_hold_days": avg_active_days,
        "avg_winner_hold_days": avg_win_hold,
        "avg_loser_hold_days": avg_loss_hold,
        "avg_exit_efficiency_pct": avg_exit_efficiency,
        "style_breakdown": formatted_styles,
        "behavioral_nudges": nudges
    }
