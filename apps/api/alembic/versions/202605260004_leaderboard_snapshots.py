"""add leaderboard snapshots

Revision ID: 202605260004
Revises: 202605260003
Create Date: 2026-05-26 00:00:04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202605260004"
down_revision: Union[str, None] = "202605260003"
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
        "trader_leaderboard_snapshots",
        *common_columns(),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("rank", sa.Integer(), nullable=True),
        sa.Column("trader_name", sa.String(length=128), nullable=True),
        sa.Column("mode", sa.String(length=20), nullable=False),
        sa.Column("equity", sa.Numeric(24, 10), nullable=False),
        sa.Column("cash_balance", sa.Numeric(24, 10), nullable=False),
        sa.Column("realized_pnl", sa.Numeric(24, 10), nullable=False),
        sa.Column("unrealized_pnl", sa.Numeric(24, 10), nullable=False),
        sa.Column("total_fees", sa.Numeric(24, 10), nullable=False),
        sa.Column("total_pnl", sa.Numeric(24, 10), nullable=False),
        sa.Column("return_7d", sa.Float(), nullable=False),
        sa.Column("return_30d", sa.Float(), nullable=False),
        sa.Column("win_rate", sa.Float(), nullable=True),
        sa.Column("closed_positions", sa.Integer(), nullable=False),
        sa.Column("wins", sa.Integer(), nullable=False),
        sa.Column("losses", sa.Integer(), nullable=False),
        sa.Column("max_drawdown", sa.Float(), nullable=False),
        sa.Column("risk_percent", sa.Float(), nullable=False),
        sa.Column("leverage", sa.Float(), nullable=True),
        sa.Column("open_orders", sa.Integer(), nullable=False),
        sa.Column("open_positions", sa.Integer(), nullable=False),
        sa.Column("biggest_win", sa.Float(), nullable=False),
        sa.Column("biggest_loss", sa.Float(), nullable=False),
        sa.Column("average_leverage", sa.Float(), nullable=True),
        sa.Column("sharpe", sa.Float(), nullable=False),
        sa.Column("long_trades", sa.Integer(), nullable=False),
        sa.Column("short_trades", sa.Integer(), nullable=False),
        sa.Column("open_notional", sa.Float(), nullable=False),
        sa.Column("open_margin", sa.Float(), nullable=False),
        sa.Column("open_order_notional", sa.Float(), nullable=False),
        sa.Column("pending_entry_weight", sa.Float(), nullable=True),
        sa.Column("latest_run_status", sa.String(length=80), nullable=True),
        sa.Column("latest_plan_status", sa.String(length=80), nullable=True),
        sa.Column("agent_mode", sa.String(length=40), nullable=True),
        sa.Column("agent_phase", sa.String(length=40), nullable=True),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_decision", sa.String(length=60), nullable=True),
        sa.Column("last_action", sa.String(length=80), nullable=True),
        sa.UniqueConstraint("trader_id", "symbol", name="uq_trader_leaderboard_snapshots_trader_symbol"),
    )
    create_common_indexes("trader_leaderboard_snapshots")
    op.create_index("ix_trader_leaderboard_snapshots_updated_at", "trader_leaderboard_snapshots", ["updated_at"])
    op.create_index("ix_trader_leaderboard_snapshots_rank", "trader_leaderboard_snapshots", ["rank"])
    op.create_index("ix_trader_leaderboard_snapshots_return_30d", "trader_leaderboard_snapshots", ["return_30d"])


def downgrade() -> None:
    op.drop_index("ix_trader_leaderboard_snapshots_return_30d", table_name="trader_leaderboard_snapshots")
    op.drop_index("ix_trader_leaderboard_snapshots_rank", table_name="trader_leaderboard_snapshots")
    op.drop_index("ix_trader_leaderboard_snapshots_updated_at", table_name="trader_leaderboard_snapshots")
    drop_common_indexes("trader_leaderboard_snapshots")
    op.drop_table("trader_leaderboard_snapshots")
