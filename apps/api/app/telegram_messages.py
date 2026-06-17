from typing import Any, Protocol

from app.db import PositionManagementReviewRecord, TradeEventRecord
from app.repositories import from_json


class TelegramPreferences(Protocol):
    locale: str


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
    event_payload = payload.get("event", {}) if isinstance(payload, dict) else {}
    review_payload = payload.get("review", {}) if isinstance(payload, dict) else {}
    rationale = review_payload.get("rationale") or review.error_message or "-"
    return "\n".join(
        [
            f"[AI Trader League] {label}",
            f"{trader_name} · {review.symbol or '-'}",
            f"Phase: {review.phase or event_payload.get('phase') or '-'}",
            f"Decision: {review.decision or '-'} / Action: {review.action_type or '-'}",
            f"Confidence: {review.confidence if review.confidence is not None else '-'}",
            f"Reason: {rationale}",
        ]
    )


def telegram_event_label(telegram_event_type: str, locale: str) -> str:
    labels = {
        "ko": {
            "pending_entry": "진입대기",
            "position_entry": "진입완료",
            "take_profit": "익절완료",
            "stop_loss": "손절완료",
            "ai_review_low": "AI 중간 리뷰 낮음",
            "ai_review_medium": "AI 중간 리뷰 중간",
            "ai_review_high": "AI 중간 리뷰 높음",
            "risk": "리스크",
        },
        "en": {
            "pending_entry": "Entry Pending",
            "position_entry": "Entry Filled",
            "take_profit": "Take Profit",
            "stop_loss": "Stop Loss",
            "ai_review_low": "AI Review Low",
            "ai_review_medium": "AI Review Medium",
            "ai_review_high": "AI Review High",
            "risk": "Risk",
        },
    }
    return labels["en" if locale == "en" else "ko"].get(telegram_event_type, telegram_event_type)


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
    action = text_value(structured.get("action")) if structured else None
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
    if locale == "en":
        return {
            "action": "Next action",
            "keyReasons": "Key reasons",
            "risks": "Risks",
            "watchConditions": "Watch next",
            "managerNote": "Manager note",
        }
    return {
        "action": "지금 할 일",
        "keyReasons": "핵심 이유",
        "risks": "주의할 점",
        "watchConditions": "다음 확인 조건",
        "managerNote": "관리 메모",
    }


def first_record(*values: Any) -> dict[str, Any] | None:
    for value in values:
        if isinstance(value, dict):
            return value
    return None


def text_value(value: Any) -> str | None:
    return value.strip() if isinstance(value, str) and value.strip() else None


def text_list(value: Any, limit: int) -> list[str]:
    if not isinstance(value, list):
        return []
    return [item.strip() for item in value if isinstance(item, str) and item.strip()][:limit]
