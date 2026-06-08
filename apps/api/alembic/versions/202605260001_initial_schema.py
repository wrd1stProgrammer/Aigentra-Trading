"""initial schema with paper trading tables

Revision ID: 202605260001
Revises:
Create Date: 2026-05-26 00:00:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202605260001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def common_columns() -> list[sa.Column]:
    return [
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=True),
        sa.Column("trader_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    ]


def create_common_indexes(table_name: str) -> None:
    op.create_index(f"ix_{table_name}_created_at", table_name, ["created_at"])
    op.create_index(f"ix_{table_name}_id", table_name, ["id"])
    op.create_index(f"ix_{table_name}_status", table_name, ["status"])
    op.create_index(f"ix_{table_name}_symbol", table_name, ["symbol"])
    op.create_index(f"ix_{table_name}_trader_id", table_name, ["trader_id"])


def drop_common_indexes(table_name: str) -> None:
    op.drop_index(f"ix_{table_name}_trader_id", table_name=table_name)
    op.drop_index(f"ix_{table_name}_symbol", table_name=table_name)
    op.drop_index(f"ix_{table_name}_status", table_name=table_name)
    op.drop_index(f"ix_{table_name}_id", table_name=table_name)
    op.drop_index(f"ix_{table_name}_created_at", table_name=table_name)


def upgrade() -> None:
    op.create_table(
        "market_snapshots",
        *common_columns(),
        sa.Column("price", sa.Float(), nullable=True),
    )
    create_common_indexes("market_snapshots")

    op.create_table(
        "trader_run_logs",
        *common_columns(),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("market_snapshot_id", sa.Integer(), nullable=True),
        sa.Column("candidate_trade_id", sa.Integer(), nullable=True),
        sa.Column("ai_review_id", sa.Integer(), nullable=True),
        sa.Column("trade_plan_id", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["market_snapshot_id"], ["market_snapshots.id"], name="fk_trader_run_logs_market_snapshot_id"),
    )
    create_common_indexes("trader_run_logs")
    op.create_index("ix_trader_run_logs_provider", "trader_run_logs", ["provider"])
    op.create_index("ix_trader_run_logs_market_snapshot_id", "trader_run_logs", ["market_snapshot_id"])
    op.create_index("ix_trader_run_logs_candidate_trade_id", "trader_run_logs", ["candidate_trade_id"])
    op.create_index("ix_trader_run_logs_ai_review_id", "trader_run_logs", ["ai_review_id"])
    op.create_index("ix_trader_run_logs_trade_plan_id", "trader_run_logs", ["trade_plan_id"])

    op.create_table(
        "candidate_trades",
        *common_columns(),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("setup_type", sa.String(length=140), nullable=True),
        sa.Column("side", sa.String(length=20), nullable=True),
        sa.Column("setup_score", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["trader_run_logs.id"], name="fk_candidate_trades_run_id"),
    )
    create_common_indexes("candidate_trades")
    op.create_index("ix_candidate_trades_run_id", "candidate_trades", ["run_id"])
    op.create_index("ix_candidate_trades_setup_type", "candidate_trades", ["setup_type"])

    op.create_table(
        "ai_reviews",
        *common_columns(),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("model", sa.String(length=140), nullable=True),
        sa.Column("decision", sa.String(length=40), nullable=True),
        sa.Column("confidence", sa.Integer(), nullable=True),
        sa.Column("risk_level", sa.String(length=40), nullable=True),
        sa.Column("fallback", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["run_id"], ["trader_run_logs.id"], name="fk_ai_reviews_run_id"),
    )
    create_common_indexes("ai_reviews")
    op.create_index("ix_ai_reviews_run_id", "ai_reviews", ["run_id"])
    op.create_index("ix_ai_reviews_provider", "ai_reviews", ["provider"])
    op.create_index("ix_ai_reviews_decision", "ai_reviews", ["decision"])
    op.create_index("ix_ai_reviews_fallback", "ai_reviews", ["fallback"])

    op.create_table(
        "trade_plans",
        *common_columns(),
        sa.Column("run_id", sa.Integer(), nullable=True),
        sa.Column("side", sa.String(length=20), nullable=True),
        sa.Column("risk_percent", sa.Float(), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["trader_run_logs.id"], name="fk_trade_plans_run_id"),
    )
    create_common_indexes("trade_plans")
    op.create_index("ix_trade_plans_run_id", "trade_plans", ["run_id"])

    if op.get_bind().dialect.name != "sqlite":
        op.create_foreign_key("fk_trader_run_logs_candidate_trade_id", "trader_run_logs", "candidate_trades", ["candidate_trade_id"], ["id"])
        op.create_foreign_key("fk_trader_run_logs_ai_review_id", "trader_run_logs", "ai_reviews", ["ai_review_id"], ["id"])
        op.create_foreign_key("fk_trader_run_logs_trade_plan_id", "trader_run_logs", "trade_plans", ["trade_plan_id"], ["id"])

    op.create_table(
        "api_call_logs",
        *common_columns(),
        sa.Column("endpoint", sa.String(length=180), nullable=True),
        sa.Column("method", sa.String(length=12), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
    )
    create_common_indexes("api_call_logs")
    op.create_index("ix_api_call_logs_endpoint", "api_call_logs", ["endpoint"])

    op.create_table(
        "provider_call_logs",
        *common_columns(),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("model", sa.String(length=140), nullable=True),
        sa.Column("success", sa.Boolean(), nullable=False),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("decision", sa.String(length=40), nullable=True),
    )
    create_common_indexes("provider_call_logs")
    op.create_index("ix_provider_call_logs_provider", "provider_call_logs", ["provider"])
    op.create_index("ix_provider_call_logs_success", "provider_call_logs", ["success"])

    op.create_table(
        "trader_states",
        *common_columns(),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("cash_balance", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("equity", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("margin_used", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("realized_pnl", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("unrealized_pnl", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("total_fees", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.UniqueConstraint("trader_id", name="uq_trader_states_trader_id"),
    )
    create_common_indexes("trader_states")
    op.create_index("ix_trader_states_updated_at", "trader_states", ["updated_at"])

    op.create_table(
        "risk_settings",
        *common_columns(),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("initial_equity", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("max_leverage", sa.Numeric(precision=12, scale=4), nullable=False),
        sa.Column("max_notional", sa.Numeric(precision=24, scale=10), nullable=True),
        sa.Column("maker_fee_rate", sa.Numeric(precision=12, scale=8), nullable=False),
        sa.Column("taker_fee_rate", sa.Numeric(precision=12, scale=8), nullable=False),
        sa.UniqueConstraint("trader_id", "symbol", name="uq_risk_settings_trader_symbol"),
    )
    create_common_indexes("risk_settings")
    op.create_index("ix_risk_settings_updated_at", "risk_settings", ["updated_at"])

    op.create_table(
        "paper_orders",
        *common_columns(),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("side", sa.String(length=12), nullable=False),
        sa.Column("order_type", sa.String(length=20), nullable=False),
        sa.Column("fee_type", sa.String(length=12), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("leverage", sa.Numeric(precision=12, scale=4), nullable=False),
        sa.Column("limit_price", sa.Numeric(precision=24, scale=10), nullable=True),
        sa.Column("take_profit_price", sa.Numeric(precision=24, scale=10), nullable=True),
        sa.Column("stop_loss_price", sa.Numeric(precision=24, scale=10), nullable=True),
        sa.Column("filled_price", sa.Numeric(precision=24, scale=10), nullable=True),
        sa.Column("filled_quantity", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("notional", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("margin", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("fee", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("position_id", sa.Integer(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("filled_at", sa.DateTime(timezone=True), nullable=True),
    )
    create_common_indexes("paper_orders")
    op.create_index("ix_paper_orders_updated_at", "paper_orders", ["updated_at"])
    op.create_index("ix_paper_orders_side", "paper_orders", ["side"])
    op.create_index("ix_paper_orders_order_type", "paper_orders", ["order_type"])
    op.create_index("ix_paper_orders_position_id", "paper_orders", ["position_id"])
    op.create_index("ix_paper_orders_submitted_at", "paper_orders", ["submitted_at"])
    op.create_index("ix_paper_orders_filled_at", "paper_orders", ["filled_at"])

    op.create_table(
        "paper_positions",
        *common_columns(),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("side", sa.String(length=12), nullable=False),
        sa.Column("quantity", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("entry_price", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("leverage", sa.Numeric(precision=12, scale=4), nullable=False),
        sa.Column("notional", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("margin", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("entry_fee", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("exit_price", sa.Numeric(precision=24, scale=10), nullable=True),
        sa.Column("exit_fee", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("realized_pnl", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("unrealized_pnl", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("take_profit_price", sa.Numeric(precision=24, scale=10), nullable=True),
        sa.Column("stop_loss_price", sa.Numeric(precision=24, scale=10), nullable=True),
        sa.Column("close_reason", sa.String(length=40), nullable=True),
        sa.Column("opened_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["paper_orders.id"], name="fk_paper_positions_order_id"),
    )
    create_common_indexes("paper_positions")
    op.create_index("ix_paper_positions_updated_at", "paper_positions", ["updated_at"])
    op.create_index("ix_paper_positions_order_id", "paper_positions", ["order_id"])
    op.create_index("ix_paper_positions_side", "paper_positions", ["side"])
    op.create_index("ix_paper_positions_close_reason", "paper_positions", ["close_reason"])
    op.create_index("ix_paper_positions_opened_at", "paper_positions", ["opened_at"])
    op.create_index("ix_paper_positions_closed_at", "paper_positions", ["closed_at"])

    op.create_table(
        "trade_events",
        *common_columns(),
        sa.Column("event_type", sa.String(length=60), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("position_id", sa.Integer(), nullable=True),
        sa.Column("price", sa.Numeric(precision=24, scale=10), nullable=True),
        sa.Column("quantity", sa.Numeric(precision=24, scale=10), nullable=True),
        sa.Column("fee", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("realized_pnl", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("equity", sa.Numeric(precision=24, scale=10), nullable=True),
        sa.ForeignKeyConstraint(["order_id"], ["paper_orders.id"], name="fk_trade_events_order_id"),
        sa.ForeignKeyConstraint(["position_id"], ["paper_positions.id"], name="fk_trade_events_position_id"),
    )
    create_common_indexes("trade_events")
    op.create_index("ix_trade_events_event_type", "trade_events", ["event_type"])
    op.create_index("ix_trade_events_order_id", "trade_events", ["order_id"])
    op.create_index("ix_trade_events_position_id", "trade_events", ["position_id"])

    op.create_table(
        "equity_snapshots",
        *common_columns(),
        sa.Column("cash_balance", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("equity", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("margin_used", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("realized_pnl", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("unrealized_pnl", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("total_fees", sa.Numeric(precision=24, scale=10), nullable=False),
        sa.Column("candle_time", sa.DateTime(timezone=True), nullable=True),
    )
    create_common_indexes("equity_snapshots")
    op.create_index("ix_equity_snapshots_candle_time", "equity_snapshots", ["candle_time"])


def downgrade() -> None:
    drop_common_indexes("equity_snapshots")
    op.drop_index("ix_equity_snapshots_candle_time", table_name="equity_snapshots")
    op.drop_table("equity_snapshots")

    drop_common_indexes("trade_events")
    op.drop_index("ix_trade_events_position_id", table_name="trade_events")
    op.drop_index("ix_trade_events_order_id", table_name="trade_events")
    op.drop_index("ix_trade_events_event_type", table_name="trade_events")
    op.drop_table("trade_events")

    drop_common_indexes("paper_positions")
    op.drop_index("ix_paper_positions_closed_at", table_name="paper_positions")
    op.drop_index("ix_paper_positions_opened_at", table_name="paper_positions")
    op.drop_index("ix_paper_positions_close_reason", table_name="paper_positions")
    op.drop_index("ix_paper_positions_side", table_name="paper_positions")
    op.drop_index("ix_paper_positions_order_id", table_name="paper_positions")
    op.drop_index("ix_paper_positions_updated_at", table_name="paper_positions")
    op.drop_table("paper_positions")

    drop_common_indexes("paper_orders")
    op.drop_index("ix_paper_orders_filled_at", table_name="paper_orders")
    op.drop_index("ix_paper_orders_submitted_at", table_name="paper_orders")
    op.drop_index("ix_paper_orders_position_id", table_name="paper_orders")
    op.drop_index("ix_paper_orders_order_type", table_name="paper_orders")
    op.drop_index("ix_paper_orders_side", table_name="paper_orders")
    op.drop_index("ix_paper_orders_updated_at", table_name="paper_orders")
    op.drop_table("paper_orders")

    drop_common_indexes("risk_settings")
    op.drop_index("ix_risk_settings_updated_at", table_name="risk_settings")
    op.drop_table("risk_settings")

    drop_common_indexes("trader_states")
    op.drop_index("ix_trader_states_updated_at", table_name="trader_states")
    op.drop_table("trader_states")

    drop_common_indexes("provider_call_logs")
    op.drop_index("ix_provider_call_logs_success", table_name="provider_call_logs")
    op.drop_index("ix_provider_call_logs_provider", table_name="provider_call_logs")
    op.drop_table("provider_call_logs")

    drop_common_indexes("api_call_logs")
    op.drop_index("ix_api_call_logs_endpoint", table_name="api_call_logs")
    op.drop_table("api_call_logs")

    if op.get_bind().dialect.name != "sqlite":
        op.drop_constraint("fk_trader_run_logs_trade_plan_id", "trader_run_logs", type_="foreignkey")
        op.drop_constraint("fk_trader_run_logs_ai_review_id", "trader_run_logs", type_="foreignkey")
        op.drop_constraint("fk_trader_run_logs_candidate_trade_id", "trader_run_logs", type_="foreignkey")

    drop_common_indexes("trade_plans")
    op.drop_index("ix_trade_plans_run_id", table_name="trade_plans")
    op.drop_table("trade_plans")

    drop_common_indexes("ai_reviews")
    op.drop_index("ix_ai_reviews_fallback", table_name="ai_reviews")
    op.drop_index("ix_ai_reviews_decision", table_name="ai_reviews")
    op.drop_index("ix_ai_reviews_provider", table_name="ai_reviews")
    op.drop_index("ix_ai_reviews_run_id", table_name="ai_reviews")
    op.drop_table("ai_reviews")

    drop_common_indexes("candidate_trades")
    op.drop_index("ix_candidate_trades_setup_type", table_name="candidate_trades")
    op.drop_index("ix_candidate_trades_run_id", table_name="candidate_trades")
    op.drop_table("candidate_trades")

    drop_common_indexes("trader_run_logs")
    op.drop_index("ix_trader_run_logs_trade_plan_id", table_name="trader_run_logs")
    op.drop_index("ix_trader_run_logs_ai_review_id", table_name="trader_run_logs")
    op.drop_index("ix_trader_run_logs_candidate_trade_id", table_name="trader_run_logs")
    op.drop_index("ix_trader_run_logs_market_snapshot_id", table_name="trader_run_logs")
    op.drop_index("ix_trader_run_logs_provider", table_name="trader_run_logs")
    op.drop_table("trader_run_logs")

    drop_common_indexes("market_snapshots")
    op.drop_table("market_snapshots")
