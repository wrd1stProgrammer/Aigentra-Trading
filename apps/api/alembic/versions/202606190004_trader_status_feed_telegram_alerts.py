"""add trader status feed telegram alerts

Revision ID: 202606190004
Revises: 202606190003
Create Date: 2026-06-19 22:30:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "202606190004"
down_revision = "202606190003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("telegram_alert_deliveries", sa.Column("trader_status_feed_id", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_telegram_alert_deliveries_trader_status_feed_id"),
        "telegram_alert_deliveries",
        ["trader_status_feed_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_telegram_alert_deliveries_trader_status_feed_id",
        "telegram_alert_deliveries",
        "trader_status_feeds",
        ["trader_status_feed_id"],
        ["id"],
    )
    op.create_unique_constraint(
        "uq_telegram_alert_delivery_subscriber_status_feed",
        "telegram_alert_deliveries",
        ["subscriber_preference_id", "trader_status_feed_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_telegram_alert_delivery_subscriber_status_feed",
        "telegram_alert_deliveries",
        type_="unique",
    )
    op.drop_constraint(
        "fk_telegram_alert_deliveries_trader_status_feed_id",
        "telegram_alert_deliveries",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_telegram_alert_deliveries_trader_status_feed_id"), table_name="telegram_alert_deliveries")
    op.drop_column("telegram_alert_deliveries", "trader_status_feed_id")
