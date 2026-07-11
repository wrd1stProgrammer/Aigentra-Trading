from functools import lru_cache
import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from pydantic import BaseModel, Field, field_validator

from app.locales import normalize_locale, normalize_translation_locales


API_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(API_ROOT / ".env")
VALID_AI_PROVIDERS = {"mock", "openai", "gemini", "anthropic", "grok", "codex_cli"}
AI_PROVIDER_ALIASES = {"anthriopic": "anthropic", "codex": "codex_cli", "codex-cli": "codex_cli"}


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


def codex_cli_provider_override_enabled(provider_env_name: str) -> bool:
    return (
        env_bool("AI_PROVIDER_CODEX", "false")
        or env_bool("USE_CODEX_CLI", "false")
        or env_bool(f"{provider_env_name}_CODEX", "false")
    )


def provider_from_env(provider_env_name: str, default: str = "mock") -> str:
    explicit_provider = os.getenv(provider_env_name)
    if env_bool(f"{provider_env_name}_CODEX", "false"):
        return "codex_cli"
    if provider_env_name == "AI_PROVIDER" and (
        env_bool("AI_PROVIDER_CODEX", "false") or env_bool("USE_CODEX_CLI", "false")
    ):
        return "codex_cli"
    if explicit_provider:
        return normalize_ai_provider_name(explicit_provider, default)
    if codex_cli_provider_override_enabled(provider_env_name):
        return "codex_cli"
    return normalize_ai_provider_name(explicit_provider, default)


def env_first(*names: str) -> str:
    for name in names:
        value = os.getenv(name, "")
        if value:
            return value
    return ""


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
    external_derivatives_enabled: bool = Field(default_factory=lambda: env_bool("EXTERNAL_DERIVATIVES_ENABLED", "true"))
    external_market_data_timeout_seconds: float = Field(default_factory=lambda: env_float("EXTERNAL_MARKET_DATA_TIMEOUT_SECONDS", "3"))
    coinalyze_api_key: str = Field(default_factory=lambda: env_first("COINALYZE_API_KEY", "COINANALYTICS_API_KEY"))
    coinalyze_base_url: str = Field(default_factory=lambda: os.getenv("COINALYZE_BASE_URL", "https://api.coinalyze.net/v1"))
    deribit_base_url: str = Field(default_factory=lambda: os.getenv("DERIBIT_BASE_URL", "https://www.deribit.com/api/v2"))
    subscriber_api_token: str = Field(default_factory=lambda: os.getenv("SUBSCRIBER_API_TOKEN", ""))
    admin_api_token: str = Field(default_factory=lambda: os.getenv("ADMIN_API_TOKEN", ""))
    whop_mode: str = Field(default_factory=lambda: os.getenv("WHOP_MODE", "production").lower())
    whop_api_key: str = Field(default_factory=lambda: os.getenv("WHOP_API_KEY", ""))
    whop_company_id: str = Field(default_factory=lambda: os.getenv("WHOP_COMPANY_ID", ""))
    whop_webhook_secret: str = Field(default_factory=lambda: os.getenv("WHOP_WEBHOOK_SECRET", ""))
    whop_api_base_url: str = Field(default_factory=lambda: os.getenv("WHOP_API_BASE_URL", "https://api.whop.com/api/v1"))
    whop_api_version_date: str = Field(default_factory=lambda: os.getenv("WHOP_API_VERSION_DATE", ""))
    whop_plan_key: str = Field(default_factory=lambda: os.getenv("WHOP_PLAN_KEY", "aigentra_pro_monthly"))
    whop_plan_id: str = Field(default_factory=lambda: os.getenv("WHOP_PLAN_ID", ""))
    whop_pro_monthly_plan_id: str = Field(default_factory=lambda: os.getenv("WHOP_PRO_MONTHLY_PLAN_ID", ""))
    whop_pro_annual_plan_id: str = Field(default_factory=lambda: os.getenv("WHOP_PRO_ANNUAL_PLAN_ID", ""))
    whop_api_key_sandbox: str = Field(default_factory=lambda: os.getenv("WHOP_API_KEY_SANDBOX", ""))
    whop_company_id_sandbox: str = Field(default_factory=lambda: os.getenv("WHOP_COMPANY_ID_SANDBOX", ""))
    whop_webhook_secret_sandbox: str = Field(default_factory=lambda: os.getenv("WHOP_WEBHOOK_SECRET_SANDBOX", ""))
    whop_api_base_url_sandbox: str = Field(
        default_factory=lambda: os.getenv("WHOP_API_BASE_URL_SANDBOX", "https://sandbox-api.whop.com/api/v1")
    )
    whop_plan_id_sandbox: str = Field(default_factory=lambda: os.getenv("WHOP_PLAN_ID_SANDBOX", ""))
    whop_pro_monthly_plan_id_sandbox: str = Field(
        default_factory=lambda: os.getenv("WHOP_PRO_MONTHLY_PLAN_ID_SANDBOX", "")
    )
    whop_pro_annual_plan_id_sandbox: str = Field(default_factory=lambda: os.getenv("WHOP_PRO_ANNUAL_PLAN_ID_SANDBOX", ""))
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
    ai_provider: str = Field(default_factory=lambda: provider_from_env("AI_PROVIDER", "mock"))
    ai_missing_key_fallback_to_mock: bool = Field(default_factory=lambda: env_bool("AI_MISSING_KEY_FALLBACK_TO_MOCK", "true"))
    openai_api_key: str = Field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    openai_model: str = Field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4.1-mini"))
    openai_trade_review_model: str = Field(default_factory=lambda: os.getenv("OPENAI_TRADE_REVIEW_MODEL", ""))
    openai_position_management_model: str = Field(default_factory=lambda: os.getenv("OPENAI_POSITION_MANAGEMENT_MODEL", ""))
    openai_league_sentiment_model: str = Field(default_factory=lambda: os.getenv("OPENAI_LEAGUE_SENTIMENT_MODEL", ""))
    codex_cli_command: str = Field(default_factory=lambda: os.getenv("CODEX_CLI_COMMAND", os.getenv("CODEX_CLI_BIN", "codex")))
    codex_cli_model: str = Field(default_factory=lambda: os.getenv("CODEX_CLI_MODEL", ""))
    codex_cli_trade_review_model: str = Field(
        default_factory=lambda: env_first("AUTO_SCANNER_CODEX_MODEL", "CODEX_CLI_TRADE_REVIEW_MODEL")
    )
    codex_cli_position_management_model: str = Field(
        default_factory=lambda: env_first("POSITION_MANAGEMENT_CODEX_MODEL", "CODEX_CLI_POSITION_MANAGEMENT_MODEL")
    )
    codex_cli_league_sentiment_model: str = Field(
        default_factory=lambda: env_first("LEAGUE_SENTIMENT_CODEX_MODEL", "CODEX_CLI_LEAGUE_SENTIMENT_MODEL")
    )
    codex_cli_translation_model: str = Field(
        default_factory=lambda: env_first("AI_TRANSLATION_CODEX_MODEL", "CODEX_CLI_TRANSLATION_MODEL")
    )
    codex_cli_status_feed_model: str = Field(
        default_factory=lambda: env_first("TRADER_STATUS_FEED_CODEX_MODEL", "CODEX_CLI_STATUS_FEED_MODEL")
    )
    codex_cli_timeout_seconds: float = Field(default_factory=lambda: env_float("CODEX_CLI_TIMEOUT_SECONDS", "120"))
    codex_cli_workdir: str = Field(default_factory=lambda: os.getenv("CODEX_CLI_WORKDIR", str(API_ROOT.parent.parent)))
    codex_cli_home: str = Field(default_factory=lambda: os.getenv("CODEX_HOME", os.getenv("CODEX_CLI_HOME", "")))
    codex_cli_access_token: str = Field(default_factory=lambda: os.getenv("CODEX_ACCESS_TOKEN", ""))
    codex_cli_fallback_provider: str = Field(
        default_factory=lambda: normalize_ai_provider_name(os.getenv("CODEX_CLI_FALLBACK_PROVIDER"), "codex_cli")
    )
    ai_translation_enabled: bool = Field(default_factory=lambda: env_bool("AI_TRANSLATION_ENABLED", "true"))
    ai_translation_provider: str = Field(default_factory=lambda: provider_from_env("AI_TRANSLATION_PROVIDER", "openai"))
    openai_translation_model: str = Field(default_factory=lambda: os.getenv("OPENAI_TRANSLATION_MODEL", "gpt-4.1-nano"))
    ai_translation_timeout_seconds: float = Field(default_factory=lambda: env_float("AI_TRANSLATION_TIMEOUT_SECONDS", "30"))
    ai_translation_concurrency: int = Field(default_factory=lambda: env_int("AI_TRANSLATION_CONCURRENCY", "4"))
    ai_translation_target_locales: List[str] = Field(
        default_factory=lambda: list(normalize_translation_locales(os.getenv("AI_TRANSLATION_TARGET_LOCALES", "")))
    )
    trader_status_feed_provider: str = Field(
        default_factory=lambda: provider_from_env("TRADER_STATUS_FEED_PROVIDER", "openai")
    )
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
    paper_daily_loss_limit_percent: float = Field(default_factory=lambda: env_float("PAPER_DAILY_LOSS_LIMIT_PERCENT", "1.5"))
    paper_consecutive_loss_limit: int = Field(default_factory=lambda: env_int("PAPER_CONSECUTIVE_LOSS_LIMIT", "3"))
    paper_drawdown_reduce_percent: float = Field(default_factory=lambda: env_float("PAPER_DRAWDOWN_REDUCE_PERCENT", "8"))
    paper_drawdown_block_percent: float = Field(default_factory=lambda: env_float("PAPER_DRAWDOWN_BLOCK_PERCENT", "12"))
    paper_drawdown_risk_multiplier: float = Field(default_factory=lambda: env_float("PAPER_DRAWDOWN_RISK_MULTIPLIER", "0.5"))
    paper_risk_budget_tolerance_percent: float = Field(default_factory=lambda: env_float("PAPER_RISK_BUDGET_TOLERANCE_PERCENT", "5"))
    paper_limit_fill_buffer_rate: float = Field(default_factory=lambda: env_float("PAPER_LIMIT_FILL_BUFFER_RATE", "0.00005"))
    paper_funding_interval_hours: int = Field(default_factory=lambda: env_int("PAPER_FUNDING_INTERVAL_HOURS", "8"))
    paper_max_leverage: float = Field(default_factory=lambda: env_float("PAPER_MAX_LEVERAGE", "10"))
    paper_min_margin_deployment_percent: float = Field(default_factory=lambda: env_float("PAPER_MIN_MARGIN_DEPLOYMENT_PERCENT", "10"))
    paper_max_margin_deployment_percent: float = Field(default_factory=lambda: env_float("PAPER_MAX_MARGIN_DEPLOYMENT_PERCENT", "100"))
    paper_max_active_positions_per_trader: int = Field(default_factory=lambda: env_int("PAPER_MAX_ACTIVE_POSITIONS_PER_TRADER", "1"))
    enable_auto_scanner: bool = Field(default_factory=lambda: env_bool("ENABLE_AUTO_SCANNER", "false"))
    enable_worker_watchdog: bool = Field(default_factory=lambda: env_bool("ENABLE_WORKER_WATCHDOG", "true"))
    worker_watchdog_timeout_seconds: int = Field(
        default_factory=lambda: env_int("WORKER_WATCHDOG_TIMEOUT_SECONDS", "120")
    )
    auto_scanner_symbols: List[str] = Field(default_factory=lambda: env_symbol_list("AUTO_SCANNER_SYMBOLS", "BTCUSDT"))
    auto_scanner_interval_seconds: int = Field(default_factory=lambda: env_int("AUTO_SCANNER_INTERVAL_SECONDS", "60"))
    auto_management_interval_seconds: int = Field(default_factory=lambda: env_int("AUTO_MANAGEMENT_INTERVAL_SECONDS", "10"))
    enable_realtime_paper_execution: bool = Field(
        default_factory=lambda: env_bool("ENABLE_REALTIME_PAPER_EXECUTION", os.getenv("ENABLE_AUTO_SCANNER", "false"))
    )
    realtime_paper_execution_symbols: List[str] = Field(
        default_factory=lambda: env_symbol_list("REALTIME_PAPER_EXECUTION_SYMBOLS", os.getenv("AUTO_SCANNER_SYMBOLS", "BTCUSDT"))
    )
    realtime_paper_execution_interval_seconds: float = Field(
        default_factory=lambda: env_float("REALTIME_PAPER_EXECUTION_INTERVAL_SECONDS", "1")
    )
    realtime_paper_execution_role: str = Field(
        default_factory=lambda: os.getenv("REALTIME_PAPER_EXECUTION_ROLE", "api").strip().lower()
    )
    realtime_paper_execution_backfill_minutes: int = Field(
        default_factory=lambda: env_int("REALTIME_PAPER_EXECUTION_BACKFILL_MINUTES", "2880")
    )
    realtime_paper_execution_backfill_page_limit: int = Field(
        default_factory=lambda: env_int("REALTIME_PAPER_EXECUTION_BACKFILL_PAGE_LIMIT", "300")
    )
    auto_scanner_provider: str = Field(default_factory=lambda: provider_from_env("AUTO_SCANNER_PROVIDER", "mock"))
    auto_scanner_locale: str = Field(default_factory=lambda: normalize_locale(os.getenv("AUTO_SCANNER_LOCALE", "ko")))
    auto_scanner_snapshot_concurrency: int = Field(default_factory=lambda: env_int("AUTO_SCANNER_SNAPSHOT_CONCURRENCY", "3"))
    auto_scanner_ai_concurrency: int = Field(default_factory=lambda: env_int("AUTO_SCANNER_AI_CONCURRENCY", "2"))
    ai_rejection_cooldown_seconds: int = Field(default_factory=lambda: env_int("AI_REJECTION_COOLDOWN_SECONDS", "300"))
    paper_reentry_cooldown_seconds: int = Field(default_factory=lambda: env_int("PAPER_REENTRY_COOLDOWN_SECONDS", "900"))
    enable_position_management_ai: bool = Field(default_factory=lambda: env_bool("ENABLE_POSITION_MANAGEMENT_AI", "true"))
    position_management_provider: str = Field(default_factory=lambda: provider_from_env("POSITION_MANAGEMENT_PROVIDER", ""))
    position_management_cooldown_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_COOLDOWN_SECONDS", "300"))
    position_management_max_reviews_per_cycle: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_MAX_REVIEWS_PER_CYCLE", "2"))
    position_management_concurrency: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_CONCURRENCY", "2"))
    position_management_provider_error_retry_seconds: int = Field(
        default_factory=lambda: env_int("POSITION_MANAGEMENT_PROVIDER_ERROR_RETRY_SECONDS", "300")
    )
    position_management_pending_heartbeat_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_PENDING_HEARTBEAT_SECONDS", "300"))
    position_management_open_heartbeat_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_OPEN_HEARTBEAT_SECONDS", "300"))
    position_management_urgent_cooldown_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_URGENT_COOLDOWN_SECONDS", "60"))
    league_sentiment_provider: str = Field(
        default_factory=lambda: provider_from_env(
            "LEAGUE_SENTIMENT_PROVIDER",
            os.getenv("POSITION_MANAGEMENT_PROVIDER") or os.getenv("AI_PROVIDER") or "mock",
        )
    )
    league_sentiment_recent_hours: int = Field(default_factory=lambda: env_int("LEAGUE_SENTIMENT_RECENT_HOURS", "24"))
    league_sentiment_timeout_seconds: float = Field(default_factory=lambda: env_float("LEAGUE_SENTIMENT_TIMEOUT_SECONDS", "110"))
    enable_league_sentiment_scheduler: bool = Field(
        default_factory=lambda: env_bool("ENABLE_LEAGUE_SENTIMENT_SCHEDULER", "true")
    )
    league_sentiment_scheduler_interval_seconds: int = Field(
        default_factory=lambda: env_int("LEAGUE_SENTIMENT_SCHEDULER_INTERVAL_SECONDS", "3600")
    )
    league_sentiment_generation_offset_seconds: int = Field(
        default_factory=lambda: env_int("LEAGUE_SENTIMENT_GENERATION_OFFSET_SECONDS", "30")
    )
    league_sentiment_retry_seconds: int = Field(
        default_factory=lambda: env_int("LEAGUE_SENTIMENT_RETRY_SECONDS", "300")
    )
    price_shock_threshold_percent: float = Field(default_factory=lambda: env_float("PRICE_SHOCK_THRESHOLD_PERCENT", "0.7"))
    price_shock_review_seconds: int = Field(default_factory=lambda: env_int("PRICE_SHOCK_REVIEW_SECONDS", "120"))
    price_shock_review_cycles: int = Field(default_factory=lambda: env_int("PRICE_SHOCK_REVIEW_CYCLES", "5"))
    equity_snapshot_interval_seconds: int = Field(default_factory=lambda: env_int("EQUITY_SNAPSHOT_INTERVAL_SECONDS", "60"))
    equity_snapshot_min_change_percent: float = Field(default_factory=lambda: env_float("EQUITY_SNAPSHOT_MIN_CHANGE_PERCENT", "0.02"))

    @field_validator(
        "ai_provider",
        "auto_scanner_provider",
        "position_management_provider",
        "league_sentiment_provider",
        "trader_status_feed_provider",
        "ai_translation_provider",
        "codex_cli_fallback_provider",
        mode="before",
    )
    @classmethod
    def normalize_provider_fields(cls, value: str | None) -> str | None:
        if value is None:
            return value
        return normalize_ai_provider_name(value, "")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
