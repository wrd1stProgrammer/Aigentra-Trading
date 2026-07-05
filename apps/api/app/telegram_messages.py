import ast
import math
from decimal import Decimal
from typing import Any, Protocol

from sqlalchemy.orm import object_session

from app.ai.translation_cache import localized_payload_for_source
from app.db import LeagueSentimentOpinionRecord, PositionManagementReviewRecord, TradeEventRecord
from app.locales import AI_TRANSLATION_SOURCE_AI_REVIEW, AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT, CANONICAL_AI_LOCALE
from app.repositories import from_json
from app.subscriber_alert_types import DEFAULT_TELEGRAM_REVIEW_SECTIONS, normalize_review_sections


class TelegramSettingsPreferences(Protocol):
    review_sections: list[str]


class TelegramPreferences(Protocol):
    locale: str
    telegram_settings: TelegramSettingsPreferences


TRADER_NAMES = {
    "channel-rider": "Channel Cartographer",
    "volume-breaker": "Volume Breaker",
    "pullback-architect": "Pullback Architect",
    "leverage-hunter": "Leverage Tracker",
    "liquidity-reaper": "Liquidity Sweeper",
    "volatility-squeezer": "Squeeze Operator",
    "trend-sentinel": "Trend Sentinel",
    "range-maker": "Range Mechanic",
    "funding-contrarian": "Funding Contrarian",
    "orderflow-sniper": "Session ORB Hunter",
    "donchian-breakout": "Donchian Breakout Boss",
    "ichimoku-cloud-pilot": "Cloud Pilot",
    "vwap-reclaimer": "VWAP Reclaim Crew",
    "wyckoff-spring": "Wyckoff Springboard",
    "rsi-divergence-scout": "RSI Divergence Scout",
    "session-raider": "Session Raider",
    "imbalance-hunter": "Imbalance Hunter",
    "momentum-ignition": "Compression Igniter",
    "bollinger-reversion": "Bollinger Boomerang",
    "atr-trail-commander": "ATR Trail Boss",
}

TRADER_NAMES_BY_LOCALE = {
    "en": TRADER_NAMES,
    "ko": {
        "channel-rider": "채널 항해사",
        "volume-breaker": "거래량 브레이커",
        "pullback-architect": "풀백 아키텍트",
        "leverage-hunter": "레버리지 헌터",
        "liquidity-reaper": "유동성 회수반",
        "volatility-squeezer": "변동성 압착반",
        "trend-sentinel": "추세 감시관",
        "range-maker": "박스권 장인",
        "funding-contrarian": "펀딩 역발상가",
        "orderflow-sniper": "세션 돌파 헌터",
        "donchian-breakout": "돈치안 돌파대장",
        "ichimoku-cloud-pilot": "구름항법사",
        "vwap-reclaimer": "VWAP 회수반장",
        "wyckoff-spring": "와이코프 스프링맨",
        "rsi-divergence-scout": "RSI 다이버전스 정찰대",
        "session-raider": "세션 침투조",
        "imbalance-hunter": "임밸런스 추적반",
        "momentum-ignition": "압축 돌파 점화수",
        "bollinger-reversion": "볼린저 부메랑",
        "atr-trail-commander": "ATR 트레일 캡틴",
    },
    "ru": {
        "channel-rider": "Картограф Канала",
        "volume-breaker": "Взломщик Объёма",
        "pullback-architect": "Архитектор Отката",
        "leverage-hunter": "Трекер Плеча",
        "liquidity-reaper": "Сборщик Ликвидности",
        "volatility-squeezer": "Оператор Сжатия",
        "trend-sentinel": "Страж Тренда",
        "range-maker": "Механик Диапазона",
        "funding-contrarian": "Контрариан Фандинга",
        "orderflow-sniper": "Охотник ORB Сессии",
        "donchian-breakout": "Босс Donchian",
        "ichimoku-cloud-pilot": "Пилот Облака",
        "vwap-reclaimer": "Возвращатель VWAP",
        "wyckoff-spring": "Пружина Wyckoff",
        "rsi-divergence-scout": "Разведчик RSI-дивергенции",
        "session-raider": "Рейдер Сессии",
        "imbalance-hunter": "Охотник за Имбалансом",
        "momentum-ignition": "Зажигатель Сжатия",
        "bollinger-reversion": "Бумеранг Боллинджера",
        "atr-trail-commander": "Босс ATR-трейла",
    },
    "pt-BR": {
        "channel-rider": "Cartógrafo do Canal",
        "volume-breaker": "Quebra-Volume",
        "pullback-architect": "Arquiteto do Pullback",
        "leverage-hunter": "Rastreador de Alavancagem",
        "liquidity-reaper": "Varredor de Liquidez",
        "volatility-squeezer": "Operador do Squeeze",
        "trend-sentinel": "Sentinela de Tendência",
        "range-maker": "Mecânico do Range",
        "funding-contrarian": "Contrário do Funding",
        "orderflow-sniper": "Caçador ORB de Sessão",
        "donchian-breakout": "Chefe Donchian",
        "ichimoku-cloud-pilot": "Piloto da Nuvem",
        "vwap-reclaimer": "Resgatador do VWAP",
        "wyckoff-spring": "Trampolim Wyckoff",
        "rsi-divergence-scout": "Batedor de Divergência RSI",
        "session-raider": "Raider de Sessão",
        "imbalance-hunter": "Caçador de Imbalance",
        "momentum-ignition": "Ignitor de Compressão",
        "bollinger-reversion": "Bumerangue Bollinger",
        "atr-trail-commander": "Chefe do Trail ATR",
    },
    "tr": {
        "channel-rider": "Kanal Haritacısı",
        "volume-breaker": "Hacim Kırıcı",
        "pullback-architect": "Pullback Mimarı",
        "leverage-hunter": "Kaldıraç İzleyici",
        "liquidity-reaper": "Likidite Süpürücüsü",
        "volatility-squeezer": "Sıkışma Operatörü",
        "trend-sentinel": "Trend Nöbetçisi",
        "range-maker": "Range Tamircisi",
        "funding-contrarian": "Funding Tersçisi",
        "orderflow-sniper": "Seans ORB Avcısı",
        "donchian-breakout": "Donchian Kırılım Şefi",
        "ichimoku-cloud-pilot": "Bulut Pilotu",
        "vwap-reclaimer": "VWAP Geri Alıcı",
        "wyckoff-spring": "Wyckoff Zıplaması",
        "rsi-divergence-scout": "RSI Uyumsuzluk Gözcüsü",
        "session-raider": "Seans Akıncısı",
        "imbalance-hunter": "Dengesizlik Avcısı",
        "momentum-ignition": "Sıkışma Ateşleyici",
        "bollinger-reversion": "Bollinger Bumerangı",
        "atr-trail-commander": "ATR Trail Patronu",
    },
}


def compose_event_message(preferences: TelegramPreferences, event: TradeEventRecord, telegram_event_type: str) -> str:
    trader_name = localized_trader_name(event.trader_id, preferences.locale)
    label = telegram_event_label(telegram_event_type, preferences.locale)
    price = f"{float(event.price):,.1f}" if event.price is not None else "-"
    pnl = f"{float(event.realized_pnl):+,.2f}" if event.realized_pnl is not None else "-"
    payload = from_json(event.payload_json)
    if isinstance(payload, dict):
        payload = localized_trade_event_payload(event, payload, preferences.locale)
    if event.event_type == "position_closed":
        return "\n".join(
            [
                f"[AI Trader League] {label}",
                f"{trader_name} · {event.symbol or '-'}",
                *full_close_result_lines(event, payload if isinstance(payload, dict) else {}, preferences.locale, price, pnl),
            ]
        )
    review_lines = entry_review_lines(payload, preferences.locale) if isinstance(payload, dict) else []
    if review_lines:
        return "\n".join(
            [
                f"[AI Trader League] {label}",
                f"{trader_name} · {event.symbol or '-'}",
                *review_lines,
                f"Price: {price}",
                f"PnL: {pnl}",
            ]
        )

    reason = payload.get("reason") if isinstance(payload, dict) else None
    return "\n".join(
        [
            f"[AI Trader League] {label}",
            f"{trader_name} · {event.symbol or '-'}",
            f"Event: {event.event_type}",
            f"Reason: {reason or '-'}",
            f"Price: {price}",
            f"PnL: {pnl}",
        ]
    )


def full_close_result_lines(
    event: TradeEventRecord,
    payload: dict[str, Any],
    locale: str,
    price: str,
    pnl: str,
) -> list[str]:
    copy = full_close_copy(locale)
    reason = text_value(payload.get("reason"))
    outcome = full_close_outcome(locale, reason, event.realized_pnl)
    side = text_value(payload.get("side")) or "-"
    entry = format_price(first_number(payload.get("entryPrice"), payload.get("entry_price")))
    stop = format_price(first_number(payload.get("stopLoss"), payload.get("stop_loss")))
    target = format_price(first_number(payload.get("takeProfit"), payload.get("take_profit"), payload.get("target")))

    return [
        copy["headline"].format(outcome=outcome),
        copy["result"].format(price=price, pnl=pnl),
        copy["position"].format(side=side.upper(), entry=entry, stop=stop, target=target),
    ]


def full_close_outcome(locale: str, reason: str | None, realized_pnl: Any) -> str:
    copy = full_close_outcome_copy(locale)
    normalized_reason = (reason or "").strip().lower()
    if normalized_reason in {"breakeven", "stop_at_entry"}:
        return copy["breakeven"]
    if normalized_reason == "take_profit":
        return copy["take_profit"]
    if normalized_reason in {"stop_loss", "early_thesis_failure"}:
        return copy["stop_loss"]
    try:
        pnl = Decimal(str(realized_pnl)) if realized_pnl is not None else Decimal("0")
    except Exception:
        pnl = Decimal("0")
    if abs(pnl) <= Decimal("0.00000001"):
        return copy["breakeven"]
    if pnl > 0:
        return copy["profit"]
    return copy["loss"]


def full_close_copy(locale: str) -> dict[str, str]:
    copy = {
        "en": {
            "headline": "Position closed. Final result: {outcome}.",
            "result": "Exit price: {price} · Realized PnL: {pnl}",
            "position": "Box: {side} from entry {entry}, stop {stop}, target {target}.",
        },
        "ko": {
            "headline": "포지션 종료. 최종 결과: {outcome}.",
            "result": "종료 가격: {price} · 실현 손익: {pnl}",
            "position": "관리 기준: {side} 진입 {entry}, 손절 {stop}, 목표 {target}.",
        },
        "ru": {
            "headline": "Позиция закрыта. Итоговый результат: {outcome}.",
            "result": "Цена выхода: {price} · Реализованный PnL: {pnl}",
            "position": "План: {side} от входа {entry}, стоп {stop}, цель {target}.",
        },
        "pt-BR": {
            "headline": "Posição encerrada. Resultado final: {outcome}.",
            "result": "Preço de saída: {price} · PnL realizado: {pnl}",
            "position": "Caixa de risco: {side} da entrada {entry}, stop {stop}, alvo {target}.",
        },
        "tr": {
            "headline": "Pozisyon kapandı. Nihai sonuç: {outcome}.",
            "result": "Çıkış fiyatı: {price} · Gerçekleşen PnL: {pnl}",
            "position": "Risk kutusu: {side} giriş {entry}, stop {stop}, hedef {target}.",
        },
    }
    return copy.get(locale, copy["en"])


def full_close_outcome_copy(locale: str) -> dict[str, str]:
    copy = {
        "en": {
            "take_profit": "target reached",
            "stop_loss": "stop loss",
            "breakeven": "breakeven exit",
            "profit": "closed in profit",
            "loss": "closed in loss",
        },
        "ko": {
            "take_profit": "익절 완료",
            "stop_loss": "손절 종료",
            "breakeven": "본절 종료",
            "profit": "수익 종료",
            "loss": "손실 종료",
        },
        "ru": {
            "take_profit": "цель достигнута",
            "stop_loss": "стоп-лосс",
            "breakeven": "выход в безубыток",
            "profit": "закрыто с прибылью",
            "loss": "закрыто с убытком",
        },
        "pt-BR": {
            "take_profit": "alvo atingido",
            "stop_loss": "stop loss",
            "breakeven": "saída no breakeven",
            "profit": "encerrada com lucro",
            "loss": "encerrada com perda",
        },
        "tr": {
            "take_profit": "hedefe ulaştı",
            "stop_loss": "zarar kes",
            "breakeven": "başa baş çıkış",
            "profit": "karla kapandı",
            "loss": "zararla kapandı",
        },
    }
    return copy.get(locale, copy["en"])


def compose_management_message(
    preferences: TelegramPreferences,
    review: PositionManagementReviewRecord,
    telegram_event_type: str,
) -> str:
    trader_name = localized_trader_name(review.trader_id, preferences.locale)
    label = telegram_event_label(telegram_event_type, preferences.locale)
    payload = from_json(review.payload_json)
    translation_meta: dict[str, Any] = {"status": "canonical"}
    if isinstance(payload, dict):
        session = object_session(review)
        if session is not None and review.id is not None:
            payload, translation_meta = localized_payload_for_source(
                session,
                source_type=AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT,
                source_id=review.id,
                payload=payload,
                locale=preferences.locale,
            )
    payload_record = first_record(payload) or {}
    event_payload = first_record(payload_record.get("event")) or {}
    exposure_payload = first_record(payload_record.get("exposure")) or {}
    review_payload = first_record(payload_record.get("review")) or {}
    metrics_payload = first_record(event_payload.get("metrics")) or {}
    labels = management_message_labels(preferences.locale)
    sections = review_sections_for_preferences(preferences)
    rationale = text_value(review_payload.get("rationale")) or text_value(review.error_message) or "-"
    lines = [
        management_notification_title(telegram_event_type, label, preferences.locale),
        f"{trader_name} · {review.symbol or '-'}",
    ]
    if "status" in sections:
        lines.extend(
            [
                "",
                labels["statusTitle"],
                f"  {labels['phase']}: {review.phase or text_value(event_payload.get('phase')) or '-'}",
                f"  {labels['decision']}: {review.decision or text_value(review_payload.get('decision')) or '-'}",
                f"  {labels['action']}: {review.action_type or first_action_type(review_payload) or '-'}",
                f"  {labels['confidence']}: {review.confidence if review.confidence is not None else '-'}",
            ]
        )
    if "position" in sections:
        lines.extend(
            [
                "",
                labels["positionTitle"],
                *management_position_lines(exposure_payload, metrics_payload, preferences.locale),
            ]
        )
    if should_suppress_unlocalized_management_details(preferences.locale, translation_meta):
        lines.extend(management_localized_digest_lines(exposure_payload, metrics_payload, sections, preferences.locale))
    else:
        lines.extend(management_review_detail_lines(review_payload, sections, preferences.locale, rationale))
    return "\n".join(lines)


def localized_trader_name(trader_id: str | None, locale: str) -> str:
    if not trader_id:
        return "-"
    names = TRADER_NAMES_BY_LOCALE.get(locale, TRADER_NAMES)
    return names.get(trader_id, TRADER_NAMES.get(trader_id, trader_id))


def management_notification_title(telegram_event_type: str, fallback_label: str, locale: str) -> str:
    if telegram_event_type.startswith("ai_review_"):
        labels = {
            "en": "Agent Review",
            "ko": "Agent 중간 리뷰",
            "ru": "Обзор агента",
            "pt-BR": "Revisão do agente",
            "tr": "Agent ara incelemesi",
        }
        return f"[Aigentra Trading] {labels.get(locale, labels['en'])}"
    return f"[Aigentra Trading] {fallback_label}"


def compose_league_sentiment_message(preferences: TelegramPreferences, opinion: LeagueSentimentOpinionRecord) -> str:
    label = telegram_event_label("league_sentiment", preferences.locale)
    copy = league_sentiment_message_copy(preferences.locale)
    return "\n".join(
        [
            f"[AI Trader League] {label}",
            copy["headline"],
            f"{copy['symbol']}: {opinion.symbol or '-'}",
            copy["action"],
        ]
    )


def localized_trade_event_payload(event: TradeEventRecord, payload: dict[str, Any], locale: str) -> dict[str, Any]:
    ai_review_id = first_number(payload.get("aiReviewId"))
    ai_review = first_record(payload.get("aiReview"))
    session = object_session(event)
    if session is None or ai_review_id is None or ai_review is None:
        return payload
    localized_review, meta = localized_payload_for_source(
        session,
        source_type=AI_TRANSLATION_SOURCE_AI_REVIEW,
        source_id=int(ai_review_id),
        payload=ai_review,
        locale=locale,
    )
    if meta.get("status") != "ok":
        return payload
    next_payload = {**payload, "aiReview": localized_review}
    structured = first_record(localized_review.get("structuredReview"))
    if structured is not None:
        next_payload["aiStructuredReview"] = structured
    if localized_review.get("approvalReason"):
        next_payload["aiApprovalReason"] = localized_review.get("approvalReason")
    return next_payload


def management_review_detail_lines(
    review_payload: dict[str, Any],
    sections: list[str],
    locale: str,
    fallback_rationale: str,
) -> list[str]:
    labels = management_message_labels(locale)
    structured = first_record(review_payload.get("structuredReview"), review_payload.get("aiStructuredReview")) or {}
    lines: list[str] = []

    verdict = text_value(structured.get("verdict"))
    headline = text_value(structured.get("headline"))
    action_line = " ".join(text_lines(structured.get("action"), 3))
    manager_note = text_value(structured.get("managerNote"))
    key_reasons = text_list(structured.get("keyReasons"), 2)
    risks = text_list(structured.get("risks"), 1)
    watch_conditions = text_list(structured.get("watchConditions"), 2)

    review_parts: list[str] = []
    if "summary" in sections:
        review_parts.extend([part for part in (verdict, headline) if part])
    if "action" in sections and action_line:
        review_parts.append(action_line)
    if "key_reasons" in sections:
        review_parts.extend(key_reasons)
    if "risks" in sections:
        review_parts.extend(risks)
    if "watch_conditions" in sections:
        review_parts.extend(watch_conditions)

    review_lines = compact_review_lines(review_parts, limit=5)
    if review_lines:
        lines.extend(["", labels["reviewTitle"], *[f"  {line}" for line in review_lines]])
    if "manager_note" in sections and manager_note:
        translated = review_labels(locale)
        lines.extend(["", translated["managerNote"], f"  {manager_note}"])
    if "rationale" in sections and not review_lines:
        lines.extend(["", labels["reviewTitle"], f"  {fallback_rationale}"])
    return lines


def should_suppress_unlocalized_management_details(locale: str, translation_meta: dict[str, Any]) -> bool:
    if locale == CANONICAL_AI_LOCALE:
        return False
    return translation_meta.get("status") not in {"canonical", "ok"}


def management_translation_unavailable_lines(sections: list[str], locale: str) -> list[str]:
    if not any(section in sections for section in ("summary", "action", "key_reasons", "risks", "watch_conditions", "manager_note", "rationale")):
        return []
    labels = management_message_labels(locale)
    copy = management_translation_unavailable_copy(locale)
    return ["", labels["summaryTitle"], f"  {copy}"]


def management_translation_unavailable_copy(locale: str) -> str:
    copy = {
        "en": "The translated review is not ready yet. Open Aigentra Trading to read the latest review.",
        "ko": "리뷰 번역이 아직 준비되지 않았습니다. 앱에서 최신 리뷰를 확인하세요.",
        "ru": "Перевод обзора еще не готов. Откройте Aigentra Trading, чтобы посмотреть последний обзор.",
        "pt-BR": "A tradução da revisão ainda não está pronta. Abra o Aigentra Trading para ver a revisão mais recente.",
        "tr": "İnceleme çevirisi henüz hazır değil. Son incelemeyi okumak için Aigentra Trading'i açın.",
    }
    return copy.get(locale, copy["en"])


def management_localized_digest_lines(
    exposure_payload: dict[str, Any],
    metrics_payload: dict[str, Any],
    sections: list[str],
    locale: str,
) -> list[str]:
    if not any(section in sections for section in ("summary", "action", "key_reasons", "risks", "watch_conditions", "manager_note", "rationale")):
        return []
    labels = management_message_labels(locale)
    side = text_value(exposure_payload.get("side")) or "-"
    entry = first_number(exposure_payload.get("entryPrice"), metrics_payload.get("entryPrice"))
    stop = first_number(exposure_payload.get("stopLoss"), metrics_payload.get("stopLoss"))
    take_profit = first_number(exposure_payload.get("takeProfit"), metrics_payload.get("takeProfit"))
    pnl = format_pnl(exposure_payload, metrics_payload)
    first_line = localized_position_digest_line(locale, side, entry, stop, take_profit)
    second_line = localized_position_pnl_line(locale, pnl)
    return ["", labels["reviewTitle"], f"  {first_line}", f"  {second_line}"]


def localized_position_digest_line(
    locale: str,
    side: str,
    entry: float | None,
    stop: float | None,
    take_profit: float | None,
) -> str:
    at_breakeven = entry is not None and stop is not None and abs(entry - stop) <= max(abs(entry) * 0.00001, 0.01)
    if locale == "ko":
        if at_breakeven:
            return f"현재 {side} 포지션은 본전 방어가 걸려 있습니다."
        return f"현재 {side} 포지션은 진입가 {format_price(entry)}, 손절가 {format_price(stop)}, 익절가 {format_price(take_profit)} 기준으로 관리 중입니다."
    if locale == "ru":
        if at_breakeven:
            return f"Текущая позиция {side} защищена стопом в безубытке."
        return f"Позиция {side} управляется от входа {format_price(entry)}, стопа {format_price(stop)} и цели {format_price(take_profit)}."
    if locale == "pt-BR":
        if at_breakeven:
            return f"A posição {side} está protegida no breakeven."
        return f"A posição {side} está sendo gerida pela entrada {format_price(entry)}, stop {format_price(stop)} e alvo {format_price(take_profit)}."
    if locale == "tr":
        if at_breakeven:
            return f"Mevcut {side} pozisyonu başa baş stop ile korunuyor."
        return f"{side} pozisyonu giriş {format_price(entry)}, stop {format_price(stop)} ve hedef {format_price(take_profit)} üzerinden yönetiliyor."
    if at_breakeven:
        return f"The current {side} position is protected at breakeven."
    return f"The {side} position is being managed from entry {format_price(entry)}, stop {format_price(stop)}, and target {format_price(take_profit)}."


def localized_position_pnl_line(locale: str, pnl: str) -> str:
    if locale == "ko":
        return f"현재 손익은 {pnl}입니다. 자세한 리뷰는 앱에서 이어서 확인하세요."
    if locale == "ru":
        return f"Текущий PnL: {pnl}. Подробный обзор смотрите в приложении."
    if locale == "pt-BR":
        return f"PnL atual: {pnl}. Veja a revisão completa no app."
    if locale == "tr":
        return f"Güncel PnL: {pnl}. Ayrıntılı incelemeyi uygulamada kontrol edin."
    return f"Current PnL is {pnl}. Open the app for the full review."


def review_sections_for_preferences(preferences: TelegramPreferences) -> list[str]:
    settings = getattr(preferences, "telegram_settings", None)
    if settings is None:
        return list(DEFAULT_TELEGRAM_REVIEW_SECTIONS)
    return normalize_review_sections(getattr(settings, "review_sections", None))


def telegram_event_label(telegram_event_type: str, locale: str) -> str:
    labels = {
        "en": {
            "pending_entry": "Entry Pending",
            "position_entry": "Entry Filled",
            "take_profit": "Take Profit",
            "stop_loss": "Stop Loss",
            "ai_review_low": "AI Review Low",
            "ai_review_medium": "AI Review Medium",
            "ai_review_high": "AI Review High",
            "league_sentiment": "Aigentra Opinion",
            "risk": "Risk",
        },
        "ko": {
            "pending_entry": "진입대기",
            "position_entry": "진입완료",
            "take_profit": "익절완료",
            "stop_loss": "손절완료",
            "ai_review_low": "AI 중간 리뷰 낮음",
            "ai_review_medium": "AI 중간 리뷰 중간",
            "ai_review_high": "AI 중간 리뷰 높음",
            "league_sentiment": "Aigentra 종합 의견",
            "risk": "리스크",
        },
        "ru": {
            "pending_entry": "Ожидает входа",
            "position_entry": "Вход исполнен",
            "take_profit": "Тейк-профит",
            "stop_loss": "Стоп-лосс",
            "ai_review_low": "AI-обзор: низкая важность",
            "ai_review_medium": "AI-обзор: средняя важность",
            "ai_review_high": "AI-обзор: высокая важность",
            "league_sentiment": "Сводное мнение Aigentra",
            "risk": "Риск",
        },
        "pt-BR": {
            "pending_entry": "Entrada pendente",
            "position_entry": "Entrada executada",
            "take_profit": "Take profit",
            "stop_loss": "Stop loss",
            "ai_review_low": "Revisão AI baixa",
            "ai_review_medium": "Revisão AI média",
            "ai_review_high": "Revisão AI alta",
            "league_sentiment": "Opinião geral Aigentra",
            "risk": "Risco",
        },
        "tr": {
            "pending_entry": "Giriş bekliyor",
            "position_entry": "Giriş tamamlandı",
            "take_profit": "Kar alındı",
            "stop_loss": "Zarar kesildi",
            "ai_review_low": "AI ara inceleme düşük",
            "ai_review_medium": "AI ara inceleme orta",
            "ai_review_high": "AI ara inceleme yüksek",
            "league_sentiment": "Aigentra genel görüşü",
            "risk": "Risk",
        },
    }
    active = labels.get(locale, labels["en"])
    return active.get(telegram_event_type, telegram_event_type)


def league_sentiment_message_copy(locale: str) -> dict[str, str]:
    copy = {
        "en": {
            "headline": "A new hourly Aigentra aggregate opinion is ready.",
            "symbol": "Symbol",
            "action": "Open Aigentra Trading to read the full context.",
        },
        "ko": {
            "headline": "새 시간대 Aigentra 종합 의견이 준비됐습니다.",
            "symbol": "심볼",
            "action": "홈 또는 AI 센티멘트 화면에서 전체 내용을 확인하세요.",
        },
        "ru": {
            "headline": "Готово новое часовое сводное мнение Aigentra.",
            "symbol": "Символ",
            "action": "Откройте Aigentra Trading, чтобы прочитать полный контекст.",
        },
        "pt-BR": {
            "headline": "A nova opinião geral horária da Aigentra está pronta.",
            "symbol": "Símbolo",
            "action": "Abra o Aigentra Trading para ler o contexto completo.",
        },
        "tr": {
            "headline": "Yeni saatlik Aigentra genel görüşü hazır.",
            "symbol": "Sembol",
            "action": "Tam bağlamı okumak için Aigentra Trading'i açın.",
        },
    }
    return copy.get(locale, copy["en"])


def entry_review_lines(payload: dict[str, Any], locale: str) -> list[str]:
    ai_review = first_record(payload.get("aiReview"))
    structured = first_record(
        payload.get("aiStructuredReview"),
        ai_review.get("structuredReview") if ai_review else None,
    )
    approval_reason = text_value(payload.get("aiApprovalReason")) or text_value(
        ai_review.get("approvalReason") if ai_review else None
    )
    if structured is None and approval_reason is None:
        return []

    verdict = text_value(structured.get("verdict")) if structured else None
    headline = text_value(structured.get("headline")) if structured else None
    action = " ".join(text_lines(structured.get("action"), 3)) if structured else None
    manager_note = text_value(structured.get("managerNote")) if structured else None
    key_reasons = text_list(structured.get("keyReasons"), 2) if structured else []
    risks = text_list(structured.get("risks"), 1) if structured else []
    watch_conditions = text_list(structured.get("watchConditions"), 2) if structured else []

    lines = compact_review_lines(
        [
            verdict,
            headline or approval_reason,
            action,
            *key_reasons,
            *risks,
            *watch_conditions,
        ],
        limit=5,
    )
    if manager_note:
        translated = review_labels(locale)
        lines.append(f"{translated['managerNote']}: {manager_note}")
    return lines


def review_labels(locale: str) -> dict[str, str]:
    labels = {
        "en": {
            "action": "Next action",
            "keyReasons": "Key reasons",
            "risks": "Risks",
            "watchConditions": "Watch next",
            "managerNote": "Manager note",
        },
        "ko": {
            "action": "지금 할 일",
            "keyReasons": "핵심 이유",
            "risks": "주의할 점",
            "watchConditions": "다음 확인 조건",
            "managerNote": "관리 메모",
        },
        "ru": {
            "action": "Что сделать сейчас",
            "keyReasons": "Ключевые причины",
            "risks": "На что обратить внимание",
            "watchConditions": "Следующие условия",
            "managerNote": "Заметка менеджера",
        },
        "pt-BR": {
            "action": "Próxima ação",
            "keyReasons": "Motivos principais",
            "risks": "Pontos de atenção",
            "watchConditions": "Próximas condições",
            "managerNote": "Nota de gestão",
        },
        "tr": {
            "action": "Şimdi yapılacak",
            "keyReasons": "Ana nedenler",
            "risks": "Dikkat edilecekler",
            "watchConditions": "Sonraki koşullar",
            "managerNote": "Yönetim notu",
        },
    }
    return labels.get(locale, labels["en"])


def management_message_labels(locale: str) -> dict[str, str]:
    labels = {
        "en": {
            "statusTitle": "Status",
            "phase": "Phase",
            "decision": "Decision",
            "action": "Action",
            "confidence": "Confidence",
            "positionTitle": "Position",
            "reviewTitle": "Review",
            "summaryTitle": "Summary",
            "side": "Side",
            "entry": "Entry",
            "current": "Current",
            "stop": "Stop",
            "takeProfit": "Take Profit",
            "pnl": "PnL",
            "rationaleTitle": "Reason",
        },
        "ko": {
            "statusTitle": "상태",
            "phase": "단계",
            "decision": "판단",
            "action": "조치",
            "confidence": "신뢰도",
            "positionTitle": "포지션",
            "reviewTitle": "리뷰",
            "summaryTitle": "요약",
            "side": "방향",
            "entry": "진입가",
            "current": "현재가",
            "stop": "손절가",
            "takeProfit": "익절가",
            "pnl": "PnL",
            "rationaleTitle": "판단 근거",
        },
        "ru": {
            "statusTitle": "Статус",
            "phase": "Этап",
            "decision": "Решение",
            "action": "Действие",
            "confidence": "Уверенность",
            "positionTitle": "Позиция",
            "reviewTitle": "Обзор",
            "summaryTitle": "Итог",
            "side": "Направление",
            "entry": "Вход",
            "current": "Текущая",
            "stop": "Стоп",
            "takeProfit": "Цель",
            "pnl": "PnL",
            "rationaleTitle": "Основание",
        },
        "pt-BR": {
            "statusTitle": "Status",
            "phase": "Fase",
            "decision": "Decisão",
            "action": "Ação",
            "confidence": "Confiança",
            "positionTitle": "Posição",
            "reviewTitle": "Revisão",
            "summaryTitle": "Resumo",
            "side": "Direção",
            "entry": "Entrada",
            "current": "Atual",
            "stop": "Stop",
            "takeProfit": "Alvo",
            "pnl": "PnL",
            "rationaleTitle": "Motivo",
        },
        "tr": {
            "statusTitle": "Durum",
            "phase": "Aşama",
            "decision": "Karar",
            "action": "Aksiyon",
            "confidence": "Güven",
            "positionTitle": "Pozisyon",
            "reviewTitle": "İnceleme",
            "summaryTitle": "Özet",
            "side": "Yön",
            "entry": "Giriş",
            "current": "Güncel",
            "stop": "Stop",
            "takeProfit": "Hedef",
            "pnl": "PnL",
            "rationaleTitle": "Gerekçe",
        },
    }
    return labels.get(locale, labels["en"])


def management_position_lines(exposure_payload: dict[str, Any], metrics_payload: dict[str, Any], locale: str) -> list[str]:
    labels = management_message_labels(locale)
    side = text_value(exposure_payload.get("side")) or "-"
    leverage = first_number(exposure_payload.get("leverage"), metrics_payload.get("leverage"))
    side_detail = f"{side} · {format_leverage(leverage)}" if leverage is not None else side
    entry = first_number(
        exposure_payload.get("entryPrice"),
        exposure_payload.get("limitPrice"),
        metrics_payload.get("entryPrice"),
        metrics_payload.get("limitPrice"),
    )
    current = first_number(
        metrics_payload.get("price"),
        metrics_payload.get("currentPrice"),
        exposure_payload.get("currentPrice"),
    )
    stop = first_number(exposure_payload.get("stopLoss"), metrics_payload.get("stopLoss"))
    take_profit = first_number(exposure_payload.get("takeProfit"), metrics_payload.get("takeProfit"))
    return [
        f"  {labels['side']}: {side_detail}",
        f"  {labels['entry']}: {format_price(entry)}",
        f"  {labels['current']}: {format_price(current)}",
        f"  {labels['stop']}: {format_price(stop)}",
        f"  {labels['takeProfit']}: {format_price(take_profit)}",
        f"  {labels['pnl']}: {format_pnl(exposure_payload, metrics_payload)}",
    ]


def first_action_type(review_payload: dict[str, Any]) -> str | None:
    actions = review_payload.get("actions")
    if not isinstance(actions, list) or not actions:
        return text_value(review_payload.get("action"))
    first_action = first_record(actions[0])
    return text_value(first_action.get("type")) if first_action else text_value(review_payload.get("action"))


def first_number(*values: Any) -> float | None:
    for value in values:
        parsed = number_value(value)
        if parsed is not None:
            return parsed
    return None


def number_value(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float, Decimal)):
        parsed = float(value)
    elif isinstance(value, str):
        clean = value.strip().replace(",", "")
        if not clean:
            return None
        try:
            parsed = float(clean)
        except ValueError:
            return None
    else:
        return None
    return parsed if math.isfinite(parsed) else None


def format_price(value: float | None) -> str:
    if value is None:
        return "-"
    return compact_number(value, max_decimals=2)


def format_leverage(value: float) -> str:
    return f"{compact_number(value, max_decimals=2)}x"


def format_pnl(exposure_payload: dict[str, Any], metrics_payload: dict[str, Any]) -> str:
    pnl = first_number(
        exposure_payload.get("unrealizedPnl"),
        metrics_payload.get("unrealizedPnl"),
        exposure_payload.get("pnl"),
        metrics_payload.get("pnl"),
    )
    if pnl is None:
        return "-"
    pnl_text = f"{pnl:+,.2f}"
    pnl_pct = first_number(
        exposure_payload.get("unrealizedPnlPercent"),
        metrics_payload.get("unrealizedPnlPercent"),
        exposure_payload.get("pnlPercent"),
        metrics_payload.get("pnlPercent"),
        exposure_payload.get("roePercent"),
        metrics_payload.get("roePercent"),
    )
    if pnl_pct is None:
        pnl_pct = inferred_roe_percent(exposure_payload, metrics_payload, pnl)
    return f"{pnl_text} ({pnl_pct:+.2f}%)" if pnl_pct is not None else pnl_text


def inferred_roe_percent(exposure_payload: dict[str, Any], metrics_payload: dict[str, Any], pnl: float) -> float | None:
    entry = first_number(exposure_payload.get("entryPrice"), metrics_payload.get("entryPrice"))
    quantity = first_number(exposure_payload.get("quantity"), metrics_payload.get("quantity"), exposure_payload.get("size"), metrics_payload.get("size"))
    leverage = first_number(exposure_payload.get("leverage"), metrics_payload.get("leverage"))
    margin = first_number(exposure_payload.get("margin"), metrics_payload.get("margin"), exposure_payload.get("initialMargin"), metrics_payload.get("initialMargin"))
    if margin is None and entry is not None and quantity is not None and leverage is not None and leverage > 0:
        margin = abs(entry * quantity) / leverage
    if margin is None or margin <= 0:
        return None
    return (pnl / margin) * 100


def compact_number(value: float, *, max_decimals: int) -> str:
    rounded = 0.0 if abs(value) < 0.5 * (10**-max_decimals) else value
    return f"{rounded:,.{max_decimals}f}".rstrip("0").rstrip(".")


def first_record(*values: Any) -> dict[str, Any] | None:
    for value in values:
        if isinstance(value, dict):
            return value
    return None


def text_value(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def text_list(value: Any, limit: int) -> list[str]:
    return text_lines(value, limit) if isinstance(value, (list, str)) else []


def text_lines(value: Any, limit: int) -> list[str]:
    items = literal_string_list(value)
    if items is None:
        if isinstance(value, list):
            items = [item for item in value if isinstance(item, str)]
        elif isinstance(value, str):
            items = split_text_lines(value)
        else:
            items = []
    return [clean for item in items if (clean := strip_bullet_prefix(item))][:limit]


def compact_review_lines(values: list[str | None], *, limit: int) -> list[str]:
    lines: list[str] = []
    seen: set[str] = set()
    for value in values:
        clean = text_value(value)
        if clean is None:
            continue
        normalized = " ".join(clean.lower().split())
        if normalized in seen:
            continue
        seen.add(normalized)
        lines.append(clean)
        if len(lines) >= limit:
            break
    return lines


def literal_string_list(value: Any) -> list[str] | None:
    if not isinstance(value, str):
        return None
    clean = value.strip()
    if not (clean.startswith("[") and clean.endswith("]")):
        return None
    try:
        parsed = ast.literal_eval(clean)
    except (SyntaxError, ValueError):
        return None
    if not isinstance(parsed, list):
        return None
    return [item for item in parsed if isinstance(item, str)]


def split_text_lines(value: str) -> list[str]:
    stripped = value.strip()
    if not stripped:
        return []
    lines = [line for line in stripped.splitlines() if line.strip()]
    return lines if len(lines) > 1 else [stripped]


def strip_bullet_prefix(value: str) -> str:
    clean = value.strip()
    changed = True
    while changed:
        changed = False
        for prefix in ("- ", "• ", "* "):
            if clean.startswith(prefix):
                clean = clean[len(prefix) :].strip()
                changed = True
    return clean
