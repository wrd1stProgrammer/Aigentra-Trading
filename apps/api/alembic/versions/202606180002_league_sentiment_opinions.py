from alembic import op
import sqlalchemy as sa


revision = "202606180002"
down_revision = "202606180001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "league_sentiment_opinions",
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("locale", sa.String(length=8), nullable=False),
        sa.Column("interval_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("interval_end", sa.DateTime(timezone=True), nullable=False),
        sa.Column("provider", sa.String(length=40), nullable=True),
        sa.Column("model", sa.String(length=140), nullable=True),
        sa.Column("bias", sa.String(length=40), nullable=True),
        sa.Column("confidence", sa.Integer(), nullable=True),
        sa.Column("risk_level", sa.String(length=40), nullable=True),
        sa.Column("fallback", sa.Boolean(), nullable=False),
        sa.Column("input_json", sa.Text(), nullable=True),
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("symbol", sa.String(length=32), nullable=True),
        sa.Column("trader_id", sa.String(length=128), nullable=True),
        sa.Column("status", sa.String(length=80), nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("payload_json", sa.Text(), nullable=True),
        sa.Column("raw_json", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("symbol", "locale", "interval_start", name="uq_league_sentiment_opinions_symbol_locale_hour"),
    )
    op.create_index(op.f("ix_league_sentiment_opinions_id"), "league_sentiment_opinions", ["id"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_created_at"), "league_sentiment_opinions", ["created_at"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_symbol"), "league_sentiment_opinions", ["symbol"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_trader_id"), "league_sentiment_opinions", ["trader_id"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_status"), "league_sentiment_opinions", ["status"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_updated_at"), "league_sentiment_opinions", ["updated_at"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_locale"), "league_sentiment_opinions", ["locale"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_interval_start"), "league_sentiment_opinions", ["interval_start"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_interval_end"), "league_sentiment_opinions", ["interval_end"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_provider"), "league_sentiment_opinions", ["provider"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_bias"), "league_sentiment_opinions", ["bias"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_risk_level"), "league_sentiment_opinions", ["risk_level"], unique=False)
    op.create_index(op.f("ix_league_sentiment_opinions_fallback"), "league_sentiment_opinions", ["fallback"], unique=False)


def downgrade() -> None:
    op.drop_table("league_sentiment_opinions")
