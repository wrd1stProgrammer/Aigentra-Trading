"""add position management reviews

Revision ID: 202605260002
Revises: 202605260001
Create Date: 2026-05-26 00:00:02
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202605260002"
down_revision: Union[str, None] = "202605260001"
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
        "position_management_reviews",
        *common_columns(),
        sa.Column("order_id", sa.Integer(), nullable=True),
        sa.Column("position_id", sa.Integer(), nullable=True),
        sa.Column("event_type", sa.String(length=80), nullable=True),
        sa.Column("phase", sa.String(length=40), nullable=True),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("model", sa.String(length=140), nullable=True),
        sa.Column("decision", sa.String(length=60), nullable=True),
        sa.Column("confidence", sa.Integer(), nullable=True),
        sa.Column("action_type", sa.String(length=80), nullable=True),
        sa.Column("fallback", sa.Boolean(), nullable=False),
        sa.ForeignKeyConstraint(["order_id"], ["paper_orders.id"], name="fk_position_management_reviews_order_id"),
        sa.ForeignKeyConstraint(["position_id"], ["paper_positions.id"], name="fk_position_management_reviews_position_id"),
    )
    create_common_indexes("position_management_reviews")
    op.create_index("ix_position_management_reviews_order_id", "position_management_reviews", ["order_id"])
    op.create_index("ix_position_management_reviews_position_id", "position_management_reviews", ["position_id"])
    op.create_index("ix_position_management_reviews_event_type", "position_management_reviews", ["event_type"])
    op.create_index("ix_position_management_reviews_phase", "position_management_reviews", ["phase"])
    op.create_index("ix_position_management_reviews_provider", "position_management_reviews", ["provider"])
    op.create_index("ix_position_management_reviews_decision", "position_management_reviews", ["decision"])
    op.create_index("ix_position_management_reviews_action_type", "position_management_reviews", ["action_type"])


def downgrade() -> None:
    op.drop_index("ix_position_management_reviews_action_type", table_name="position_management_reviews")
    op.drop_index("ix_position_management_reviews_decision", table_name="position_management_reviews")
    op.drop_index("ix_position_management_reviews_provider", table_name="position_management_reviews")
    op.drop_index("ix_position_management_reviews_phase", table_name="position_management_reviews")
    op.drop_index("ix_position_management_reviews_event_type", table_name="position_management_reviews")
    op.drop_index("ix_position_management_reviews_position_id", table_name="position_management_reviews")
    op.drop_index("ix_position_management_reviews_order_id", table_name="position_management_reviews")
    drop_common_indexes("position_management_reviews")
    op.drop_table("position_management_reviews")
