"""
SQLite Database Layer for Antigravity Market Analysis Platform.
Provides robust ACID-compliant persistence for trade journal, watchlists, and portfolio tracking.
Includes auto-migration from legacy JSON files.
"""

import os
import sqlite3
import json
import uuid
from datetime import datetime

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trading_platform.db")
LEGACY_JSON_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "trade_journal.json")


def get_connection():
    """Returns a SQLite connection with dict-like row factory and WAL mode for high concurrency."""
    conn = sqlite3.connect(DB_PATH, timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def init_db():
    """Initializes the database schema and performs one-time migration if needed."""
    with get_connection() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS trade_journal (
                id TEXT PRIMARY KEY,
                symbol TEXT NOT NULL,
                code TEXT NOT NULL,
                entry_date TEXT NOT NULL,
                entry_price REAL NOT NULL,
                quantity INTEGER NOT NULL,
                stop_loss REAL NOT NULL,
                target_1 REAL NOT NULL,
                target_2 REAL,
                style TEXT DEFAULT 'Swing',
                status TEXT DEFAULT 'OPEN',
                exit_date TEXT,
                exit_price REAL,
                pnl REAL,
                pnl_pct REAL,
                notes TEXT,
                is_manual INTEGER DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_trades_status ON trade_journal(status);")

        conn.execute("""
            CREATE TABLE IF NOT EXISTS watchlists (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                symbols TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        conn.commit()

        # Add tags column if not exists
        try:
            conn.execute("ALTER TABLE trade_journal ADD COLUMN tags TEXT DEFAULT '';")
            conn.commit()
        except sqlite3.OperationalError:
            pass

    _migrate_legacy_json_if_needed()


def _migrate_legacy_json_if_needed():
    """Migrates existing records from trade_journal.json into SQLite if DB is fresh."""
    if not os.path.exists(LEGACY_JSON_PATH):
        return

    try:
        with get_connection() as conn:
            cursor = conn.execute("SELECT COUNT(*) FROM trade_journal;")
            count = cursor.fetchone()[0]
            if count > 0:
                return  # Already has records, no migration required

            with open(LEGACY_JSON_PATH, "r") as f:
                data = json.load(f)

            active_trades = data.get("active_trades", [])
            closed_trades = data.get("closed_trades", [])

            for t in active_trades:
                conn.execute("""
                    INSERT OR IGNORE INTO trade_journal 
                    (id, symbol, code, entry_date, entry_price, quantity, stop_loss, target_1, target_2, style, status, notes, is_manual)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
                """, (
                    t.get("id"),
                    t.get("symbol"),
                    t.get("code", t.get("symbol", "").replace(".NS", "")),
                    t.get("entry_date", datetime.now().strftime("%Y-%m-%d")),
                    float(t.get("entry_price", 0.0)),
                    int(t.get("quantity", 1)),
                    float(t.get("stop_loss", 0.0)),
                    float(t.get("target_1", 0.0)),
                    float(t.get("target_2", 0.0)) if t.get("target_2") else None,
                    t.get("style", "Swing"),
                    t.get("notes", ""),
                    1 if t.get("is_manual") else 0
                ))

            for t in closed_trades:
                conn.execute("""
                    INSERT OR IGNORE INTO trade_journal 
                    (id, symbol, code, entry_date, entry_price, quantity, stop_loss, target_1, target_2, style, status, exit_date, exit_price, pnl, pnl_pct, notes, is_manual)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLOSED', ?, ?, ?, ?, ?, ?)
                """, (
                    t.get("id"),
                    t.get("symbol"),
                    t.get("code", t.get("symbol", "").replace(".NS", "")),
                    t.get("entry_date", datetime.now().strftime("%Y-%m-%d")),
                    float(t.get("entry_price", 0.0)),
                    int(t.get("quantity", 1)),
                    float(t.get("stop_loss", 0.0)),
                    float(t.get("target_1", 0.0)),
                    float(t.get("target_2", 0.0)) if t.get("target_2") else None,
                    t.get("style", "Swing"),
                    t.get("exit_date"),
                    float(t.get("exit_price", 0.0)) if t.get("exit_price") else None,
                    float(t.get("pnl", 0.0)) if t.get("pnl") is not None else None,
                    float(t.get("pnl_pct", 0.0)) if t.get("pnl_pct") is not None else None,
                    t.get("notes", ""),
                    1 if t.get("is_manual") else 0
                ))

            conn.commit()
    except Exception as e:
        print(f"Error during legacy trade JSON migration: {e}")


def db_get_all_trades():
    """Returns all active and closed trades."""
    with get_connection() as conn:
        cursor = conn.execute("SELECT * FROM trade_journal ORDER BY entry_date DESC;")
        rows = cursor.fetchall()
        trades = [dict(r) for r in rows]
        active = [t for t in trades if t["status"] == "OPEN"]
        closed = [t for t in trades if t["status"] == "CLOSED"]
        return {"active_trades": active, "closed_trades": closed}


def db_get_active_trades():
    """Returns all open trades."""
    with get_connection() as conn:
        cursor = conn.execute("SELECT * FROM trade_journal WHERE status = 'OPEN' ORDER BY entry_date DESC;")
        return [dict(r) for r in cursor.fetchall()]


def db_get_closed_trades():
    """Returns all closed trades."""
    with get_connection() as conn:
        cursor = conn.execute("SELECT * FROM trade_journal WHERE status = 'CLOSED' ORDER BY exit_date DESC;")
        return [dict(r) for r in cursor.fetchall()]


def db_add_trade(trade: dict) -> dict:
    """Inserts a new trade into SQLite."""
    trade_id = trade.get("id") or f"trade_{int(datetime.now().timestamp()*1000)}_{uuid.uuid4().hex[:6]}"
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO trade_journal
            (id, symbol, code, entry_date, entry_price, quantity, stop_loss, target_1, target_2, style, status, notes, tags, is_manual)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?, ?)
        """, (
            trade_id,
            trade.get("symbol"),
            trade.get("code", trade.get("symbol", "").replace(".NS", "")),
            trade.get("entry_date") or datetime.now().strftime("%Y-%m-%d"),
            float(trade.get("entry_price", 0.0)),
            int(trade.get("quantity", 1)),
            float(trade.get("stop_loss", 0.0)),
            float(trade.get("target_1", 0.0)),
            float(trade.get("target_2", 0.0)) if trade.get("target_2") else None,
            trade.get("style", "Swing"),
            trade.get("notes", ""),
            trade.get("tags", ""),
            1 if trade.get("is_manual") else 0
        ))
        conn.commit()

    trade["id"] = trade_id
    trade["status"] = "OPEN"
    return trade


def db_close_trade(trade_id: str, exit_price: float, exit_date: str = None, exit_tags: str = None, realized_pnl: float = None, realized_pct: float = None) -> dict:
    """Closes an open trade and calculates final realized P&L."""
    if not exit_date:
        exit_date = datetime.now().strftime("%Y-%m-%d")

    with get_connection() as conn:
        cursor = conn.execute("SELECT * FROM trade_journal WHERE id = ? AND status = 'OPEN';", (trade_id,))
        row = cursor.fetchone()
        if not row:
            return {"status": "error", "message": f"Active trade with ID {trade_id} not found."}

        trade = dict(row)
        entry_price = float(trade["entry_price"])
        qty = int(trade["quantity"])

        try:
            realized_pnl = float(realized_pnl) if realized_pnl is not None else None
        except (ValueError, TypeError):
            realized_pnl = None

        try:
            realized_pct = float(realized_pct) if realized_pct is not None else None
        except (ValueError, TypeError):
            realized_pct = None

        if realized_pnl is None and realized_pct is not None:
            realized_pnl = round((entry_price * (realized_pct / 100.0)) * qty, 2)
        elif realized_pnl is not None and realized_pct is None:
            capital = entry_price * qty
            realized_pct = round((realized_pnl / capital) * 100.0, 2) if capital > 0 else 0.0
        elif realized_pnl is None and realized_pct is None:
            realized_pnl = round((exit_price - entry_price) * qty, 2)
            realized_pct = round(((exit_price - entry_price) / entry_price) * 100, 2) if entry_price > 0 else 0.0

        existing_tags = trade.get("tags") or ""
        final_tags = f"{existing_tags}, {exit_tags}".strip(", ") if exit_tags else existing_tags

        conn.execute("""
            UPDATE trade_journal
            SET status = 'CLOSED', exit_date = ?, exit_price = ?, pnl = ?, pnl_pct = ?, tags = ?
            WHERE id = ?
        """, (exit_date, exit_price, realized_pnl, realized_pct, final_tags, trade_id))
        conn.commit()

        trade["status"] = "CLOSED"
        trade["exit_date"] = exit_date
        trade["exit_price"] = exit_price
        trade["pnl"] = realized_pnl
        trade["pnl_pct"] = realized_pct
        trade["tags"] = final_tags
        return {"status": "success", "trade": trade}


def db_get_trade_by_id(trade_id: str):
    """Fetches a single trade by ID."""
    with get_connection() as conn:
        cursor = conn.execute("SELECT * FROM trade_journal WHERE id = ?;", (trade_id,))
        row = cursor.fetchone()
        return dict(row) if row else None


def db_update_trade(trade_id: str, updates: dict) -> dict:
    """Updates fields of an existing trade in SQLite."""
    allowed = {"entry_price", "quantity", "stop_loss", "target_1", "target_2", "style", "notes", "tags", "entry_date"}
    clean_updates = {k: v for k, v in updates.items() if k in allowed}
    if not clean_updates:
        return {"status": "error", "message": "No valid fields to update."}

    set_clauses = [f"{k} = ?" for k in clean_updates.keys()]
    values = list(clean_updates.values())
    values.append(trade_id)

    with get_connection() as conn:
        cursor = conn.execute(f"UPDATE trade_journal SET {', '.join(set_clauses)} WHERE id = ?;", values)
        conn.commit()
        if cursor.rowcount == 0:
            return {"status": "error", "message": f"Trade {trade_id} not found."}

    return {"status": "success", "trade": db_get_trade_by_id(trade_id)}


def db_partial_exit(trade_id: str, exit_qty: int, exit_price: float, exit_date: str = None, exit_tags: str = None, realized_pnl: float = None, realized_pct: float = None) -> dict:
    """Executes a partial exit: decrements active position qty and inserts a closed trade record."""
    if not exit_date:
        exit_date = datetime.now().strftime("%Y-%m-%d")

    with get_connection() as conn:
        cursor = conn.execute("SELECT * FROM trade_journal WHERE id = ? AND status = 'OPEN';", (trade_id,))
        row = cursor.fetchone()
        if not row:
            return {"status": "error", "message": f"Active trade {trade_id} not found."}

        trade = dict(row)
        curr_qty = int(trade["quantity"])
        exit_qty = int(exit_qty)

        if exit_qty <= 0:
            return {"status": "error", "message": "Exit quantity must be greater than zero."}

        if exit_qty >= curr_qty:
            # Full exit fallback
            return db_close_trade(trade_id, exit_price, exit_date, exit_tags, realized_pnl, realized_pct)

        # Partial exit: decrement active position quantity
        remaining_qty = curr_qty - exit_qty
        conn.execute("UPDATE trade_journal SET quantity = ? WHERE id = ?;", (remaining_qty, trade_id))

        # Create closed trade row for the exited quantity
        closed_trade_id = f"{trade_id}_exit_{int(datetime.now().timestamp()*1000)}_{uuid.uuid4().hex[:6]}"
        existing_tags = trade.get("tags") or ""
        final_tags = f"{existing_tags}, {exit_tags}".strip(", ") if exit_tags else existing_tags
        if "Partial Exit" not in final_tags:
            final_tags = f"{final_tags}, Partial Exit".strip(", ")

        conn.execute("""
            INSERT INTO trade_journal
            (id, symbol, code, entry_date, entry_price, quantity, stop_loss, target_1, target_2, style, status, exit_date, exit_price, pnl, pnl_pct, notes, tags, is_manual)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'CLOSED', ?, ?, ?, ?, ?, ?, ?)
        """, (
            closed_trade_id,
            trade["symbol"],
            trade["code"],
            trade["entry_date"],
            trade["entry_price"],
            exit_qty,
            trade["stop_loss"],
            trade["target_1"],
            trade.get("target_2"),
            trade.get("style", "Swing"),
            exit_date,
            exit_price,
            realized_pnl,
            realized_pct,
            f"Partial exit ({exit_qty}/{curr_qty} units). {trade.get('notes', '')}".strip(),
            final_tags,
            trade.get("is_manual", 0)
        ))
        conn.commit()

        updated_open = db_get_trade_by_id(trade_id)
        closed_trade = db_get_trade_by_id(closed_trade_id)
        return {
            "status": "success",
            "is_partial": True,
            "remaining_trade": updated_open,
            "closed_trade": closed_trade,
            "message": f"Successfully scaled out {exit_qty} shares of {trade['code']} @ ₹{exit_price:.2f}."
        }


def db_delete_trade(trade_id: str) -> bool:
    """Deletes a trade from SQLite."""
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM trade_journal WHERE id = ?;", (trade_id,))
        conn.commit()
        return cursor.rowcount > 0


def db_clear_journal(scope: str = "all") -> int:
    """Clears trade journal records based on scope ('all', 'closed', 'active'). Returns number of deleted rows."""
    with get_connection() as conn:
        if scope == "closed":
            cursor = conn.execute("DELETE FROM trade_journal WHERE status = 'CLOSED';")
        elif scope == "active":
            cursor = conn.execute("DELETE FROM trade_journal WHERE status = 'OPEN';")
        else:
            cursor = conn.execute("DELETE FROM trade_journal;")
        conn.commit()
        deleted_count = cursor.rowcount

    # Also sync legacy JSON if it exists to avoid re-migration
    try:
        if os.path.exists(LEGACY_JSON_PATH):
            if scope == "all":
                with open(LEGACY_JSON_PATH, "w") as f:
                    json.dump({"active_trades": [], "closed_trades": []}, f, indent=2)
            elif scope == "closed":
                with open(LEGACY_JSON_PATH, "r") as f:
                    data = json.load(f)
                data["closed_trades"] = []
                with open(LEGACY_JSON_PATH, "w") as f:
                    json.dump(data, f, indent=2)
            elif scope == "active":
                with open(LEGACY_JSON_PATH, "r") as f:
                    data = json.load(f)
                data["active_trades"] = []
                with open(LEGACY_JSON_PATH, "w") as f:
                    json.dump(data, f, indent=2)
    except Exception as e:
        print(f"Failed to sync legacy JSON on journal clear: {e}")

    return deleted_count


# Initialize tables upon module load
init_db()
