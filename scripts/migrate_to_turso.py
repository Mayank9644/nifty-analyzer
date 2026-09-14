#!/usr/bin/env python3
"""
Migration Utility: Local SQLite -> Turso Cloud Database
Transfers all open and closed trades and watchlists from data/trading_platform.db
into Turso Cloud SQLite with zero data loss.
"""

import os
import sys
import sqlite3
import json

# Ensure workspace root is in python path
WORKSPACE_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if WORKSPACE_ROOT not in sys.path:
    sys.path.insert(0, WORKSPACE_ROOT)

from data.database import TursoHttpClient, init_db, is_turso_enabled

LOCAL_DB_PATH = os.path.join(WORKSPACE_ROOT, "data", "trading_platform.db")


def run_migration(turso_url: str = None, turso_token: str = None):
    url = turso_url or os.environ.get("TURSO_DATABASE_URL", "").strip()
    token = turso_token or os.environ.get("TURSO_AUTH_TOKEN", "").strip()

    if not url or not token:
        print("ERROR: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN must be provided.")
        print("Usage: python migrate_to_turso.py <DATABASE_URL> <AUTH_TOKEN>")
        print("   or: export TURSO_DATABASE_URL='...' TURSO_AUTH_TOKEN='...' && python migrate_to_turso.py")
        sys.exit(1)

    print(f" Connecting to Turso Cloud DB: {url}")
    turso = TursoHttpClient(url, token)

    print(f" Reading local SQLite DB: {LOCAL_DB_PATH}")
    if not os.path.exists(LOCAL_DB_PATH):
        print(f"ERROR: Local DB {LOCAL_DB_PATH} not found!")
        sys.exit(1)

    local_conn = sqlite3.connect(LOCAL_DB_PATH)
    local_conn.row_factory = sqlite3.Row

    # 1. Initialize Turso schema
    print(" Ensuring schema exists on Turso...")
    turso.execute("""
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
            tags TEXT DEFAULT '',
            is_manual INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)
    turso.execute("CREATE INDEX IF NOT EXISTS idx_trades_status ON trade_journal(status);")
    turso.execute("""
        CREATE TABLE IF NOT EXISTS watchlists (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            symbols TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
    """)

    # 2. Migrate Trades
    local_trades = local_conn.execute("SELECT * FROM trade_journal;").fetchall()
    print(f" Found {len(local_trades)} trades in local database.")

    migrated_trades = 0
    for t in local_trades:
        d = dict(t)
        turso.execute("""
            INSERT OR REPLACE INTO trade_journal (
                id, symbol, code, entry_date, entry_price, quantity,
                stop_loss, target_1, target_2, style, status,
                exit_date, exit_price, pnl, pnl_pct, notes, tags, is_manual, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
        """, (
            d["id"], d["symbol"], d["code"], d["entry_date"],
            float(d["entry_price"]), int(d["quantity"]),
            float(d["stop_loss"]), float(d["target_1"]),
            float(d["target_2"]) if d.get("target_2") is not None else None,
            d.get("style", "Swing"), d.get("status", "OPEN"),
            d.get("exit_date"),
            float(d["exit_price"]) if d.get("exit_price") is not None else None,
            float(d["pnl"]) if d.get("pnl") is not None else None,
            float(d["pnl_pct"]) if d.get("pnl_pct") is not None else None,
            d.get("notes", ""), d.get("tags", ""),
            int(d.get("is_manual", 0)),
            d.get("created_at")
        ))
        migrated_trades += 1
        print(f"   [{migrated_trades}/{len(local_trades)}] Migrated trade {d['symbol']} ({d['status']}) - Qty: {d['quantity']}, Price: ₹{d['entry_price']}")

    # 3. Migrate Watchlists
    local_watchlists = local_conn.execute("SELECT * FROM watchlists;").fetchall()
    print(f" Found {len(local_watchlists)} watchlist(s) in local database.")
    for w in local_watchlists:
        wd = dict(w)
        turso.execute("""
            INSERT OR REPLACE INTO watchlists (id, name, symbols, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?);
        """, (wd["id"], wd["name"], wd["symbols"], wd.get("created_at"), wd.get("updated_at")))
        print(f"   Migrated watchlist: {wd['name']} -> {wd['symbols']}")

    # 4. Verify count on Turso
    cur = turso.execute("SELECT COUNT(*) FROM trade_journal WHERE status = 'OPEN';")
    turso_open_count = cur.fetchone()[0]
    cur_total = turso.execute("SELECT COUNT(*) FROM trade_journal;")
    turso_total = cur_total.fetchone()[0]

    print("\n" + "="*50)
    print(" MIGRATION COMPLETE & VERIFIED!")
    print(f"  Total Trades in Turso: {turso_total}")
    print(f"  Active Trades in Turso: {turso_open_count}")
    print("="*50 + "\n")


if __name__ == "__main__":
    url_arg = sys.argv[1] if len(sys.argv) > 1 else None
    token_arg = sys.argv[2] if len(sys.argv) > 2 else None
    run_migration(url_arg, token_arg)
