from functools import lru_cache
import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from pydantic import BaseModel, Field

from app.locales import normalize_locale, normalize_translation_locales


API_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(API_ROOT / ".env")
VALID_AI_PROVIDERS = {"mock", "openai", "gemini", "anthropic", "grok"}
AI_PROVIDER_ALIASES = {"anthriopic": "anthropic"}


def env_bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).lower() in {"1", "true", "yes", "on"}


def env_float(name: str, default: str) -> float:
    return float(os.getenv(name) or default)


def env_int(name: str, default: str) -> int:
    return int(os.getenv(name) or default)


def env_list(name: str, default: str) -> List[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def env_symbol_list(name: str, default: str) -> List[str]:
    return [item.upper() for item in env_list(name, default)]


def normalize_ai_provider_name(provider: str | None, default: str = "mock") -> str:
    requested = (provider or default).strip().lower()
    return AI_PROVIDER_ALIASES.get(requested, requested)


def default_database_url() -> str:
    return os.getenv("DATABASE_URL", "") or os.getenv("NEON_DATABASE_URL", "") or "sqlite:///./data/dev.db"


class Settings(BaseModel):
    env_file_loaded: bool = Field(default_factory=lambda: (API_ROOT / ".env").exists())
    app_env: str = Field(default_factory=lambda: os.getenv("APP_ENV", "local"))
    build_sha: str = Field(default_factory=lambda: os.getenv("AIGENTRA_BUILD_SHA", "local"))
    cors_origins: List[str] = Field(default_factory=lambda: env_list("CORS_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000"))
    binance_futures_base_url: str = Field(default_factory=lambda: os.getenv("BINANCE_FUTURES_BASE_URL", "https://fapi.binance.com"))
    neon_database_url: str = Field(default_factory=lambda: os.getenv("NEON_DATABASE_URL", ""))
    database_url: str = Field(default_factory=default_database_url)
    allow_remote_database_in_local: bool = Field(default_factory=lambda: env_bool("ALLOW_REMOTE_DATABASE_IN_LOCAL", "false"))
    database_pool_size: int = Field(default_factory=lambda: env_int("DATABASE_POOL_SIZE", "8"))
    database_max_overflow: int = Field(default_factory=lambda: env_int("DATABASE_MAX_OVERFLOW", "8"))
    database_pool_timeout_seconds: int = Field(default_factory=lambda: env_int("DATABASE_POOL_TIMEOUT_SECONDS", "20"))
    database_pool_recycle_seconds: int = Field(default_factory=lambda: env_int("DATABASE_POOL_RECYCLE_SECONDS", "300"))
    database_connect_timeout_seconds: int = Field(default_factory=lambda: env_int("DATABASE_CONNECT_TIMEOUT_SECONDS", "10"))
    redis_url: str = Field(default_factory=lambda: os.getenv("REDIS_URL", ""))
    redis_market_cache_enabled: bool = Field(default_factory=lambda: env_bool("REDIS_MARKET_CACHE_ENABLED", "true"))
    redis_key_prefix: str = Field(default_factory=lambda: os.getenv("REDIS_KEY_PREFIX", "aigentra"))
    redis_socket_timeout_seconds: float = Field(default_factory=lambda: env_float("REDIS_SOCKET_TIMEOUT_SECONDS", "1.5"))
    market_data_provider: str = Field(default_factory=lambda: os.getenv("MARKET_DATA_PROVIDER", "okx").lower())
    market_data_fallback_provider: str = Field(default_factory=lambda: os.getenv("MARKET_DATA_FALLBACK_PROVIDER", "bitget").lower())
    market_data_user_agent: str = Field(default_factory=lambda: os.getenv("MARKET_DATA_USER_AGENT", "Aigentra-Trading/1.0"))
    market_data_max_limit: int = Field(default_factory=lambda: env_int("MARKET_DATA_MAX_LIMIT", "500"))
    market_data_warm_enabled: bool = Field(default_factory=lambda: env_bool("MARKET_DATA_WARM_ENABLED", "true"))
    market_data_warm_symbols: List[str] = Field(default_factory=lambda: env_symbol_list("MARKET_DATA_WARM_SYMBOLS", "BTCUSDT"))
    market_data_warm_intervals: List[str] = Field(default_factory=lambda: env_list("MARKET_DATA_WARM_INTERVALS", "1m,5m,15m,30m,1h,4h,1d,1w"))
    market_data_warm_limit: int = Field(default_factory=lambda: env_int("MARKET_DATA_WARM_LIMIT", "500"))
    subscriber_api_token: str = Field(default_factory=lambda: os.getenv("SUBSCRIBER_API_TOKEN", ""))
    whop_api_key: str = Field(default_factory=lambda: os.getenv("WHOP_API_KEY", ""))
    whop_company_id: str = Field(default_factory=lambda: os.getenv("WHOP_COMPANY_ID", ""))
    whop_webhook_secret: str = Field(default_factory=lambda: os.getenv("WHOP_WEBHOOK_SECRET", ""))
    whop_api_base_url: str = Field(default_factory=lambda: os.getenv("WHOP_API_BASE_URL", "https://api.whop.com/api/v1"))
    whop_api_version_date: str = Field(default_factory=lambda: os.getenv("WHOP_API_VERSION_DATE", ""))
    whop_plan_key: str = Field(default_factory=lambda: os.getenv("WHOP_PLAN_KEY", "aigentra_pro_monthly"))
    whop_plan_id: str = Field(default_factory=lambda: os.getenv("WHOP_PLAN_ID", ""))
    whop_plan_title: str = Field(default_factory=lambda: os.getenv("WHOP_PLAN_TITLE", "Aigentra Pro"))
    whop_plan_type: str = Field(default_factory=lambda: os.getenv("WHOP_PLAN_TYPE", "renewal").lower())
    whop_plan_currency: str = Field(default_factory=lambda: os.getenv("WHOP_PLAN_CURRENCY", "usd").lower())
    whop_plan_initial_price: float = Field(default_factory=lambda: env_float("WHOP_PLAN_INITIAL_PRICE", "0"))
    whop_plan_renewal_price: float = Field(default_factory=lambda: env_float("WHOP_PLAN_RENEWAL_PRICE", "0"))
    whop_plan_billing_period_days: int = Field(default_factory=lambda: env_int("WHOP_PLAN_BILLING_PERIOD_DAYS", "30"))
    whop_checkout_timeout_seconds: float = Field(default_factory=lambda: env_float("WHOP_CHECKOUT_TIMEOUT_SECONDS", "10"))
    ops_api_token: str = Field(default_factory=lambda: os.getenv("OPS_API_TOKEN", ""))
    ops_allow_production_reset: bool = Field(default_factory=lambda: env_bool("OPS_ALLOW_PRODUCTION_RESET", "false"))
    ops_allow_remote_reset: bool = Field(default_factory=lambda: env_bool("OPS_ALLOW_REMOTE_RESET", "false"))
    ai_provider: str = Field(default_factory=lambda: normalize_ai_provider_name(os.getenv("AI_PROVIDER"), "mock"))
    ai_missing_key_fallback_to_mock: bool = Field(default_factory=lambda: env_bool("AI_MISSING_KEY_FALLBACK_TO_MOCK", "true"))
    openai_api_key: str = Field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    openai_model: str = Field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4.1-mini"))
    ai_translation_enabled: bool = Field(default_factory=lambda: env_bool("AI_TRANSLATION_ENABLED", "true"))
    openai_translation_model: str = Field(default_factory=lambda: os.getenv("OPENAI_TRANSLATION_MODEL", "gpt-4.1-nano"))
    ai_translation_timeout_seconds: float = Field(default_factory=lambda: env_float("AI_TRANSLATION_TIMEOUT_SECONDS", "30"))
    ai_translation_concurrency: int = Field(default_factory=lambda: env_int("AI_TRANSLATION_CONCURRENCY", "4"))
    ai_translation_target_locales: List[str] = Field(
        default_factory=lambda: list(normalize_translation_locales(os.getenv("AI_TRANSLATION_TARGET_LOCALES", "")))
    )
    trader_status_feed_provider: str = Field(default_factory=lambda: normalize_ai_provider_name(os.getenv("TRADER_STATUS_FEED_PROVIDER"), "openai"))
    trader_status_feed_model: str = Field(default_factory=lambda: os.getenv("TRADER_STATUS_FEED_MODEL", os.getenv("OPENAI_MODEL", "gpt-4.1-mini")))
    trader_status_feed_timeout_seconds: float = Field(default_factory=lambda: env_float("TRADER_STATUS_FEED_TIMEOUT_SECONDS", "30"))
    trader_status_feed_regeneration_seconds: int = Field(default_factory=lambda: env_int("TRADER_STATUS_FEED_REGENERATION_SECONDS", "10800"))
    gemini_api_key: str = Field(default_factory=lambda: os.getenv("GEMINI_API_KEY", ""))
    gemini_model: str = Field(default_factory=lambda: os.getenv("GEMINI_MODEL", "gemini-1.5-flash"))
    anthropic_api_key: str = Field(default_factory=lambda: os.getenv("ANTHROPIC_API_KEY", ""))
    anthropic_model: str = Field(default_factory=lambda: os.getenv("ANTHROPIC_MODEL", "claude-3-5-haiku-latest"))
    grok_api_key: str = Field(default_factory=lambda: os.getenv("GROK_API_KEY", ""))
    grok_model: str = Field(default_factory=lambda: os.getenv("GROK_MODEL", "grok-2-latest"))
    paper_default_equity: float = Field(default_factory=lambda: env_float("PAPER_DEFAULT_EQUITY", "10000"))
    paper_maker_fee_rate: float = Field(default_factory=lambda: env_float("PAPER_MAKER_FEE_RATE", "0.0002"))
    paper_taker_fee_rate: float = Field(default_factory=lambda: env_float("PAPER_TAKER_FEE_RATE", "0.0005"))
    paper_slippage_rate: float = Field(default_factory=lambda: env_float("PAPER_SLIPPAGE_RATE", "0.0001"))
    paper_max_leverage: float = Field(default_factory=lambda: env_float("PAPER_MAX_LEVERAGE", "10"))
    paper_min_margin_deployment_percent: float = Field(default_factory=lambda: env_float("PAPER_MIN_MARGIN_DEPLOYMENT_PERCENT", "10"))
    paper_max_margin_deployment_percent: float = Field(default_factory=lambda: env_float("PAPER_MAX_MARGIN_DEPLOYMENT_PERCENT", "100"))
    paper_max_active_positions_per_trader: int = Field(default_factory=lambda: env_int("PAPER_MAX_ACTIVE_POSITIONS_PER_TRADER", "1"))
    enable_auto_scanner: bool = Field(default_factory=lambda: env_bool("ENABLE_AUTO_SCANNER", "false"))
    auto_scanner_symbols: List[str] = Field(default_factory=lambda: env_symbol_list("AUTO_SCANNER_SYMBOLS", "BTCUSDT"))
    auto_scanner_interval_seconds: int = Field(default_factory=lambda: env_int("AUTO_SCANNER_INTERVAL_SECONDS", "60"))
    auto_scanner_provider: str = Field(default_factory=lambda: normalize_ai_provider_name(os.getenv("AUTO_SCANNER_PROVIDER"), "mock"))
    auto_scanner_locale: str = Field(default_factory=lambda: normalize_locale(os.getenv("AUTO_SCANNER_LOCALE", "en")))
    auto_scanner_snapshot_concurrency: int = Field(default_factory=lambda: env_int("AUTO_SCANNER_SNAPSHOT_CONCURRENCY", "3"))
    auto_scanner_ai_concurrency: int = Field(default_factory=lambda: env_int("AUTO_SCANNER_AI_CONCURRENCY", "2"))
    ai_rejection_cooldown_seconds: int = Field(default_factory=lambda: env_int("AI_REJECTION_COOLDOWN_SECONDS", "300"))
    paper_reentry_cooldown_seconds: int = Field(default_factory=lambda: env_int("PAPER_REENTRY_COOLDOWN_SECONDS", "900"))
    enable_position_management_ai: bool = Field(default_factory=lambda: env_bool("ENABLE_POSITION_MANAGEMENT_AI", "true"))
    position_management_provider: str = Field(default_factory=lambda: normalize_ai_provider_name(os.getenv("POSITION_MANAGEMENT_PROVIDER"), ""))
    position_management_cooldown_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_COOLDOWN_SECONDS", "300"))
    position_management_max_reviews_per_cycle: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_MAX_REVIEWS_PER_CYCLE", "2"))
    position_management_pending_heartbeat_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_PENDING_HEARTBEAT_SECONDS", "300"))
    position_management_open_heartbeat_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_OPEN_HEARTBEAT_SECONDS", "300"))
    position_management_urgent_cooldown_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_URGENT_COOLDOWN_SECONDS", "60"))
    league_sentiment_provider: str = Field(
        default_factory=lambda: normalize_ai_provider_name(
            os.getenv("LEAGUE_SENTIMENT_PROVIDER"),
            os.getenv("POSITION_MANAGEMENT_PROVIDER") or os.getenv("AI_PROVIDER") or "mock",
        )
    )
    league_sentiment_recent_hours: int = Field(default_factory=lambda: env_int("LEAGUE_SENTIMENT_RECENT_HOURS", "24"))
    price_shock_threshold_percent: float = Field(default_factory=lambda: env_float("PRICE_SHOCK_THRESHOLD_PERCENT", "0.7"))
    price_shock_review_seconds: int = Field(default_factory=lambda: env_int("PRICE_SHOCK_REVIEW_SECONDS", "120"))
    price_shock_review_cycles: int = Field(default_factory=lambda: env_int("PRICE_SHOCK_REVIEW_CYCLES", "5"))
    equity_snapshot_interval_seconds: int = Field(default_factory=lambda: env_int("EQUITY_SNAPSHOT_INTERVAL_SECONDS", "60"))
    equity_snapshot_min_change_percent: float = Field(default_factory=lambda: env_float("EQUITY_SNAPSHOT_MIN_CHANGE_PERCENT", "0.02"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
