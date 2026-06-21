"""add review unlock coupons

Revision ID: 202606210001
Revises: 202606200002
Create Date: 2026-06-21 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202606210001"
down_revision: Union[str, None] = "202606200002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "review_unlocks",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.String(length=180), nullable=False),
        sa.Column("email", sa.String(length=240), nullable=False),
        sa.Column("source_key", sa.String(length=520), nullable=False),
        sa.Column("source_type", sa.String(length=40), nullable=False),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=True),
        sa.Column("trader_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", "source_key", name="uq_review_unlocks_email_source_key"),
    )
    op.create_index(op.f("ix_review_unlocks_id"), "review_unlocks", ["id"], unique=False)
    op.create_index(op.f("ix_review_unlocks_created_at"), "review_unlocks", ["created_at"], unique=False)
    op.create_index(op.f("ix_review_unlocks_symbol"), "review_unlocks", ["symbol"], unique=False)
    op.create_index(op.f("ix_review_unlocks_trader_id"), "review_unlocks", ["trader_id"], unique=False)
    op.create_index(op.f("ix_review_unlocks_status"), "review_unlocks", ["status"], unique=False)
    op.create_index(op.f("ix_review_unlocks_updated_at"), "review_unlocks", ["updated_at"], unique=False)
    op.create_index(op.f("ix_review_unlocks_user_id"), "review_unlocks", ["user_id"], unique=False)
    op.create_index(op.f("ix_review_unlocks_email"), "review_unlocks", ["email"], unique=False)
    op.create_index(op.f("ix_review_unlocks_source_key"), "review_unlocks", ["source_key"], unique=False)
    op.create_index(op.f("ix_review_unlocks_source_type"), "review_unlocks", ["source_type"], unique=False)
    op.create_index("ix_review_unlocks_email_created", "review_unlocks", ["email", "created_at"], unique=False)
    op.create_index("ix_review_unlocks_user_created", "review_unlocks", ["user_id", "created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_review_unlocks_user_created", table_name="review_unlocks")
    op.drop_index("ix_review_unlocks_email_created", table_name="review_unlocks")
    op.drop_index(op.f("ix_review_unlocks_source_type"), table_name="review_unlocks")
    op.drop_index(op.f("ix_review_unlocks_source_key"), table_name="review_unlocks")
    op.drop_index(op.f("ix_review_unlocks_email"), table_name="review_unlocks")
    op.drop_index(op.f("ix_review_unlocks_user_id"), table_name="review_unlocks")
    op.drop_index(op.f("ix_review_unlocks_updated_at"), table_name="review_unlocks")
    op.drop_index(op.f("ix_review_unlocks_status"), table_name="review_unlocks")
    op.drop_index(op.f("ix_review_unlocks_trader_id"), table_name="review_unlocks")
    op.drop_index(op.f("ix_review_unlocks_symbol"), table_name="review_unlocks")
    op.drop_index(op.f("ix_review_unlocks_created_at"), table_name="review_unlocks")
    op.drop_index(op.f("ix_review_unlocks_id"), table_name="review_unlocks")
    op.drop_table("review_unlocks")
