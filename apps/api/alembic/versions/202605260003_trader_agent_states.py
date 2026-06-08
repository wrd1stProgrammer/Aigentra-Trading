"""add trader agent states

Revision ID: 202605260003
Revises: 202605260002
Create Date: 2026-05-26 00:00:03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202605260003"
down_revision: Union[str, None] = "202605260002"
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
        "trader_agent_states",
        *common_columns(),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("phase", sa.String(length=40), nullable=False),
        sa.Column("mode", sa.String(length=40), nullable=False),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_review_id", sa.Integer(), nullable=True),
        sa.Column("last_event_type", sa.String(length=80), nullable=True),
        sa.Column("last_decision", sa.String(length=60), nullable=True),
        sa.Column("last_action_type", sa.String(length=80), nullable=True),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("model", sa.String(length=140), nullable=True),
        sa.ForeignKeyConstraint(["last_review_id"], ["position_management_reviews.id"], name="fk_trader_agent_states_last_review_id"),
        sa.UniqueConstraint("trader_id", "symbol", name="uq_trader_agent_states_trader_symbol"),
    )
    create_common_indexes("trader_agent_states")
    op.create_index("ix_trader_agent_states_updated_at", "trader_agent_states", ["updated_at"])
    op.create_index("ix_trader_agent_states_phase", "trader_agent_states", ["phase"])
    op.create_index("ix_trader_agent_states_mode", "trader_agent_states", ["mode"])
    op.create_index("ix_trader_agent_states_next_review_at", "trader_agent_states", ["next_review_at"])
    op.create_index("ix_trader_agent_states_last_review_id", "trader_agent_states", ["last_review_id"])
    op.create_index("ix_trader_agent_states_last_event_type", "trader_agent_states", ["last_event_type"])
    op.create_index("ix_trader_agent_states_last_decision", "trader_agent_states", ["last_decision"])
    op.create_index("ix_trader_agent_states_last_action_type", "trader_agent_states", ["last_action_type"])
    op.create_index("ix_trader_agent_states_provider", "trader_agent_states", ["provider"])


def downgrade() -> None:
    op.drop_index("ix_trader_agent_states_provider", table_name="trader_agent_states")
    op.drop_index("ix_trader_agent_states_last_action_type", table_name="trader_agent_states")
    op.drop_index("ix_trader_agent_states_last_decision", table_name="trader_agent_states")
    op.drop_index("ix_trader_agent_states_last_event_type", table_name="trader_agent_states")
    op.drop_index("ix_trader_agent_states_last_review_id", table_name="trader_agent_states")
    op.drop_index("ix_trader_agent_states_next_review_at", table_name="trader_agent_states")
    op.drop_index("ix_trader_agent_states_mode", table_name="trader_agent_states")
    op.drop_index("ix_trader_agent_states_phase", table_name="trader_agent_states")
    op.drop_index("ix_trader_agent_states_updated_at", table_name="trader_agent_states")
    drop_common_indexes("trader_agent_states")
    op.drop_table("trader_agent_states")
