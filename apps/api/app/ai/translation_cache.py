import hashlib
import json
import re
from collections.abc import Sequence
from typing import Any

from sqlalchemy.orm import Session

from app.ai.translation_provider import AITranslationProvider, get_translation_provider, translate_json_with_logging
from app.core.config import Settings
from app.locales import (
    AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT,
    AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
    CANONICAL_AI_LOCALE,
    NON_CANONICAL_AI_LOCALES,
    normalize_locale,
)
from app.repositories import (
    from_json,
    get_latest_successful_translation_for_source,
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
    "sourceLocale",
    "source_locale",
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
    source_locale = source_locale_for_payload(payload)
    if requested_locale == source_locale or source_id is None:
        return payload, {"status": "canonical", "locale": source_locale, "sourceLocale": source_locale}
    source_hash = stable_source_hash(payload)
    record = get_translation_cache_record(
        db,
        source_type=source_type,
        source_id=int(source_id),
        source_hash=source_hash,
        locale=requested_locale,
    )
    if record is not None and record.status == "ok":
        cached_payload = from_json(record.payload_json)
        if isinstance(cached_payload, dict):
            localized_payload = merge_translation_overlay(payload, scrub_translation_payload_for_source(source_type, cached_payload))
            return localized_payload, {"status": "ok", "locale": requested_locale, "sourceLocale": source_locale, "sourceHash": source_hash}
    latest_record = get_latest_successful_translation_for_source(
        db,
        source_type=source_type,
        source_id=int(source_id),
        locale=requested_locale,
    )
    if latest_record is not None and latest_record.source_hash != source_hash:
        return payload, {
            "status": "missing",
            "locale": requested_locale,
            "fallbackLocale": source_locale,
            "sourceLocale": source_locale,
            "sourceHash": source_hash,
            "cachedSourceHash": latest_record.source_hash,
            "staleSourceHash": True,
        }
    if record is None:
        return payload, {"status": "missing", "locale": requested_locale, "fallbackLocale": source_locale, "sourceLocale": source_locale}
    return payload, {
        "status": record.status or "fallback",
        "locale": requested_locale,
        "fallbackLocale": source_locale,
        "sourceLocale": source_locale,
        "sourceHash": source_hash,
    }


def translation_provider_is_available(settings: Settings, provider: AITranslationProvider | None = None) -> bool:
    if provider is not None:
        return True
    if getattr(settings, "ai_translation_provider", "openai") == "codex_cli":
        return True
    return bool(getattr(settings, "openai_api_key", ""))


async def ensure_localized_payload_for_source(
    db: Session,
    *,
    settings: Settings,
    source_type: str,
    source_id: int | None,
    payload: dict[str, Any],
    locale: str,
    symbol: str | None = None,
    trader_id: str | None = None,
    provider: AITranslationProvider | None = None,
    release_clean_transaction_before_call: bool = False,
) -> tuple[dict[str, Any], dict[str, Any]]:
    localized_payload, meta = localized_payload_for_source(
        db,
        source_type=source_type,
        source_id=source_id,
        payload=payload,
        locale=locale,
    )
    requested_locale = normalize_locale(locale)
    source_locale = source_locale_for_payload(payload)
    if requested_locale == source_locale or source_id is None:
        return localized_payload, meta
    if meta.get("status") == "ok" and not meta.get("staleSourceHash"):
        return localized_payload, meta
    if not getattr(settings, "ai_translation_enabled", True) or not translation_provider_is_available(settings, provider):
        return localized_payload, meta

    await fanout_ai_translations(
        db,
        settings=settings,
        source_type=source_type,
        source_id=source_id,
        payload=payload,
        symbol=symbol,
        trader_id=trader_id,
        provider=provider,
        target_locales=(requested_locale,),
        release_clean_transaction_before_call=release_clean_transaction_before_call,
    )
    return localized_payload_for_source(
        db,
        source_type=source_type,
        source_id=source_id,
        payload=payload,
        locale=requested_locale,
    )


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
    target_locales: Sequence[str] | None = None,
    release_clean_transaction_before_call: bool = False,
) -> None:
    if source_id is None:
        return
    source_locale = source_locale_for_payload(payload)
    source_hash = stable_source_hash(payload)
    raw_locales = target_locales if target_locales is not None else getattr(settings, "ai_translation_target_locales", NON_CANONICAL_AI_LOCALES)
    if target_locales is None and source_locale != CANONICAL_AI_LOCALE:
        raw_locales = (CANONICAL_AI_LOCALE, *tuple(raw_locales))
    locales = tuple(dict.fromkeys(
        locale
        for locale in (normalize_locale(item) for item in raw_locales)
        if locale != source_locale
    ))
    for locale in locales:
        existing = get_translation_cache_record(
            db,
            source_type=source_type,
            source_id=int(source_id),
            source_hash=source_hash,
            locale=locale,
        )
        if existing is not None and existing.status == "ok":
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
        active_provider = provider
        if active_provider is None and getattr(settings, "ai_translation_provider", "openai") == "codex_cli":
            active_provider = get_translation_provider(settings)
        if not active_provider and not getattr(settings, "openai_api_key", ""):
            upsert_translation_cache_record(
                db,
                source_type=source_type,
                source_id=int(source_id),
                source_hash=source_hash,
                locale=locale,
                status="fallback",
                payload=scrub_translation_payload_for_source(source_type, payload),
                provider=getattr(settings, "ai_translation_provider", "openai"),
                model=getattr(settings, "openai_translation_model", "translation"),
                symbol=symbol,
                trader_id=trader_id,
                error_message="OPENAI_API_KEY is missing for AI translation.",
            )
            continue
        try:
            request_payload = translation_request_payload(source_type, payload)
            if release_clean_transaction_before_call:
                release_clean_session_transaction(db)
            translated = await translate_json_with_logging(
                db,
                settings=settings,
                payload=request_payload,
                target_locale=locale,
                symbol=symbol,
                trader_id=trader_id,
                provider=active_provider,
            )
            safe_payload = merge_validated_translation(request_payload, translated)
            safe_payload = scrub_translation_payload_for_source(source_type, safe_payload)
            upsert_translation_cache_record(
                db,
                source_type=source_type,
                source_id=int(source_id),
                source_hash=source_hash,
                locale=locale,
                status="ok",
                payload=safe_payload,
                provider=getattr(active_provider, "name", "openai"),
                model=getattr(active_provider, "model", getattr(settings, "openai_translation_model", "translation")),
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
                provider=getattr(active_provider, "name", "openai"),
                model=getattr(active_provider, "model", getattr(settings, "openai_translation_model", "translation")),
                symbol=symbol,
                trader_id=trader_id,
                error_message=sanitize_error_message(str(exc)),
            )


def release_clean_session_transaction(db: Session) -> None:
    if not db.in_transaction():
        return
    if db.new or db.dirty or db.deleted:
        return
    db.commit()


def merge_validated_translation(original: Any, translated: Any, path: tuple[str, ...] = ()) -> Any:
    if isinstance(original, dict):
        if not isinstance(translated, dict):
            raise TranslationShapeError(f"Expected object at {'.'.join(path) or '<root>'}.")
        return {
            key: merge_validated_translation(value, translated[key], (*path, str(key))) if key in translated else value
            for key, value in original.items()
        }
    if isinstance(original, list):
        if is_protected_path(path):
            return original
        if not isinstance(translated, list) or len(original) != len(translated):
            return original
        return [merge_validated_translation(item, translated[index], (*path, str(index))) for index, item in enumerate(original)]
    if is_protected_path(path):
        return original
    if isinstance(original, str):
        if not isinstance(translated, str):
            if is_translatable_string_list_path(path) and is_string_list(translated):
                return translated
            raise TranslationShapeError(f"Expected string at {'.'.join(path) or '<root>'}.")
        return translated
    if translated != original:
        raise TranslationShapeError(f"Non-string value changed at {'.'.join(path) or '<root>'}.")
    return original


def merge_translation_overlay(original: Any, translated: Any, path: tuple[str, ...] = ()) -> Any:
    if is_protected_path(path):
        return original
    if isinstance(original, dict):
        if not isinstance(translated, dict):
            return original
        result = dict(original)
        for key, value in original.items():
            if key in translated:
                result[key] = merge_translation_overlay(value, translated[key], (*path, str(key)))
        return result
    if isinstance(original, list):
        if not isinstance(translated, list) or len(original) != len(translated):
            return original
        return [
            merge_translation_overlay(item, translated[index], (*path, str(index)))
            for index, item in enumerate(original)
        ]
    if isinstance(original, str):
        if isinstance(translated, str):
            return translated
        if is_translatable_string_list_path(path) and is_string_list(translated):
            return translated
    return original


def is_translatable_string_list_path(path: tuple[str, ...]) -> bool:
    return len(path) >= 2 and path[-1] == "action" and "structuredReview" in path


def is_string_list(value: Any) -> bool:
    return isinstance(value, list) and all(isinstance(item, str) for item in value)


def translation_request_payload(source_type: str, payload: dict[str, Any]) -> dict[str, Any]:
    source_locale = source_locale_for_payload(payload)
    if source_type != AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT:
        return payload
    compact = {
        key: payload[key]
        for key in ("event", "review", "appliedActions")
        if key in payload
    }
    if compact:
        compact["sourceLocale"] = source_locale
    return compact or payload


def source_locale_for_payload(payload: dict[str, Any]) -> str:
    nested_review = payload.get("review") if isinstance(payload.get("review"), dict) else None
    nested_ai_review = payload.get("aiReview") if isinstance(payload.get("aiReview"), dict) else None
    return normalize_locale(
        payload.get("sourceLocale")
        or payload.get("source_locale")
        or (nested_review or {}).get("sourceLocale")
        or (nested_ai_review or {}).get("sourceLocale")
        or CANONICAL_AI_LOCALE
    )


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
