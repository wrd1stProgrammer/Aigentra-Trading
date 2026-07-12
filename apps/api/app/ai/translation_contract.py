from typing import Any, Final

from app.locales import AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED, CANONICAL_AI_LOCALE, normalize_locale


TRANSLATION_SYSTEM_PROMPT = """You are Aigentra's localization engine for AI trading review JSON.
Return only a strict JSON object with exactly one root key named content. Put the translated JSON inside content.
Translate ONLY human-readable natural-language string values.
Do not translate JSON keys.
Do not translate enum/status/code/id/provider/model/ticker/symbol/timeframe/order side values.
Preserve all numbers, booleans, nulls, arrays, object shape, and array length.
Preserve technical trading abbreviations when natural in the target language: BTC, USDT, LONG, SHORT, TP, SL, PnL, RSI, EMA, VWAP, OI, RR, ADX, ATR.
Keep prices, percentages, timestamps, and candle intervals exactly as provided.
Use natural, concise product-language for the target locale. Do not sound machine-translated.
If the user message includes a styleContract, follow it for natural-language values.
If a string mixes an enum with prose, preserve the enum token and translate only the prose around it."""


TARGET_LOCALE_GUIDES = {
    "ko": "Korean. Natural, concise service Korean for beginner-friendly trading UI.",
    "ru": "Russian. Natural fintech/trading UI Russian; keep market abbreviations intact.",
    "pt-BR": "Brazilian Portuguese. Natural Brazilian trading UI Portuguese; avoid European phrasing.",
    "tr": "Turkish. Natural Turkish trading UI wording; keep market abbreviations intact.",
}

TRADER_STATUS_TRANSLATION_STYLE_CONTRACT: Final[dict[str, str | tuple[str, ...]]] = {
    "contentKind": "trader_status_feed",
    "tone": "casual_trader_thread",
    "voice": "short first-person trader briefing, not a product explainer",
    "languagePolicy": "korean_first_no_mixed_prose",
    "preserveTokens": ("BTC", "USDT", "TP", "SL", "PnL", "RSI", "EMA", "VWAP", "OI", "RR", "ADX", "ATR"),
    "forbiddenStyles": ("journalist_summary", "analyst_report", "formal_postmortem"),
    "forbiddenPhrases": ("next_watch_label", "next_confirmation_label", "what_to_watch"),
    "koreanTermRules": (
        "LONG prose -> 롱",
        "SHORT prose -> 숏",
        "I'm flat -> 포지션 없이 대기 중",
        "close SHORT -> 숏 청산",
        "adverse move against SHORT -> 반등 위험/손실 위험",
        "never reverse entry, stop, target, reduce, or close direction",
        "use restrained 해요체",
    ),
    "avoidExamples": (
        "다음 확인",
        "핵심 신호",
        "주요 위험으로 보고 있습니다",
        "시장 상황은 지지적",
        "무효 신호는 감지되지 않음",
        "거래량과 모멘텀은 중립적",
        "Price remains",
    ),
}

GENERIC_TRANSLATION_STYLE_CONTRACT: Final[dict[str, str | tuple[str, ...]]] = {
    "contentKind": "generic_trading_review",
    "tone": "concise_product_language",
    "forbiddenStyles": (),
    "forbiddenPhrases": (),
    "avoidExamples": (),
}

AI_REVIEW_TRANSLATION_STYLE_CONTRACT: Final[dict[str, str | tuple[str, ...]]] = {
    "contentKind": "ai_trading_review",
    "tone": "plain_user_trading_briefing",
    "voice": "direct trading desk explanation for a normal user, not an internal system log",
    "languagePolicy": "target_locale_first_no_mixed_source_prose",
    "preserveTokens": ("BTC", "USDT", "LONG", "SHORT", "TP", "SL", "PnL", "RSI", "EMA", "VWAP", "OI", "RR", "ADX", "ATR"),
    "forbiddenStyles": ("internal_event_log", "literal_machine_translation", "developer_note", "stiff_research_report"),
    "forbiddenPhrases": (
        "latest_event_label",
        "previous_wording_label",
        "risk_box_label",
        "high_dimensional_damage",
        "translation_prepared",
        "이익이 확정적",
        "확정 이익",
        "이익이 확정",
        "진입 대비",
        "가격 대비",
        "진행률",
        "정지 손실",
        "정지선",
        "손실 제한",
        "하락 위험",
        "HTF 연속",
        "보상대위험비",
        "확인 크기",
        "확인 크기 지연",
        "확인 부분",
        "판매자가 반등을 거부",
        "하락 EMA 스택",
        "두 조각",
        "세타",
    ),
    "koreanTermRules": (
        "higher timeframe / HTF -> 상위 시간대",
        "HTF continuation SHORT -> 상위 시간대 하락 추세를 따라가는 숏",
        "reward-to-risk -> 손익비",
        "reward-to-risk after fees -> 수수료를 뺀 손익비",
        "confirmation sizing -> 확인 후 추가 진입 규모",
        "delayed confirmation sizing -> 바로 크게 들어가지 말고 확인 후 추가 진입",
        "EMA stack -> EMA 흐름/EMA 배열",
        "sellers reject the rebound -> 반등이 막히는지 확인",
        "unrealized profit -> 미실현 이익",
        "realized profit -> 실현 이익",
        "breakeven stop -> 본절 손절",
        "stop moved to breakeven -> 손절가를 진입가로 이동",
        "stop loss -> 손절가/손절선",
        "target / take profit -> 목표가/익절가",
        "loss risk -> 손실 위험",
        "rebound-to-stop risk -> 손절가까지 반등할 위험",
        "current price is X, entry is Y -> 현재가 X, 진입가 Y",
        "X versus the Y entry -> 현재가 X, 진입가 Y",
        "R progress -> R 기준 이동",
        "target progress -> 목표가까지의 이동",
        "thesis -> 논리/가설",
        "invalidation -> 무효화",
    ),
    "avoidExamples": (
        "Latest event",
        "This review is tied to the latest event",
        "previous wording",
        "risk box",
        "higher-timeframe damage",
        "이 검토는 최신 이벤트",
        "이전 검토 문구",
        "현재 위험 박스",
        "고차원 손상",
        "번역 준비",
        "진입가 대비",
        "가격은 진입에 대해",
        "진입에 대해",
        "진행률",
        "locked in profit -> 수익 확정이 아니라 손실 위험을 줄인 상태",
        "preserving gains -> 실현 이익 보존이 아니라 미실현 이익을 지키는 상태",
        "downside risk in a SHORT review -> 하락 위험이 아니라 손실 위험 또는 반등 리스크",
        "HTF 연속 SHORT -> 상위 시간대 하락 추세를 따라가는 숏",
        "보상대위험비 -> 손익비",
        "확인 크기 지연 -> 확인 후 추가 진입",
        "판매자가 반등을 거부 -> 반등이 막히는지 확인",
        "하락 EMA 스택 -> 상위 시간대 EMA 흐름",
        "두 조각 -> 두 번의 진입/분할 진입",
        "thesis -> 세타가 아니라 논리 또는 가설",
    ),
}


def translation_style_contract_for_payload(payload: dict[str, Any], target_locale: str) -> dict[str, str | tuple[str, ...]]:
    if is_ai_review_translation_payload(payload):
        return AI_REVIEW_TRANSLATION_STYLE_CONTRACT
    if payload.get("feedType") != AI_TRANSLATION_SOURCE_TRADER_STATUS_FEED:
        return GENERIC_TRANSLATION_STYLE_CONTRACT
    if target_locale == "ko":
        return TRADER_STATUS_TRANSLATION_STYLE_CONTRACT
    return {
        **TRADER_STATUS_TRANSLATION_STYLE_CONTRACT,
        "languagePolicy": "target_locale_first_no_mixed_source_prose",
        "koreanTermRules": (),
        "avoidExamples": ("Next watch", "key signal", "core signal", "Price remains"),
    }


def is_ai_review_translation_payload(payload: dict[str, Any]) -> bool:
    return any(
        key in payload
        for key in (
            "structuredReview",
            "approvalReason",
            "counterThesis",
            "rationale",
            "review",
            "appliedActions",
        )
    )


def translation_request_payload(payload: dict[str, Any], target_locale: str) -> dict[str, Any]:
    source_locale = normalize_locale(payload.get("sourceLocale") or payload.get("source_locale"), CANONICAL_AI_LOCALE)
    return {
        "sourceLocale": source_locale,
        "targetLocale": target_locale,
        "targetGuide": TARGET_LOCALE_GUIDES.get(target_locale, target_locale),
        "styleContract": translation_style_contract_for_payload(payload, target_locale),
        "rules": [
            "same JSON shape",
            "do not translate keys",
            "preserve enum/status/code/id/provider/model values",
            "translate natural-language values only",
            "apply styleContract to natural-language strings",
        ],
        "content": payload,
    }
