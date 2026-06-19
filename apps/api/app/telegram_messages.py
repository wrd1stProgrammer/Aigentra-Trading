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
    "channel-rider": "Channel Rider",
    "volume-breaker": "Volume Breaker",
    "pullback-architect": "Pullback Architect",
    "leverage-hunter": "Leverage Hunter",
    "liquidity-reaper": "Liquidity Reaper",
    "volatility-squeezer": "Volatility Squeeze",
    "trend-sentinel": "Trend Sentinel",
    "range-maker": "Range Maker",
    "funding-contrarian": "Funding Contrarian",
    "orderflow-sniper": "Orderflow Sniper",
    "donchian-breakout": "Donchian Breakout",
    "ichimoku-cloud-pilot": "Ichimoku Cloud Pilot",
    "vwap-reclaimer": "VWAP Reclaimer",
    "wyckoff-spring": "Wyckoff Spring",
    "rsi-divergence-scout": "RSI Divergence Scout",
    "session-raider": "Session Raider",
    "imbalance-hunter": "Imbalance Hunter",
    "momentum-ignition": "Momentum Ignition",
    "bollinger-reversion": "Bollinger Reversion",
    "atr-trail-commander": "ATR Trail Commander",
}


def compose_event_message(preferences: TelegramPreferences, event: TradeEventRecord, telegram_event_type: str) -> str:
    trader_name = TRADER_NAMES.get(event.trader_id or "", event.trader_id or "-")
    label = telegram_event_label(telegram_event_type, preferences.locale)
    price = f"{float(event.price):,.1f}" if event.price is not None else "-"
    pnl = f"{float(event.realized_pnl):+,.2f}" if event.realized_pnl else "-"
    payload = from_json(event.payload_json)
    if isinstance(payload, dict):
        payload = localized_trade_event_payload(event, payload, preferences.locale)
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


def compose_management_message(
    preferences: TelegramPreferences,
    review: PositionManagementReviewRecord,
    telegram_event_type: str,
) -> str:
    trader_name = TRADER_NAMES.get(review.trader_id or "", review.trader_id or "-")
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
        f"[AI Trader League] {label}",
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
        lines.extend(management_translation_unavailable_lines(sections, preferences.locale))
    else:
        lines.extend(management_review_detail_lines(review_payload, sections, preferences.locale, rationale))
    return "\n".join(lines)


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
    translated = review_labels(locale)
    structured = first_record(review_payload.get("structuredReview"), review_payload.get("aiStructuredReview")) or {}
    lines: list[str] = []

    verdict = text_value(structured.get("verdict"))
    headline = text_value(structured.get("headline"))
    action_lines = text_lines(structured.get("action"), 6)
    manager_note = text_value(structured.get("managerNote"))
    key_reasons = text_list(structured.get("keyReasons"), 3)
    risks = text_list(structured.get("risks"), 3)
    watch_conditions = text_list(structured.get("watchConditions"), 3)

    if "summary" in sections and (verdict or headline):
        summary = " · ".join([part for part in (verdict, headline) if part])
        lines.extend(["", labels["summaryTitle"], f"  {summary}"])
    if "action" in sections and action_lines:
        lines.extend(["", translated["action"], *[f"  {line}" for line in action_lines]])
    if "key_reasons" in sections and key_reasons:
        lines.extend(["", translated["keyReasons"], f"  {' · '.join(key_reasons)}"])
    if "risks" in sections and risks:
        lines.extend(["", translated["risks"], f"  {' · '.join(risks)}"])
    if "watch_conditions" in sections and watch_conditions:
        lines.extend(["", translated["watchConditions"], f"  {' · '.join(watch_conditions)}"])
    if "manager_note" in sections and manager_note:
        lines.extend(["", translated["managerNote"], f"  {manager_note}"])
    if "rationale" in sections:
        lines.extend(["", labels["rationaleTitle"], f"  {fallback_rationale}"])
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

    translated = review_labels(locale)
    lines: list[str] = []
    verdict = text_value(structured.get("verdict")) if structured else None
    headline = text_value(structured.get("headline")) if structured else None
    action = " · ".join(text_lines(structured.get("action"), 6)) if structured else None
    manager_note = text_value(structured.get("managerNote")) if structured else None
    key_reasons = text_list(structured.get("keyReasons"), 3) if structured else []
    risks = text_list(structured.get("risks"), 2) if structured else []
    watch_conditions = text_list(structured.get("watchConditions"), 3) if structured else []

    if verdict:
        lines.append(verdict)
    if headline or approval_reason:
        lines.append(headline or approval_reason or "-")
    if action and action != headline:
        lines.append(f"{translated['action']}: {action}")
    if key_reasons:
        lines.append(f"{translated['keyReasons']}: {' · '.join(key_reasons)}")
    if risks:
        lines.append(f"{translated['risks']}: {' · '.join(risks)}")
    if watch_conditions:
        lines.append(f"{translated['watchConditions']}: {' · '.join(watch_conditions)}")
    if manager_note:
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
    return f"{pnl_text} ({pnl_pct:+.2f}%)" if pnl_pct is not None else pnl_text


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
