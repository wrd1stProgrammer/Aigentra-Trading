import time
from typing import Optional

from sqlalchemy.orm import Session

from app.ai.factory import get_ai_provider
from app.ai.mock_provider import MockAIProvider
from app.core.config import Settings
from app.db import session_scope
from app.repositories import create_provider_call_log, sanitize_error_message
from app.traders.models import PositionManagementPayload, PositionManagementResult, TradeReviewPayload, TradeReviewResult


def log_provider_failure(
    *,
    provider: str,
    model: str,
    latency_ms: int,
    symbol: str,
    trader_id: str,
    error_message: str,
    status: Optional[str] = None,
) -> None:
    with session_scope() as db:
        create_provider_call_log(
            db,
            provider=provider,
            model=model,
            success=False,
            latency_ms=latency_ms,
            symbol=symbol,
            trader_id=trader_id,
            status=status,
            error_message=sanitize_error_message(error_message),
        )


async def run_review_with_logging(
    db: Session,
    payload: TradeReviewPayload,
    provider_name: str,
    *,
    settings: Settings,
) -> TradeReviewResult:
    provider = get_ai_provider(settings, provider_name)
    attempts = 2 if provider_name == "gemini" and provider.name == "gemini" else 1
    last_error: Optional[Exception] = None

    for _ in range(attempts):
        start = time.perf_counter()
        try:
            review = await provider.review_trade_candidate(payload)
            latency_ms = int((time.perf_counter() - start) * 1000)
            create_provider_call_log(
                db,
                provider=provider.name,
                model=review.model,
                success=True,
                latency_ms=latency_ms,
                decision=review.decision,
                symbol=payload.symbol,
                trader_id=payload.trader.id,
            )
            return review
        except Exception as exc:
            last_error = exc
            latency_ms = int((time.perf_counter() - start) * 1000)
            log_provider_failure(
                provider=provider.name,
                model=getattr(provider, "model", provider_name),
                latency_ms=latency_ms,
                symbol=payload.symbol,
                trader_id=payload.trader.id,
                error_message=str(exc),
            )

    if settings.ai_missing_key_fallback_to_mock:
        start = time.perf_counter()
        mock = MockAIProvider(fallback=True)
        review = await mock.review_trade_candidate(payload)
        latency_ms = int((time.perf_counter() - start) * 1000)
        create_provider_call_log(
            db,
            provider=mock.name,
            model=mock.model,
            success=True,
            latency_ms=latency_ms,
            decision=review.decision,
            symbol=payload.symbol,
            trader_id=payload.trader.id,
            status="fallback",
            error_message=sanitize_error_message(f"Fallback after {provider_name} failure: {last_error}"),
        )
        return review

    raise RuntimeError(str(last_error) if last_error else "AI provider call failed.")


async def run_position_management_with_logging(
    db: Session,
    payload: PositionManagementPayload,
    provider_name: str,
    *,
    settings: Settings,
) -> PositionManagementResult:
    provider = get_ai_provider(settings, provider_name)
    attempts = 2 if provider_name == "gemini" and provider.name == "gemini" else 1
    last_error: Optional[Exception] = None

    for _ in range(attempts):
        start = time.perf_counter()
        try:
            review = await provider.review_position_management(payload)
            latency_ms = int((time.perf_counter() - start) * 1000)
            create_provider_call_log(
                db,
                provider=provider.name,
                model=review.model,
                success=True,
                latency_ms=latency_ms,
                decision=review.decision,
                symbol=payload.symbol,
                trader_id=payload.trader.id,
                status="position_management",
            )
            return review
        except Exception as exc:
            last_error = exc
            latency_ms = int((time.perf_counter() - start) * 1000)
            log_provider_failure(
                provider=provider.name,
                model=getattr(provider, "model", provider_name),
                latency_ms=latency_ms,
                symbol=payload.symbol,
                trader_id=payload.trader.id,
                status="position_management_error",
                error_message=str(exc),
            )

    if settings.ai_missing_key_fallback_to_mock:
        start = time.perf_counter()
        mock = MockAIProvider(fallback=True)
        review = await mock.review_position_management(payload)
        latency_ms = int((time.perf_counter() - start) * 1000)
        create_provider_call_log(
            db,
            provider=mock.name,
            model=mock.model,
            success=True,
            latency_ms=latency_ms,
            decision=review.decision,
            symbol=payload.symbol,
            trader_id=payload.trader.id,
            status="position_management_fallback",
            error_message=sanitize_error_message(f"Fallback after {provider_name} failure: {last_error}"),
        )
        return review

    raise RuntimeError(str(last_error) if last_error else "Position management provider call failed.")
