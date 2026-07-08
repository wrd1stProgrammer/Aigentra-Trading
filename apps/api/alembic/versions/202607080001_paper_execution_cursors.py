"""add paper execution cursors

Revision ID: 202607080001
Revises: 202607050001
Create Date: 2026-07-08 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202607080001"
down_revision: Union[str, None] = "202607050001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "paper_execution_cursors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=False),
        sa.Column("interval", sa.String(length=20), nullable=False),
        sa.Column("last_open_time_ms", sa.BigInteger(), nullable=False),
        sa.Column("last_candle_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("symbol", "interval", name="uq_paper_execution_cursors_symbol_interval"),
    )
    op.create_index(op.f("ix_paper_execution_cursors_id"), "paper_execution_cursors", ["id"], unique=False)
    op.create_index(op.f("ix_paper_execution_cursors_created_at"), "paper_execution_cursors", ["created_at"], unique=False)
    op.create_index(op.f("ix_paper_execution_cursors_updated_at"), "paper_execution_cursors", ["updated_at"], unique=False)
    op.create_index(op.f("ix_paper_execution_cursors_symbol"), "paper_execution_cursors", ["symbol"], unique=False)
    op.create_index(op.f("ix_paper_execution_cursors_interval"), "paper_execution_cursors", ["interval"], unique=False)
    op.create_index(op.f("ix_paper_execution_cursors_last_candle_at"), "paper_execution_cursors", ["last_candle_at"], unique=False)
    op.create_index(
        "ix_paper_execution_cursors_symbol_interval",
        "paper_execution_cursors",
        ["symbol", "interval"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_paper_execution_cursors_symbol_interval", table_name="paper_execution_cursors")
    op.drop_index(op.f("ix_paper_execution_cursors_last_candle_at"), table_name="paper_execution_cursors")
    op.drop_index(op.f("ix_paper_execution_cursors_interval"), table_name="paper_execution_cursors")
    op.drop_index(op.f("ix_paper_execution_cursors_symbol"), table_name="paper_execution_cursors")
    op.drop_index(op.f("ix_paper_execution_cursors_updated_at"), table_name="paper_execution_cursors")
    op.drop_index(op.f("ix_paper_execution_cursors_created_at"), table_name="paper_execution_cursors")
    op.drop_index(op.f("ix_paper_execution_cursors_id"), table_name="paper_execution_cursors")
    op.drop_table("paper_execution_cursors")
