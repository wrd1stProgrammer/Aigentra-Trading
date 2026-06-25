from typing import Final


STRUCTURED_REVIEW_QUALITY_CONTRACT: Final[str] = (
    "User-facing quality guardrail for structuredReview: the reader should understand why this review matters without knowing the internal checklist. "
    "Write a decision path, not an indicator checklist: current call, why the setup or position still deserves that call, what would prove the thesis wrong, and what the user should watch next. "
    "Do not reuse those phrases or their close translations: '시장 상황은 지지적', '무효 신호는 감지되지 않음', "
    "'거래량과 모멘텀은 중립적', '명확한 무효 신호 없음', '조건이 악화되면 논리가 약화될 수 있음', "
    "'higher-timeframe trend is confirmed', 'no failure signal is present', 'no invalidation signal is present', "
    "'valid price structure', 'risk-reward ratio is valid', 'hold the position and continue monitoring'. "
    "headline, action, keyReasons, risks, watchConditions, and managerNote must each do a different job: "
    "headline says the current call, action says what the trader is doing now, keyReasons name concrete evidence, "
    "risks explain what could go wrong, watchConditions name exact market events that would change the call, "
    "and managerNote tells how to behave until the next review. "
    "do not write two structuredReview fields that make the same claim with different words; if headline says the short is still valid, keyReasons must explain why with price/entry/stop/target context, not repeat that it is valid. "
    "Do not reuse the same reason/action/watch pattern from recentAiReviews or recentManagementReviews; if the decision is still HOLD, "
    "explain what is still valid now and which single condition would change it. "
    "If you mention EMA, ADX, RSI, volume, momentum, risk-reward, or a timeframe trend, explain what the number means for the trade before using it as a trigger. "
    "For example, do not write only '4H EMA50 64115.22 breaks'; explain whether that would show buyers reclaimed control, the short thesis failed, or the stop/exit should be reconsidered. "
    "Use Korean for Korean locale without mixing English, except for LONG/SHORT, BTCUSDT, timeframe labels like 15m, and numbers. "
    "Avoid abstract claims such as supportive market, neutral momentum, valid structure, or no invalidation unless the same sentence explains the exact price, candle, stop, target, or trader thesis that makes it true. "
)
