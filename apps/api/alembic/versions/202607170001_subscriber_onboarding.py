from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202607170001"
down_revision: Union[str, None] = "202607160001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "subscriber_onboarding",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.String(length=180), nullable=False),
        sa.Column("email", sa.String(length=240), nullable=False),
        sa.Column("acquisition_source", sa.String(length=40), nullable=False),
        sa.Column("weekly_position_frequency", sa.String(length=40), nullable=False),
        sa.Column("primary_goal", sa.String(length=40), nullable=False),
        sa.Column("experience_level", sa.String(length=40), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_subscriber_onboarding_email"),
    )
    op.create_index("ix_subscriber_onboarding_id", "subscriber_onboarding", ["id"])
    op.create_index("ix_subscriber_onboarding_created_at", "subscriber_onboarding", ["created_at"])
    op.create_index("ix_subscriber_onboarding_updated_at", "subscriber_onboarding", ["updated_at"])
    op.create_index("ix_subscriber_onboarding_completed_at", "subscriber_onboarding", ["completed_at"])
    op.create_index("ix_subscriber_onboarding_user_id", "subscriber_onboarding", ["user_id"])
    op.create_index("ix_subscriber_onboarding_email", "subscriber_onboarding", ["email"])
    op.create_index("ix_subscriber_onboarding_acquisition_source", "subscriber_onboarding", ["acquisition_source"])
    op.create_index("ix_subscriber_onboarding_weekly_position_frequency", "subscriber_onboarding", ["weekly_position_frequency"])
    op.create_index("ix_subscriber_onboarding_primary_goal", "subscriber_onboarding", ["primary_goal"])
    op.create_index("ix_subscriber_onboarding_experience_level", "subscriber_onboarding", ["experience_level"])
    op.create_index(
        "ix_subscriber_onboarding_user_completed",
        "subscriber_onboarding",
        ["user_id", "completed_at"],
    )


def downgrade() -> None:
    op.drop_table("subscriber_onboarding")
