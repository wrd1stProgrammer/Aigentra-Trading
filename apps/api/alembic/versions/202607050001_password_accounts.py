"""add password accounts

Revision ID: 202607050001
Revises: 202607010001
Create Date: 2026-07-05 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "202607050001"
down_revision: Union[str, None] = "202607010001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "password_accounts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("user_id", sa.String(length=180), nullable=False),
        sa.Column("email", sa.String(length=240), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("password_hash", sa.String(length=260), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("email", name="uq_password_accounts_email"),
        sa.UniqueConstraint("user_id", name="uq_password_accounts_user_id"),
    )
    op.create_index(op.f("ix_password_accounts_id"), "password_accounts", ["id"], unique=False)
    op.create_index(op.f("ix_password_accounts_created_at"), "password_accounts", ["created_at"], unique=False)
    op.create_index(op.f("ix_password_accounts_updated_at"), "password_accounts", ["updated_at"], unique=False)
    op.create_index(op.f("ix_password_accounts_user_id"), "password_accounts", ["user_id"], unique=False)
    op.create_index(op.f("ix_password_accounts_email"), "password_accounts", ["email"], unique=False)
    op.create_index(op.f("ix_password_accounts_last_login_at"), "password_accounts", ["last_login_at"], unique=False)
    op.create_index(op.f("ix_password_accounts_disabled_at"), "password_accounts", ["disabled_at"], unique=False)
    op.create_index("ix_password_accounts_email_active", "password_accounts", ["email", "disabled_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_password_accounts_email_active", table_name="password_accounts")
    op.drop_index(op.f("ix_password_accounts_disabled_at"), table_name="password_accounts")
    op.drop_index(op.f("ix_password_accounts_last_login_at"), table_name="password_accounts")
    op.drop_index(op.f("ix_password_accounts_email"), table_name="password_accounts")
    op.drop_index(op.f("ix_password_accounts_user_id"), table_name="password_accounts")
    op.drop_index(op.f("ix_password_accounts_updated_at"), table_name="password_accounts")
    op.drop_index(op.f("ix_password_accounts_created_at"), table_name="password_accounts")
    op.drop_index(op.f("ix_password_accounts_id"), table_name="password_accounts")
    op.drop_table("password_accounts")
