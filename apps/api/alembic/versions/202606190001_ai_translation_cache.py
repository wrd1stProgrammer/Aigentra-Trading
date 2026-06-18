from alembic import op
import sqlalchemy as sa


revision = "202606190001"
down_revision = "202606180002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_translation_cache",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_type", sa.String(length=80), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("source_hash", sa.String(length=80), nullable=False),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("model", sa.String(length=140), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=True),
        sa.Column("trader_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_type", "source_id", "source_hash", "locale", name="uq_ai_translation_cache_source_hash_locale"),
    )
    op.create_index(op.f("ix_ai_translation_cache_id"), "ai_translation_cache", ["id"], unique=False)
    op.create_index(op.f("ix_ai_translation_cache_created_at"), "ai_translation_cache", ["created_at"], unique=False)
    op.create_index(op.f("ix_ai_translation_cache_symbol"), "ai_translation_cache", ["symbol"], unique=False)
    op.create_index(op.f("ix_ai_translation_cache_trader_id"), "ai_translation_cache", ["trader_id"], unique=False)
    op.create_index(op.f("ix_ai_translation_cache_status"), "ai_translation_cache", ["status"], unique=False)
    op.create_index(op.f("ix_ai_translation_cache_updated_at"), "ai_translation_cache", ["updated_at"], unique=False)
    op.create_index(op.f("ix_ai_translation_cache_source_type"), "ai_translation_cache", ["source_type"], unique=False)
    op.create_index(op.f("ix_ai_translation_cache_source_id"), "ai_translation_cache", ["source_id"], unique=False)
    op.create_index(op.f("ix_ai_translation_cache_source_hash"), "ai_translation_cache", ["source_hash"], unique=False)
    op.create_index(op.f("ix_ai_translation_cache_locale"), "ai_translation_cache", ["locale"], unique=False)
    op.create_index(op.f("ix_ai_translation_cache_provider"), "ai_translation_cache", ["provider"], unique=False)
    op.create_index(
        "ix_ai_translation_cache_source_lookup",
        "ai_translation_cache",
        ["source_type", "source_id", "source_hash", "locale"],
        unique=False,
    )
    op.create_index(
        "ix_ai_translation_cache_hash_reuse",
        "ai_translation_cache",
        ["source_type", "source_hash", "locale", "status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ai_translation_cache_hash_reuse", table_name="ai_translation_cache")
    op.drop_index("ix_ai_translation_cache_source_lookup", table_name="ai_translation_cache")
    op.drop_index(op.f("ix_ai_translation_cache_provider"), table_name="ai_translation_cache")
    op.drop_index(op.f("ix_ai_translation_cache_locale"), table_name="ai_translation_cache")
    op.drop_index(op.f("ix_ai_translation_cache_source_hash"), table_name="ai_translation_cache")
    op.drop_index(op.f("ix_ai_translation_cache_source_id"), table_name="ai_translation_cache")
    op.drop_index(op.f("ix_ai_translation_cache_source_type"), table_name="ai_translation_cache")
    op.drop_index(op.f("ix_ai_translation_cache_updated_at"), table_name="ai_translation_cache")
    op.drop_index(op.f("ix_ai_translation_cache_status"), table_name="ai_translation_cache")
    op.drop_index(op.f("ix_ai_translation_cache_trader_id"), table_name="ai_translation_cache")
    op.drop_index(op.f("ix_ai_translation_cache_symbol"), table_name="ai_translation_cache")
    op.drop_index(op.f("ix_ai_translation_cache_created_at"), table_name="ai_translation_cache")
    op.drop_index(op.f("ix_ai_translation_cache_id"), table_name="ai_translation_cache")
    op.drop_table("ai_translation_cache")
