from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202607160001"
down_revision: Union[str, None] = "202607150001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "whop_checkouts",
        sa.Column("cancel_at_period_end", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column("whop_checkouts", sa.Column("current_period_end", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("whop_checkouts", "current_period_end")
    op.drop_column("whop_checkouts", "cancel_at_period_end")
