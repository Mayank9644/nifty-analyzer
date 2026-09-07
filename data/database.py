"""
SQLite Database Layer for Antigravity Market Analysis Platform.
Provides robust ACID-compliant persistence for trade journal, watchlists, and portfolio tracking.
Includes auto-migration from legacy JSON files.
"""

import os
import sqlite3
import json
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
    trade_id = trade.get("id") or f"trade_{int(datetime.now().timestamp())}"
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO trade_journal
            (id, symbol, code, entry_date, entry_price, quantity, stop_loss, target_1, target_2, style, status, notes, is_manual)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN', ?, ?)
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
            1 if trade.get("is_manual") else 0
        ))
        conn.commit()

    trade["id"] = trade_id
    trade["status"] = "OPEN"
    return trade


def db_close_trade(trade_id: str, exit_price: float, exit_date: str = None) -> dict:
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
        realized_pnl = round((exit_price - entry_price) * qty, 2)
        realized_pct = round(((exit_price - entry_price) / entry_price) * 100, 2) if entry_price > 0 else 0.0

        conn.execute("""
            UPDATE trade_journal
            SET status = 'CLOSED', exit_date = ?, exit_price = ?, pnl = ?, pnl_pct = ?
            WHERE id = ?
        """, (exit_date, exit_price, realized_pnl, realized_pct, trade_id))
        conn.commit()

        trade["status"] = "CLOSED"
        trade["exit_date"] = exit_date
        trade["exit_price"] = exit_price
        trade["pnl"] = realized_pnl
        trade["pnl_pct"] = realized_pct
        return {"status": "success", "trade": trade}


def db_delete_trade(trade_id: str) -> bool:
    """Deletes a trade from SQLite."""
    with get_connection() as conn:
        cursor = conn.execute("DELETE FROM trade_journal WHERE id = ?;", (trade_id,))
        conn.commit()
        return cursor.rowcount > 0


# Initialize tables upon module load
init_db()
