import psycopg

db_url = "postgresql://neondb_owner:npg_LNsWr6Rqh1Au@ep-raspy-thunder-aquewe4e.c-8.us-east-1.aws.neon.tech/neondb?sslmode=require"

try:
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            tables = ["trader_run_logs", "trade_plans", "paper_orders", "paper_positions", "trader_leaderboard_snapshots"]
            print("--- Symbol breakdown ---")
            for table in tables:
                cur.execute(f"SELECT symbol, COUNT(*) FROM {table} GROUP BY symbol")
                rows = cur.fetchall()
                print(f"{table}: {rows}")
except Exception as e:
    print("Failed to query database:", e)
