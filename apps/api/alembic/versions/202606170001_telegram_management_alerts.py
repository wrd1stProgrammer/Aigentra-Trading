"""add Telegram delivery tracking for management reviews

Revision ID: 202606170001
Revises: 202606060001
Create Date: 2026-06-17 17:30:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202606170001"
down_revision: Union[str, None] = "202606060001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column("telegram_alert_deliveries", "trade_event_id", existing_type=sa.Integer(), nullable=True)
    op.add_column("telegram_alert_deliveries", sa.Column("position_management_review_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_telegram_alert_deliveries_position_management_review_id",
        "telegram_alert_deliveries",
        "position_management_reviews",
        ["position_management_review_id"],
        ["id"],
    )
    op.create_index(
        "ix_telegram_alert_deliveries_position_management_review_id",
        "telegram_alert_deliveries",
        ["position_management_review_id"],
    )
    op.create_unique_constraint(
        "uq_telegram_alert_delivery_subscriber_review",
        "telegram_alert_deliveries",
        ["subscriber_preference_id", "position_management_review_id"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_telegram_alert_delivery_subscriber_review", "telegram_alert_deliveries", type_="unique")
    op.drop_index("ix_telegram_alert_deliveries_position_management_review_id", table_name="telegram_alert_deliveries")
    op.drop_constraint(
        "fk_telegram_alert_deliveries_position_management_review_id",
        "telegram_alert_deliveries",
        type_="foreignkey",
    )
    op.drop_column("telegram_alert_deliveries", "position_management_review_id")
    op.alter_column("telegram_alert_deliveries", "trade_event_id", existing_type=sa.Integer(), nullable=False)
