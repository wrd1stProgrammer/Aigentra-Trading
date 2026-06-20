"""add Whop payment checkout records

Revision ID: 202606200001
Revises: 202606190004
Create Date: 2026-06-20 12:00:00.000000
"""

from alembic import op
import sqlalchemy as sa


revision = "202606200001"
down_revision = "202606190004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "whop_checkouts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("checkout_id", sa.String(length=120), nullable=False),
        sa.Column("internal_order_id", sa.String(length=120), nullable=False),
        sa.Column("user_id", sa.String(length=180), nullable=False),
        sa.Column("email", sa.String(length=240), nullable=False),
        sa.Column("plan_key", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=60), nullable=False),
        sa.Column("whop_plan_id", sa.String(length=120), nullable=True),
        sa.Column("whop_payment_id", sa.String(length=120), nullable=True),
        sa.Column("whop_membership_id", sa.String(length=120), nullable=True),
        sa.Column("currency", sa.String(length=16), nullable=True),
        sa.Column("amount", sa.Float(), nullable=True),
        sa.Column("purchase_url", sa.Text(), nullable=False),
        sa.Column("metadata_json", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("checkout_id", name="uq_whop_checkouts_checkout_id"),
        sa.UniqueConstraint("internal_order_id", name="uq_whop_checkouts_internal_order_id"),
    )
    op.create_index("ix_whop_checkouts_id", "whop_checkouts", ["id"])
    op.create_index("ix_whop_checkouts_created_at", "whop_checkouts", ["created_at"])
    op.create_index("ix_whop_checkouts_updated_at", "whop_checkouts", ["updated_at"])
    op.create_index("ix_whop_checkouts_checkout_id", "whop_checkouts", ["checkout_id"])
    op.create_index("ix_whop_checkouts_internal_order_id", "whop_checkouts", ["internal_order_id"])
    op.create_index("ix_whop_checkouts_user_id", "whop_checkouts", ["user_id"])
    op.create_index("ix_whop_checkouts_email", "whop_checkouts", ["email"])
    op.create_index("ix_whop_checkouts_email_created", "whop_checkouts", ["email", "created_at"])
    op.create_index("ix_whop_checkouts_plan_key", "whop_checkouts", ["plan_key"])
    op.create_index("ix_whop_checkouts_status", "whop_checkouts", ["status"])
    op.create_index("ix_whop_checkouts_whop_plan_id", "whop_checkouts", ["whop_plan_id"])
    op.create_index("ix_whop_checkouts_whop_payment_id", "whop_checkouts", ["whop_payment_id"])
    op.create_index("ix_whop_checkouts_whop_membership_id", "whop_checkouts", ["whop_membership_id"])

    op.create_table(
        "whop_webhook_events",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("processed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("webhook_id", sa.String(length=160), nullable=False),
        sa.Column("event_type", sa.String(length=120), nullable=False),
        sa.Column("api_version", sa.String(length=40), nullable=True),
        sa.Column("checkout_id", sa.String(length=120), nullable=True),
        sa.Column("payment_id", sa.String(length=120), nullable=True),
        sa.Column("membership_id", sa.String(length=120), nullable=True),
        sa.Column("status", sa.String(length=60), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("webhook_id", name="uq_whop_webhook_events_webhook_id"),
    )
    op.create_index("ix_whop_webhook_events_id", "whop_webhook_events", ["id"])
    op.create_index("ix_whop_webhook_events_created_at", "whop_webhook_events", ["created_at"])
    op.create_index("ix_whop_webhook_events_webhook_id", "whop_webhook_events", ["webhook_id"])
    op.create_index("ix_whop_webhook_events_event_type", "whop_webhook_events", ["event_type"])
    op.create_index("ix_whop_webhook_events_checkout_id", "whop_webhook_events", ["checkout_id"])
    op.create_index("ix_whop_webhook_events_payment_id", "whop_webhook_events", ["payment_id"])
    op.create_index("ix_whop_webhook_events_membership_id", "whop_webhook_events", ["membership_id"])
    op.create_index("ix_whop_webhook_events_status", "whop_webhook_events", ["status"])


def downgrade() -> None:
    op.drop_index("ix_whop_webhook_events_status", table_name="whop_webhook_events")
    op.drop_index("ix_whop_webhook_events_membership_id", table_name="whop_webhook_events")
    op.drop_index("ix_whop_webhook_events_payment_id", table_name="whop_webhook_events")
    op.drop_index("ix_whop_webhook_events_checkout_id", table_name="whop_webhook_events")
    op.drop_index("ix_whop_webhook_events_event_type", table_name="whop_webhook_events")
    op.drop_index("ix_whop_webhook_events_webhook_id", table_name="whop_webhook_events")
    op.drop_index("ix_whop_webhook_events_created_at", table_name="whop_webhook_events")
    op.drop_index("ix_whop_webhook_events_id", table_name="whop_webhook_events")
    op.drop_table("whop_webhook_events")
    op.drop_index("ix_whop_checkouts_whop_membership_id", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_whop_payment_id", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_whop_plan_id", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_status", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_plan_key", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_email_created", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_email", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_user_id", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_internal_order_id", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_checkout_id", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_updated_at", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_created_at", table_name="whop_checkouts")
    op.drop_index("ix_whop_checkouts_id", table_name="whop_checkouts")
    op.drop_table("whop_checkouts")
