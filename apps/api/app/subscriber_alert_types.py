from typing import Iterable


TELEGRAM_EVENT_TYPES = (
    "pending_entry",
    "position_entry",
    "take_profit",
    "stop_loss",
    "ai_review_low",
    "ai_review_medium",
    "ai_review_high",
    "league_sentiment",
    "risk",
)

DEFAULT_TELEGRAM_EVENT_TYPES = (
    "pending_entry",
    "position_entry",
    "take_profit",
    "stop_loss",
    "ai_review_low",
    "ai_review_medium",
    "ai_review_high",
    "league_sentiment",
    "risk",
)

TELEGRAM_REVIEW_SECTIONS = (
    "status",
    "position",
    "summary",
    "action",
    "key_reasons",
    "risks",
    "watch_conditions",
    "manager_note",
    "rationale",
)

DEFAULT_TELEGRAM_REVIEW_SECTIONS = TELEGRAM_REVIEW_SECTIONS

LEGACY_EVENT_ALIASES = {
    "entry": ("pending_entry", "position_entry"),
    "exit": ("take_profit", "stop_loss"),
    "management": ("ai_review_low", "ai_review_medium", "ai_review_high"),
}


def normalize_event_types(values: Iterable[str] | None) -> list[str]:
    if values is None:
        return list(DEFAULT_TELEGRAM_EVENT_TYPES)

    selected: set[str] = set()
    for value in values:
        event_type = str(value).strip()
        if event_type in LEGACY_EVENT_ALIASES:
            selected.update(LEGACY_EVENT_ALIASES[event_type])
        elif event_type in TELEGRAM_EVENT_TYPES:
            selected.add(event_type)

    return [event_type for event_type in TELEGRAM_EVENT_TYPES if event_type in selected]


def normalize_review_sections(values: Iterable[str] | None) -> list[str]:
    if values is None:
        return list(DEFAULT_TELEGRAM_REVIEW_SECTIONS)

    selected = {str(value).strip() for value in values if str(value).strip() in TELEGRAM_REVIEW_SECTIONS}
    return [section for section in TELEGRAM_REVIEW_SECTIONS if section in selected]
