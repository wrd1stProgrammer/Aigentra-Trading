from datetime import datetime, timedelta, timezone
from decimal import Decimal
import re
import time
from typing import Any, Optional

from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.ai.factory import get_ai_provider
from app.ai.league_sentiment_models import LeagueSentimentOpinionResult, LeagueSentimentPayload
from app.ai.translation_cache import fanout_ai_translations, localized_payload_for_source
from app.core.config import Settings
from app.db import (
    AIReviewRecord,
    LeagueSentimentOpinionRecord,
    MarketSnapshotRecord,
    PaperOrderRecord,
    PaperPositionRecord,
    PositionManagementReviewRecord,
    TradeEventRecord,
    utc_now,
)
from app.locales import AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT, CANONICAL_AI_LOCALE, normalize_locale
from app.market.data_cache import redis_get_json, redis_set_json, shared_cache_key
from app.repositories import create_provider_call_log, from_json, sanitize_error_message, to_json
from app.traders.registry import list_traders


RECENT_TRADE_EVENT_TYPES = {
    "order_filled",
    "position_opened",
    "take_profit",
    "take_partial_profit",
    "stop_loss",
    "position_closed",
}
ACTIVE_ORDER_STATUSES = {"open", "pending", "submitted"}
ACTIVE_POSITION_STATUSES = {"open"}
BANNED_OPINION_TERMS = (
    ("페이퍼 트레이딩은", "Aigentra 리그는"),
    ("페이퍼 트레이딩", "Aigentra 리그"),
    ("모델 시뮬레이션은", "Aigentra 리그 의견은"),
    ("모델 시뮬레이션", "Aigentra 리그 의견"),
    ("시뮬레이션 리그는", "Aigentra 리그는"),
    ("시뮬레이션 리그", "Aigentra 리그"),
    ("paper-trading", "Aigentra league"),
    ("paper trading", "Aigentra league"),
    ("paper league", "Aigentra league"),
    ("simulation league", "Aigentra league"),
    ("simulated league", "Aigentra league"),
)
KOREAN_CONTEXT_BANNED_OPINION_TERMS = (
    ("노타시온", "노출"),
    ("전적으로 노출", "활성 노출"),
    ("notional", "노출"),
    ("stop zone", "무효화 구역"),
    ("desk says", "리그 판단"),
    ("bot says", "리그 판단"),
)
ENGLISH_CONTEXT_BANNED_OPINION_TERMS = (
    ("notional", "exposure"),
    ("stop zone", "invalidation area"),
    ("desk says", "league read"),
    ("bot says", "league read"),
)
LOCALIZED_OPINION_KEYS = (
    "confidenceReason",
    "brief",
    "headline",
    "summary",
    "keyDrivers",
    "risks",
    "watchConditions",
    "action",
    "longShortContext",
)


def current_utc_hour_window(now: Optional[datetime] = None) -> tuple[datetime, datetime]:
    base = ensure_utc(now or utc_now())
    start = base.replace(minute=0, second=0, microsecond=0)
    return start, start + timedelta(hours=1)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def iso_utc(value: Optional[datetime]) -> Optional[str]:
    if value is None:
        return None
    return ensure_utc(value).isoformat()


def league_sentiment_cache_key(symbol: str, locale: str, interval_start: datetime) -> str:
    return shared_cache_key("league_sentiment_opinion:v2", symbol.upper(), normalize_locale(locale), ensure_utc(interval_start).isoformat())


def league_sentiment_cache_ttl(interval_end: datetime, *, stale: bool = False) -> int:
    if stale:
        return 120
    seconds = int((ensure_utc(interval_end) - utc_now()).total_seconds())
    return max(60, min(seconds + 300, 7200))


async def cache_league_sentiment_payload(
    symbol: str,
    locale: str,
    interval_start: datetime,
    interval_end: datetime,
    payload: dict[str, Any],
    *,
    stale: bool = False,
) -> None:
    await redis_set_json(
        league_sentiment_cache_key(symbol, locale, interval_start),
        payload,
        league_sentiment_cache_ttl(interval_end, stale=stale),
    )


def sanitize_league_sentiment_opinion(opinion: LeagueSentimentOpinionResult) -> LeagueSentimentOpinionResult:
    return LeagueSentimentOpinionResult.model_validate(scrub_banned_opinion_terms(opinion.model_dump()))


def ensure_compact_brief_payload(payload: dict[str, Any]) -> dict[str, Any]:
    normalized = dict(payload)
    brief = normalized.get("brief") if isinstance(normalized.get("brief"), dict) else {}
    conclusion = compact_opinion_line(brief.get("conclusion")) or compact_opinion_line(normalized.get("headline"))
    reason = compact_opinion_line(brief.get("reason")) or compact_opinion_line(normalized.get("summary"))
    watch = compact_opinion_line(brief.get("watch")) or compact_opinion_line(normalized.get("action"))
    normalized["brief"] = {
        "conclusion": conclusion or "Market context needs review.",
        "reason": reason or "Not enough reliable trader context is available.",
        "watch": watch or "Wait for the next hourly context refresh.",
    }
    return normalized


def embedded_league_sentiment_locale_payload(
    payload: dict[str, Any],
    locale: str,
) -> tuple[Optional[dict[str, Any]], dict[str, Any]]:
    requested_locale = normalize_locale(locale)
    translations = payload.get("translations") if isinstance(payload.get("translations"), dict) else {}
    translated = translations.get(requested_locale) if isinstance(translations, dict) else None
    if isinstance(translated, dict):
        localized = dict(payload)
        for key in LOCALIZED_OPINION_KEYS:
            if key in translated:
                localized[key] = translated[key]
        localized.pop("translations", None)
        return localized, {"status": "embedded", "locale": requested_locale, "sourceLocale": CANONICAL_AI_LOCALE}
    if requested_locale == CANONICAL_AI_LOCALE:
        localized = dict(payload)
        localized.pop("translations", None)
        return localized, {"status": "canonical", "locale": CANONICAL_AI_LOCALE, "sourceLocale": CANONICAL_AI_LOCALE}
    return None, {"status": "missing", "locale": requested_locale, "fallbackLocale": CANONICAL_AI_LOCALE, "sourceLocale": CANONICAL_AI_LOCALE}


def embedded_league_sentiment_missing_locales(payload: dict[str, Any], locales: tuple[str, ...]) -> tuple[str, ...]:
    translations = payload.get("translations") if isinstance(payload.get("translations"), dict) else {}
    return tuple(
        locale
        for locale in (normalize_locale(item) for item in locales)
        if locale != CANONICAL_AI_LOCALE and not isinstance(translations.get(locale), dict)
    )


def compact_opinion_line(value: Any) -> Optional[str]:
    if value is None:
        return None
    clean = str(value).strip()
    if not clean:
        return None
    for pattern in (
        r"\s*(?:출처|Sources?|sourceRef|Evidence)\s*:\s*[^.。]+[.。]?\s*$",
        r"\s*\([^)]*(?:position|order|review|trade_event|closed_position):[^)]*\)\s*$",
    ):
        clean = re.sub(pattern, "", clean, flags=re.IGNORECASE).strip()
    return clean or None


def scrub_banned_opinion_terms(value: Any) -> Any:
    if isinstance(value, str):
        result = value
        for banned, replacement in BANNED_OPINION_TERMS:
            result = re.sub(re.escape(banned), replacement, result, flags=re.IGNORECASE)
        contextual_terms = KOREAN_CONTEXT_BANNED_OPINION_TERMS if re.search(r"[가-힣]", result) else ENGLISH_CONTEXT_BANNED_OPINION_TERMS
        for banned, replacement in contextual_terms:
            result = re.sub(re.escape(banned), replacement, result, flags=re.IGNORECASE)
        return result
    if isinstance(value, list):
        return [scrub_banned_opinion_terms(item) for item in value]
    if isinstance(value, dict):
        return {key: scrub_banned_opinion_terms(item) for key, item in value.items()}
    return value


async def get_or_create_league_sentiment_opinion(
    db: Session,
    *,
    symbol: str,
    locale: str,
    settings: Settings,
    force: bool = False,
    prefer_cached: bool = False,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    requested_locale = normalize_locale(locale)
    interval_start, interval_end = current_utc_hour_window(now)
    if not force:
        cached_payload = await redis_get_json(league_sentiment_cache_key(symbol, requested_locale, interval_start))
        if isinstance(cached_payload, dict):
            cached_payload["cacheHit"] = True
            return cached_payload
        existing = latest_hourly_opinion(db, symbol, CANONICAL_AI_LOCALE, interval_start)
        if existing is not None:
            await ensure_league_sentiment_translation(
                db,
                record=existing,
                locale=requested_locale,
                settings=settings,
            )
            serialized = serialize_league_sentiment_record(db, existing, cache_hit=True, locale=requested_locale)
            await cache_league_sentiment_payload(symbol, requested_locale, interval_start, interval_end, serialized)
            return serialized
        if prefer_cached:
            previous = latest_previous_opinion(db, symbol, CANONICAL_AI_LOCALE, interval_start)
            if previous is not None:
                await ensure_league_sentiment_translation(
                    db,
                    record=previous,
                    locale=requested_locale,
                    settings=settings,
                )
                serialized = serialize_league_sentiment_record(
                    db,
                    previous,
                    cache_hit=True,
                    locale=requested_locale,
                    stale=True,
                    next_refresh_at=interval_start,
                )
                await cache_league_sentiment_payload(symbol, requested_locale, interval_start, interval_end, serialized, stale=True)
                return serialized

    payload = build_league_sentiment_payload(
        db,
        symbol=symbol,
        locale=CANONICAL_AI_LOCALE,
        interval_start=interval_start,
        interval_end=interval_end,
        now=ensure_utc(now or utc_now()),
        recent_hours=max(1, int(getattr(settings, "league_sentiment_recent_hours", 24) or 24)),
    )
    provider_name = (
        getattr(settings, "league_sentiment_provider", "")
        or getattr(settings, "position_management_provider", "")
        or settings.ai_provider
        or "mock"
    )
    start = time.perf_counter()
    status = "ok"
    error_message = None
    try:
        provider = get_ai_provider(settings, provider_name)
        opinion = await provider.review_league_sentiment(payload)
        latency_ms = int((time.perf_counter() - start) * 1000)
        create_provider_call_log(
            db,
            provider=provider.name,
            model=opinion.model,
            success=True,
            latency_ms=latency_ms,
            decision=opinion.bias,
            symbol=symbol,
            trader_id="aigentra-opinion",
            status="league_sentiment",
        )
    except Exception as exc:
        latency_ms = int((time.perf_counter() - start) * 1000)
        status = "fallback"
        error_message = sanitize_error_message(str(exc))
        opinion = fallback_league_sentiment_opinion(payload)
        create_provider_call_log(
            db,
            provider=str(provider_name or "unknown"),
            model=str(getattr(settings, f"{provider_name}_model", provider_name) or provider_name),
            success=False,
            latency_ms=latency_ms,
            decision=opinion.bias,
            symbol=symbol,
            trader_id="aigentra-opinion",
            status="league_sentiment_error",
            error_message=error_message,
        )

    opinion = sanitize_league_sentiment_opinion(
        opinion.model_copy(
            update={
                "sourceCounts": dict(payload.sourceCounts),
                "sourceBreakdown": dict(payload.sourceBreakdown),
                "dataFreshness": dict(payload.dataFreshness),
                "evidenceRefs": trusted_evidence_refs(opinion.evidenceRefs, payload.evidenceRefs),
                "invalidatesAt": opinion.invalidatesAt or payload.intervalEnd,
            }
        )
    )
    record = LeagueSentimentOpinionRecord(
        symbol=symbol,
        trader_id="aigentra-opinion",
        status=status,
        error_message=error_message,
        locale=CANONICAL_AI_LOCALE,
        interval_start=interval_start,
        interval_end=interval_end,
        provider=opinion.provider,
        model=opinion.model,
        bias=opinion.bias,
        confidence=opinion.confidence,
        risk_level=opinion.riskLevel,
        fallback=opinion.fallback,
        input_json=to_json(payload.model_dump()),
        payload_json=to_json(opinion.model_dump()),
        raw_json=None,
    )
    try:
        db.add(record)
        db.flush()
        opinion_payload = opinion.model_dump()
        missing_locales = embedded_league_sentiment_missing_locales(
            opinion_payload,
            league_sentiment_translation_locales(settings, requested_locale),
        )
        if missing_locales:
            await fanout_ai_translations(
                db,
                settings=settings,
                source_type=AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
                source_id=record.id,
                payload=opinion_payload,
                symbol=symbol,
                trader_id="aigentra-opinion",
                target_locales=missing_locales,
            )
        from app.subscribers import notify_subscribers_for_league_sentiment_opinion

        notify_subscribers_for_league_sentiment_opinion(db, record)
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = latest_hourly_opinion(db, symbol, CANONICAL_AI_LOCALE, interval_start)
        if existing is not None:
            await ensure_league_sentiment_translation(
                db,
                record=existing,
                locale=requested_locale,
                settings=settings,
            )
            serialized = serialize_league_sentiment_record(db, existing, cache_hit=True, locale=requested_locale)
            await cache_league_sentiment_payload(symbol, requested_locale, interval_start, interval_end, serialized)
            return serialized
        raise
    serialized = serialize_league_sentiment_record(db, record, cache_hit=False, locale=requested_locale)
    await cache_league_sentiment_payload(symbol, requested_locale, interval_start, interval_end, serialized)
    return serialized


async def ensure_league_sentiment_translation(
    db: Session,
    *,
    record: LeagueSentimentOpinionRecord,
    locale: str,
    settings: Settings,
) -> None:
    requested_locale = normalize_locale(locale)
    if requested_locale == CANONICAL_AI_LOCALE or record.id is None:
        return
    opinion = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(opinion, dict):
        return
    embedded_payload, translation_meta = embedded_league_sentiment_locale_payload(opinion, requested_locale)
    if embedded_payload is not None and translation_meta.get("status") == "embedded":
        return

    _, translation_meta = localized_payload_for_source(
        db,
        source_type=AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
        source_id=record.id,
        payload=opinion,
        locale=requested_locale,
    )
    if translation_meta.get("status") == "ok":
        return

    await fanout_ai_translations(
        db,
        settings=settings,
        source_type=AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
        source_id=record.id,
        payload=opinion,
        symbol=record.symbol,
        trader_id="aigentra-opinion",
        target_locales=(requested_locale,),
    )
    db.flush()
    db.commit()


def league_sentiment_translation_locales(settings: Settings, requested_locale: str) -> tuple[str, ...]:
    locales: list[str] = []
    for item in getattr(settings, "ai_translation_target_locales", []):
        locale = normalize_locale(item)
        if locale != CANONICAL_AI_LOCALE and locale not in locales:
            locales.append(locale)
    normalized_requested_locale = normalize_locale(requested_locale)
    if normalized_requested_locale != CANONICAL_AI_LOCALE and normalized_requested_locale not in locales:
        locales.append(normalized_requested_locale)
    return tuple(locales)


def latest_hourly_opinion(
    db: Session,
    symbol: str,
    locale: str,
    interval_start: datetime,
) -> Optional[LeagueSentimentOpinionRecord]:
    return db.execute(
        select(LeagueSentimentOpinionRecord)
        .where(
            LeagueSentimentOpinionRecord.symbol == symbol,
            LeagueSentimentOpinionRecord.locale == locale,
            LeagueSentimentOpinionRecord.interval_start == interval_start,
        )
        .order_by(desc(LeagueSentimentOpinionRecord.id))
    ).scalar_one_or_none()


def latest_previous_opinion(
    db: Session,
    symbol: str,
    locale: str,
    before_interval_start: datetime,
) -> Optional[LeagueSentimentOpinionRecord]:
    return db.execute(
        select(LeagueSentimentOpinionRecord)
        .where(
            LeagueSentimentOpinionRecord.symbol == symbol,
            LeagueSentimentOpinionRecord.locale == locale,
            LeagueSentimentOpinionRecord.interval_start < before_interval_start,
        )
        .order_by(desc(LeagueSentimentOpinionRecord.interval_start), desc(LeagueSentimentOpinionRecord.id))
        .limit(1)
    ).scalar_one_or_none()


def build_league_sentiment_payload(
    db: Session,
    *,
    symbol: str,
    locale: str,
    interval_start: datetime,
    interval_end: datetime,
    now: datetime,
    recent_hours: int,
) -> LeagueSentimentPayload:
    cutoff = now - timedelta(hours=recent_hours)
    trader_names = {trader.id: trader.name for trader in list_traders()}
    active_positions = list_active_positions(db, symbol)
    pending_orders = list_pending_orders(db, symbol)
    recent_closed = list_recent_closed_positions(db, symbol, cutoff)
    recent_events = list_recent_trade_events(db, symbol, cutoff)
    entry_reviews = list_recent_entry_reviews(db, symbol, cutoff)
    management_reviews = list_recent_management_reviews(db, symbol, cutoff)
    market = latest_market_context(db, symbol)

    active_position_summaries = [summarize_position(record, trader_names) for record in active_positions]
    pending_order_summaries = [summarize_order(record, trader_names) for record in pending_orders]
    closed_position_summaries = [summarize_closed_position(record, trader_names) for record in recent_closed]
    event_summaries = [summarize_trade_event(record, trader_names) for record in recent_events]
    entry_review_summaries = [summarize_entry_review(record, trader_names) for record in entry_reviews]
    management_review_summaries = [summarize_management_review(record, trader_names) for record in management_reviews]
    counts = source_counts(
        active_position_summaries,
        pending_order_summaries,
        closed_position_summaries,
        event_summaries,
        entry_review_summaries,
        management_review_summaries,
    )
    active_position_summaries = add_source_refs(active_position_summaries, "position")
    pending_order_summaries = add_source_refs(pending_order_summaries, "order")
    closed_position_summaries = add_source_refs(closed_position_summaries, "closed_position")
    event_summaries = add_source_refs(event_summaries, "event")
    entry_review_summaries_raw = add_source_refs(entry_review_summaries, "entry_review")
    management_review_summaries_raw = add_source_refs(management_review_summaries, "management_review")
    entry_review_summaries = dedupe_latest_summaries(
        entry_review_summaries_raw,
        ("traderId", "decision", "riskLevel"),
    )
    management_review_summaries = dedupe_latest_summaries(
        management_review_summaries_raw,
        ("traderId", "phase", "decision", "action", "side"),
    )
    active_position_summaries = add_exposure_distances(active_position_summaries, market)
    pending_order_summaries = add_exposure_distances(pending_order_summaries, market, price_key="limitPrice")
    evidence_refs = build_evidence_refs(
        active_position_summaries,
        pending_order_summaries,
        closed_position_summaries,
        event_summaries,
        entry_review_summaries,
        management_review_summaries,
    )
    breakdown = source_breakdown(
        counts,
        active_position_summaries,
        pending_order_summaries,
    )
    previous_opinion = summarize_previous_opinion(
        latest_previous_opinion(db, symbol, CANONICAL_AI_LOCALE, interval_start)
    )
    return LeagueSentimentPayload(
        symbol=symbol,
        locale=locale,
        generatedAt=iso_utc(now) or "",
        intervalStart=iso_utc(interval_start) or "",
        intervalEnd=iso_utc(interval_end) or "",
        market=market,
        sourceCounts=counts,
        activePositions=active_position_summaries[:40],
        pendingOrders=pending_order_summaries[:40],
        recentClosedPositions=closed_position_summaries[:40],
        recentTradeEvents=event_summaries[:80],
        recentEntryReviews=entry_review_summaries[:60],
        recentManagementReviews=management_review_summaries[:60],
        longShortContext=long_short_context(active_position_summaries, pending_order_summaries),
        sourceBreakdown=breakdown,
        dataFreshness=data_freshness(
            now=now,
            generated_at=iso_utc(now) or "",
            market=market,
            active_positions=active_position_summaries,
            pending_orders=pending_order_summaries,
            closed_positions=closed_position_summaries,
            events=event_summaries,
            entry_reviews=entry_review_summaries_raw,
            management_reviews=management_review_summaries_raw,
        ),
        evidenceRefs=evidence_refs,
        derivedSignals=derived_signals(
            active_positions=active_position_summaries,
            pending_orders=pending_order_summaries,
            counts=counts,
        ),
        previousOpinion=previous_opinion,
    )


def list_active_positions(db: Session, symbol: str) -> list[PaperPositionRecord]:
    return db.execute(
        select(PaperPositionRecord)
        .where(
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status.in_(ACTIVE_POSITION_STATUSES),
        )
        .order_by(desc(PaperPositionRecord.updated_at), desc(PaperPositionRecord.opened_at), desc(PaperPositionRecord.id))
        .limit(80)
    ).scalars().all()


def list_pending_orders(db: Session, symbol: str) -> list[PaperOrderRecord]:
    return db.execute(
        select(PaperOrderRecord)
        .where(
            PaperOrderRecord.symbol == symbol,
            PaperOrderRecord.status.in_(ACTIVE_ORDER_STATUSES),
        )
        .order_by(desc(PaperOrderRecord.submitted_at), desc(PaperOrderRecord.id))
        .limit(80)
    ).scalars().all()


def list_recent_closed_positions(db: Session, symbol: str, cutoff: datetime) -> list[PaperPositionRecord]:
    return db.execute(
        select(PaperPositionRecord)
        .where(
            PaperPositionRecord.symbol == symbol,
            PaperPositionRecord.status == "closed",
            PaperPositionRecord.closed_at >= cutoff,
        )
        .order_by(desc(PaperPositionRecord.closed_at), desc(PaperPositionRecord.id))
        .limit(80)
    ).scalars().all()


def list_recent_trade_events(db: Session, symbol: str, cutoff: datetime) -> list[TradeEventRecord]:
    return db.execute(
        select(TradeEventRecord)
        .where(
            TradeEventRecord.symbol == symbol,
            TradeEventRecord.created_at >= cutoff,
            TradeEventRecord.event_type.in_(RECENT_TRADE_EVENT_TYPES),
        )
        .order_by(desc(TradeEventRecord.created_at), desc(TradeEventRecord.id))
        .limit(120)
    ).scalars().all()


def list_recent_entry_reviews(db: Session, symbol: str, cutoff: datetime) -> list[AIReviewRecord]:
    return db.execute(
        select(AIReviewRecord)
        .where(
            AIReviewRecord.symbol == symbol,
            AIReviewRecord.created_at >= cutoff,
            AIReviewRecord.status == "ok",
            AIReviewRecord.fallback.is_(False),
        )
        .order_by(desc(AIReviewRecord.created_at), desc(AIReviewRecord.id))
        .limit(100)
    ).scalars().all()


def list_recent_management_reviews(db: Session, symbol: str, cutoff: datetime) -> list[PositionManagementReviewRecord]:
    return db.execute(
        select(PositionManagementReviewRecord)
        .where(
            PositionManagementReviewRecord.symbol == symbol,
            PositionManagementReviewRecord.created_at >= cutoff,
            PositionManagementReviewRecord.status == "ok",
            PositionManagementReviewRecord.fallback.is_(False),
            PositionManagementReviewRecord.error_message.is_(None),
        )
        .order_by(desc(PositionManagementReviewRecord.created_at), desc(PositionManagementReviewRecord.id))
        .limit(100)
    ).scalars().all()


def latest_market_context(db: Session, symbol: str) -> dict[str, Any]:
    record = db.execute(
        select(MarketSnapshotRecord)
        .where(MarketSnapshotRecord.symbol == symbol)
        .order_by(desc(MarketSnapshotRecord.created_at), desc(MarketSnapshotRecord.id))
        .limit(1)
    ).scalar_one_or_none()
    if record is None:
        return {"symbol": symbol, "price": None, "updatedAt": None, "dataAvailable": False}
    payload = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(payload, dict):
        payload = {}
    return {
        "symbol": symbol,
        "price": numeric(payload.get("price")) or numeric(record.price),
        "updatedAt": iso_utc(record.created_at),
        "dataAvailable": True,
        "marketRegime": payload.get("marketRegime") or {},
        "timeframes": compact_timeframes(payload.get("timeframes") or {}),
        "derivatives": payload.get("derivatives") or {},
    }


def compact_timeframes(timeframes: dict[str, Any]) -> dict[str, Any]:
    allowed = {"close", "ema20", "ema50", "ema200", "rsi14", "atr14", "volumeZscore", "trend", "adx14"}
    compact: dict[str, Any] = {}
    for timeframe, values in timeframes.items():
        if not isinstance(values, dict):
            continue
        compact[str(timeframe)] = {key: values.get(key) for key in allowed if values.get(key) is not None}
    return compact


def summarize_position(record: PaperPositionRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    return {
        "id": record.id,
        "orderId": record.order_id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "side": side_label(record.side),
        "status": record.status,
        "quantity": numeric(record.quantity),
        "entryPrice": numeric(record.entry_price),
        "takeProfit": numeric(record.take_profit_price),
        "stopLoss": numeric(record.stop_loss_price),
        "leverage": numeric(record.leverage),
        "notional": numeric(record.notional),
        "margin": numeric(record.margin),
        "unrealizedPnl": numeric(record.unrealized_pnl),
        "openedAt": iso_utc(record.opened_at),
        "updatedAt": iso_utc(record.updated_at),
    }


def summarize_order(record: PaperOrderRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    return {
        "id": record.id,
        "positionId": record.position_id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "side": side_label(record.side),
        "status": record.status,
        "orderType": record.order_type,
        "quantity": numeric(record.quantity),
        "limitPrice": numeric(record.limit_price),
        "takeProfit": numeric(record.take_profit_price),
        "stopLoss": numeric(record.stop_loss_price),
        "leverage": numeric(record.leverage),
        "notional": numeric(record.notional),
        "margin": numeric(record.margin),
        "submittedAt": iso_utc(record.submitted_at),
        "updatedAt": iso_utc(record.updated_at),
    }


def summarize_closed_position(record: PaperPositionRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    return {
        "id": record.id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "side": side_label(record.side),
        "closeReason": record.close_reason,
        "entryPrice": numeric(record.entry_price),
        "exitPrice": numeric(record.exit_price),
        "realizedPnl": numeric(record.realized_pnl),
        "leverage": numeric(record.leverage),
        "openedAt": iso_utc(record.opened_at),
        "closedAt": iso_utc(record.closed_at),
    }


def summarize_trade_event(record: TradeEventRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    payload = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(payload, dict):
        payload = {}
    return {
        "id": record.id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "eventType": record.event_type,
        "side": side_label(payload.get("side")),
        "price": numeric(record.price),
        "quantity": numeric(record.quantity),
        "realizedPnl": numeric(record.realized_pnl),
        "reason": first_text(payload, ("reason", "message", "closeReason")),
        "createdAt": iso_utc(record.created_at),
    }


def summarize_entry_review(record: AIReviewRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    payload = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(payload, dict):
        payload = {}
    return {
        "id": record.id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "decision": record.decision,
        "confidence": record.confidence,
        "riskLevel": record.risk_level,
        "headline": review_text(payload, ("headline", "approvalReason", "rationale")),
        "action": review_text(payload, ("action", "counterThesis")),
        "createdAt": iso_utc(record.created_at),
    }


def summarize_management_review(record: PositionManagementReviewRecord, trader_names: dict[str, str]) -> dict[str, Any]:
    payload = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(payload, dict):
        payload = {}
    review = payload.get("review") if isinstance(payload.get("review"), dict) else {}
    exposure = payload.get("exposure") if isinstance(payload.get("exposure"), dict) else {}
    return {
        "id": record.id,
        "traderId": record.trader_id,
        "traderName": trader_names.get(str(record.trader_id), record.trader_id),
        "phase": record.phase,
        "decision": record.decision,
        "action": record.action_type,
        "confidence": record.confidence,
        "riskLevel": review.get("riskLevel") or payload.get("riskLevel"),
        "side": side_label(exposure.get("side")),
        "entryPrice": numeric(exposure.get("entryPrice")),
        "currentPrice": numeric(exposure.get("currentPrice")),
        "headline": review_text(review, ("headline", "rationale", "reason")),
        "nextAction": review_text(review, ("action",)),
        "createdAt": iso_utc(record.created_at),
    }


def source_counts(
    positions: list[dict[str, Any]],
    orders: list[dict[str, Any]],
    closed: list[dict[str, Any]],
    events: list[dict[str, Any]],
    entry_reviews: list[dict[str, Any]],
    management_reviews: list[dict[str, Any]],
) -> dict[str, int]:
    def count_side(records: list[dict[str, Any]], side: str) -> int:
        return sum(1 for record in records if record.get("side") == side)

    closed_take_profits = sum(1 for item in closed if closed_outcome(item) == "take_profit")
    closed_stop_losses = sum(1 for item in closed if closed_outcome(item) == "stop_loss")
    event_take_profits = sum(1 for item in events if str(item.get("eventType") or "").lower() in {"take_profit", "take_partial_profit"})
    event_stop_losses = sum(1 for item in events if str(item.get("eventType") or "").lower() == "stop_loss")
    take_profits = closed_take_profits if closed else event_take_profits
    stop_losses = closed_stop_losses if closed else event_stop_losses
    return {
        "activePositions": len(positions),
        "activeLongPositions": count_side(positions, "LONG"),
        "activeShortPositions": count_side(positions, "SHORT"),
        "pendingOrders": len(orders),
        "pendingLongOrders": count_side(orders, "LONG"),
        "pendingShortOrders": count_side(orders, "SHORT"),
        "recentClosedPositions": len(closed),
        "recentTradeEvents": len(events),
        "recentTakeProfits": take_profits,
        "recentStopLosses": stop_losses,
        "recentEntryReviews": len(entry_reviews),
        "recentApprovedEntryReviews": sum(1 for item in entry_reviews if str(item.get("decision") or "").upper() in {"APPROVE", "ADJUST_AND_APPROVE"}),
        "recentRejectedEntryReviews": sum(1 for item in entry_reviews if str(item.get("decision") or "").upper() == "REJECT"),
        "recentManagementReviews": len(management_reviews),
    }


def closed_outcome(item: dict[str, Any]) -> str:
    reason = str(item.get("closeReason") or "").lower()
    pnl = numeric(item.get("realizedPnl"))
    if reason == "take_profit" or (pnl is not None and pnl > 0):
        return "take_profit"
    if reason == "stop_loss" or (pnl is not None and pnl < 0):
        return "stop_loss"
    return "breakeven"


def long_short_context(positions: list[dict[str, Any]], orders: list[dict[str, Any]]) -> dict[str, Any]:
    long_notional = sum(float(item.get("notional") or 0) for item in positions + orders if item.get("side") == "LONG")
    short_notional = sum(float(item.get("notional") or 0) for item in positions + orders if item.get("side") == "SHORT")
    return {
        "longExposureCount": sum(1 for item in positions + orders if item.get("side") == "LONG"),
        "shortExposureCount": sum(1 for item in positions + orders if item.get("side") == "SHORT"),
        "longNotional": round(long_notional, 4),
        "shortNotional": round(short_notional, 4),
        "dominantSide": "LONG" if long_notional > short_notional else "SHORT" if short_notional > long_notional else "BALANCED",
    }


def add_source_refs(records: list[dict[str, Any]], source_prefix: str) -> list[dict[str, Any]]:
    enriched: list[dict[str, Any]] = []
    for index, item in enumerate(records):
        record_id = item.get("id")
        ref_id = f"{source_prefix}:{record_id if record_id not in {None, ''} else index}"
        enriched.append({**item, "sourceRef": ref_id})
    return enriched


def dedupe_latest_summaries(records: list[dict[str, Any]], key_fields: tuple[str, ...]) -> list[dict[str, Any]]:
    seen: set[tuple[Any, ...]] = set()
    deduped: list[dict[str, Any]] = []
    for item in records:
        key = tuple(item.get(field) or "" for field in key_fields)
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
    return deduped


def add_exposure_distances(
    records: list[dict[str, Any]],
    market: dict[str, Any],
    *,
    price_key: str = "entryPrice",
) -> list[dict[str, Any]]:
    market_price = numeric(market.get("price"))
    enriched: list[dict[str, Any]] = []
    for item in records:
        current_price = market_price or numeric(item.get("currentPrice")) or numeric(item.get(price_key))
        if current_price is None or current_price <= 0:
            enriched.append(item)
            continue
        side = item.get("side")
        take_profit = numeric(item.get("takeProfit"))
        stop_loss = numeric(item.get("stopLoss"))
        enriched.append(
            {
                **item,
                "distanceToTakeProfitPct": price_distance_pct(side, current_price, take_profit, favorable=True),
                "distanceToStopLossPct": price_distance_pct(side, current_price, stop_loss, favorable=False),
            }
        )
    return enriched


def price_distance_pct(side: Any, current_price: float, target_price: Optional[float], *, favorable: bool) -> Optional[float]:
    if target_price is None or current_price <= 0:
        return None
    side_value = side_label(side)
    if side_value == "SHORT":
        distance = current_price - target_price if favorable else target_price - current_price
    else:
        distance = target_price - current_price if favorable else current_price - target_price
    return round((distance / current_price) * 100, 4)


def source_breakdown(
    counts: dict[str, int],
    active_positions: list[dict[str, Any]],
    pending_orders: list[dict[str, Any]],
) -> dict[str, Any]:
    active_context = exposure_group(active_positions)
    pending_context = exposure_group(pending_orders)
    return {
        "activeExposure": {
            **active_context,
            "total": int(counts.get("activePositions", 0)),
            "long": int(counts.get("activeLongPositions", 0)),
            "short": int(counts.get("activeShortPositions", 0)),
        },
        "pendingOrders": {
            **pending_context,
            "total": int(counts.get("pendingOrders", 0)),
            "long": int(counts.get("pendingLongOrders", 0)),
            "short": int(counts.get("pendingShortOrders", 0)),
        },
        "recentOutcomes": {
            "closedPositions": int(counts.get("recentClosedPositions", 0)),
            "tradeEvents": int(counts.get("recentTradeEvents", 0)),
            "takeProfits": int(counts.get("recentTakeProfits", 0)),
            "stopLosses": int(counts.get("recentStopLosses", 0)),
        },
        "aiReviews": {
            "entry": int(counts.get("recentEntryReviews", 0)),
            "approvedEntry": int(counts.get("recentApprovedEntryReviews", 0)),
            "rejectedEntry": int(counts.get("recentRejectedEntryReviews", 0)),
            "management": int(counts.get("recentManagementReviews", 0)),
        },
    }


def exposure_group(records: list[dict[str, Any]]) -> dict[str, Any]:
    long_notional = sum(float(item.get("notional") or 0) for item in records if item.get("side") == "LONG")
    short_notional = sum(float(item.get("notional") or 0) for item in records if item.get("side") == "SHORT")
    return {
        "longNotional": round(long_notional, 4),
        "shortNotional": round(short_notional, 4),
        "dominantSide": "LONG" if long_notional > short_notional else "SHORT" if short_notional > long_notional else "BALANCED",
    }


def data_freshness(
    *,
    now: datetime,
    generated_at: str,
    market: dict[str, Any],
    active_positions: list[dict[str, Any]],
    pending_orders: list[dict[str, Any]],
    closed_positions: list[dict[str, Any]],
    events: list[dict[str, Any]],
    entry_reviews: list[dict[str, Any]],
    management_reviews: list[dict[str, Any]],
) -> dict[str, Any]:
    latest_outcome_at = latest_timestamp(closed_positions + events, ("closedAt", "createdAt"))
    market_updated_at = parse_iso_datetime(market.get("updatedAt"))
    latest_active_position_at = latest_timestamp(active_positions, ("updatedAt", "openedAt"))
    latest_pending_order_at = latest_timestamp(pending_orders, ("updatedAt", "submittedAt"))
    latest_entry_review_at = latest_timestamp(entry_reviews, ("createdAt",))
    latest_management_review_at = latest_timestamp(management_reviews, ("createdAt",))
    return {
        "generatedAt": generated_at,
        "marketUpdatedAt": iso_utc(market_updated_at),
        "marketAgeMinutes": age_minutes(now, market_updated_at),
        "latestActivePositionAt": iso_utc(latest_active_position_at),
        "latestActivePositionAgeMinutes": age_minutes(now, latest_active_position_at),
        "latestPendingOrderAt": iso_utc(latest_pending_order_at),
        "latestPendingOrderAgeMinutes": age_minutes(now, latest_pending_order_at),
        "latestOutcomeAt": iso_utc(latest_outcome_at),
        "latestOutcomeAgeMinutes": age_minutes(now, latest_outcome_at),
        "latestEntryReviewAt": iso_utc(latest_entry_review_at),
        "latestEntryReviewAgeMinutes": age_minutes(now, latest_entry_review_at),
        "latestManagementReviewAt": iso_utc(latest_management_review_at),
        "latestManagementReviewAgeMinutes": age_minutes(now, latest_management_review_at),
    }


def derived_signals(
    *,
    active_positions: list[dict[str, Any]],
    pending_orders: list[dict[str, Any]],
    counts: dict[str, int],
) -> dict[str, Any]:
    active = long_short_context(active_positions, [])
    pending = long_short_context([], pending_orders)
    total_reviews = int(counts.get("recentEntryReviews", 0)) + int(counts.get("recentManagementReviews", 0))
    total_outcomes = int(counts.get("recentTakeProfits", 0)) + int(counts.get("recentStopLosses", 0))
    return {
        "activeExposure": {
            **active,
            "concentration": exposure_concentration(active_positions),
        },
        "pendingIntent": pending,
        "recentOutcomeBalance": {
            "takeProfits": int(counts.get("recentTakeProfits", 0)),
            "stopLosses": int(counts.get("recentStopLosses", 0)),
            "sampleSize": total_outcomes,
        },
        "aiReviewVolume": {
            "total": total_reviews,
            "entry": int(counts.get("recentEntryReviews", 0)),
            "management": int(counts.get("recentManagementReviews", 0)),
        },
    }


def exposure_concentration(records: list[dict[str, Any]]) -> dict[str, Any]:
    total = sum(float(item.get("notional") or 0) for item in records)
    if total <= 0:
        return {"topTraderId": None, "topSharePct": None}
    by_trader: dict[str, float] = {}
    for item in records:
        trader_id = str(item.get("traderId") or "unknown")
        by_trader[trader_id] = by_trader.get(trader_id, 0.0) + float(item.get("notional") or 0)
    top_trader, top_value = max(by_trader.items(), key=lambda entry: entry[1])
    return {"topTraderId": top_trader, "topSharePct": round((top_value / total) * 100, 2)}


def build_evidence_refs(*groups: list[dict[str, Any]]) -> list[dict[str, Any]]:
    refs: list[dict[str, Any]] = []
    seen: set[str] = set()
    for group in groups:
        for item in group:
            ref_id = item.get("sourceRef")
            if not ref_id or ref_id in seen:
                continue
            seen.add(str(ref_id))
            source_type = evidence_source_type(str(ref_id))
            refs.append(
                {
                    "id": str(ref_id),
                    "sourceType": source_type,
                    "label": evidence_label(source_type, item),
                    "traderId": item.get("traderId"),
                    "traderName": item.get("traderName"),
                    "side": item.get("side"),
                    "price": numeric(item.get("entryPrice"))
                    or numeric(item.get("limitPrice"))
                    or numeric(item.get("currentPrice"))
                    or numeric(item.get("price")),
                    "timestamp": item.get("updatedAt")
                    or item.get("submittedAt")
                    or item.get("closedAt")
                    or item.get("createdAt")
                    or item.get("openedAt"),
                }
            )
            if len(refs) >= 12:
                return refs
    return refs


def evidence_source_type(ref_id: str) -> str:
    prefix = ref_id.split(":", 1)[0]
    return {
        "position": "active_position",
        "order": "pending_order",
        "closed_position": "closed_position",
        "event": "trade_event",
        "entry_review": "entry_review",
        "management_review": "management_review",
    }.get(prefix, "source")


def evidence_label(source_type: str, item: dict[str, Any]) -> str:
    trader = item.get("traderName") or item.get("traderId") or "Unknown trader"
    side = item.get("side")
    decision = item.get("decision") or item.get("eventType") or item.get("closeReason")
    price = numeric(item.get("entryPrice")) or numeric(item.get("limitPrice")) or numeric(item.get("currentPrice")) or numeric(item.get("price"))
    pieces = [str(trader), source_type.replace("_", " ")]
    if side:
        pieces.append(str(side))
    if decision:
        pieces.append(str(decision))
    if price is not None:
        pieces.append(f"@ {price:g}")
    return " ".join(pieces)


def trusted_evidence_refs(
    opinion_refs: list[dict[str, Any]],
    payload_refs: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    known = {str(ref.get("id")): ref for ref in payload_refs if ref.get("id")}
    trusted = [known[str(ref.get("id"))] for ref in opinion_refs if str(ref.get("id")) in known]
    return trusted[:8] if trusted else payload_refs[:8]


def latest_timestamp(records: list[dict[str, Any]], keys: tuple[str, ...]) -> Optional[datetime]:
    values: list[datetime] = []
    for item in records:
        for key in keys:
            parsed = parse_iso_datetime(item.get(key))
            if parsed is not None:
                values.append(parsed)
                break
    return max(values) if values else None


def parse_iso_datetime(value: Any) -> Optional[datetime]:
    if not value:
        return None
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return ensure_utc(parsed)


def age_minutes(now: datetime, value: Optional[datetime]) -> Optional[int]:
    if value is None:
        return None
    return max(0, int((ensure_utc(now) - ensure_utc(value)).total_seconds() // 60))


def summarize_previous_opinion(record: Optional[LeagueSentimentOpinionRecord]) -> Optional[dict[str, Any]]:
    if record is None:
        return None
    opinion = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(opinion, dict):
        opinion = {}
    return {
        "intervalStart": iso_utc(record.interval_start),
        "intervalEnd": iso_utc(record.interval_end),
        "createdAt": iso_utc(record.created_at),
        "bias": opinion.get("bias") or record.bias,
        "confidence": opinion.get("confidence") or record.confidence,
        "riskLevel": opinion.get("riskLevel") or record.risk_level,
        "headline": opinion.get("headline"),
    }


def fallback_league_sentiment_translations(
    *,
    long_count: int,
    short_count: int,
    take_profits: int,
    stop_losses: int,
) -> dict[str, dict[str, Any]]:
    return {
        "en": {
            "confidenceReason": "Confidence is capped because only verified counts and freshness metadata were available.",
            "brief": {
                "conclusion": "Check active setup invalidation before reading a new direction.",
                "reason": f"Verified exposure shows LONG {long_count} versus SHORT {short_count}, so directional confidence is limited.",
                "watch": "Before the next generation, watch fills plus take-profit and stop-loss changes first.",
            },
            "headline": "Check active setup invalidation before reading a new direction.",
            "summary": f"Verified exposure shows LONG {long_count} versus SHORT {short_count}, so directional confidence is limited.",
            "keyDrivers": [f"LONG {long_count} / SHORT {short_count} shows which side has more active or planned exposure."],
            "risks": ["Treating pending entries like filled exposure can overstate direction."],
            "watchConditions": ["Check whether active side counts or take-profit and stop-loss events change before the next generation."],
            "action": "Before the next generation, watch fills plus take-profit and stop-loss changes first.",
            "longShortContext": f"LONG {long_count} / SHORT {short_count}; recent take-profit {take_profits} / stop-loss {stop_losses}.",
        },
        "ko": {
            "confidenceReason": "검증된 집계와 데이터 신선도만 사용할 수 있어 신뢰도를 제한했습니다.",
            "brief": {
                "conclusion": "새 방향보다 활성 셋업의 무효화 조건을 먼저 볼 구간입니다.",
                "reason": f"검증된 노출 기준 LONG {long_count}건, SHORT {short_count}건이라 방향 신뢰도가 제한됩니다.",
                "watch": "다음 생성 전까지 체결 변화와 익절/손절 이벤트를 먼저 확인하세요.",
            },
            "headline": "새 방향보다 활성 셋업의 무효화 조건을 먼저 볼 구간입니다.",
            "summary": f"검증된 노출 기준 LONG {long_count}건, SHORT {short_count}건이라 방향 신뢰도가 제한됩니다.",
            "keyDrivers": [f"LONG {long_count}건 / SHORT {short_count}건은 리그가 어느 쪽에 리스크를 준비하거나 보유 중인지 보여줍니다."],
            "risks": ["진입 대기 주문을 체결 포지션처럼 해석하면 방향성이 과장될 수 있습니다."],
            "watchConditions": ["다음 생성 전까지 활성 방향 수와 익절/손절 이벤트가 바뀌는지 확인하세요."],
            "action": "다음 생성 전까지 체결 변화와 익절/손절 이벤트를 먼저 확인하세요.",
            "longShortContext": f"LONG {long_count}건 / SHORT {short_count}건, 최근 익절 {take_profits}건 / 손절 {stop_losses}건입니다.",
        },
        "ru": {
            "confidenceReason": "Уверенность ограничена, потому что доступны только проверенные счетчики и свежесть данных.",
            "brief": {
                "conclusion": "Сначала проверьте зоны отмены активных сетапов, а не новый импульс.",
                "reason": f"Проверенная экспозиция: LONG {long_count} против SHORT {short_count}, поэтому направленная уверенность ограничена.",
                "watch": "До следующей генерации следите за исполнениями, take-profit и stop-loss событиями.",
            },
            "headline": "Сначала проверьте зоны отмены активных сетапов, а не новый импульс.",
            "summary": f"Проверенная экспозиция: LONG {long_count} против SHORT {short_count}, поэтому направленная уверенность ограничена.",
            "keyDrivers": [f"LONG {long_count} / SHORT {short_count} показывает, где у лиги активный или планируемый риск."],
            "risks": ["Ожидающие входы могут преувеличить перекос, если считать их уже исполненной экспозицией."],
            "watchConditions": ["Проверьте, меняются ли активные стороны, take-profit или stop-loss события до следующей генерации."],
            "action": "До следующей генерации следите за исполнениями, take-profit и stop-loss событиями.",
            "longShortContext": f"LONG {long_count} / SHORT {short_count}; недавние take-profit {take_profits} / stop-loss {stop_losses}.",
        },
        "pt-BR": {
            "confidenceReason": "A confiança fica limitada porque só havia contagens verificadas e frescor dos dados.",
            "brief": {
                "conclusion": "Confira primeiro as áreas de invalidação dos setups ativos antes de ler nova direção.",
                "reason": f"A exposição verificada mostra LONG {long_count} contra SHORT {short_count}, então a convicção direcional é limitada.",
                "watch": "Até a próxima geração, acompanhe execuções e eventos de take-profit e stop-loss.",
            },
            "headline": "Confira primeiro as áreas de invalidação dos setups ativos antes de ler nova direção.",
            "summary": f"A exposição verificada mostra LONG {long_count} contra SHORT {short_count}, então a convicção direcional é limitada.",
            "keyDrivers": [f"LONG {long_count} / SHORT {short_count} mostra onde a liga tem exposição ativa ou planejada."],
            "risks": ["Entradas pendentes podem exagerar o viés se forem lidas como exposição já executada."],
            "watchConditions": ["Veja se as contagens ativas ou eventos de take-profit e stop-loss mudam antes da próxima geração."],
            "action": "Até a próxima geração, acompanhe execuções e eventos de take-profit e stop-loss.",
            "longShortContext": f"LONG {long_count} / SHORT {short_count}; take-profit recente {take_profits} / stop-loss {stop_losses}.",
        },
        "tr": {
            "confidenceReason": "Güven, yalnızca doğrulanmış sayımlar ve veri tazeliği kullanılabildiği için sınırlı tutuldu.",
            "brief": {
                "conclusion": "Yeni yön okumadan önce aktif kurulumların geçersizleşme alanlarını kontrol edin.",
                "reason": f"Doğrulanmış maruziyet LONG {long_count} ve SHORT {short_count} gösteriyor, bu yüzden yön güveni sınırlı.",
                "watch": "Bir sonraki üretime kadar gerçekleşen emirleri, take-profit ve stop-loss olaylarını izleyin.",
            },
            "headline": "Yeni yön okumadan önce aktif kurulumların geçersizleşme alanlarını kontrol edin.",
            "summary": f"Doğrulanmış maruziyet LONG {long_count} ve SHORT {short_count} gösteriyor, bu yüzden yön güveni sınırlı.",
            "keyDrivers": [f"LONG {long_count} / SHORT {short_count}, ligde aktif veya planlanan riskin hangi tarafta olduğunu gösterir."],
            "risks": ["Bekleyen girişleri gerçekleşmiş maruziyet gibi okumak yön eğilimini abartabilir."],
            "watchConditions": ["Sonraki üretimden önce aktif taraf sayıları veya take-profit ve stop-loss olayları değişiyor mu kontrol edin."],
            "action": "Bir sonraki üretime kadar gerçekleşen emirleri, take-profit ve stop-loss olaylarını izleyin.",
            "longShortContext": f"LONG {long_count} / SHORT {short_count}; son take-profit {take_profits} / stop-loss {stop_losses}.",
        },
    }


def fallback_league_sentiment_opinion(payload: LeagueSentimentPayload) -> LeagueSentimentOpinionResult:
    counts = payload.sourceCounts
    long_count = int(counts.get("activeLongPositions", 0)) + int(counts.get("pendingLongOrders", 0))
    short_count = int(counts.get("activeShortPositions", 0)) + int(counts.get("pendingShortOrders", 0))
    stop_losses = int(counts.get("recentStopLosses", 0))
    take_profits = int(counts.get("recentTakeProfits", 0))
    if stop_losses >= max(2, take_profits + 2):
        bias = "RISK_OFF"
        risk = "HIGH"
    elif long_count > short_count:
        bias = "LONG_BIASED"
        risk = "MEDIUM"
    elif short_count > long_count:
        bias = "SHORT_BIASED"
        risk = "MEDIUM"
    elif long_count or short_count:
        bias = "MIXED"
        risk = "MEDIUM"
    else:
        bias = "NEUTRAL"
        risk = "LOW"
    translations = fallback_league_sentiment_translations(
        long_count=long_count,
        short_count=short_count,
        take_profits=take_profits,
        stop_losses=stop_losses,
    )
    localized = translations.get(normalize_locale(payload.locale), translations["en"])
    return LeagueSentimentOpinionResult(
        bias=bias,
        confidence=45 if bias in {"NEUTRAL", "MIXED"} else 58,
        riskLevel=risk,
        confidenceReason=localized["confidenceReason"],
        brief=localized["brief"],
        headline=localized["headline"],
        summary=localized["summary"],
        keyDrivers=localized["keyDrivers"],
        risks=localized["risks"],
        watchConditions=localized["watchConditions"],
        action=localized["action"],
        longShortContext=localized["longShortContext"],
        sourceCounts=dict(counts),
        sourceBreakdown=dict(payload.sourceBreakdown),
        dataFreshness=dict(payload.dataFreshness),
        evidenceRefs=payload.evidenceRefs[:8],
        invalidatesAt=payload.intervalEnd,
        provider="system",
        model="safe-hourly-fallback",
        fallback=True,
        translations=translations,
    )


def serialize_league_sentiment_record(
    db: Session,
    record: LeagueSentimentOpinionRecord,
    *,
    cache_hit: bool,
    locale: str,
    stale: bool = False,
    next_refresh_at: Optional[datetime] = None,
    now: Optional[datetime] = None,
) -> dict[str, Any]:
    opinion = from_json(record.payload_json) if record.payload_json else {}
    if not isinstance(opinion, dict):
        opinion = {}
    localized_opinion, translation_meta = embedded_league_sentiment_locale_payload(opinion, locale)
    if localized_opinion is None:
        localized_opinion, translation_meta = localized_payload_for_source(
            db,
            source_type=AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
            source_id=record.id,
            payload=opinion,
            locale=locale,
        )
    if isinstance(localized_opinion, dict):
        localized_opinion = dict(localized_opinion)
        localized_opinion.pop("dataQuality", None)
        localized_opinion = ensure_compact_brief_payload(localized_opinion)
    reference_now = ensure_utc(now or utc_now())
    refresh_at = ensure_utc(next_refresh_at or record.interval_end)
    refresh_overdue_minutes = max(0, int((reference_now - refresh_at).total_seconds() // 60))
    opinion_anchor = record.created_at or record.interval_start
    opinion_age_minutes = max(0, int((reference_now - ensure_utc(opinion_anchor)).total_seconds() // 60))
    return {
        "id": record.id,
        "symbol": record.symbol,
        "locale": locale,
        "sourceLocale": record.locale,
        "status": record.status,
        "intervalStart": iso_utc(record.interval_start),
        "intervalEnd": iso_utc(record.interval_end),
        "createdAt": iso_utc(record.created_at),
        "updatedAt": iso_utc(record.updated_at),
        "cacheHit": cache_hit,
        "stale": stale,
        "staleReason": "previous_interval" if stale else None,
        "refreshOverdue": refresh_overdue_minutes > 0,
        "refreshOverdueMinutes": refresh_overdue_minutes,
        "opinionAgeMinutes": opinion_age_minutes,
        "nextRefreshAt": iso_utc(refresh_at),
        "translation": translation_meta,
        "opinion": localized_opinion,
    }


def numeric(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def side_label(value: Any) -> Optional[str]:
    normalized = str(value or "").strip().upper()
    if normalized in {"LONG", "BUY"}:
        return "LONG"
    if normalized in {"SHORT", "SELL"}:
        return "SHORT"
    return normalized or None


def first_text(source: dict[str, Any], keys: tuple[str, ...]) -> Optional[str]:
    for key in keys:
        value = source.get(key)
        if value not in {None, ""}:
            return str(value)
    return None


def review_text(payload: dict[str, Any], keys: tuple[str, ...]) -> Optional[str]:
    structured = payload.get("structuredReview") if isinstance(payload.get("structuredReview"), dict) else {}
    for key in keys:
        value = structured.get(key)
        if value not in {None, ""}:
            return str(value)
    return first_text(payload, keys)
