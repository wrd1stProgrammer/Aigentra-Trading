from typing import Iterable


TELEGRAM_EVENT_TYPES = (
    "pending_entry",
    "position_entry",
    "take_profit",
    "stop_loss",
    "ai_review_low",
    "ai_review_medium",
    "ai_review_high",
    "risk",
)

DEFAULT_TELEGRAM_EVENT_TYPES = (
    "pending_entry",
    "position_entry",
    "take_profit",
    "stop_loss",
)

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
