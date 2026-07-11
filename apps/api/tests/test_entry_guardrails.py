from datetime import datetime, timezone
from decimal import Decimal

from app.db import init_db, reset_db_engine, session_scope
from app.paper.entry_guardrails import entry_guardrail_context
from app.paper.repositories import create_equity_snapshot, ensure_trader_state


def test_daily_loss_guard_blocks_new_entries(tmp_path):
    reset_db_engine(f"sqlite:///{tmp_path / 'guardrails.db'}")
    init_db()
    try:
        with session_scope() as db:
            state = ensure_trader_state(db, "guarded-trader", Decimal("10000"))
            snapshot = create_equity_snapshot(db, state, "BTCUSDT")
            snapshot.created_at = datetime.now(timezone.utc).replace(hour=0, minute=1, second=0, microsecond=0)
            state.equity = Decimal("9800")
            state.cash_balance = Decimal("9800")
            db.flush()

            context = entry_guardrail_context(db, "guarded-trader", candidate_risk_percent=0.7)
            assert context["blocked"] is True
            assert context["dailyLossPercent"] == 2.0
            assert context["dailyLossLimitPercent"] == 1.4
            assert context["riskMultiplier"] == 0.0
    finally:
        reset_db_engine("sqlite:///:memory:")
