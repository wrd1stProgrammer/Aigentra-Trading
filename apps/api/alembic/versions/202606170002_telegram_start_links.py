"""add Telegram account start links

Revision ID: 202606170002
Revises: 202606170001
Create Date: 2026-06-17 18:10:00
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202606170002"
down_revision: Union[str, None] = "202606170001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("subscriber_preferences", sa.Column("telegram_link_token_hash", sa.String(length=80), nullable=True))
    op.add_column("subscriber_preferences", sa.Column("telegram_link_expires_at", sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        "ix_subscriber_preferences_telegram_link_token_hash",
        "subscriber_preferences",
        ["telegram_link_token_hash"],
        unique=True,
    )
    op.create_index(
        "ix_subscriber_preferences_telegram_link_expires_at",
        "subscriber_preferences",
        ["telegram_link_expires_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_subscriber_preferences_telegram_link_expires_at", table_name="subscriber_preferences")
    op.drop_index("ix_subscriber_preferences_telegram_link_token_hash", table_name="subscriber_preferences")
    op.drop_column("subscriber_preferences", "telegram_link_expires_at")
    op.drop_column("subscriber_preferences", "telegram_link_token_hash")
