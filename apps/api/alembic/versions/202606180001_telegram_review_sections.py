from alembic import op
import sqlalchemy as sa


revision = "202606180001"
down_revision = "202606170002"
branch_labels = None
depends_on = None


DEFAULT_REVIEW_SECTIONS_JSON = (
    '["status","position","summary","action","key_reasons","risks","watch_conditions","manager_note","rationale"]'
)
DEFAULT_EVENT_TYPES_JSON = (
    '["pending_entry","position_entry","take_profit","stop_loss","ai_review_low","ai_review_medium","ai_review_high","risk"]'
)


def upgrade() -> None:
    op.alter_column("subscriber_preferences", "telegram_event_types_json", server_default=DEFAULT_EVENT_TYPES_JSON)
    op.add_column(
        "subscriber_preferences",
        sa.Column("telegram_review_sections_json", sa.Text(), nullable=False, server_default=DEFAULT_REVIEW_SECTIONS_JSON),
    )


def downgrade() -> None:
    op.drop_column("subscriber_preferences", "telegram_review_sections_json")
    op.alter_column("subscriber_preferences", "telegram_event_types_json", server_default="[]")
