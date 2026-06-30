"""add monthly position closed-at indexes

Revision ID: 202607010001
Revises: 202606300002
Create Date: 2026-07-01 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op


revision: str = "202607010001"
down_revision: Union[str, None] = "202606300002"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_paper_positions_trader_symbol_status_closed "
                "ON paper_positions (trader_id, symbol, status, closed_at, id)"
            )
            op.execute(
                "CREATE INDEX CONCURRENTLY IF NOT EXISTS ix_paper_positions_symbol_status_closed "
                "ON paper_positions (symbol, status, closed_at, id)"
            )
        return

    op.create_index(
        "ix_paper_positions_trader_symbol_status_closed",
        "paper_positions",
        ["trader_id", "symbol", "status", "closed_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_paper_positions_symbol_status_closed",
        "paper_positions",
        ["symbol", "status", "closed_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    if op.get_bind().dialect.name == "postgresql":
        with op.get_context().autocommit_block():
            op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_paper_positions_symbol_status_closed")
            op.execute("DROP INDEX CONCURRENTLY IF EXISTS ix_paper_positions_trader_symbol_status_closed")
        return

    op.drop_index("ix_paper_positions_symbol_status_closed", table_name="paper_positions")
    op.drop_index("ix_paper_positions_trader_symbol_status_closed", table_name="paper_positions")
