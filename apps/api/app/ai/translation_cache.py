import hashlib
import json
import re
from typing import Any

from sqlalchemy.orm import Session

from app.ai.translation_provider import AITranslationProvider, translate_json_with_logging
from app.core.config import Settings
from app.locales import AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT, CANONICAL_AI_LOCALE, NON_CANONICAL_AI_LOCALES, normalize_locale
from app.repositories import (
    from_json,
    get_successful_translation_by_hash,
    get_translation_cache_record,
    sanitize_error_message,
    upsert_translation_cache_record,
)


PROTECTED_KEYS = {
    "id",
    "symbol",
    "traderId",
    "trader_id",
    "sourceType",
    "sourceId",
    "sourceHash",
    "locale",
    "provider",
    "model",
    "fallback",
    "decision",
    "type",
    "riskLevel",
    "reviewCode",
    "reviewFacts",
    "riskFlags",
    "labelKey",
    "code",
    "severity",
    "status",
    "phase",
    "side",
    "bias",
    "sourceCounts",
    "confidence",
    "quantityFraction",
    "price",
    "entryPrice",
    "limitPrice",
    "stopLoss",
    "takeProfit",
    "leverage",
    "nextReviewInSeconds",
    "riskChange",
    "createdAt",
    "updatedAt",
    "generatedAt",
    "stateKey",
    "eventType",
    "feedType",
    "refreshReason",
    "sourceType",
    "sourceId",
    "mood",
    "stance",
    "intervalStart",
    "intervalEnd",
}
LEAGUE_SENTIMENT_BANNED_TERMS = (
    ("페이퍼 트레이딩", "시뮬레이션"),
    ("paper-trading", "simulation"),
    ("paper trading", "simulation"),
    ("paper league", "simulation league"),
)


class TranslationShapeError(ValueError):
    pass


def stable_source_hash(payload: dict[str, Any]) -> str:
    canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def localized_payload_for_source(
    db: Session,
    *,
    source_type: str,
    source_id: int | None,
    payload: dict[str, Any],
    locale: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    requested_locale = normalize_locale(locale)
    if requested_locale == CANONICAL_AI_LOCALE or source_id is None:
        return payload, {"status": "canonical", "locale": CANONICAL_AI_LOCALE}
    source_hash = stable_source_hash(payload)
    record = get_translation_cache_record(
        db,
        source_type=source_type,
        source_id=int(source_id),
        source_hash=source_hash,
        locale=requested_locale,
    )
    if record is None:
        return payload, {"status": "missing", "locale": requested_locale, "fallbackLocale": CANONICAL_AI_LOCALE}
    cached_payload = from_json(record.payload_json)
    if isinstance(cached_payload, dict) and record.status == "ok":
        return scrub_translation_payload_for_source(source_type, cached_payload), {"status": "ok", "locale": requested_locale, "sourceHash": source_hash}
    return payload, {
        "status": record.status or "fallback",
        "locale": requested_locale,
        "fallbackLocale": CANONICAL_AI_LOCALE,
        "sourceHash": source_hash,
    }


async def fanout_ai_translations(
    db: Session,
    *,
    settings: Settings,
    source_type: str,
    source_id: int | None,
    payload: dict[str, Any],
    symbol: str | None = None,
    trader_id: str | None = None,
    provider: AITranslationProvider | None = None,
) -> None:
    if source_id is None:
        return
    source_hash = stable_source_hash(payload)
    locales = tuple(
        locale
        for locale in (normalize_locale(item) for item in getattr(settings, "ai_translation_target_locales", NON_CANONICAL_AI_LOCALES))
        if locale != CANONICAL_AI_LOCALE
    )
    for locale in locales or NON_CANONICAL_AI_LOCALES:
        existing = get_translation_cache_record(
            db,
            source_type=source_type,
            source_id=int(source_id),
            source_hash=source_hash,
            locale=locale,
        )
        if existing is not None and existing.status in {"ok", "fallback"}:
            continue
        reusable = get_successful_translation_by_hash(db, source_type=source_type, source_hash=source_hash, locale=locale)
        if reusable is not None:
            reusable_payload = from_json(reusable.payload_json)
            if isinstance(reusable_payload, dict):
                reusable_payload = scrub_translation_payload_for_source(source_type, reusable_payload)
                upsert_translation_cache_record(
                    db,
                    source_type=source_type,
                    source_id=int(source_id),
                    source_hash=source_hash,
                    locale=locale,
                    status="ok",
                    payload=reusable_payload,
                    provider=reusable.provider,
                    model=reusable.model,
                    symbol=symbol,
                    trader_id=trader_id,
                    raw=from_json(reusable.raw_json) if reusable.raw_json else None,
                )
                continue
        if not getattr(settings, "ai_translation_enabled", True):
            upsert_translation_cache_record(
                db,
                source_type=source_type,
                source_id=int(source_id),
                source_hash=source_hash,
                locale=locale,
                status="fallback",
                payload=scrub_translation_payload_for_source(source_type, payload),
                provider="system",
                model="translation-disabled",
                symbol=symbol,
                trader_id=trader_id,
                error_message="AI translation is disabled.",
            )
            continue
        if not getattr(settings, "openai_api_key", ""):
            upsert_translation_cache_record(
                db,
                source_type=source_type,
                source_id=int(source_id),
                source_hash=source_hash,
                locale=locale,
                status="fallback",
                payload=scrub_translation_payload_for_source(source_type, payload),
                provider="openai",
                model=getattr(settings, "openai_translation_model", "translation"),
                symbol=symbol,
                trader_id=trader_id,
                error_message="OPENAI_API_KEY is missing for AI translation.",
            )
            continue
        try:
            translated = await translate_json_with_logging(
                db,
                settings=settings,
                payload=payload,
                target_locale=locale,
                symbol=symbol,
                trader_id=trader_id,
                provider=provider,
            )
            safe_payload = merge_validated_translation(payload, translated)
            safe_payload = scrub_translation_payload_for_source(source_type, safe_payload)
            upsert_translation_cache_record(
                db,
                source_type=source_type,
                source_id=int(source_id),
                source_hash=source_hash,
                locale=locale,
                status="ok",
                payload=safe_payload,
                provider=getattr(provider, "name", "openai"),
                model=getattr(provider, "model", getattr(settings, "openai_translation_model", "translation")),
                symbol=symbol,
                trader_id=trader_id,
                raw={"translated": translated},
            )
        except Exception as exc:
            upsert_translation_cache_record(
                db,
                source_type=source_type,
                source_id=int(source_id),
                source_hash=source_hash,
                locale=locale,
                status="fallback",
                payload=scrub_translation_payload_for_source(source_type, payload),
                provider=getattr(provider, "name", "openai"),
                model=getattr(provider, "model", getattr(settings, "openai_translation_model", "translation")),
                symbol=symbol,
                trader_id=trader_id,
                error_message=sanitize_error_message(str(exc)),
            )


def merge_validated_translation(original: Any, translated: Any, path: tuple[str, ...] = ()) -> Any:
    if isinstance(original, dict):
        if not isinstance(translated, dict):
            raise TranslationShapeError(f"Expected object at {'.'.join(path) or '<root>'}.")
        if set(original.keys()) != set(translated.keys()):
            missing = sorted(set(original.keys()) - set(translated.keys()))
            extra = sorted(set(translated.keys()) - set(original.keys()))
            raise TranslationShapeError(f"Translation key mismatch at {'.'.join(path) or '<root>'}: missing={missing}, extra={extra}.")
        return {
            key: merge_validated_translation(value, translated[key], (*path, str(key)))
            for key, value in original.items()
        }
    if isinstance(original, list):
        if is_protected_path(path):
            return original
        if not isinstance(translated, list) or len(original) != len(translated):
            raise TranslationShapeError(f"Translation array mismatch at {'.'.join(path) or '<root>'}.")
        return [merge_validated_translation(item, translated[index], path) for index, item in enumerate(original)]
    if is_protected_path(path):
        return original
    if isinstance(original, str):
        if not isinstance(translated, str):
            raise TranslationShapeError(f"Expected string at {'.'.join(path) or '<root>'}.")
        return translated
    if translated != original:
        raise TranslationShapeError(f"Non-string value changed at {'.'.join(path) or '<root>'}.")
    return original


def is_protected_path(path: tuple[str, ...]) -> bool:
    if not path:
        return False
    return path[-1] in PROTECTED_KEYS or any(part in {"reviewFacts", "riskFlags", "sourceCounts"} for part in path)


def scrub_translation_payload_for_source(source_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    if source_type != AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT:
        return payload
    cleaned = scrub_league_sentiment_banned_terms(payload)
    return cleaned if isinstance(cleaned, dict) else payload


def scrub_league_sentiment_banned_terms(value: Any) -> Any:
    if isinstance(value, str):
        result = value
        for banned, replacement in LEAGUE_SENTIMENT_BANNED_TERMS:
            result = re.sub(re.escape(banned), replacement, result, flags=re.IGNORECASE)
        return result
    if isinstance(value, list):
        return [scrub_league_sentiment_banned_terms(item) for item in value]
    if isinstance(value, dict):
        return {key: scrub_league_sentiment_banned_terms(item) for key, item in value.items()}
    return value
