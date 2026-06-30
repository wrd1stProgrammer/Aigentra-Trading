"""add covering indexes for public read timeouts

Revision ID: 202606300002
Revises: 202606300001
Create Date: 2026-06-30 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "202606300002"
down_revision: Union[str, None] = "202606300001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_trade_plans_symbol_status_created",
        "trade_plans",
        ["symbol", "status", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_paper_orders_symbol_status_created",
        "paper_orders",
        ["symbol", "status", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_paper_positions_symbol_status_created",
        "paper_positions",
        ["symbol", "status", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_whop_checkouts_user_updated",
        "whop_checkouts",
        ["user_id", "updated_at", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_whop_checkouts_email_updated",
        "whop_checkouts",
        ["email", "updated_at", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_whop_checkouts_user_status_updated",
        "whop_checkouts",
        ["user_id", "status", "updated_at", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_whop_checkouts_email_status_updated",
        "whop_checkouts",
        ["email", "status", "updated_at", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_review_unlocks_email_created_id",
        "review_unlocks",
        ["email", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_review_unlocks_email_created_id", table_name="review_unlocks")
    op.drop_index("ix_whop_checkouts_email_status_updated", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_user_status_updated", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_email_updated", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_user_updated", table_name="whop_checkouts")
    op.drop_index("ix_paper_positions_symbol_status_created", table_name="paper_positions")
    op.drop_index("ix_paper_orders_symbol_status_created", table_name="paper_orders")
    op.drop_index("ix_trade_plans_symbol_status_created", table_name="trade_plans")
