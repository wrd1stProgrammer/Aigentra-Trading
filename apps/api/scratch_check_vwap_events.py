import sys
import os
sys.path.append(os.path.abspath(os.path.dirname(__file__) + "/app"))

from app.db import session_scope
from sqlalchemy import text

with session_scope() as db:
    # 1. Query closed positions for vwap-reclaimer
    print("--- Closed Positions for vwap-reclaimer ---")
    positions = db.execute(text("""
        SELECT id, symbol, side, quantity, entry_price, exit_price, realized_pnl, closed_at
        FROM paper_positions
        WHERE trader_id = 'vwap-reclaimer' AND status = 'closed'
        ORDER BY closed_at DESC
        LIMIT 20
    """)).fetchall()
    for p in positions:
        print(f"Pos ID: {p[0]} | Symbol: {p[1]} | Side: {p[2]} | Qty: {p[3]} | Entry: {p[4]} | Exit: {p[5]} | PnL: {p[6]} | ClosedAt (UTC): {p[7]}")
        
    # 2. Query trade events for vwap-reclaimer
    print("\n--- Trade Events for vwap-reclaimer ---")
    events = db.execute(text("""
        SELECT id, event_type, realized_pnl, created_at, position_id
        FROM trade_events
        WHERE trader_id = 'vwap-reclaimer'
        ORDER BY created_at DESC
        LIMIT 20
    """)).fetchall()
    for e in events:
        print(f"Event ID: {e[0]} | Type: {e[1]} | PnL: {e[2]} | Time (UTC): {e[3]} | PosID: {e[4]}")
        
    # 3. Query equity snapshots for vwap-reclaimer
    print("\n--- Equity Snapshots for vwap-reclaimer ---")
    snapshots = db.execute(text("""
        SELECT id, cash_balance, equity, realized_pnl, unrealized_pnl, candle_time, created_at
        FROM equity_snapshots
        WHERE trader_id = 'vwap-reclaimer'
        ORDER BY created_at DESC
        LIMIT 20
    """)).fetchall()
    for s in snapshots:
         print(f"Snapshot ID: {s[0]} | Cash: {s[1]} | Equity: {s[2]} | Realized: {s[3]} | Unrealized: {s[4]} | CandleTime: {s[5]} | CreatedAt: {s[6]}")
