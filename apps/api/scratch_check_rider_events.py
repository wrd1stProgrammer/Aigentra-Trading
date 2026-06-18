import sys
import os
sys.path.append(os.path.abspath(os.path.dirname(__file__) + "/app"))

from app.db import session_scope
from sqlalchemy import text

with session_scope() as db:
    # Query events for channel-rider
    # We need to find trader_id = 'channel-rider'
    events = db.execute(text("""
        SELECT id, event_type, price, quantity, realized_pnl, created_at, symbol
        FROM trade_events
        WHERE trader_id = 'channel-rider'
        ORDER BY created_at DESC
        LIMIT 50
    """)).fetchall()
    
    print("Recent 50 trade events for channel-rider:")
    for e in events:
        print(f"ID: {e[0]} | Type: {e[1]} | Price: {e[2]} | Qty: {e[3]} | PnL: {e[4]} | Time (UTC): {e[5]} | Symbol: {e[6]}")

    # Total counts
    cnt = db.execute(text("SELECT COUNT(*) FROM trade_events WHERE trader_id = 'channel-rider'")).scalar()
    print(f"\nTotal trade events for channel-rider: {cnt}")
    
    # Query closed positions for channel-rider
    closed_positions = db.execute(text("""
        SELECT id, symbol, side, quantity, entry_price, exit_price, realized_pnl, closed_at
        FROM paper_positions
        WHERE trader_id = 'channel-rider' AND status = 'closed'
        ORDER BY closed_at DESC
        LIMIT 20
    """)).fetchall()
    
    print("\nRecent closed positions for channel-rider:")
    for p in closed_positions:
         print(f"ID: {p[0]} | Symbol: {p[1]} | Side: {p[2]} | Qty: {p[3]} | Entry: {p[4]} | Exit: {p[5]} | PnL: {p[6]} | ClosedAt (UTC): {p[7]}")
