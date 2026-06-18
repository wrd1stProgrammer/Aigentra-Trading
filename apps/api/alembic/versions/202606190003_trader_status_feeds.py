"""add trader status feeds

Revision ID: 202606190003
Revises: 202606190002
Create Date: 2026-06-19 03:45:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "202606190003"
down_revision = "202606190002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "trader_status_feeds",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state_key", sa.String(length=80), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=True),
        sa.Column("refresh_reason", sa.String(length=40), nullable=False),
        sa.Column("state_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("model", sa.String(length=140), nullable=True),
        sa.Column("fallback", sa.Boolean(), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=True),
        sa.Column("trader_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_type", "source_id", "state_key", "refresh_reason", name="uq_trader_status_feeds_source_state_reason"),
    )
    op.create_index(op.f("ix_trader_status_feeds_id"), "trader_status_feeds", ["id"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_created_at"), "trader_status_feeds", ["created_at"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_symbol"), "trader_status_feeds", ["symbol"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_trader_id"), "trader_status_feeds", ["trader_id"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_status"), "trader_status_feeds", ["status"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_updated_at"), "trader_status_feeds", ["updated_at"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_state_key"), "trader_status_feeds", ["state_key"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_event_type"), "trader_status_feeds", ["event_type"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_source_type"), "trader_status_feeds", ["source_type"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_source_id"), "trader_status_feeds", ["source_id"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_refresh_reason"), "trader_status_feeds", ["refresh_reason"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_state_started_at"), "trader_status_feeds", ["state_started_at"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_provider"), "trader_status_feeds", ["provider"], unique=False)
    op.create_index(op.f("ix_trader_status_feeds_fallback"), "trader_status_feeds", ["fallback"], unique=False)
    op.create_index(
        "ix_trader_status_feeds_trader_symbol_created",
        "trader_status_feeds",
        ["trader_id", "symbol", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_trader_status_feeds_state_created",
        "trader_status_feeds",
        ["state_key", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_trader_status_feeds_state_created", table_name="trader_status_feeds")
    op.drop_index("ix_trader_status_feeds_trader_symbol_created", table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_fallback"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_provider"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_state_started_at"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_refresh_reason"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_source_id"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_source_type"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_event_type"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_state_key"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_updated_at"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_status"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_trader_id"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_symbol"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_created_at"), table_name="trader_status_feeds")
    op.drop_index(op.f("ix_trader_status_feeds_id"), table_name="trader_status_feeds")
    op.drop_table("trader_status_feeds")
