from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202607150001"
down_revision: Union[str, None] = "202607080001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "site_daily_visitors",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("visit_date", sa.Date(), nullable=False),
        sa.Column("visitor_key", sa.String(length=64), nullable=False),
        sa.Column("user_key", sa.String(length=64), nullable=True),
        sa.Column("visit_count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("visit_date", "visitor_key", name="uq_site_daily_visitors_date_visitor"),
    )
    op.create_index(op.f("ix_site_daily_visitors_id"), "site_daily_visitors", ["id"], unique=False)
    op.create_index(op.f("ix_site_daily_visitors_created_at"), "site_daily_visitors", ["created_at"], unique=False)
    op.create_index(op.f("ix_site_daily_visitors_visit_date"), "site_daily_visitors", ["visit_date"], unique=False)
    op.create_index("ix_site_daily_visitors_date_user", "site_daily_visitors", ["visit_date", "user_key"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_site_daily_visitors_date_user", table_name="site_daily_visitors")
    op.drop_index(op.f("ix_site_daily_visitors_visit_date"), table_name="site_daily_visitors")
    op.drop_index(op.f("ix_site_daily_visitors_created_at"), table_name="site_daily_visitors")
    op.drop_index(op.f("ix_site_daily_visitors_id"), table_name="site_daily_visitors")
    op.drop_table("site_daily_visitors")
