"""add leaderboard snapshot fast fields

Revision ID: 202605260005
Revises: 202605260004
Create Date: 2026-05-26 00:00:05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202605260005"
down_revision: Union[str, None] = "202605260004"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("trader_leaderboard_snapshots", sa.Column("has_live_paper_data", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("trader_leaderboard_snapshots", sa.Column("rank_score", sa.Float(), nullable=False, server_default="0"))
    op.add_column("trader_leaderboard_snapshots", sa.Column("current_plan_ko", sa.Text(), nullable=True))
    op.add_column("trader_leaderboard_snapshots", sa.Column("current_plan_en", sa.Text(), nullable=True))
    op.create_index("ix_trader_leaderboard_snapshots_has_live_paper_data", "trader_leaderboard_snapshots", ["has_live_paper_data"])
    op.create_index("ix_trader_leaderboard_snapshots_rank_score", "trader_leaderboard_snapshots", ["rank_score"])
    op.create_index("ix_trader_leaderboard_snapshots_symbol_rank_score", "trader_leaderboard_snapshots", ["symbol", "rank_score"])


def downgrade() -> None:
    op.drop_index("ix_trader_leaderboard_snapshots_symbol_rank_score", table_name="trader_leaderboard_snapshots")
    op.drop_index("ix_trader_leaderboard_snapshots_rank_score", table_name="trader_leaderboard_snapshots")
    op.drop_index("ix_trader_leaderboard_snapshots_has_live_paper_data", table_name="trader_leaderboard_snapshots")
    op.drop_column("trader_leaderboard_snapshots", "current_plan_en")
    op.drop_column("trader_leaderboard_snapshots", "current_plan_ko")
    op.drop_column("trader_leaderboard_snapshots", "rank_score")
    op.drop_column("trader_leaderboard_snapshots", "has_live_paper_data")
