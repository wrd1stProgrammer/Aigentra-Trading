import sys
import os
sys.path.append(os.path.abspath(os.path.dirname(__file__) + "/app"))

from app.db import session_scope
from sqlalchemy import text

with session_scope() as db:
    # Query events for position 201
    events = db.execute(text("""
        SELECT id, event_type, price, quantity, realized_pnl, created_at, payload_json
        FROM trade_events
        WHERE position_id = 201
        ORDER BY created_at ASC
    """)).fetchall()
    
    print("Events for position 201:")
    for e in events:
        print(f"ID: {e[0]} | Type: {e[1]} | Price: {e[2]} | Qty: {e[3]} | PnL: {e[4]} | Time: {e[5]}")
        
    pos = db.execute(text("""
        SELECT id, quantity, entry_price, realized_pnl, unrealized_pnl, status, payload_json
        FROM paper_positions
        WHERE id = 201
    """)).fetchone()
    print("\nPosition 201 State:")
    print(f"ID: {pos[0]} | Qty: {pos[1]} | Entry: {pos[2]} | Realized PnL: {pos[3]} | Unrealized PnL: {pos[4]} | Status: {pos[5]}")
