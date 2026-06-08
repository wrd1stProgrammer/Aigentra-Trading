from functools import lru_cache
import os
from pathlib import Path
from typing import List

from dotenv import load_dotenv
from pydantic import BaseModel, Field


API_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(API_ROOT / ".env")


def env_bool(name: str, default: str = "false") -> bool:
    return os.getenv(name, default).lower() in {"1", "true", "yes", "on"}


def env_float(name: str, default: str) -> float:
    return float(os.getenv(name, default))


def env_int(name: str, default: str) -> int:
    return int(os.getenv(name, default))


def env_list(name: str, default: str) -> List[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


def env_symbol_list(name: str, default: str) -> List[str]:
    return [item.upper() for item in env_list(name, default)]


def default_database_url() -> str:
    return os.getenv("DATABASE_URL", "") or os.getenv("NEON_DATABASE_URL", "") or "sqlite:///./data/dev.db"


class Settings(BaseModel):
    env_file_loaded: bool = Field(default_factory=lambda: (API_ROOT / ".env").exists())
    app_env: str = Field(default_factory=lambda: os.getenv("APP_ENV", "local"))
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
    subscriber_api_token: str = Field(default_factory=lambda: os.getenv("SUBSCRIBER_API_TOKEN", ""))
    ai_provider: str = Field(default_factory=lambda: os.getenv("AI_PROVIDER", "mock").lower())
    ai_missing_key_fallback_to_mock: bool = Field(default_factory=lambda: env_bool("AI_MISSING_KEY_FALLBACK_TO_MOCK", "true"))
    openai_api_key: str = Field(default_factory=lambda: os.getenv("OPENAI_API_KEY", ""))
    openai_model: str = Field(default_factory=lambda: os.getenv("OPENAI_MODEL", "gpt-4.1-mini"))
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
    auto_scanner_provider: str = Field(default_factory=lambda: os.getenv("AUTO_SCANNER_PROVIDER", "mock").lower())
    auto_scanner_locale: str = Field(default_factory=lambda: os.getenv("AUTO_SCANNER_LOCALE", "ko").lower())
    auto_scanner_snapshot_concurrency: int = Field(default_factory=lambda: env_int("AUTO_SCANNER_SNAPSHOT_CONCURRENCY", "3"))
    auto_scanner_ai_concurrency: int = Field(default_factory=lambda: env_int("AUTO_SCANNER_AI_CONCURRENCY", "2"))
    ai_rejection_cooldown_seconds: int = Field(default_factory=lambda: env_int("AI_REJECTION_COOLDOWN_SECONDS", "300"))
    enable_position_management_ai: bool = Field(default_factory=lambda: env_bool("ENABLE_POSITION_MANAGEMENT_AI", "true"))
    position_management_provider: str = Field(default_factory=lambda: os.getenv("POSITION_MANAGEMENT_PROVIDER", "").lower())
    position_management_cooldown_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_COOLDOWN_SECONDS", "300"))
    position_management_max_reviews_per_cycle: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_MAX_REVIEWS_PER_CYCLE", "2"))
    position_management_pending_heartbeat_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_PENDING_HEARTBEAT_SECONDS", "300"))
    position_management_open_heartbeat_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_OPEN_HEARTBEAT_SECONDS", "300"))
    position_management_urgent_cooldown_seconds: int = Field(default_factory=lambda: env_int("POSITION_MANAGEMENT_URGENT_COOLDOWN_SECONDS", "60"))
    price_shock_threshold_percent: float = Field(default_factory=lambda: env_float("PRICE_SHOCK_THRESHOLD_PERCENT", "0.7"))
    price_shock_review_seconds: int = Field(default_factory=lambda: env_int("PRICE_SHOCK_REVIEW_SECONDS", "120"))
    price_shock_review_cycles: int = Field(default_factory=lambda: env_int("PRICE_SHOCK_REVIEW_CYCLES", "5"))
    equity_snapshot_interval_seconds: int = Field(default_factory=lambda: env_int("EQUITY_SNAPSHOT_INTERVAL_SECONDS", "60"))
    equity_snapshot_min_change_percent: float = Field(default_factory=lambda: env_float("EQUITY_SNAPSHOT_MIN_CHANGE_PERCENT", "0.02"))


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()
