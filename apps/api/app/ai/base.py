import json
from typing import Any, Dict, Optional

from app.paper.holding_policy import trader_holding_policy
from app.traders.models import (
    ManagementAction,
    PositionManagementPayload,
    PositionManagementResult,
    TradeReviewPayload,
    TradeReviewResult,
)


VALID_DECISIONS = {
    "APPROVE",
    "ADJUST_AND_APPROVE",
    "DEFER",
    "REJECT",
    "NEEDS_MORE_DATA",
}
VALID_RISK_LEVELS = {"LOW", "MEDIUM", "HIGH", "EXTREME"}
VALID_MANAGEMENT_DECISIONS = {
    "HOLD",
    "CANCEL_PENDING_ORDER",
    "ADJUST_PENDING_ORDER",
    "MOVE_STOP",
    "MOVE_STOP_TO_BREAKEVEN",
    "TRAIL_STOP",
    "TAKE_PARTIAL_PROFIT",
    "CLOSE_POSITION",
    "REDUCE_RISK",
    "ADD_TO_POSITION",
    "PYRAMID_POSITION",
    "LET_PROFIT_RUN",
    "NEEDS_MORE_DATA",
}
VALID_MANAGEMENT_ACTIONS = VALID_MANAGEMENT_DECISIONS | {
    "CANCEL_REMAINING_ORDERS",
    "REDUCE_SIZE",
    "EXPIRE_PLAN",
}


class BaseAIProvider:
    name = "base"
    model = "base"
    fallback = False

    async def review_trade_candidate(
        self, payload: TradeReviewPayload
    ) -> TradeReviewResult:
        raise NotImplementedError

    async def review_position_management(
        self, payload: PositionManagementPayload
    ) -> PositionManagementResult:
        raise NotImplementedError

    def normalize_result(self, raw: Dict[str, Any]) -> TradeReviewResult:
        decision = str(raw.get("decision", "NEEDS_MORE_DATA")).upper()
        if decision not in VALID_DECISIONS:
            decision = "NEEDS_MORE_DATA"
        risk_level = str(raw.get("riskLevel", "MEDIUM")).upper()
        if risk_level not in VALID_RISK_LEVELS:
            risk_level = "MEDIUM"
        confidence = self._normalize_confidence(raw.get("confidence", 50))
        confidence = max(0, min(confidence, 100))
        adjustments = raw.get("adjustments", [])
        if not isinstance(adjustments, list):
            adjustments = [str(adjustments)]
        early_exit_recommendations = raw.get("earlyExitRecommendations", [])
        if not isinstance(early_exit_recommendations, list):
            early_exit_recommendations = [str(early_exit_recommendations)]
        review_facts = self._normalize_review_facts(
            raw.get("reviewFacts"),
            [
                {"code": "entry_geometry_checked", "labelKey": "reviewFact.entryGeometryChecked", "severity": "info"},
                {"code": "risk_plan_checked", "labelKey": "reviewFact.riskPlanChecked", "severity": "info"},
            ],
        )
        return TradeReviewResult(
            decision=decision,
            confidence=confidence,
            riskLevel=risk_level,
            reviewCode=str(raw.get("reviewCode") or "ENTRY_REVIEW").upper(),
            reviewFacts=review_facts,
            riskFlags=self._normalize_string_list(raw.get("riskFlags")) or [f"risk_level:{risk_level.lower()}"],
            structuredReview=self._normalize_structured_review(raw.get("structuredReview")),
            adjustments=[str(item) for item in adjustments],
            leverageOverride=self._normalize_optional_float(raw.get("leverageOverride")),
            riskPercentOverride=self._normalize_optional_float(raw.get("riskPercentOverride")),
            earlyExitRecommendations=[str(item) for item in early_exit_recommendations],
            approvalReason=str(raw.get("approvalReason", "No provider reason supplied.")),
            counterThesis=str(raw.get("counterThesis", "Invalidation conditions require monitoring.")),
            userSummary=self._normalize_optional_text(raw.get("userSummary")),
            provider=self.name,
            model=self.model,
            fallback=self.fallback,
        )

    def normalize_management_result(self, raw: Dict[str, Any]) -> PositionManagementResult:
        decision = str(raw.get("decision", "HOLD")).upper()
        if decision not in VALID_MANAGEMENT_DECISIONS:
            decision = "NEEDS_MORE_DATA"
        risk_level = str(raw.get("riskLevel", "MEDIUM")).upper()
        if risk_level not in VALID_RISK_LEVELS:
            risk_level = "MEDIUM"
        confidence = max(0, min(self._normalize_confidence(raw.get("confidence", 50)), 100))
        actions = raw.get("actions", [])
        if not isinstance(actions, list):
            actions = [{"type": str(actions)}]
        normalized_actions = []
        for item in actions:
            action = item if isinstance(item, dict) else {"type": str(item)}
            action_type = str(action.get("type", decision)).upper()
            if action_type not in VALID_MANAGEMENT_ACTIONS:
                action_type = "HOLD"
            quantity_fraction = self._normalize_optional_float(action.get("quantityFraction"))
            if quantity_fraction is not None:
                quantity_fraction = max(0.0, min(quantity_fraction, 1.0))
            normalized_actions.append(
                ManagementAction(
                    type=action_type,
                    price=self._normalize_optional_float(action.get("price")),
                    quantityFraction=quantity_fraction,
                    reason=str(action.get("reason", "")),
                )
            )
        if not normalized_actions:
            normalized_actions = [ManagementAction(type=decision, reason="No explicit action supplied.")]
        next_review = int(self._normalize_optional_float(raw.get("nextReviewInSeconds")) or 300)
        review_facts = self._normalize_review_facts(
            raw.get("reviewFacts"),
            [
                {"code": "management_event_reviewed", "labelKey": "reviewFact.managementEventReviewed", "severity": "info"},
                {"code": "hard_rules_priority", "labelKey": "reviewFact.hardRulesPriority", "severity": "warn"},
            ],
        )
        return PositionManagementResult(
            decision=decision,
            confidence=confidence,
            riskLevel=risk_level,
            reviewCode=str(raw.get("reviewCode") or "POSITION_MANAGEMENT_REVIEW").upper(),
            reviewFacts=review_facts,
            riskFlags=self._normalize_string_list(raw.get("riskFlags")) or [f"risk_level:{risk_level.lower()}"],
            structuredReview=self._normalize_structured_review(raw.get("structuredReview")),
            actions=normalized_actions,
            riskChange=str(raw.get("riskChange", "UNCHANGED")).upper(),
            nextReviewInSeconds=max(60, min(next_review, 3600)),
            rationale=str(raw.get("rationale", "Management review completed.")),
            counterThesis=str(raw.get("counterThesis", "If invalidation fires, hard risk rules take priority.")),
            userSummary=self._normalize_optional_text(raw.get("userSummary")),
            provider=self.name,
            model=self.model,
            fallback=self.fallback,
        )

    def _normalize_string_list(self, value: Any) -> list[str]:
        if value is None or value == "":
            return []
        if not isinstance(value, list):
            value = [value]
        return [str(item) for item in value if str(item).strip()]

    def _normalize_review_facts(self, value: Any, default: list[dict[str, Any]]) -> list[dict[str, Any]]:
        facts = value if isinstance(value, list) else []
        normalized: list[dict[str, Any]] = []
        for item in facts:
            record = item if isinstance(item, dict) else {"code": str(item)}
            code = str(record.get("code") or "").strip()
            if not code:
                continue
            label_key = str(record.get("labelKey") or f"reviewFact.{code}")
            normalized.append(
                {
                    "code": code,
                    "labelKey": label_key,
                    "severity": str(record.get("severity") or "info"),
                    "detail": str(record["detail"]) if record.get("detail") not in {None, ""} else None,
                    "value": str(record["value"]) if record.get("value") not in {None, ""} else None,
                }
            )
        return normalized or default

    def _normalize_structured_review(self, value: Any) -> Optional[dict[str, Any]]:
        if not isinstance(value, dict):
            return None
        structured = {
            "verdict": self._normalize_optional_text(value.get("verdict")),
            "headline": self._normalize_optional_text(value.get("headline")),
            "action": self._normalize_optional_text(value.get("action")),
            "keyReasons": self._normalize_limited_string_list(value.get("keyReasons"), 3),
            "risks": self._normalize_limited_string_list(value.get("risks"), 2),
            "watchConditions": self._normalize_limited_string_list(value.get("watchConditions"), 3),
            "managerNote": self._normalize_optional_text(value.get("managerNote")),
        }
        has_content = any(
            structured[key]
            for key in ("verdict", "headline", "action", "keyReasons", "risks", "watchConditions", "managerNote")
        )
        return structured if has_content else None

    def _normalize_limited_string_list(self, value: Any, limit: int) -> list[str]:
        return self._normalize_string_list(value)[:limit]

    def _normalize_optional_text(self, value: Any) -> Optional[str]:
        if value is None:
            return None
        text = str(value).strip()
        return text or None

    def _normalize_confidence(self, value: Any) -> int:
        if isinstance(value, (int, float)):
            if 0 <= float(value) <= 1:
                return int(float(value) * 100)
            return int(value)
        if isinstance(value, str):
            normalized = value.strip().upper().replace("%", "")
            try:
                numeric = float(normalized)
                if 0 <= numeric <= 1:
                    return int(numeric * 100)
                return int(numeric)
            except ValueError:
                pass
            if normalized.isdigit():
                return int(normalized)
            confidence_map = {
                "LOW": 35,
                "MEDIUM": 60,
                "MID": 60,
                "MODERATE": 60,
                "HIGH": 80,
                "VERY_HIGH": 90,
                "EXTREME": 95,
            }
            return confidence_map.get(normalized, 50)
        return 50

    def _normalize_optional_float(self, value: Any) -> Optional[float]:
        if value is None or value == "":
            return None
        try:
            return float(value)
        except (TypeError, ValueError):
            return None


TRADER_REVIEW_POLICIES: Dict[str, Dict[str, Any]] = {
    "channel-rider": {
        "temperament": "balanced tactical; do not reject a valid channel edge only because 4H is sideways, but reduce risk if channel quality is mixed",
        "approveWhen": "channel edge, RSI band, stop beyond channel, and RR are coherent",
        "adjustWhen": "channel is plausible but trend alignment or confirmation is weaker",
        "rejectWhen": "channel is forced, entries are on the wrong side, or price already accepted beyond invalidation",
    },
    "volume-breaker": {
        "temperament": "confirmation-first but not passive; prefer ADJUST_AND_APPROVE when level flip is valid but entry should be smaller",
        "approveWhen": "breakout/retest level, volume expansion, and continuation room are all present",
        "adjustWhen": "breakout is valid but late or volume is fading",
        "rejectWhen": "price is back inside the broken level or the move is pure chase",
    },
    "pullback-architect": {
        "temperament": "patient builder; scale entries can remain valid if thesis is intact, but cancel weak later scales",
        "approveWhen": "HTF trend, EMA zone, funding, and staged sizing are coherent",
        "adjustWhen": "scales are too tight/wide or later entries should be cancelled after first fill",
        "rejectWhen": "pullback has become structure failure or funding/OI is overheated",
    },
    "leverage-hunter": {
        "temperament": "decisive but risk-aware; leverage is allowed only after structure trigger and crowding confirmation",
        "approveWhen": "crowding, funding/OI context, taker flow, and 15m structure trigger agree",
        "adjustWhen": "edge exists but leverage/risk should be reduced",
        "rejectWhen": "this is only funding overheat without structure or opposite squeeze risk is uncontrolled",
    },
    "liquidity-reaper": {
        "temperament": "fast reversal specialist; approve sharp sweep setups, but do not confuse real breakout with stop hunt",
        "approveWhen": "wick, sweep distance, reclaim/fail close, volume, and stop placement are coherent",
        "adjustWhen": "sweep is valid but TP/SL or scale split needs tightening",
        "rejectWhen": "price accepted beyond swept level or volume does not support stop run thesis",
    },
    "volatility-squeezer": {
        "temperament": "momentum expansion trader; allow quick participation but demand fast invalidation",
        "approveWhen": "compression and expansion impulse are both visible and risk is tight",
        "adjustWhen": "breakout is valid but first pullback entry should be reduced or stop tightened",
        "rejectWhen": "price already re-entered compression or volume/body impulse is absent",
    },
    "trend-sentinel": {
        "temperament": "slow, durable trend follower; less concerned with quick TP, more concerned with trend integrity",
        "approveWhen": "4H/1D trend, EMA stack, and trailing plan agree",
        "adjustWhen": "trend is valid but entry is late or funding is warming up",
        "rejectWhen": "trend stack is broken, entry is exhaustion, or stop cannot trail logically",
    },
    "range-maker": {
        "temperament": "mean reversion specialist; quick to take profit and quick to abandon breakouts",
        "approveWhen": "ADX/trend is flat, price is near range edge, and funding/volume are neutral",
        "adjustWhen": "range trade is valid but TP should be closer to midpoint or size lower",
        "rejectWhen": "volume expansion or trend strength suggests breakout rather than range",
    },
    "funding-contrarian": {
        "temperament": "contrarian but not blind; funding alone never approves a trade",
        "approveWhen": "funding/premium extreme plus price stall and structure trigger agree",
        "adjustWhen": "edge exists but crowding can persist, so leverage or size should be reduced",
        "rejectWhen": "no structure trigger, crowded side is accelerating, or premium normalized",
    },
    "orderflow-sniper": {
        "temperament": "fast scalper; action can be aggressive only when micro flow is clean and fee-aware",
        "approveWhen": "1m/5m impulse, taker imbalance, stop distance, and fee buffer are all coherent",
        "adjustWhen": "edge exists but chase risk or fee drag argues for smaller size",
        "rejectWhen": "flow is neutral/flipped, volatility is chaotic, or RR is negative after fees",
    },
    "donchian-breakout": {
        "temperament": "breakout participant; accept clean BTC range expansion but reject late chase back inside the range",
        "approveWhen": "Donchian boundary break, volume/OI participation, retest plan, and ATR stop are coherent",
        "adjustWhen": "breakout is valid but second retest entry should be cancelled or leverage capped",
        "rejectWhen": "price is back inside the range, volume is absent, or TP is already too close after fees",
    },
    "ichimoku-cloud-pilot": {
        "temperament": "patient trend rider; prefer continuation only when cloud proxy and HTF structure agree",
        "approveWhen": "cloud proxy hold, 4H trend, RSI health, and wider RR support a holdable trade",
        "adjustWhen": "trend is valid but cloud is flat, funding is crowded, or entry needs deeper scale spacing",
        "rejectWhen": "cloud proxy is broken, trend is mixed, or the trade is only a short-term bounce",
    },
    "vwap-reclaimer": {
        "temperament": "fair-value reclaim trader; approve only if reclaim/rejection is not just noise",
        "approveWhen": "VWAP/EMA20 proxy reclaim or failure closes cleanly with fading counter-flow",
        "adjustWhen": "reclaim is real but target is close, so size/leverage should be smaller",
        "rejectWhen": "price is chopping around fair value or flow expands against the reclaim",
    },
    "wyckoff-spring": {
        "temperament": "range-extreme reversal specialist; decisive after spring/upthrust, but fast to invalidate",
        "approveWhen": "sweep distance, wick, volume spike, and reclaim/fail close all confirm a trap",
        "adjustWhen": "spring/upthrust is plausible but stop needs to sit outside the true wick extreme",
        "rejectWhen": "the market accepts beyond the swept level or higher timeframe breakout pressure dominates",
    },
    "rsi-divergence-scout": {
        "temperament": "confirmation-first reversal scout; divergence alone is not enough",
        "approveWhen": "momentum divergence, structure reclaim/failure, and fee-adjusted RR are all present",
        "adjustWhen": "divergence exists but HTF trend is strong, requiring smaller size or faster partials",
        "rejectWhen": "RSI divergence is weak, no structure trigger exists, or trend acceleration continues",
    },
    "session-raider": {
        "temperament": "time-window specialist; aggressive only during real liquidity transition windows",
        "approveWhen": "session range break, body expansion, volume, and fast expiry plan align",
        "adjustWhen": "break is valid but order should expire quickly or TP should be closer",
        "rejectWhen": "thin-liquidity wick, stale session timing, or immediate re-entry into range",
    },
    "imbalance-hunter": {
        "temperament": "displacement retest trader; prefers clean midpoint entries over chasing candles",
        "approveWhen": "strong displacement left a meaningful imbalance and retest entry is on the correct side",
        "adjustWhen": "imbalance is valid but continuation entry should be smaller after first fill",
        "rejectWhen": "midpoint is sliced through, displacement is weak, or liquidity target is too near",
    },
    "momentum-ignition": {
        "temperament": "high-conviction momentum trader; can approve higher leverage, but never average down",
        "approveWhen": "EMA stack, RSI thrust, OI, taker flow, and continuation room align",
        "adjustWhen": "ignition is valid but volatility requires leverage cap or immediate trail plan",
        "rejectWhen": "this is late chase, flow is mixed, or stop distance is too tight for BTC volatility",
    },
    "bollinger-reversion": {
        "temperament": "statistical mean-reversion trader; conservative in trends, active in contained ranges",
        "approveWhen": "band stretch, RSI exhaustion, weak trend regime, and midpoint target are coherent",
        "adjustWhen": "reversion is plausible but trend strength argues for reduced size",
        "rejectWhen": "band-walk trend is active, volume expands through the band, or target is too small",
    },
    "atr-trail-commander": {
        "temperament": "trend commander; less eager to take quick profits and more willing to trail winners",
        "approveWhen": "HTF trend, ATR stop, continuation structure, and wider target plan support a hold",
        "adjustWhen": "trend is valid but stop is too wide or scale entries should be further apart",
        "rejectWhen": "ATR stop cannot fit account risk or the trend has already exhausted",
    },
}


TRADER_POST_LOSS_DISCIPLINE: Dict[str, str] = {
    "channel-rider": "After a channel stop, require a newly redrawn channel edge plus fresh 15m confirmation; do not reuse the failed boundary.",
    "volume-breaker": "After a failed breakout, demand a new level flip with renewed volume/OI participation; late retests are rejected.",
    "pullback-architect": "After a stopped pullback, cancel the prior scale map and require HTF trend plus EMA zone recovery before another staged entry.",
    "leverage-hunter": "After a leverage stop, cap aggressiveness and require both crowding and structure trigger to refresh before considering approval.",
    "liquidity-reaper": "After a failed sweep, require a different liquidity pool or a much cleaner reclaim/failure candle; repeated wick fades are blocked.",
    "volatility-squeezer": "After a squeeze failure, wait for a fresh compression base and reject immediate re-entry into the same expansion candle.",
    "trend-sentinel": "After a trend stop, require HTF trend repair and a new trailing-stop path; do not approve normal pullback language after structure broke.",
    "range-maker": "After a range stop, require evidence that the breakout attempt failed and the range edge rebuilt before fading it again.",
    "funding-contrarian": "After a funding fade loss, funding alone is disqualified; require price stall, structure trigger, and crowding deceleration together.",
    "orderflow-sniper": "After a scalp stop, require a new 1m/5m impulse cluster with fee-positive RR; never retry the same flow burst.",
    "donchian-breakout": "After a Donchian fakeout, require price to rebuild outside the range with participation, not just retouch the boundary.",
    "ichimoku-cloud-pilot": "After a cloud continuation stop, require cloud proxy recovery and HTF alignment; flat-cloud rebounds are deferred.",
    "vwap-reclaimer": "After a failed fair-value reclaim, require a clean recapture/rejection and fading counter-flow before any retry.",
    "wyckoff-spring": "After a failed spring/upthrust, require a new trap at a different extreme or decisive reclaim; same-wick retries are rejected.",
    "rsi-divergence-scout": "After a divergence loss, require structure confirmation in addition to momentum divergence; weak repeat divergence is deferred.",
    "session-raider": "After a session-break stop, require the next valid liquidity transition window; stale same-session retries are blocked.",
    "imbalance-hunter": "After an imbalance midpoint failure, require a fresh displacement leg and intact midpoint; sliced gaps cannot be reused.",
    "momentum-ignition": "After ignition fails, require renewed OI/taker alignment and continuation room; do not approve average-down attempts.",
    "bollinger-reversion": "After a band fade stop, require trend strength to cool and mean target distance to reopen; band-walk fades are rejected.",
    "atr-trail-commander": "After an ATR trend stop, require a new trend leg with account-risk-compatible ATR; do not relabel exhaustion as continuation.",
}


TRADER_MANAGEMENT_POLICIES: Dict[str, Dict[str, Any]] = {
    "channel-rider": {
        "bias": "protect at channel midline; close if channel invalidates",
        "allowedAggression": "moderate patience inside channel; add once near the channel edge only if stop remains outside the same channel and RR improves; pyramid only after clean midline reclaim/acceptance",
    },
    "volume-breaker": {
        "bias": "continuation must keep volume/level acceptance; failed retests are closed quickly",
        "allowedAggression": "add on a clean retest hold with fading counter-volume; pyramid on renewed volume expansion after level acceptance; close fast if the broken level is lost",
    },
    "pullback-architect": {
        "bias": "manage remaining scale orders actively; cancel later entries when first fill already moves",
        "allowedAggression": "can average inside the planned EMA/Fib pullback zone; pyramid only after structure resumes with higher-low/lower-high confirmation; defensive after EMA50 failure",
    },
    "leverage-hunter": {
        "bias": "crowding setups demand faster stop tightening and risk reduction",
        "allowedAggression": "add only when OI/funding crowding strengthens and structure trigger still holds; pyramid on confirmed squeeze acceleration; reduce decisively when flow flips",
    },
    "liquidity-reaper": {
        "bias": "protect quickly after range midpoint; close if wick extreme is accepted",
        "allowedAggression": "small add is allowed only on retest rejection/reclaim of the swept level; pyramid after displacement away from the wick; patience window stays short",
    },
    "volatility-squeezer": {
        "bias": "if expansion stalls, move stop or close; if expansion persists, trail",
        "allowedAggression": "pyramid during clean expansion with rising range and volume; add on first compression retest only if price does not re-enter the old range",
    },
    "trend-sentinel": {
        "bias": "prefer trailing and holding while HTF structure is intact",
        "allowedAggression": "pyramid on HTF continuation pullbacks while trailing stop tightens; average only near planned trend support/resistance, never after HTF break",
    },
    "range-maker": {
        "bias": "take profit near midpoint and exit accepted breakouts",
        "allowedAggression": "can add near the outer range edge only while ADX/trend remains weak; never pyramid into the midpoint; never fight a volume breakout",
    },
    "funding-contrarian": {
        "bias": "harvest funding normalization; reduce if crowded side accelerates",
        "allowedAggression": "average only after funding/premium stays extreme but price stops extending; pyramid after funding normalization begins and structure confirms reversal",
    },
    "orderflow-sniper": {
        "bias": "micro scalps expire quickly; flow flips are close/reduce events",
        "allowedAggression": "can add or pyramid only on immediate taker-flow confirmation with tight stop unchanged; otherwise reduce or close quickly",
    },
    "donchian-breakout": {
        "bias": "keep winners alive outside the broken range; cancel if price accepts back inside",
        "allowedAggression": "add on a clean retest of the broken Donchian boundary; pyramid only after new range expansion with ATR trail intact",
    },
    "ichimoku-cloud-pilot": {
        "bias": "hold while cloud proxy and HTF trend remain intact",
        "allowedAggression": "average only near the cloud edge; pyramid after continuation candle clears the prior swing and stop can trail below/above cloud",
    },
    "vwap-reclaimer": {
        "bias": "mean/fair-value trades should protect quickly when reclaim stalls",
        "allowedAggression": "add only on fair-value retest hold/fail; do not pyramid far from VWAP proxy unless flow expands in favor",
    },
    "wyckoff-spring": {
        "bias": "trap trades must work quickly; invalidation is the wick extreme acceptance",
        "allowedAggression": "small add on retest of swept level is allowed; pyramid only after displacement away from the spring/upthrust",
    },
    "rsi-divergence-scout": {
        "bias": "divergence trades need structure confirmation and should reduce if momentum re-accelerates",
        "allowedAggression": "average only at the planned divergence swing; pyramid after a confirmed higher-low/lower-high and improving RSI",
    },
    "session-raider": {
        "bias": "session trades are time-sensitive; stale orders and flat momentum should be cancelled fast",
        "allowedAggression": "one add is allowed only during the same session impulse; no late pyramiding after the window closes",
    },
    "imbalance-hunter": {
        "bias": "manage the imbalance midpoint; cancel if midpoint fails",
        "allowedAggression": "add at the imbalance midpoint or after continuation resumes; pyramid only if displacement extension remains open",
    },
    "momentum-ignition": {
        "bias": "ride clean ignition but cut immediately when flow flips",
        "allowedAggression": "pyramid only with sustained OI/taker confirmation and no stop widening; never average down after failed ignition",
    },
    "bollinger-reversion": {
        "bias": "take profit toward the mean and do not fight band-walk trends",
        "allowedAggression": "average only within planned band extension while trend strength stays weak; no pyramiding beyond mean target",
    },
    "atr-trail-commander": {
        "bias": "prefer ATR trailing over early fixed exits while HTF trend remains intact",
        "allowedAggression": "pyramid after profit cushion and fresh continuation confirmation; average only if ATR stop and account risk remain valid",
    },
}


def trader_review_policy(trader_id: str) -> Dict[str, Any]:
    policy = dict(TRADER_REVIEW_POLICIES.get(trader_id, {}))
    if trader_id in TRADER_POST_LOSS_DISCIPLINE:
        policy["postLossDiscipline"] = TRADER_POST_LOSS_DISCIPLINE[trader_id]
    return policy


def trader_management_policy(trader_id: str) -> Dict[str, Any]:
    policy = dict(TRADER_MANAGEMENT_POLICIES.get(trader_id, {}))
    policy["holdingPolicy"] = trader_holding_policy(trader_id).as_prompt_dict()
    return policy


def extract_json_object(text: str) -> Dict[str, Any]:
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.find("{")
        end = text.rfind("}")
        if start >= 0 and end > start:
            return json.loads(text[start : end + 1])
    raise ValueError("Provider response did not contain valid JSON.")


def entry_approval_prompt(payload: TradeReviewPayload) -> str:
    locale = "ko" if (payload.locale or "ko").lower().startswith("ko") else "en"
    language_instruction = (
        "Write structuredReview, approvalReason, counterThesis, every adjustments item, and every earlyExitRecommendations item in Korean. Keep reviewFacts as language-neutral codes and labelKey values."
        if locale == "ko"
        else "Write structuredReview, approvalReason, counterThesis, every adjustments item, and every earlyExitRecommendations item in English. Keep reviewFacts as language-neutral codes and labelKey values."
    )
    data = {
        "trader": payload.trader.model_dump(),
        "strategyReviewerPolicy": trader_review_policy(payload.trader.id),
        "symbol": payload.symbol,
        "locale": locale,
        "candidate": payload.candidate.model_dump(),
        "recentAiReviews": payload.recentAiReviews,
        "recentManagementReviews": payload.recentManagementReviews,
        "activeExposure": payload.activeExposure,
        "recentTradeEvents": payload.recentTradeEvents,
        "lossDiscipline": payload.lossDiscipline,
        "marketSnapshot": {
            "symbol": payload.marketSnapshot.get("symbol"),
            "price": payload.marketSnapshot.get("price"),
            "timeframes": payload.marketSnapshot.get("timeframes"),
            "derivatives": payload.marketSnapshot.get("derivatives"),
        },
    }
    return (
        "You are the ENTRY APPROVAL reviewer for a futures paper-trading candidate. Return only strict JSON with keys "
        "decision, confidence, riskLevel, reviewCode, reviewFacts, riskFlags, structuredReview, adjustments, leverageOverride, riskPercentOverride, "
        "earlyExitRecommendations, approvalReason, counterThesis. Valid decisions are "
        "APPROVE, ADJUST_AND_APPROVE, DEFER, REJECT, NEEDS_MORE_DATA. "
        "This is not financial advice and no real order will be placed. "
        "Treat paper-trading status as execution context only; do not use it as approval evidence. "
        "Use the strategyReviewerPolicy to calibrate your judgment: do not be blindly conservative, "
        "but do not approve inconsistent geometry, missing stops, unsupported leverage, or thesis conflicts. "
        "When lossDiscipline.active is true or recentTradeEvents show stop-loss or thesis-failure loss, apply the trader's postLossDiscipline strictly. "
        "Prefer ADJUST_AND_APPROVE when the edge is real and the flaw is fixable by smaller size, lower leverage, "
        "entry cancellation, or a stricter early-exit rule. "
        "Before approving, run these second-pass checks: "
        "1) direction must match the setup and must not contradict the market structure, "
        "2) LONG entries must be at or below current price and SHORT entries at or above current price, "
        "3) stopLoss must sit beyond every entry on the loss side, "
        "4) all takeProfits must sit on the profit side and weighted RR after feeBufferPercent must meet riskPlan.minRiskReward, "
        "5) leveragePlan.suggestedLeverage must not exceed leveragePlan.maxLeverage and must be justified by setup quality, "
        "and if you return leverageOverride for an approved paper trade, keep it between 5 and leveragePlan.maxLeverage; "
        "use REJECT or DEFER instead of approving with leverage below 5 when the setup is not strong enough for the service's futures range, "
        "6) orderIntent must be compatible with pending paper entries and must not imply a real order, "
        "7) fees/slippage buffer must be included in the risk review, "
        "8) earlyExitRules and invalidation must be specific enough to stop the trade before the full stop when thesis fails. "
        "structuredReview is the primary user-facing explanation. It must be an object with verdict, headline, action, keyReasons, risks, watchConditions, managerNote. "
        "Write it for a beginner who understands LONG/SHORT but not every indicator: headline is one plain-language decision, action is one concrete next step, "
        "keyReasons has up to 3 short bullets, risks has up to 2 bullets, watchConditions has up to 3 exact price/time/indicator triggers, and managerNote is one concise desk note. "
        "Do not dump raw metrics without saying what they mean. Do not hide the actual trade reason behind generic learning or paper-trading language. "
        "approvalReason is a legacy compatibility field. For APPROVE or ADJUST_AND_APPROVE, write 1-2 compact sentences that mirror structuredReview and connect "
        "the trader thesis, entry/stop/target geometry, fee-aware RR, risk adjustment, and the main residual risk. "
        "For REJECT, DEFER, or NEEDS_MORE_DATA, approvalReason must explain the blocker and what evidence would change the decision. "
        "Do not describe approval as paper-trading learning, training suitability, or because no real order will be placed. "
        "Do not use setupScore as the main reason; mention setupScore only after concrete market and geometry evidence. "
        "counterThesis must be a concrete kill-switch or opposing market story, not a generic warning. "
        "Reject or defer if any required candidate field is missing or internally inconsistent. "
        f"{language_instruction}\n\n"
        f"Payload:\n{json.dumps(data, ensure_ascii=False)}"
    )


def review_prompt(payload: TradeReviewPayload) -> str:
    return entry_approval_prompt(payload)


def position_management_review_prompt(payload: PositionManagementPayload) -> str:
    locale = "ko" if (payload.locale or "ko").lower().startswith("ko") else "en"
    event_type = str(payload.event.eventType or "")
    is_price_shock = event_type == "common_price_shock"
    language_instruction = (
        "Write structuredReview, rationale, counterThesis, and every action reason in Korean. Keep reviewFacts as language-neutral codes and labelKey values."
        if locale == "ko"
        else "Write structuredReview, rationale, counterThesis, and every action reason in English. Keep reviewFacts as language-neutral codes and labelKey values."
    )
    shock_instruction = (
        "FAST-MARKET EVENT MODE: the scanner detected an absolute BTC price move at or above the configured threshold. "
        "Treat this as a short-lived event review, not a normal heartbeat. Decide whether the pending order/position thesis is still valid, "
        "whether adverse movement requires cancel/reduce/close, whether the original thesis still justifies controlled averaging, "
        "or whether favorable movement deserves breakeven stop, partial profit, pyramiding, or hold. "
        "Never widen stops or exceed leverage/account deployment caps. For this event, set nextReviewInSeconds to 120 unless the position/order is closed or cancelled. "
        "If the move is noise and structure is intact, HOLD is acceptable, but explain the exact invalidation to watch over the next 120 seconds. "
        if is_price_shock
        else ""
    )
    data = {
        "trader": payload.trader.model_dump(),
        "strategyManagementPolicy": trader_management_policy(payload.trader.id),
        "symbol": payload.symbol,
        "locale": locale,
        "event": payload.event.model_dump(),
        "exposure": payload.exposure.model_dump(),
        "recentManagementReviews": payload.recentManagementReviews,
        "recentTradeEvents": payload.recentTradeEvents,
        "siblingExposures": payload.siblingExposures,
        "accountState": payload.accountState,
        "marketSnapshot": {
            "symbol": payload.marketSnapshot.get("symbol"),
            "price": payload.marketSnapshot.get("price"),
            "timeframes": payload.marketSnapshot.get("timeframes"),
            "derivatives": payload.marketSnapshot.get("derivatives"),
            "system": payload.marketSnapshot.get("system"),
        },
    }
    return (
        "You are the POSITION MANAGEMENT reviewer for a live paper order or position. Return only strict JSON with keys "
        "decision, confidence, riskLevel, reviewCode, reviewFacts, riskFlags, structuredReview, actions, riskChange, nextReviewInSeconds, rationale, counterThesis. "
        "Valid decisions are HOLD, CANCEL_PENDING_ORDER, ADJUST_PENDING_ORDER, MOVE_STOP, MOVE_STOP_TO_BREAKEVEN, "
        "TRAIL_STOP, TAKE_PARTIAL_PROFIT, CLOSE_POSITION, REDUCE_RISK, ADD_TO_POSITION, PYRAMID_POSITION, "
        "LET_PROFIT_RUN, NEEDS_MORE_DATA. "
        "Valid action.type values are the same plus CANCEL_REMAINING_ORDERS, REDUCE_SIZE, EXPIRE_PLAN. "
        "This is paper trading only and no real exchange order will be placed. Hard risk rules are superior to your decision. "
        "Never widen a stop or exceed leverage/account deployment caps. "
        "You may reduce risk, cancel pending paper orders, move a stop tighter, take partial profit, close a paper position, hold, "
        "or propose controlled additional paper exposure. "
        "Use ADD_TO_POSITION only when adverse movement is still inside the original thesis, the added order improves average price, "
        "the existing hard stop does not move farther away, and recent reviews/events do not show repeated thesis decay. "
        "Use PYRAMID_POSITION only when the position is already working, structure confirms continuation, "
        "the added order does not turn a winner into an overleveraged chase, and accountState has spare margin. "
        "Use strategyManagementPolicy to match the trader's style. You should actively intervene when the event shows thesis decay, "
        "profit protection, stale pending entries, or volatility/funding/orderflow regime change. "
        "The nested holdingPolicy is mandatory: do not move stops to breakeven, take partial profit, or trail earlier than that policy "
        "unless the event is a hard invalidation or fast-market risk event. Slow trend/channel/pullback traders should be allowed to hold "
        "through normal pullbacks; scalp/orderflow traders can protect faster. "
        "structuredReview is the primary user-facing explanation. It must be an object with verdict, headline, action, keyReasons, risks, watchConditions, managerNote. "
        "Write it for a beginner who needs to know what changed, what to do now, why, what can go wrong, and exactly what to watch next. "
        "Use short bullets instead of one dense paragraph. Translate indicators into plain meaning, and include raw numbers only when they support a clear action. "
        "rationale is a legacy compatibility field; keep it to 1-2 compact sentences that mirror structuredReview. "
        "If evidence is weak, choose HOLD or NEEDS_MORE_DATA, but include the exact next condition that would trigger action. "
        f"{shock_instruction}"
        f"{language_instruction}\n\n"
        f"Payload:\n{json.dumps(data, ensure_ascii=False)}"
    )


def management_prompt(payload: PositionManagementPayload) -> str:
    return position_management_review_prompt(payload)
