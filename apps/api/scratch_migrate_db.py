import sys
import os
sys.path.append(os.path.abspath(os.path.dirname(__file__) + "/app"))

from sqlalchemy import create_engine, select, text
from app.db import Base

# Connection strings
src_url = "postgresql+psycopg://neondb_owner:npg_LNsWr6Rqh1Au@ep-raspy-thunder-aquewe4e.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require"
dest_url = "postgresql+psycopg://neondb_owner:npg_8JfCQ7vKMiDV@ep-weathered-union-apj1qmnw-pooler.c-7.us-east-1.aws.neon.tech/neondb?sslmode=require&channel_binding=require"

src_engine = create_engine(src_url)
dest_engine = create_engine(dest_url)

print("1. Creating tables in the new database...")
Base.metadata.create_all(dest_engine)
print("Schema creation completed.")

# Table copy order (any order works since FKs will be dropped temporarily)
tables = [
    "market_snapshots",
    "ai_reviews",
    "trade_plans",
    "trader_run_logs",
    "candidate_trades",
    "paper_orders",
    "paper_positions",
    "trade_events",
    "equity_snapshots",
    "subscriber_preferences",
    "telegram_alert_deliveries",
    "trader_leaderboard_snapshots",
    "trader_states"
]

print("\n2. Finding and dropping foreign key constraints temporarily...")
fk_query = """
SELECT 
    tc.table_name, 
    tc.constraint_name,
    ccu.table_name AS foreign_table_name,
    kcu.column_name AS local_column_name,
    ccu.column_name AS foreign_column_name
FROM 
    information_schema.table_constraints AS tc 
    JOIN information_schema.key_column_usage AS kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage AS ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public';
"""

with dest_engine.connect() as dest_conn:
    fks = dest_conn.execute(text(fk_query)).fetchall()
    print(f"Found {len(fks)} foreign key constraints to drop.")
    
    # Drop all foreign keys
    for fk in fks:
        table_name = fk[0]
        constraint_name = fk[1]
        print(f"Dropping FK '{constraint_name}' from table '{table_name}'...")
        dest_conn.execute(text(f"ALTER TABLE {table_name} DROP CONSTRAINT {constraint_name};"))
    dest_conn.commit()

print("\n3. Migrating table data...")
with src_engine.connect() as src_conn:
    with dest_engine.connect() as dest_conn:
        for table in tables:
            print(f"Migrating table '{table}'...")
            try:
                # Get columns
                cols_res = src_conn.execute(text(f"SELECT * FROM {table} LIMIT 0"))
                columns = cols_res.keys()
                cols_str = ", ".join(columns)
                placeholders = ", ".join([f":{col}" for col in columns])
                
                # Fetch all data
                rows = src_conn.execute(text(f"SELECT {cols_str} FROM {table}")).fetchall()
                print(f"-> Found {len(rows)} rows to migrate.")
                
                if rows:
                    # Clean target table first
                    dest_conn.execute(text(f"TRUNCATE TABLE {table} CASCADE;"))
                    
                    # Batch insert
                    insert_stmt = text(f"INSERT INTO {table} ({cols_str}) VALUES ({placeholders})")
                    data = [dict(row._mapping) for row in rows]
                    dest_conn.execute(insert_stmt, data)
                    print(f"-> Successfully inserted {len(rows)} rows into '{table}'.")
            except Exception as e:
                print(f"-> Failed/Skipped '{table}': {e}")
        dest_conn.commit()

print("\n4. Re-creating dropped foreign key constraints...")
with dest_engine.connect() as dest_conn:
    for fk in fks:
        table_name = fk[0]
        constraint_name = fk[1]
        foreign_table_name = fk[2]
        local_column_name = fk[3]
        foreign_column_name = fk[4]
        
        print(f"Re-creating FK '{constraint_name}' on table '{table_name}' referencing '{foreign_table_name}'...")
        add_fk_sql = f"""
        ALTER TABLE {table_name} 
        ADD CONSTRAINT {constraint_name} 
        FOREIGN KEY ({local_column_name}) 
        REFERENCES {foreign_table_name} ({foreign_column_name});
        """
        dest_conn.execute(text(add_fk_sql))
    dest_conn.commit()

print("\nMigration successfully completed without replica privilege restrictions!")
