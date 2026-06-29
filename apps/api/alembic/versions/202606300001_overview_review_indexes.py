from typing import Sequence, Union

from alembic import op


revision: str = "202606300001"
down_revision: Union[str, None] = "202606210001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "ix_ai_reviews_overview_symbol_recent",
        "ai_reviews",
        ["symbol", "status", "fallback", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_ai_reviews_overview_recent",
        "ai_reviews",
        ["status", "fallback", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_position_management_reviews_overview_symbol_recent",
        "position_management_reviews",
        ["symbol", "status", "fallback", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_position_management_reviews_overview_recent",
        "position_management_reviews",
        ["status", "fallback", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_position_management_reviews_trader_symbol_created",
        "position_management_reviews",
        ["trader_id", "symbol", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_trade_plans_trader_symbol_created",
        "trade_plans",
        ["trader_id", "symbol", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_paper_orders_trader_symbol_status_created",
        "paper_orders",
        ["trader_id", "symbol", "status", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_paper_positions_trader_symbol_status_created",
        "paper_positions",
        ["trader_id", "symbol", "status", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_trade_events_trader_symbol_created",
        "trade_events",
        ["trader_id", "symbol", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_equity_snapshots_trader_symbol_created",
        "equity_snapshots",
        ["trader_id", "symbol", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_equity_snapshots_trader_symbol_created", table_name="equity_snapshots")
    op.drop_index("ix_trade_events_trader_symbol_created", table_name="trade_events")
    op.drop_index("ix_paper_positions_trader_symbol_status_created", table_name="paper_positions")
    op.drop_index("ix_paper_orders_trader_symbol_status_created", table_name="paper_orders")
    op.drop_index("ix_trade_plans_trader_symbol_created", table_name="trade_plans")
    op.drop_index("ix_position_management_reviews_trader_symbol_created", table_name="position_management_reviews")
    op.drop_index("ix_position_management_reviews_overview_recent", table_name="position_management_reviews")
    op.drop_index("ix_position_management_reviews_overview_symbol_recent", table_name="position_management_reviews")
    op.drop_index("ix_ai_reviews_overview_recent", table_name="ai_reviews")
    op.drop_index("ix_ai_reviews_overview_symbol_recent", table_name="ai_reviews")
