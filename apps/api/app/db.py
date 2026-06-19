from contextlib import contextmanager
from datetime import datetime, timezone
from decimal import Decimal
import os
from pathlib import Path
from typing import Generator, Optional

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Index, Integer, Numeric, String, Text, TypeDecorator, UniqueConstraint, create_engine, text
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.config import get_settings


API_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DATABASE_URL = f"sqlite:///{API_ROOT / 'data' / 'dev.db'}"
REMOTE_DATABASE_PREFIXES = ("postgres://", "postgresql://", "postgresql+psycopg://")
LOCAL_APP_ENVS = {"local", "dev", "development", "test"}
DEFAULT_TELEGRAM_EVENT_TYPES_JSON = (
    '["pending_entry","position_entry","take_profit","stop_loss","ai_review_low","ai_review_medium","ai_review_high","league_sentiment","risk"]'
)
DEFAULT_TELEGRAM_REVIEW_SECTIONS_JSON = (
    '["status","position","summary","action","key_reasons","risks","watch_conditions","manager_note","rationale"]'
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def normalized_database_url() -> str:
    settings = get_settings()
    configured = settings.database_url
    if configured == "sqlite:///./data/dev.db" and settings.neon_database_url:
        configured = settings.neon_database_url
    if (
        configured.startswith(REMOTE_DATABASE_PREFIXES)
        and settings.app_env.lower() in LOCAL_APP_ENVS
        and not settings.allow_remote_database_in_local
    ):
        return DEFAULT_DATABASE_URL
    if configured == "sqlite:///./data/dev.db":
        return DEFAULT_DATABASE_URL
    if configured.startswith("postgres://"):
        return configured.replace("postgres://", "postgresql+psycopg://", 1)
    if configured.startswith("postgresql://"):
        return configured.replace("postgresql://", "postgresql+psycopg://", 1)
    return configured


def mask_database_url(url: str) -> str:
    if "@" not in url:
        return url
    scheme, rest = url.split("://", 1)
    return f"{scheme}://***@{rest.split('@', 1)[1]}"


def make_engine(database_url: Optional[str] = None):
    url = database_url or normalized_database_url()
    settings = get_settings()
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+psycopg://", 1)
    elif url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)
    if url.startswith("sqlite:///"):
        raw_path = url.replace("sqlite:///", "", 1)
        if raw_path and raw_path != ":memory:":
            Path(raw_path).parent.mkdir(parents=True, exist_ok=True)
    return create_engine(url, **make_engine_options(url, settings), future=True)


def make_engine_options(url: str, settings) -> dict:
    if url.startswith("sqlite:///"):
        raw_path = url.replace("sqlite:///", "", 1)
        if raw_path and raw_path != ":memory:":
            Path(raw_path).parent.mkdir(parents=True, exist_ok=True)
        if raw_path == ":memory:":
            return {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool}
        return {"connect_args": {"check_same_thread": False, "timeout": 30}}
    return {
        "pool_pre_ping": True,
        "pool_size": max(1, settings.database_pool_size),
        "max_overflow": max(0, settings.database_max_overflow),
        "pool_timeout": max(1, settings.database_pool_timeout_seconds),
        "pool_recycle": max(60, settings.database_pool_recycle_seconds),
        "pool_use_lifo": True,
        "connect_args": {
            "connect_timeout": max(1, settings.database_connect_timeout_seconds),
            "application_name": "ai_trader_league_api",
        },
    }


engine = make_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False, future=True)


class Base(DeclarativeBase):
    pass


class UTCDateTime(TypeDecorator):
    impl = DateTime
    cache_ok = True

    def __init__(self) -> None:
        super().__init__(timezone=True)

    def process_bind_param(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value
        return value.astimezone(timezone.utc).replace(tzinfo=None)

    def process_result_value(self, value, dialect):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=timezone.utc)
        return value.astimezone(timezone.utc)


class CommonMixin:
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    symbol: Mapped[Optional[str]] = mapped_column(String(32), nullable=True, index=True)
    trader_id: Mapped[Optional[str]] = mapped_column(String(128), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(80), default="ok", nullable=False, index=True)
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    payload_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    raw_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class MarketSnapshotRecord(CommonMixin, Base):
    __tablename__ = "market_snapshots"
    price: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class TraderRunLogRecord(CommonMixin, Base):
    __tablename__ = "trader_run_logs"
    provider: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    market_snapshot_id: Mapped[Optional[int]] = mapped_column(ForeignKey("market_snapshots.id"), nullable=True)
    candidate_trade_id: Mapped[Optional[int]] = mapped_column(ForeignKey("candidate_trades.id"), nullable=True)
    ai_review_id: Mapped[Optional[int]] = mapped_column(ForeignKey("ai_reviews.id"), nullable=True)
    trade_plan_id: Mapped[Optional[int]] = mapped_column(ForeignKey("trade_plans.id"), nullable=True)


class CandidateTradeRecord(CommonMixin, Base):
    __tablename__ = "candidate_trades"
    run_id: Mapped[Optional[int]] = mapped_column(ForeignKey("trader_run_logs.id"), nullable=True, index=True)
    setup_type: Mapped[Optional[str]] = mapped_column(String(140), nullable=True, index=True)
    side: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    setup_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class AIReviewRecord(CommonMixin, Base):
    __tablename__ = "ai_reviews"
    run_id: Mapped[Optional[int]] = mapped_column(ForeignKey("trader_run_logs.id"), nullable=True, index=True)
    provider: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    model: Mapped[Optional[str]] = mapped_column(String(140), nullable=True)
    decision: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    confidence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    fallback: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class TradePlanRecord(CommonMixin, Base):
    __tablename__ = "trade_plans"
    run_id: Mapped[Optional[int]] = mapped_column(ForeignKey("trader_run_logs.id"), nullable=True, index=True)
    side: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    risk_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)


class APICallLogRecord(CommonMixin, Base):
    __tablename__ = "api_call_logs"
    endpoint: Mapped[Optional[str]] = mapped_column(String(180), nullable=True, index=True)
    method: Mapped[Optional[str]] = mapped_column(String(12), nullable=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)


class ProviderCallLogRecord(CommonMixin, Base):
    __tablename__ = "provider_call_logs"
    provider: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    model: Mapped[Optional[str]] = mapped_column(String(140), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    latency_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    decision: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)


class PositionManagementReviewRecord(CommonMixin, Base):
    __tablename__ = "position_management_reviews"

    order_id: Mapped[Optional[int]] = mapped_column(ForeignKey("paper_orders.id"), nullable=True, index=True)
    position_id: Mapped[Optional[int]] = mapped_column(ForeignKey("paper_positions.id"), nullable=True, index=True)
    event_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    phase: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    provider: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    model: Mapped[Optional[str]] = mapped_column(String(140), nullable=True)
    decision: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    confidence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    action_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    fallback: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class LeagueSentimentOpinionRecord(CommonMixin, Base):
    __tablename__ = "league_sentiment_opinions"
    __table_args__ = (
        UniqueConstraint("symbol", "locale", "interval_start", name="uq_league_sentiment_opinions_symbol_locale_hour"),
    )

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)
    locale: Mapped[str] = mapped_column(String(8), default="ko", nullable=False, index=True)
    interval_start: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    interval_end: Mapped[datetime] = mapped_column(UTCDateTime(), nullable=False, index=True)
    provider: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    model: Mapped[Optional[str]] = mapped_column(String(140), nullable=True)
    bias: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    confidence: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    risk_level: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    fallback: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    input_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class AITranslationCacheRecord(CommonMixin, Base):
    __tablename__ = "ai_translation_cache"
    __table_args__ = (
        UniqueConstraint("source_type", "source_id", "source_hash", "locale", name="uq_ai_translation_cache_source_hash_locale"),
        Index("ix_ai_translation_cache_source_lookup", "source_type", "source_id", "source_hash", "locale"),
        Index("ix_ai_translation_cache_hash_reuse", "source_type", "source_hash", "locale", "status"),
    )

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    source_id: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    source_hash: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    locale: Mapped[str] = mapped_column(String(8), nullable=False, index=True)
    provider: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    model: Mapped[Optional[str]] = mapped_column(String(140), nullable=True)


class TraderStatusFeedRecord(CommonMixin, Base):
    __tablename__ = "trader_status_feeds"
    __table_args__ = (
        UniqueConstraint("source_type", "source_id", "state_key", "refresh_reason", name="uq_trader_status_feeds_source_state_reason"),
        Index("ix_trader_status_feeds_trader_symbol_created", "trader_id", "symbol", "created_at"),
        Index("ix_trader_status_feeds_state_created", "state_key", "created_at"),
    )

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)
    state_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    source_type: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    source_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    refresh_reason: Mapped[str] = mapped_column(String(40), default="event", nullable=False, index=True)
    state_started_at: Mapped[Optional[datetime]] = mapped_column(UTCDateTime(), nullable=True, index=True)
    provider: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    model: Mapped[Optional[str]] = mapped_column(String(140), nullable=True)
    fallback: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)


class TraderAgentStateRecord(CommonMixin, Base):
    __tablename__ = "trader_agent_states"
    __table_args__ = (UniqueConstraint("trader_id", "symbol", name="uq_trader_agent_states_trader_symbol"),)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)
    phase: Mapped[str] = mapped_column(String(40), default="IDLE", nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(40), default="WATCHING", nullable=False, index=True)
    next_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_review_id: Mapped[Optional[int]] = mapped_column(ForeignKey("position_management_reviews.id"), nullable=True, index=True)
    last_event_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    last_decision: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    last_action_type: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    provider: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    model: Mapped[Optional[str]] = mapped_column(String(140), nullable=True)


class TraderLeaderboardSnapshotRecord(CommonMixin, Base):
    __tablename__ = "trader_leaderboard_snapshots"
    __table_args__ = (UniqueConstraint("trader_id", "symbol", name="uq_trader_leaderboard_snapshots_trader_symbol"),)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)
    rank: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    mode: Mapped[str] = mapped_column(String(40), default="paper", nullable=False, index=True)
    trader_name: Mapped[Optional[str]] = mapped_column(String(160), nullable=True)
    has_live_paper_data: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    rank_score: Mapped[float] = mapped_column(Float, default=0.0, nullable=False, index=True)
    equity: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    cash_balance: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    realized_pnl: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    unrealized_pnl: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_fees: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_pnl: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    return_7d: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    return_30d: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    win_rate: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    closed_positions: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    wins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    losses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_drawdown: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    risk_percent: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    leverage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    open_orders: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    open_positions: Mapped[int] = mapped_column(Integer, default=0, nullable=False, index=True)
    biggest_win: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    biggest_loss: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    average_leverage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    sharpe: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    long_trades: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    short_trades: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    open_notional: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    open_margin: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    open_order_notional: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    pending_entry_weight: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    latest_run_status: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    latest_plan_status: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)
    current_plan_ko: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    current_plan_en: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    agent_mode: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    agent_phase: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    next_review_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    last_decision: Mapped[Optional[str]] = mapped_column(String(60), nullable=True, index=True)
    last_action: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, index=True)


class TraderStateRecord(CommonMixin, Base):
    __tablename__ = "trader_states"
    __table_args__ = (UniqueConstraint("trader_id", name="uq_trader_states_trader_id"),)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)
    cash_balance: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    equity: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    margin_used: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    total_fees: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)


class RiskSettingsRecord(CommonMixin, Base):
    __tablename__ = "risk_settings"
    __table_args__ = (UniqueConstraint("trader_id", "symbol", name="uq_risk_settings_trader_symbol"),)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)
    initial_equity: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("10000"), nullable=False)
    max_leverage: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("10"), nullable=False)
    max_notional: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10), nullable=True)
    maker_fee_rate: Mapped[Decimal] = mapped_column(Numeric(12, 8), default=Decimal("0.0002"), nullable=False)
    taker_fee_rate: Mapped[Decimal] = mapped_column(Numeric(12, 8), default=Decimal("0.0005"), nullable=False)


class PaperOrderRecord(CommonMixin, Base):
    __tablename__ = "paper_orders"

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    order_type: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    fee_type: Mapped[str] = mapped_column(String(12), default="taker", nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    leverage: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("1"), nullable=False)
    limit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10), nullable=True)
    take_profit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10), nullable=True)
    stop_loss_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10), nullable=True)
    filled_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10), nullable=True)
    filled_quantity: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    notional: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    margin: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    fee: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    position_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    filled_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class PaperPositionRecord(CommonMixin, Base):
    __tablename__ = "paper_positions"

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)
    order_id: Mapped[Optional[int]] = mapped_column(ForeignKey("paper_orders.id"), nullable=True, index=True)
    side: Mapped[str] = mapped_column(String(12), nullable=False, index=True)
    quantity: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    entry_price: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    leverage: Mapped[Decimal] = mapped_column(Numeric(12, 4), default=Decimal("1"), nullable=False)
    notional: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    margin: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    entry_fee: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    exit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10), nullable=True)
    exit_fee: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    take_profit_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10), nullable=True)
    stop_loss_price: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10), nullable=True)
    close_reason: Mapped[Optional[str]] = mapped_column(String(40), nullable=True, index=True)
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class TradeEventRecord(CommonMixin, Base):
    __tablename__ = "trade_events"

    event_type: Mapped[str] = mapped_column(String(60), nullable=False, index=True)
    order_id: Mapped[Optional[int]] = mapped_column(ForeignKey("paper_orders.id"), nullable=True, index=True)
    position_id: Mapped[Optional[int]] = mapped_column(ForeignKey("paper_positions.id"), nullable=True, index=True)
    price: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10), nullable=True)
    quantity: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10), nullable=True)
    fee: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(24, 10), default=Decimal("0"), nullable=False)
    equity: Mapped[Optional[Decimal]] = mapped_column(Numeric(24, 10), nullable=True)


class EquitySnapshotRecord(CommonMixin, Base):
    __tablename__ = "equity_snapshots"

    cash_balance: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    equity: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    margin_used: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    realized_pnl: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    unrealized_pnl: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    total_fees: Mapped[Decimal] = mapped_column(Numeric(24, 10), nullable=False)
    candle_time: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)


class SubscriberPreferenceRecord(CommonMixin, Base):
    __tablename__ = "subscriber_preferences"
    __table_args__ = (UniqueConstraint("email", name="uq_subscriber_preferences_email"),)

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)
    user_id: Mapped[str] = mapped_column(String(180), nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(240), nullable=False, index=True)
    subscription_status: Mapped[str] = mapped_column(String(40), default="active", nullable=False, index=True)
    favorite_trader_ids_json: Mapped[str] = mapped_column(Text, default="[]", nullable=False)
    telegram_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    telegram_chat_id: Mapped[Optional[str]] = mapped_column(String(120), nullable=True)
    telegram_link_token_hash: Mapped[Optional[str]] = mapped_column(String(80), nullable=True, unique=True, index=True)
    telegram_link_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    telegram_event_types_json: Mapped[str] = mapped_column(Text, default=DEFAULT_TELEGRAM_EVENT_TYPES_JSON, nullable=False)
    telegram_review_sections_json: Mapped[str] = mapped_column(Text, default=DEFAULT_TELEGRAM_REVIEW_SECTIONS_JSON, nullable=False)
    telegram_min_return_pct: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    locale: Mapped[str] = mapped_column(String(8), default="ko", nullable=False)


class TelegramAlertDeliveryRecord(CommonMixin, Base):
    __tablename__ = "telegram_alert_deliveries"
    __table_args__ = (
        UniqueConstraint("subscriber_preference_id", "trade_event_id", name="uq_telegram_alert_delivery_subscriber_event"),
        UniqueConstraint("subscriber_preference_id", "position_management_review_id", name="uq_telegram_alert_delivery_subscriber_review"),
        UniqueConstraint("subscriber_preference_id", "league_sentiment_opinion_id", name="uq_telegram_alert_delivery_subscriber_sentiment"),
        UniqueConstraint("subscriber_preference_id", "trader_status_feed_id", name="uq_telegram_alert_delivery_subscriber_status_feed"),
    )

    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utc_now, onupdate=utc_now, nullable=False, index=True)
    subscriber_preference_id: Mapped[int] = mapped_column(ForeignKey("subscriber_preferences.id"), nullable=False, index=True)
    trade_event_id: Mapped[Optional[int]] = mapped_column(ForeignKey("trade_events.id"), nullable=True, index=True)
    position_management_review_id: Mapped[Optional[int]] = mapped_column(ForeignKey("position_management_reviews.id"), nullable=True, index=True)
    league_sentiment_opinion_id: Mapped[Optional[int]] = mapped_column(ForeignKey("league_sentiment_opinions.id"), nullable=True, index=True)
    trader_status_feed_id: Mapped[Optional[int]] = mapped_column(ForeignKey("trader_status_feeds.id"), nullable=True, index=True)
    telegram_event_type: Mapped[str] = mapped_column(String(40), nullable=False, index=True)
    chat_id: Mapped[str] = mapped_column(String(120), nullable=False)
    response_json: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


def init_db(force: bool = False) -> None:
    if engine.dialect.name != "sqlite" and not force:
        return
    Base.metadata.create_all(bind=engine)


def reset_db_engine(database_url: Optional[str] = None) -> None:
    global engine, SessionLocal
    engine.dispose()
    engine = make_engine(database_url)
    SessionLocal.configure(bind=engine)


def db_status() -> dict:
    init_db()
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    url = normalized_database_url()
    db_path = None
    exists = None
    if url.startswith("sqlite:///"):
        db_path = os.path.abspath(url.replace("sqlite:///", "", 1))
        exists = os.path.exists(db_path)
    settings = get_settings()
    configured_remote = (settings.database_url or settings.neon_database_url).startswith(REMOTE_DATABASE_PREFIXES)
    remote_blocked = (
        configured_remote
        and settings.app_env.lower() in LOCAL_APP_ENVS
        and not settings.allow_remote_database_in_local
        and url.startswith("sqlite:///")
    )
    return {
        "status": "ok",
        "databaseUrl": mask_database_url(url),
        "dialect": engine.dialect.name,
        "path": db_path,
        "exists": exists,
        "appEnv": settings.app_env,
        "remoteDatabaseBlockedInLocal": remote_blocked,
        "allowRemoteDatabaseInLocal": settings.allow_remote_database_in_local,
        "tables": sorted(Base.metadata.tables.keys()),
    }


@contextmanager
def session_scope() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        try:
            db.rollback()
        except Exception:
            db.invalidate()
        raise
    finally:
        db.close()


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    except Exception:
        try:
            db.rollback()
        except Exception:
            db.invalidate()
        raise
    finally:
        db.close()
