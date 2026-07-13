from datetime import datetime, timedelta, timezone
from decimal import Decimal

from app.db import PaperPositionRecord, init_db, reset_db_engine, session_scope
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


def test_consecutive_loss_guard_counts_negative_management_exits(tmp_path):
    reset_db_engine(f"sqlite:///{tmp_path / 'management-loss-guardrails.db'}")
    init_db()
    try:
        with session_scope() as db:
            ensure_trader_state(db, "guarded-trader", Decimal("10000"))
            now = datetime.now(timezone.utc)
            for index, reason in enumerate(("management_close", "close_position", "stop_loss")):
                db.add(
                    PaperPositionRecord(
                        trader_id="guarded-trader",
                        symbol="BTCUSDT",
                        status="closed",
                        side="long",
                        quantity=Decimal("0.1"),
                        entry_price=Decimal("68000"),
                        leverage=Decimal("5"),
                        notional=Decimal("6800"),
                        margin=Decimal("1360"),
                        realized_pnl=Decimal("-10"),
                        unrealized_pnl=Decimal("0"),
                        close_reason=reason,
                        closed_at=now - timedelta(minutes=index + 1),
                    )
                )
            db.flush()

            context = entry_guardrail_context(db, "guarded-trader", candidate_risk_percent=0.7, now=now)

        assert context["consecutiveLosses"] == 3
        assert context["blocked"] is True
        assert "consecutive" in context["blockReasons"][0].lower()
    finally:
        reset_db_engine("sqlite:///:memory:")
