"""add league sentiment telegram alerts

Revision ID: 202606190002
Revises: 202606190001
Create Date: 2026-06-19 00:00:00.000000
"""

from __future__ import annotations

import json

from alembic import context, op
import sqlalchemy as sa


revision = "202606190002"
down_revision = "202606190001"
branch_labels = None
depends_on = None

EVENT_TYPE = "league_sentiment"

subscriber_preferences = sa.table(
    "subscriber_preferences",
    sa.column("id", sa.Integer),
    sa.column("telegram_event_types_json", sa.Text),
)


def upgrade() -> None:
    op.add_column("telegram_alert_deliveries", sa.Column("league_sentiment_opinion_id", sa.Integer(), nullable=True))
    op.create_index(
        op.f("ix_telegram_alert_deliveries_league_sentiment_opinion_id"),
        "telegram_alert_deliveries",
        ["league_sentiment_opinion_id"],
        unique=False,
    )
    op.create_foreign_key(
        "fk_telegram_alert_deliveries_league_sentiment_opinion_id",
        "telegram_alert_deliveries",
        "league_sentiment_opinions",
        ["league_sentiment_opinion_id"],
        ["id"],
    )
    op.create_unique_constraint(
        "uq_telegram_alert_delivery_subscriber_sentiment",
        "telegram_alert_deliveries",
        ["subscriber_preference_id", "league_sentiment_opinion_id"],
    )
    add_event_type_to_existing_preferences()


def downgrade() -> None:
    remove_event_type_from_existing_preferences()
    op.drop_constraint(
        "uq_telegram_alert_delivery_subscriber_sentiment",
        "telegram_alert_deliveries",
        type_="unique",
    )
    op.drop_constraint(
        "fk_telegram_alert_deliveries_league_sentiment_opinion_id",
        "telegram_alert_deliveries",
        type_="foreignkey",
    )
    op.drop_index(op.f("ix_telegram_alert_deliveries_league_sentiment_opinion_id"), table_name="telegram_alert_deliveries")
    op.drop_column("telegram_alert_deliveries", "league_sentiment_opinion_id")


def add_event_type_to_existing_preferences() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    rows = bind.execute(
        sa.select(
            subscriber_preferences.c.id,
            subscriber_preferences.c.telegram_event_types_json,
        )
    ).all()
    for row in rows:
        values = read_event_types(row.telegram_event_types_json)
        if values is None or EVENT_TYPE in values:
            continue
        bind.execute(
            sa.update(subscriber_preferences)
            .where(subscriber_preferences.c.id == row.id)
            .values(telegram_event_types_json=json.dumps([*values, EVENT_TYPE], ensure_ascii=False))
        )


def remove_event_type_from_existing_preferences() -> None:
    if context.is_offline_mode():
        return
    bind = op.get_bind()
    rows = bind.execute(
        sa.select(
            subscriber_preferences.c.id,
            subscriber_preferences.c.telegram_event_types_json,
        )
    ).all()
    for row in rows:
        values = read_event_types(row.telegram_event_types_json)
        if values is None or EVENT_TYPE not in values:
            continue
        bind.execute(
            sa.update(subscriber_preferences)
            .where(subscriber_preferences.c.id == row.id)
            .values(telegram_event_types_json=json.dumps([value for value in values if value != EVENT_TYPE], ensure_ascii=False))
        )


def read_event_types(raw_value: str | None) -> list[str] | None:
    try:
        parsed = json.loads(raw_value or "[]")
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, list):
        return None
    return [value for value in parsed if isinstance(value, str)]
