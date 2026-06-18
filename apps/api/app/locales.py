from typing import Final, Optional


CANONICAL_AI_LOCALE: Final[str] = "en"
SUPPORTED_LOCALES: Final[tuple[str, ...]] = ("en", "ko", "ru", "pt-BR", "tr")
NON_CANONICAL_AI_LOCALES: Final[tuple[str, ...]] = tuple(locale for locale in SUPPORTED_LOCALES if locale != CANONICAL_AI_LOCALE)

AI_TRANSLATION_SOURCE_AI_REVIEW: Final[str] = "ai_review"
AI_TRANSLATION_SOURCE_POSITION_MANAGEMENT: Final[str] = "position_management_review"
AI_TRANSLATION_SOURCE_LEAGUE_SENTIMENT: Final[str] = "league_sentiment_opinion"
AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED: Final[str] = "trader_status_feed"

LOCALE_ALIASES: Final[dict[str, str]] = {
    "en": "en",
    "en-us": "en",
    "en_us": "en",
    "en-gb": "en",
    "ko": "ko",
    "kr": "ko",
    "ko-kr": "ko",
    "ko_kr": "ko",
    "ru": "ru",
    "ru-ru": "ru",
    "ru_ru": "ru",
    "pt": "pt-BR",
    "pt-br": "pt-BR",
    "pt_br": "pt-BR",
    "pt-brasil": "pt-BR",
    "tr": "tr",
    "tr-tr": "tr",
    "tr_tr": "tr",
}


def normalize_locale(value: Optional[str], default: str = CANONICAL_AI_LOCALE) -> str:
    clean = str(value or "").strip()
    if not clean:
        return default if default in SUPPORTED_LOCALES else CANONICAL_AI_LOCALE
    lowered = clean.replace("_", "-").lower()
    if lowered in LOCALE_ALIASES:
        return LOCALE_ALIASES[lowered]
    prefix = lowered.split("-", 1)[0]
    if prefix in LOCALE_ALIASES:
        return LOCALE_ALIASES[prefix]
    return default if default in SUPPORTED_LOCALES else CANONICAL_AI_LOCALE


def normalize_translation_locales(value: Optional[str]) -> tuple[str, ...]:
    if not value:
        return NON_CANONICAL_AI_LOCALES
    locales: list[str] = []
    for item in value.split(","):
        locale = normalize_locale(item)
        if locale != CANONICAL_AI_LOCALE and locale not in locales:
            locales.append(locale)
    return tuple(locales) or NON_CANONICAL_AI_LOCALES
