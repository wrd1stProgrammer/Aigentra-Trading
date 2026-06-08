"""add subscriber preferences and Telegram alert deliveries

Revision ID: 202606060001
Revises: 202605260005
Create Date: 2026-06-06 00:00:01
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202606060001"
down_revision: Union[str, None] = "202605260005"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriber_preferences",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=True),
        sa.Column("trader_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.String(length=180), nullable=False),
        sa.Column("email", sa.String(length=240), nullable=False),
        sa.Column("subscription_status", sa.String(length=40), nullable=False, server_default="active"),
        sa.Column("favorite_trader_ids_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("telegram_enabled", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("telegram_chat_id", sa.String(length=120), nullable=True),
        sa.Column("telegram_event_types_json", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("telegram_min_return_pct", sa.Float(), nullable=False, server_default="0"),
        sa.Column("locale", sa.String(length=8), nullable=False, server_default="ko"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_subscriber_preferences_email"),
    )
    op.create_index("ix_subscriber_preferences_id", "subscriber_preferences", ["id"])
    op.create_index("ix_subscriber_preferences_created_at", "subscriber_preferences", ["created_at"])
    op.create_index("ix_subscriber_preferences_symbol", "subscriber_preferences", ["symbol"])
    op.create_index("ix_subscriber_preferences_trader_id", "subscriber_preferences", ["trader_id"])
    op.create_index("ix_subscriber_preferences_status", "subscriber_preferences", ["status"])
    op.create_index("ix_subscriber_preferences_updated_at", "subscriber_preferences", ["updated_at"])
    op.create_index("ix_subscriber_preferences_user_id", "subscriber_preferences", ["user_id"])
    op.create_index("ix_subscriber_preferences_email", "subscriber_preferences", ["email"])
    op.create_index("ix_subscriber_preferences_subscription_status", "subscriber_preferences", ["subscription_status"])
    op.create_index("ix_subscriber_preferences_telegram_enabled", "subscriber_preferences", ["telegram_enabled"])

    op.create_table(
        "telegram_alert_deliveries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=True),
        sa.Column("trader_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("subscriber_preference_id", sa.Integer(), nullable=False),
        sa.Column("trade_event_id", sa.Integer(), nullable=False),
        sa.Column("telegram_event_type", sa.String(length=40), nullable=False),
        sa.Column("chat_id", sa.String(length=120), nullable=False),
        sa.Column("response_json", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["subscriber_preference_id"], ["subscriber_preferences.id"]),
        sa.ForeignKeyConstraint(["trade_event_id"], ["trade_events.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subscriber_preference_id", "trade_event_id", name="uq_telegram_alert_delivery_subscriber_event"),
    )
    op.create_index("ix_telegram_alert_deliveries_id", "telegram_alert_deliveries", ["id"])
    op.create_index("ix_telegram_alert_deliveries_created_at", "telegram_alert_deliveries", ["created_at"])
    op.create_index("ix_telegram_alert_deliveries_symbol", "telegram_alert_deliveries", ["symbol"])
    op.create_index("ix_telegram_alert_deliveries_trader_id", "telegram_alert_deliveries", ["trader_id"])
    op.create_index("ix_telegram_alert_deliveries_status", "telegram_alert_deliveries", ["status"])
    op.create_index("ix_telegram_alert_deliveries_updated_at", "telegram_alert_deliveries", ["updated_at"])
    op.create_index("ix_telegram_alert_deliveries_subscriber_preference_id", "telegram_alert_deliveries", ["subscriber_preference_id"])
    op.create_index("ix_telegram_alert_deliveries_trade_event_id", "telegram_alert_deliveries", ["trade_event_id"])
    op.create_index("ix_telegram_alert_deliveries_telegram_event_type", "telegram_alert_deliveries", ["telegram_event_type"])


def downgrade() -> None:
    op.drop_index("ix_telegram_alert_deliveries_telegram_event_type", table_name="telegram_alert_deliveries")
    op.drop_index("ix_telegram_alert_deliveries_trade_event_id", table_name="telegram_alert_deliveries")
    op.drop_index("ix_telegram_alert_deliveries_subscriber_preference_id", table_name="telegram_alert_deliveries")
    op.drop_index("ix_telegram_alert_deliveries_updated_at", table_name="telegram_alert_deliveries")
    op.drop_index("ix_telegram_alert_deliveries_status", table_name="telegram_alert_deliveries")
    op.drop_index("ix_telegram_alert_deliveries_trader_id", table_name="telegram_alert_deliveries")
    op.drop_index("ix_telegram_alert_deliveries_symbol", table_name="telegram_alert_deliveries")
    op.drop_index("ix_telegram_alert_deliveries_created_at", table_name="telegram_alert_deliveries")
    op.drop_index("ix_telegram_alert_deliveries_id", table_name="telegram_alert_deliveries")
    op.drop_table("telegram_alert_deliveries")
    op.drop_index("ix_subscriber_preferences_telegram_enabled", table_name="subscriber_preferences")
    op.drop_index("ix_subscriber_preferences_subscription_status", table_name="subscriber_preferences")
    op.drop_index("ix_subscriber_preferences_email", table_name="subscriber_preferences")
    op.drop_index("ix_subscriber_preferences_user_id", table_name="subscriber_preferences")
    op.drop_index("ix_subscriber_preferences_updated_at", table_name="subscriber_preferences")
    op.drop_index("ix_subscriber_preferences_status", table_name="subscriber_preferences")
    op.drop_index("ix_subscriber_preferences_trader_id", table_name="subscriber_preferences")
    op.drop_index("ix_subscriber_preferences_symbol", table_name="subscriber_preferences")
    op.drop_index("ix_subscriber_preferences_created_at", table_name="subscriber_preferences")
    op.drop_index("ix_subscriber_preferences_id", table_name="subscriber_preferences")
    op.drop_table("subscriber_preferences")
