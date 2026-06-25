from typing import Final


STRUCTURED_REVIEW_QUALITY_CONTRACT: Final[str] = (
    "User-facing quality guardrail for structuredReview: the reader should understand why this review matters without knowing the internal checklist. "
    "Do not reuse those phrases or their close translations: '시장 상황은 지지적', '무효 신호는 감지되지 않음', "
    "'거래량과 모멘텀은 중립적', '명확한 무효 신호 없음', '조건이 악화되면 논리가 약화될 수 있음'. "
    "headline, action, keyReasons, risks, watchConditions, and managerNote must each do a different job: "
    "headline says the current call, action says what the trader is doing now, keyReasons name concrete evidence, "
    "risks explain what could go wrong, watchConditions name exact market events that would change the call, "
    "and managerNote tells how to behave until the next review. "
    "Do not reuse the same reason/action/watch pattern from recentAiReviews or recentManagementReviews; if the decision is still HOLD, "
    "explain what is still valid now and which single condition would change it. "
    "Use Korean for Korean locale without mixing English, except for LONG/SHORT, BTCUSDT, timeframe labels like 15m, and numbers. "
    "Avoid abstract claims such as supportive market, neutral momentum, valid structure, or no invalidation unless the same sentence explains the exact price, candle, stop, target, or trader thesis that makes it true. "
)
