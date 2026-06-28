import json
import pytest
from decimal import Decimal

import app.main as main_module
from app.ai.mock_provider import MockAIProvider
from app.ai.base import (
    entry_approval_prompt,
    management_prompt,
    position_management_review_prompt,
    review_prompt,
    trader_review_policy,
)
from app.db import PaperPositionRecord
from app.market.snapshot import classify_market_regime, derivative_context
from app.main import (
    enforce_pending_order_cancel_event,
    heartbeat_event_for_position,
    refresh_stale_position_management_review,
    trade_plan_from_review,
)
from app.paper.management import position_management_events
from app.traders.models import (
    ManagedExposure,
    ManagementEvent,
    PositionManagementPayload,
    PositionManagementResult,
    StructuredReview,
    TradeReviewPayload,
    TradeReviewResult,
)
from app.traders.registry import get_strategy, list_traders


def sample_snapshot():
    price = 68000.0
    return {
        "symbol": "BTCUSDT",
        "price": price,
        "intervals": ["1m", "5m", "15m", "1h", "4h"],
        "timeframes": {
            "1m": {"close": price, "volume": 180.0},
            "5m": {"close": price, "volume": 740.0},
            "15m": {
                "open": 68100.0,
                "high": 68600.0,
                "low": 67400.0,
                "close": price,
                "volume": 1600.0,
                "rsi14": 49.0,
                "atr14": 520.0,
                "volumeZscore": 1.2,
                "latestCandle": {
                    "open": 68100.0,
                    "high": 68600.0,
                    "low": 67400.0,
                    "close": price,
                    "volume": 1600.0,
                },
            },
            "1h": {
                "open": 67900.0,
                "high": 68500.0,
                "low": 67100.0,
                "close": price,
                "ema20": 67800.0,
                "ema50": 67000.0,
                "rsi14": 47.0,
                "atr14": 780.0,
                "volumeZscore": 1.1,
                "trend": "bullish",
                "swings": {"highs": [67200.0, 67800.0, 68400.0], "lows": [65000.0, 65800.0, 66800.0]},
                "channel": {"slope": 18.0, "lower": 67500.0, "mid": 68400.0, "upper": 69300.0, "position": 0.28},
                "priceChange": {"1": 0.001, "4": 0.004, "12": 0.011},
            },
            "4h": {
                "open": 66600.0,
                "high": 69000.0,
                "low": 65000.0,
                "close": price,
                "ema20": 67200.0,
                "ema50": 65800.0,
                "rsi14": 54.0,
                "atr14": 1600.0,
                "volumeZscore": 0.4,
                "trend": "bullish",
                "swings": {"highs": [65000.0, 67000.0, 69000.0], "lows": [62000.0, 64000.0, 66000.0]},
                "channel": {"slope": 45.0, "lower": 65500.0, "mid": 67500.0, "upper": 69500.0, "position": 0.63},
            },
        },
        "derivatives": {
            "openInterest": 123456.7,
            "fundingRate": 0.00004,
            "markPrice": price,
            "indexPrice": price * 0.9998,
            "openInterestStats": {
                "historyAvailable": True,
                "sumOpenInterest": 123456.7,
                "sumOpenInterestValue": 8395000000.0,
                "changePercent5m": 0.35,
                "changePercent30m": 0.9,
            },
            "fundingStats": {
                "historyAvailable": True,
                "absPercentile": 62.0,
                "latest": 0.00004,
                "averageAbs": 0.00003,
            },
            "longShortRatios": {
                "globalAccount": {"longAccount": 0.52, "shortAccount": 0.48, "longShortRatio": 1.08, "longSkew": 0.08},
                "topAccount": {"longAccount": 0.54, "shortAccount": 0.46, "longShortRatio": 1.17, "longSkew": 0.17},
                "topPosition": {"longAccount": 0.55, "shortAccount": 0.45, "longShortRatio": 1.22, "longSkew": 0.22},
            },
            "takerBuySell": {
                "buySellRatio": 1.08,
                "buyVol": 5600.0,
                "sellVol": 5185.0,
                "buyShare": 1.08 / 2.08,
            },
            "crowding": {
                "longCrowded": False,
                "shortCrowded": False,
                "crowdedSide": None,
                "oiChangePercent30m": 0.9,
                "fundingAbsPercentile": 62.0,
            },
        },
        "marketRegime": {
            "primary": "trend",
            "adx1h": 26.0,
            "adx4h": 24.0,
            "volumeZscore15m": 1.2,
            "priceChange1h": 0.001,
            "bollingerWidth1h": 1.8,
            "keltnerWidth1h": 2.1,
        },
    }


def prompt_payload(prompt: str) -> dict:
    return json.loads(prompt.split("Payload:", 1)[1])


def test_pending_order_cancel_event_overrides_hold_review():
    review = PositionManagementResult(
        decision="HOLD",
        confidence=82,
        riskLevel="MEDIUM",
        actions=[],
        riskChange="UNCHANGED",
        nextReviewInSeconds=900,
        rationale="Wait for more confirmation.",
        counterThesis="Cancel if the level is missed.",
    )
    event = ManagementEvent(
        eventType="imbalance_retest_missed",
        phase="PENDING_ORDER",
        severity="MEDIUM",
        reason="Projected take-profit zone was reached before the pending entry filled.",
        suggestedAction="CANCEL_PENDING_ORDER",
    )
    exposure = ManagedExposure(
        kind="order",
        id=758,
        status="open",
        side="SHORT",
        quantity=0.278,
        limitPrice=62826.9,
        stopLoss=62964.9,
        takeProfit=61476.2,
        leverage=5,
    )

    enforced = enforce_pending_order_cancel_event(review, event=event, exposure=exposure)

    assert enforced.decision == "CANCEL_PENDING_ORDER"
    assert enforced.actions[0].type == "CANCEL_PENDING_ORDER"
    assert enforced.actions[0].reason == event.reason
    assert "PENDING_ORDER_CANCEL_EVENT_ENFORCED" in enforced.riskFlags


def test_derivative_context_and_regime_contract():
    derivatives = derivative_context(
        open_interest={"openInterest": 123000.0, "time": 1770000000000},
        premium_index={
            "markPrice": 68020.0,
            "indexPrice": 68000.0,
            "lastFundingRate": 0.00004,
            "nextFundingTime": 1770003600000,
        },
        open_interest_history=[
            {"sumOpenInterest": 120000.0, "sumOpenInterestValue": 8000000000.0},
            {"sumOpenInterest": 121000.0, "sumOpenInterestValue": 8100000000.0},
            {"sumOpenInterest": 123000.0, "sumOpenInterestValue": 8300000000.0},
            {"sumOpenInterest": 124500.0, "sumOpenInterestValue": 8400000000.0},
            {"sumOpenInterest": 125000.0, "sumOpenInterestValue": 8450000000.0},
            {"sumOpenInterest": 126000.0, "sumOpenInterestValue": 8500000000.0},
            {"sumOpenInterest": 127000.0, "sumOpenInterestValue": 8550000000.0},
        ],
        funding_history=[
            {"fundingRate": 0.00001},
            {"fundingRate": 0.00002},
            {"fundingRate": 0.00004},
        ],
        global_long_short=[{"longAccount": 0.52, "shortAccount": 0.48, "longShortRatio": 1.08}],
        top_account_ratio=[{"longAccount": 0.53, "shortAccount": 0.47, "longShortRatio": 1.12}],
        top_position_ratio=[{"longAccount": 0.56, "shortAccount": 0.44, "longShortRatio": 1.27}],
        taker_buy_sell=[{"buySellRatio": 1.2, "buyVol": 1200.0, "sellVol": 1000.0}],
    )

    assert derivatives["openInterestStats"]["historyAvailable"] is True
    assert isinstance(derivatives["openInterestStats"]["changePercent5m"], float)
    assert 0 <= derivatives["fundingStats"]["absPercentile"] <= 100
    assert derivatives["longShortRatios"]["globalAccount"]["longShortRatio"] == 1.08
    assert derivatives["takerBuySell"]["buyShare"] == pytest.approx(1.2 / 2.2)
    assert derivatives["crowding"]["crowdedSide"] in {"LONG", "SHORT", None}
    regime = classify_market_regime(sample_snapshot()["timeframes"], derivatives)
    assert regime["primary"] in {"shock", "squeeze", "trend", "range", "mixed"}


def test_all_trader_strategies_return_candidate_shape():
    snapshot = sample_snapshot()
    for trader in list_traders():
        candidate = get_strategy(trader.id).evaluate(snapshot)
        assert candidate.created in {True, False}
        assert candidate.setupScore >= 0
        if candidate.created and candidate.side == "LONG":
            assert all(entry.price <= snapshot["price"] for entry in candidate.entries)
        if candidate.created and candidate.side == "SHORT":
            assert all(entry.price >= snapshot["price"] for entry in candidate.entries)
        if candidate.created:
            assert candidate.orderIntent is not None
            assert candidate.leveragePlan is not None
            assert 5 <= candidate.leveragePlan.suggestedLeverage <= 10
            assert candidate.leveragePlan.suggestedLeverage <= candidate.leveragePlan.maxLeverage
            assert candidate.leveragePlan.maxLeverage <= 10
            assert candidate.riskPlan is not None
            assert candidate.riskPlan.estimatedRiskReward >= candidate.riskPlan.minRiskReward
            assert candidate.riskPlan.feeBufferPercent > 0
            assert candidate.earlyExitRules


def test_channel_rider_short_entries_are_not_below_current_price():
    snapshot = sample_snapshot()
    snapshot["timeframes"]["1h"]["channel"]["position"] = 0.8
    snapshot["timeframes"]["4h"]["trend"] = "sideways"

    candidate = get_strategy("channel-rider").evaluate(snapshot)

    assert candidate.created is True
    assert candidate.side == "SHORT"
    assert all(entry.price >= snapshot["price"] for entry in candidate.entries)


def test_trade_plan_clamps_provider_leverage_override_to_service_minimum():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(snapshot)
    assert candidate.created is True
    review = TradeReviewResult(
        decision="ADJUST_AND_APPROVE",
        confidence=80,
        riskLevel="MEDIUM",
        adjustments=["Provider requested lower leverage."],
        leverageOverride=3,
        riskPercentOverride=None,
        earlyExitRecommendations=[],
        approvalReason="Approved with adjustment.",
        counterThesis="Invalidation remains active.",
        userSummary="Approved.",
        provider="gemini",
        model="gemini-test",
    )

    plan = trade_plan_from_review("BTCUSDT", candidate, review)

    assert plan.status == "PAPER_TRADING_PENDING"
    assert plan.leverage >= 5
    assert "clamped to the service minimum" in " ".join(plan.notes)


def test_trade_plan_allows_larger_risk_for_high_confidence_high_rr_setup():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(snapshot)
    assert candidate.created is True
    assert candidate.riskPlan is not None
    candidate.setupScore = 82
    candidate.riskPlan.estimatedRiskReward = 2.2
    review = TradeReviewResult(
        decision="ADJUST_AND_APPROVE",
        confidence=92,
        riskLevel="MEDIUM",
        adjustments=["Provider requested higher size for a clean setup."],
        leverageOverride=None,
        riskPercentOverride=2.5,
        earlyExitRecommendations=[],
        approvalReason="Approved with larger but bounded risk.",
        counterThesis="Invalidation remains active.",
        userSummary="Approved.",
        provider="openai",
        model="gpt-test",
    )

    plan = trade_plan_from_review("BTCUSDT", candidate, review)

    assert plan.status == "PAPER_TRADING_PENDING"
    assert plan.riskPercent > 1.575
    assert plan.riskPercent == pytest.approx(1.81125)


def test_public_trader_profiles_have_beginner_readable_concepts():
    for trader in list_traders():
        assert len(trader.description) >= 70, trader.id
        assert len(trader.concept) >= 70, trader.id


@pytest.mark.asyncio
async def test_mock_ai_review():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(snapshot)
    assert candidate.created is True
    review = await MockAIProvider().review_trade_candidate(
        TradeReviewPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            candidate=candidate,
        )
    )
    assert review.decision in {
        "APPROVE",
        "ADJUST_AND_APPROVE",
        "DEFER",
        "REJECT",
        "NEEDS_MORE_DATA",
    }
    assert 0 <= review.confidence <= 100


@pytest.mark.asyncio
async def test_mock_ai_review_uses_requested_locale():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(snapshot)
    review = await MockAIProvider().review_trade_candidate(
        TradeReviewPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            candidate=candidate,
            locale="ko",
        )
    )
    assert "2차 검증" not in review.approvalReason
    assert "종이 거래" not in review.approvalReason
    assert "진입" in review.approvalReason
    assert "손절" in review.approvalReason


@pytest.mark.asyncio
async def test_structured_review_fields_for_entry_review():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(snapshot)

    review = await MockAIProvider().review_trade_candidate(
        TradeReviewPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            candidate=candidate,
            locale="ko",
            lossDiscipline={
                "active": False,
                "lastLoss": {
                    "closeReason": "stop_loss",
                    "realizedPnl": -37.2,
                    "closedAt": "2026-06-17T00:00:00+00:00",
                },
            },
        )
    )

    assert review.reviewCode == "ENTRY_REVIEW"
    assert review.reviewFacts
    assert {fact.code for fact in review.reviewFacts} >= {
        "entry_geometry_checked",
        "risk_plan_checked",
    }
    assert review.riskFlags
    assert review.userSummary in {None, ""}
    assert review.structuredReview is not None
    assert review.structuredReview.headline
    assert review.structuredReview.action
    assert review.structuredReview.keyReasons


@pytest.mark.asyncio
async def test_mock_position_management_review_uses_requested_locale():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    review = await MockAIProvider().review_position_management(
        PositionManagementPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            event=ManagementEvent(
                eventType="channel_entry_stale",
                phase="PENDING_ORDER",
                severity="MEDIUM",
                reason="Price moved away from channel edge.",
                suggestedAction="CANCEL_PENDING_ORDER",
            ),
            exposure=ManagedExposure(
                kind="order",
                id=1,
                status="open",
                side="LONG",
                quantity=0.01,
                limitPrice=67500,
                stopLoss=66800,
                takeProfit=70000,
                leverage=2,
            ),
            locale="ko",
        )
    )

    assert review.decision == "CANCEL_PENDING_ORDER"
    assert "관리 판단" in review.rationale


@pytest.mark.asyncio
async def test_structured_review_fields_for_management_review():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")

    review = await MockAIProvider().review_position_management(
        PositionManagementPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            event=ManagementEvent(
                eventType="channel_entry_stale",
                phase="PENDING_ORDER",
                severity="HIGH",
                reason="Price moved away from channel edge.",
                suggestedAction="CANCEL_PENDING_ORDER",
            ),
            exposure=ManagedExposure(
                kind="order",
                id=1,
                status="open",
                side="LONG",
                quantity=0.01,
                limitPrice=67500,
                stopLoss=66800,
                takeProfit=70000,
                leverage=2,
            ),
            locale="ko",
        )
    )

    assert review.reviewCode == "POSITION_MANAGEMENT_REVIEW"
    assert review.reviewFacts
    assert {fact.code for fact in review.reviewFacts} >= {
        "management_event_reviewed",
        "hard_rules_priority",
    }
    assert review.riskFlags
    assert review.userSummary in {None, ""}
    assert review.structuredReview is not None
    assert review.structuredReview.headline
    assert review.structuredReview.action
    assert review.structuredReview.watchConditions


def test_review_policies_have_trader_specific_post_loss_discipline():
    disciplines = []
    for trader in list_traders():
        policy = trader_review_policy(trader.id)
        discipline = policy.get("postLossDiscipline")
        assert isinstance(discipline, str) and discipline.strip(), trader.id
        disciplines.append(discipline)

    assert len(set(disciplines)) == len(disciplines)


def test_btc_specialist_profiles_are_differentiated_with_concrete_evaluators():
    traders = list_traders()
    btc_specialists = traders[10:]
    assert [trader.id for trader in btc_specialists] == [
        "donchian-breakout",
        "ichimoku-cloud-pilot",
        "vwap-reclaimer",
        "wyckoff-spring",
        "rsi-divergence-scout",
        "session-raider",
        "imbalance-hunter",
        "momentum-ignition",
        "bollinger-reversion",
        "atr-trail-commander",
    ]
    signatures = {
        (trader.concept, trader.currentPlan, tuple(trader.aiReviewChecklist))
        for trader in btc_specialists
    }
    assert len(signatures) == len(btc_specialists)
    for trader_id in [trader.id for trader in btc_specialists]:
        strategy = get_strategy(trader_id)
        assert "evaluate" in type(strategy).__dict__, trader_id


def test_trader_execution_profiles_are_rebalanced_across_horizons():
    profiles = [trader.holdingProfile for trader in list_traders()]
    assert profiles.count("micro") in {3, 4}
    assert profiles.count("tactical") + profiles.count("intraday") in {8, 9, 10}
    assert profiles.count("swing") + profiles.count("trend") in {6, 7, 8}


def test_ai_prompts_include_context_and_non_conservative_management_options():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(snapshot)

    candidate_prompt = review_prompt(
        TradeReviewPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            candidate=candidate,
            locale="ko",
            recentAiReviews=[{"decision": "REJECT", "counterThesis": "이전 채널 품질 부족"}],
            recentManagementReviews=[{"decision": "MOVE_STOP_TO_BREAKEVEN"}],
            activeExposure={"openOrders": [], "openPositions": []},
            recentTradeEvents=[{"eventType": "position_reduced_by_ai"}],
        )
    )
    management = management_prompt(
        PositionManagementPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            event=ManagementEvent(
                eventType="channel_rider_position_heartbeat",
                phase="OPEN_POSITION",
                severity="MEDIUM",
                reason="Heartbeat review.",
                suggestedAction="HOLD",
                metrics={"progressR": -0.2, "targetProgress": 0.1},
            ),
            exposure=ManagedExposure(
                kind="position",
                id=1,
                status="open",
                side="LONG",
                quantity=0.08,
                entryPrice=68100,
                stopLoss=67200,
                takeProfit=70000,
                leverage=6,
            ),
            locale="ko",
            recentManagementReviews=[{"decision": "HOLD", "rationale": "이전 리뷰"}],
            recentTradeEvents=[{"eventType": "order_filled", "price": 68100}],
            siblingExposures={"orders": [], "positions": []},
            accountState={"equity": 10000, "marginUsed": 2200},
        )
    )

    assert "recentAiReviews" in candidate_prompt
    assert "recentManagementReviews" in candidate_prompt
    assert "activeExposure" in candidate_prompt
    assert "lossDiscipline" in candidate_prompt
    assert "ADD_TO_POSITION" in management
    assert "PYRAMID_POSITION" in management
    assert "Never widen a stop, never increase leverage, never add to a position" not in management


def test_prompt_contracts_are_split_and_do_not_request_user_summary():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(snapshot)

    entry = entry_approval_prompt(
        TradeReviewPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            candidate=candidate,
            locale="en",
            lossDiscipline={"active": True, "remainingSeconds": 480, "closeReason": "stop_loss"},
            recentLossReviews=[
                {
                    "closeReason": "stop_loss",
                    "realizedPnl": -42.5,
                    "side": "long",
                    "summary": "Previous long hit the planned stop after reclaim failed.",
                }
            ],
        )
    ).split("Payload:", 1)[0]
    management = position_management_review_prompt(
        PositionManagementPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            event=ManagementEvent(eventType="heartbeat", phase="OPEN_POSITION", reason="Heartbeat"),
            exposure=ManagedExposure(kind="position", id=7, status="open", side="LONG", entryPrice=68000),
            locale="en",
        )
    )

    assert "APPROVE, ADJUST_AND_APPROVE, DEFER, REJECT, NEEDS_MORE_DATA" in entry
    assert "CLOSE_POSITION" not in entry.split("Payload:", 1)[0]
    assert "CLOSE_POSITION" in management
    assert "ADJUST_AND_APPROVE" not in management.split("Payload:", 1)[0]
    assert "userSummary" not in entry.split("Payload:", 1)[0]
    assert "userSummary" not in management.split("Payload:", 1)[0]
    assert "reviewCode" in entry
    assert "reviewFacts" in entry
    assert "structuredReview" in entry
    entry_contract = entry.split("Payload:", 1)[0]
    assert "structuredReview is the primary user-facing explanation" in entry_contract
    assert "approvalReason is a legacy compatibility field" in entry_contract
    assert "Do not describe approval as paper-trading learning" in entry_contract
    assert "Do not use setupScore as the main reason" in entry_contract
    assert "Treat 5x as the service execution floor" in entry_contract
    assert "Do not require arbitrary setupScore 70+ or 75+" in entry_contract
    assert "exactly one second-pass review for the whole candidate" in entry_contract
    assert "higher leverage should require progressively stronger confirmation" in entry_contract
    assert "Use recentAiReviews as context, not as an independent veto" in entry_contract
    assert "recentLossReviews" in entry
    assert "not an automatic rejection" in entry_contract
    assert "apply the trader's postLossDiscipline strictly" not in entry_contract
    assert "For reversal, mean-reversion, divergence, or fade strategies" in entry_contract
    assert "entry approval should read like a desk judgment, not a permission stamp" in entry_contract
    assert "why this trade is worth taking now" in entry_contract
    assert "how entry, stop, and target contain the risk" in entry_contract
    assert "reviewCode" in management
    assert "reviewFacts" in management
    assert "structuredReview" in management
    assert "early_failure_adverse_r is a review-warning signal only" in management
    assert "rationale is a legacy compatibility field" in management
    assert "Do not collapse active-position HOLD reviews into a single generic sentence" in management
    assert "two compact desk-style sentences" in management
    assert "position management briefing for a normal user" in management
    assert "The UI merges headline, action, keyReasons, risks, and watchConditions into a few natural review lines" in management
    assert "do not write text that depends on headings such as next action, key reasons, risks, or watch conditions" in management
    assert "Start from the current exposure: entry, current price, stop, target, unrealized PnL" in management
    assert "Do not write checklist fragments such as structure and risk-reward are healthy" in management
    assert "Do not mention paper trading in structuredReview, rationale, counterThesis, or action reasons" in management
    assert "For HOLD reviews, never stop at keep holding or continue monitoring" in management
    assert "why no stop, leverage, partial-profit, or close action is justified right now" in management
    assert "This is paper trading only" not in management.split("Payload:", 1)[0]


def test_review_prompts_ban_generic_repeated_briefing_language():
    snapshot = sample_snapshot()
    entry = entry_approval_prompt(
        TradeReviewPayload(
            trader=get_strategy("channel-rider").profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            candidate=get_strategy("channel-rider").evaluate(snapshot),
            locale="ko",
            recentAiReviews=[
                {
                    "decision": "APPROVE",
                    "structuredReview": {
                        "headline": "시장 상황은 지지적이며 무효 신호는 감지되지 않음.",
                        "action": "15분 종가가 기준선 아래로 떨어지면 포지션 유지 및 무효 신호 확인.",
                    },
                }
            ],
        )
    )
    management = position_management_review_prompt(
        PositionManagementPayload(
            trader=get_strategy("channel-rider").profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            event=ManagementEvent(
                eventType="position_heartbeat",
                phase="OPEN_POSITION",
                severity="MEDIUM",
                reason="Periodic review while position is open.",
                suggestedAction="HOLD",
            ),
            exposure=ManagedExposure(
                kind="position",
                id=77,
                status="open",
                side="LONG",
                entryPrice=66120.0,
                stopLoss=65480.0,
                takeProfit=67220.0,
                unrealizedPnl=42.5,
            ),
            recentManagementReviews=[
                {
                    "decision": "HOLD",
                    "rationale": "시장 상황은 지지적이며 무효 신호는 감지되지 않음.",
                }
            ],
            locale="ko",
        )
    )

    for contract in (entry.split("Payload:", 1)[0], management.split("Payload:", 1)[0]):
        assert "시장 상황은 지지적" in contract
        assert "무효 신호는 감지되지 않음" in contract
        assert "거래량과 모멘텀은 중립적" in contract
        assert "Do not reuse those phrases or their close translations" in contract
        assert "headline, action, keyReasons, risks, watchConditions, and managerNote must each do a different job" in contract


def test_review_prompts_require_plain_english_decision_flow_not_indicator_lists():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    entry = entry_approval_prompt(
        TradeReviewPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            candidate=strategy.evaluate(snapshot),
            locale="en",
            recentAiReviews=[
                {
                    "decision": "APPROVE",
                    "structuredReview": {
                        "headline": "Higher-timeframe trend is confirmed and no invalidation signal is present.",
                        "action": "Approve and keep monitoring.",
                    },
                }
            ],
        )
    ).split("Payload:", 1)[0]
    management = position_management_review_prompt(
        PositionManagementPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            event=ManagementEvent(
                eventType="position_heartbeat",
                phase="OPEN_POSITION",
                severity="MEDIUM",
                reason="Periodic review while position is open.",
                suggestedAction="HOLD",
                metrics={"ema50_4h": 64115.22, "adx1h": 40.0, "stallPrice": 63900.0},
            ),
            exposure=ManagedExposure(
                kind="position",
                id=78,
                status="open",
                side="SHORT",
                entryPrice=63880.0,
                stopLoss=64180.0,
                takeProfit=63120.0,
                unrealizedPnl=18.5,
            ),
            recentManagementReviews=[
                {
                    "decision": "HOLD",
                    "structuredReview": {
                        "headline": "Higher-timeframe downtrend is confirmed and no failure signal is present.",
                        "action": "Hold the position and continue monitoring.",
                    },
                    "rationale": "4H EMA50 64115.22 and 1H ADX 40 remain valid.",
                }
            ],
            locale="en",
        )
    ).split("Payload:", 1)[0]

    for contract in (entry, management):
        assert "decision path, not an indicator checklist" in contract
        assert "do not write two structuredReview fields that make the same claim" in contract
        assert "explain what the number means for the trade before using it as a trigger" in contract
        assert "higher-timeframe trend is confirmed" in contract
        assert "no failure signal is present" in contract
        assert "valid price structure" in contract
        assert "risk-reward ratio is valid" in contract
        assert "hold the position and continue monitoring" in contract


def test_prompts_directly_ban_latest_repeated_trend_sentinel_review_copy():
    snapshot = sample_snapshot()
    snapshot["price"] = 60271.0
    snapshot["timeframes"]["1h"]["ema50"] = 64115.22
    strategy = get_strategy("trend-sentinel")
    candidate = strategy.evaluate(snapshot)

    entry_prompt = entry_approval_prompt(
        TradeReviewPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            candidate=candidate,
            locale="en",
            recentAiReviews=[
                {
                    "decision": "ADJUST_AND_APPROVE",
                    "approvalReason": (
                        "The 4h and 1d bearish structure supports the short, and the entry/stop/target "
                        "geometry is valid with fee-aware RR just meeting the minimum."
                    ),
                    "structuredReview": {
                        "headline": "The short setup is structurally valid, but 8x leverage is too aggressive for a moderate reward-to-risk and mixed lower-timeframe confirmation.",
                        "action": "Approve only with reduced leverage and tighter execution discipline; keep the first limit and cancel the immediate second fill if price does not reject cleanly.",
                        "keyReasons": [
                            "The 4h and 1d trends still support a short continuation, and the stop and targets are placed correctly for a pending short.",
                            "The fee-aware RR clears the minimum, but only modestly, so the trade needs smaller size and cleaner confirmation to stay durable.",
                        ],
                    },
                }
            ],
        )
    )
    management_prompt_text = position_management_review_prompt(
        PositionManagementPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            event=ManagementEvent(
                eventType="trend_sentinel_position_heartbeat",
                phase="OPEN_POSITION",
                severity="MEDIUM",
                reason="Periodic agent review: actively decide whether to keep trailing a trend or exit on higher-timeframe damage.",
                suggestedAction="HOLD",
                metrics={
                    "price": 60271.0,
                    "entryPrice": 59681.6,
                    "stopLoss": 61057.6,
                    "takeProfit": 58304.2,
                    "progressR": -0.4286,
                    "targetProgress": -0.4286,
                    "ema50_4h": 64115.22,
                    "adx1h": 40.0,
                    "stallPrice": 63900.0,
                },
            ),
            exposure=ManagedExposure(
                kind="position",
                id=1464,
                status="open",
                side="SHORT",
                entryPrice=59681.6,
                stopLoss=61057.6,
                takeProfit=58304.2,
                unrealizedPnl=-42.0,
            ),
            recentManagementReviews=[
                {
                    "decision": "HOLD",
                    "eventType": "trend_sentinel_position_heartbeat",
                    "structuredReview": {
                        "headline": "The position remains within the confirmed bearish trend on higher timeframes; no change needed.",
                        "action": "Continue monitoring without adjusting stops or leverage; no change unless higher timeframe support weakens.",
                        "keyReasons": ["Trend is confirmed on higher timeframes with valid price structure and risk-reward ratio."],
                        "risks": ["If 4H closes above EMA50 64115.22, the bearish structure may invalidate, requiring reassessment."],
                        "watchConditions": [
                            "Exit if 4H closes above EMA50 64115.22. Monitor 1H ADX for any drop below 40; if price stalls above 63900 for more than 2 hours, consider partial profit and trailing only if ADX remains strong."
                        ],
                        "managerNote": "Current setup remains valid; no urgent action needed. Continue to observe higher timeframe signals.",
                    },
                    "rationale": "The position remains aligned with the long-term bearish trend supported by higher timeframe structure.",
                }
            ],
            locale="en",
        )
    )

    entry_contract, entry_payload = entry_prompt.split("Payload:", 1)
    management_contract, management_payload = management_prompt_text.split("Payload:", 1)
    entry_data = json.loads(entry_payload)
    management_data = json.loads(management_payload)

    assert entry_data["approvalDossier"]["context"]["recentEntryReviewMemory"][0]["avoidRepeating"][0].startswith("The short setup is structurally valid")
    assert management_data["recentReviewMemory"][0]["avoidRepeating"][0].startswith(
        "The position remains within the confirmed bearish trend"
    )

    for contract in (entry_contract, management_contract):
        assert "repeat-suppression is mandatory" in contract
        assert "a materially different first sentence" in contract
        assert "Never expose internal event plumbing" in contract
        assert "Do not write phrases such as Latest event" in contract
        assert "Do not mention previous wording" in contract


def test_position_management_prompt_requires_live_position_first_desk_briefing():
    payload = PositionManagementPayload(
        trader=get_strategy("trend-sentinel").profile,
        symbol="BTCUSDT",
        marketSnapshot={"symbol": "BTCUSDT", "price": 60187.3, "timeframes": {}, "derivatives": {}},
        event=ManagementEvent(
            eventType="trend_sentinel_position_heartbeat",
            phase="OPEN_POSITION",
            severity="HIGH",
            reason="Decide whether to keep trailing the trend or exit if the higher-timeframe trend weakens.",
            suggestedAction="HOLD",
            metrics={
                "price": 60187.3,
                "entryPrice": 59681.6,
                "stopLoss": 61057.6,
                "takeProfit": 57043.9,
                "progressR": -0.37,
                "targetProgress": -0.19,
                "unrealizedPnl": -255.59,
            },
        ),
        exposure=ManagedExposure(
            kind="position",
            id=366,
            status="open",
            side="SHORT",
            entryPrice=59681.6,
            stopLoss=61057.6,
            takeProfit=57043.9,
            unrealizedPnl=-255.59,
        ),
        locale="en",
    )

    prompt = position_management_review_prompt(payload)

    assert "POSITION-FIRST DESK BRIEFING" in prompt
    assert "lead with price versus entry, stop, target, PnL, progressR, and targetProgress" in prompt
    assert "Do not lead with overall trend alignment, valid structure, risk-reward ratio, or no invalidation signal" in prompt
    assert "If progressR is between -0.25 and 0.25" in prompt
    assert "why not close, why not move the stop, why not take profit, and what exact trigger changes the decision" in prompt


def test_position_management_prompt_bans_repeated_title_labels_and_entry_price_confusion():
    payload = PositionManagementPayload(
        trader=get_strategy("trend-sentinel").profile,
        symbol="BTCUSDT",
        marketSnapshot={"symbol": "BTCUSDT", "price": 59440.0, "timeframes": {}, "derivatives": {}},
        event=ManagementEvent(
            eventType="trend_sentinel_position_heartbeat",
            phase="OPEN_POSITION",
            severity="MEDIUM",
            reason="Manage a short that is only slightly in profit while higher timeframes are not aligned.",
            suggestedAction="HOLD",
            metrics={
                "price": 59440.0,
                "entryPrice": 59681.63,
                "stopLoss": 61057.6,
                "takeProfit": 57043.9,
                "progressR": 0.18,
                "targetProgress": 0.09,
                "unrealizedPnl": 122.0,
                "ema50_4h": 64115.22,
            },
        ),
        exposure=ManagedExposure(
            kind="position",
            id=367,
            status="open",
            side="SHORT",
            entryPrice=59681.63,
            stopLoss=61057.6,
            takeProfit=57043.9,
            unrealizedPnl=122.0,
        ),
        recentManagementReviews=[
            {
                "decision": "HOLD",
                "eventType": "trend_sentinel_position_heartbeat",
                "structuredReview": {
                    "headline": "숏 익절권 확인",
                    "action": "현재 숏 포지션을 유지하며 손절 또는 이익 실현을 조정하지 마세요.",
                    "keyReasons": ["진입가 59,440 근처에서 약간의 수익이 발생한 숏 포지션입니다."],
                },
            }
        ],
        locale="ko",
    )

    prompt = position_management_review_prompt(payload)
    contract, raw_payload = prompt.split("Payload:", 1)
    data = json.loads(raw_payload)

    assert data["recentReviewMemory"][0]["avoidRepeating"][0] == "숏 익절권 확인"
    assert data["currentReviewDelta"]["priceBox"]["price"] == 59440.0
    assert data["currentReviewDelta"]["priceBox"]["entry"] == 59681.63
    assert "headline must not be a reusable status label" in contract
    assert "숏 익절권 확인" in contract
    assert "Never call the current price the entry price" in contract
    assert "If higher timeframes oppose the open position direction" in contract
    assert "counter-trend or tactical position" in contract


def test_position_management_prompt_sends_slim_exposure_and_entry_thesis_context():
    previous_entry_review = (
        "The short setup is structurally valid, but 8x leverage is too aggressive. "
        "This long approval report is intentionally bulky and should never be copied into a management prompt."
    )
    payload = PositionManagementPayload(
        trader=get_strategy("trend-sentinel").profile,
        symbol="BTCUSDT",
        marketSnapshot={"symbol": "BTCUSDT", "price": 59659.9, "timeframes": {}, "derivatives": {}},
        event=ManagementEvent(
            eventType="trend_sentinel_position_heartbeat",
            phase="OPEN_POSITION",
            severity="MEDIUM",
            reason="Manage the open short after TP1 filled and the stop moved to breakeven.",
            suggestedAction="HOLD",
            metrics={
                "price": 59659.9,
                "entryPrice": 60347.5,
                "stopLoss": 60347.5,
                "takeProfit": 59109.6,
                "progressR": 2.88,
                "targetProgress": 0.56,
                "unrealizedPnl": 275.4,
            },
        ),
        exposure=ManagedExposure(
            kind="position",
            id=919,
            status="open",
            side="SHORT",
            entryPrice=60347.5,
            stopLoss=60347.5,
            takeProfit=59109.6,
            leverage=5,
            unrealizedPnl=275.4,
            payload={
                "aiReview": previous_entry_review,
                "aiReviewFacts": [{"code": "old_fact", "detail": "old detailed review fact"}],
                "aiStructuredReview": {
                    "headline": "Old approval headline that should not steer management.",
                    "managerNote": "Old approval manager note should stay out of the prompt.",
                },
                "aiApprovalReason": "Trend continuation entry after rejection near EMA.",
                "aiCounterThesis": "A reclaim above the invalidation line would cancel the short thesis.",
                "candidateSetupType": "trend_continuation_short",
                "plannedEntryPrice": 60347.5,
                "plannedStopLoss": 61337.8,
                "riskPercent": 0.8,
                "plannedMargin": 1200.0,
                "notionalExposurePercent": 41.2,
                "orderIntent": {"type": "scale_limit", "verbose": "not needed now"},
                "leveragePlan": {"suggestedLeverage": 8, "verbose": "not needed now"},
                "takeProfits": [
                    {"price": 59109.6, "weight": 0.5, "reason": "first channel target", "status": "filled"},
                    {"price": 57043.9, "weight": 0.5, "reason": "trend extension target", "status": "open"},
                ],
            },
        ),
        recentManagementReviews=[
            {
                "decision": "HOLD",
                "actionType": "HOLD",
                "eventType": "trend_sentinel_position_heartbeat",
                "createdAt": "2026-06-26T00:00:00Z",
                "rationale": "Old repeated management rationale SHOULD_NOT_LEAK_RECENT_REVIEW",
                "structuredReview": {
                    "headline": "Old repeated management headline SHOULD_NOT_LEAK_RECENT_REVIEW",
                    "action": "Keep repeating the old line.",
                },
                "providerPayload": {
                    "rawCompletion": "INTERNAL_PROVIDER_COMPLETION_SHOULD_NOT_LEAK",
                },
            }
        ],
        locale="en",
    )

    data = prompt_payload(position_management_review_prompt(payload))
    prompt_json = json.dumps(data, ensure_ascii=False)

    assert "entryThesis" in data
    assert data["entryThesis"]["setupType"] == "trend_continuation_short"
    assert data["entryThesis"]["approvalSummary"] == "Trend continuation entry after rejection near EMA."
    assert data["entryThesis"]["takeProfits"][0]["status"] == "filled"
    assert data["exposure"]["entryPrice"] == 60347.5
    assert "payload" not in data["exposure"]
    assert previous_entry_review not in prompt_json
    assert "aiReviewFacts" not in prompt_json
    assert "aiStructuredReview" not in prompt_json
    assert "plannedMargin" not in prompt_json
    assert "notionalExposurePercent" not in prompt_json
    assert "orderIntent" not in prompt_json
    assert "leveragePlan" not in prompt_json
    assert data["recentManagementReviews"] == [
        {
            "decision": "HOLD",
            "actionType": "HOLD",
            "eventType": "trend_sentinel_position_heartbeat",
            "createdAt": "2026-06-26T00:00:00Z",
        }
    ]
    assert "providerPayload" not in prompt_json
    assert "INTERNAL_PROVIDER_COMPLETION_SHOULD_NOT_LEAK" not in prompt_json


def test_position_management_prompt_bans_profit_certainty_and_current_price_as_entry():
    payload = PositionManagementPayload(
        trader=get_strategy("channel-rider").profile,
        symbol="BTCUSDT",
        marketSnapshot={"symbol": "BTCUSDT", "price": 59659.9, "timeframes": {}, "derivatives": {}},
        event=ManagementEvent(
            eventType="channel_stop_tightened",
            phase="OPEN_POSITION",
            severity="MEDIUM",
            reason="TP1 was reached and stop is now at breakeven.",
            suggestedAction="HOLD",
            metrics={"price": 59659.9, "entryPrice": 60347.5, "stopLoss": 60347.5, "takeProfit": 59109.6},
        ),
        exposure=ManagedExposure(
            kind="position",
            id=920,
            status="open",
            side="SHORT",
            entryPrice=60347.5,
            stopLoss=60347.5,
            takeProfit=59109.6,
        ),
        locale="en",
    )

    contract = position_management_review_prompt(payload).split("Payload:", 1)[0]

    assert "Do not say profit is locked, secured, guaranteed, confirmed, or preserved" in contract
    assert "profit remains unrealized" in contract
    assert "Never write near entry at <current price>" in contract
    assert "current price X versus entry Y" in contract
    assert "For SHORT positions, do not use downside risk to mean loss risk" in contract


def test_management_reviews_do_not_use_post_provider_repetitive_rewrite_guard():
    assert not hasattr(main_module, "refresh_repetitive_position_management_review")
    source = main_module.run_management_reviews.__code__.co_names
    assert "refresh_repetitive_position_management_review" not in source
    assert "REPETITIVE_STRUCTURED_REVIEW_REFRESHED" not in str(main_module.__dict__)


def test_imbalance_management_prompt_builds_delta_memory_from_recent_reviews():
    snapshot = sample_snapshot()
    snapshot["price"] = 59531.0
    snapshot["timeframes"]["15m"]["close"] = 59531.0
    snapshot["timeframes"]["15m"]["latestCandle"]["close"] = 59531.0
    snapshot["timeframes"]["15m"]["volumeZscore"] = -0.65
    snapshot["derivatives"]["fundingRate"] = 0.000005
    snapshot["derivatives"]["takerBuySell"]["buyShare"] = 0.47

    management = position_management_review_prompt(
        PositionManagementPayload(
            trader=get_strategy("imbalance-hunter").profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            event=ManagementEvent(
                eventType="imbalance_hunter_position_heartbeat",
                phase="OPEN_POSITION",
                severity="MEDIUM",
                reason="Short is working but the failure line is close enough to require a precise next review.",
                suggestedAction="HOLD",
                metrics={
                    "price": 59531.0,
                    "entryPrice": 59213.0,
                    "stopLoss": 62853.7,
                    "takeProfit": 58407.6,
                    "progressR": -0.0873,
                    "targetProgress": -0.3946,
                    "distanceToStopR": 0.9127,
                    "imbalanceMidpoint": 59213.0,
                    "failureLine": 62853.7,
                    "volumeZscore": -0.65,
                    "fundingRate": 0.000005,
                    "takerBuyRatio": 0.47,
                },
            ),
            exposure=ManagedExposure(
                kind="position",
                id=531,
                status="open",
                side="SHORT",
                entryPrice=59213.0,
                stopLoss=62853.7,
                takeProfit=58407.6,
                unrealizedPnl=-18.2,
            ),
            recentManagementReviews=[
                {
                    "decision": "HOLD",
                    "rationale": "Weak volume and neutral funding keep the position near entry, so patience is supported but the failure level is key.",
                    "structuredReview": {
                        "headline": "Weak volume and neutral funding keep the position near entry.",
                        "action": "Hold the current position and keep watching 15m failure at 62853.7.",
                        "keyReasons": ["The position is profitable but close to failure."],
                        "risks": ["A rebound through the failure level may trigger the stop."],
                        "watchConditions": ["If 15m closes above 62853.7, the setup fails."],
                    },
                }
            ],
            locale="ko",
        )
    )

    contract, payload = management.split("Payload:", 1)
    data = json.loads(payload)
    delta = data["currentReviewDelta"]
    memory = data["recentReviewMemory"]
    assert "Do not start any structuredReview field with the same opening phrase" in contract
    assert "이번 리뷰가 이전 리뷰와 다른 이유" in contract
    assert memory[0]["avoidRepeating"][0] == "Weak volume and neutral funding keep the position near entry."
    assert delta["priceBox"]["distanceToStopR"] == pytest.approx(0.9127)
    assert delta["strategyTriggers"]["failureLine"] == 62853.7


def test_management_prompt_builds_generic_delta_memory_for_non_imbalance_traders():
    snapshot = sample_snapshot()
    snapshot["price"] = 68420.0
    snapshot["timeframes"]["15m"]["close"] = 68420.0
    snapshot["timeframes"]["15m"]["latestCandle"]["close"] = 68420.0
    snapshot["timeframes"]["1h"]["channel"]["mid"] = 68400.0
    position = PaperPositionRecord(
        trader_id="channel-rider",
        symbol="BTCUSDT",
        status="open",
        side="long",
        quantity=Decimal("0.1"),
        entry_price=Decimal("68100.0"),
        leverage=Decimal("5"),
        notional=Decimal("34050.0"),
        margin=Decimal("6810.0"),
        unrealized_pnl=Decimal("28.4"),
        take_profit_price=Decimal("70000.0"),
        stop_loss_price=Decimal("67200.0"),
    )
    event = heartbeat_event_for_position("channel-rider", position, snapshot)

    management = position_management_review_prompt(
        PositionManagementPayload(
            trader=get_strategy("channel-rider").profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            event=event,
            exposure=ManagedExposure(
                kind="position",
                id=532,
                status="open",
                side="LONG",
                entryPrice=68100.0,
                stopLoss=67200.0,
                takeProfit=70000.0,
                unrealizedPnl=28.4,
            ),
            recentManagementReviews=[
                {
                    "decision": "HOLD",
                    "structuredReview": {
                        "headline": "The channel long remains valid near the midline.",
                        "action": "Hold and keep monitoring the channel boundary.",
                        "keyReasons": ["Price is still above the lower channel."],
                    },
                    "rationale": "The channel long remains valid and needs patience.",
                }
            ],
            locale="ko",
        )
    )

    contract, payload = management.split("Payload:", 1)
    data = json.loads(payload)
    delta = data["currentReviewDelta"]
    memory = data["recentReviewMemory"]
    assert "For every trader" in contract
    assert "For Imbalance Hunter" not in contract
    assert memory[0]["avoidRepeating"][0] == "The channel long remains valid near the midline."
    assert delta["managementAnchors"]["primaryLevel"] == 68400.0
    assert delta["managementAnchors"]["primaryLevelName"] == "channelMid"
    assert delta["managementAnchors"]["invalidationLine"] == 67200.0
    assert delta["strategyTriggers"]["channelMid"] == 68400.0


def test_imbalance_position_management_event_uses_midpoint_distance_and_displacement_metrics():
    snapshot = sample_snapshot()
    snapshot["price"] = 62860.0
    snapshot["timeframes"]["15m"]["close"] = 62860.0
    snapshot["timeframes"]["15m"]["latestCandle"]["close"] = 62860.0
    snapshot["timeframes"]["15m"]["latestCandle"]["volume"] = 1000.0
    snapshot["timeframes"]["15m"]["latestCandle"]["takerBuyBaseVolume"] = 470.0
    snapshot["timeframes"]["15m"]["volumeZscore"] = -0.65
    snapshot["derivatives"]["fundingRate"] = 0.000005
    snapshot["derivatives"]["takerBuySell"]["buyShare"] = 0.47
    position = PaperPositionRecord(
        trader_id="imbalance-hunter",
        symbol="BTCUSDT",
        status="open",
        side="short",
        quantity=Decimal("0.1"),
        entry_price=Decimal("59213.0"),
        leverage=Decimal("5"),
        notional=Decimal("29606.5"),
        margin=Decimal("5921.3"),
        unrealized_pnl=Decimal("-18.2"),
        take_profit_price=Decimal("58407.6"),
        stop_loss_price=Decimal("62853.7"),
    )

    events = position_management_events("imbalance-hunter", position, snapshot)

    assert events
    event = events[0]
    assert event.eventType == "displacement_origin_failed"
    assert "imbalance" in event.reason.lower()
    assert event.metrics["failureLine"] == 62853.7
    assert event.metrics["imbalanceMidpoint"] == 59213.0
    assert event.metrics["distanceToStopR"] == pytest.approx(-0.0017)
    assert event.metrics["targetProgress"] == pytest.approx(-4.5282)
    assert event.metrics["volumeZscore"] == -0.65
    assert event.metrics["fundingRate"] == pytest.approx(0.000005)
    assert event.metrics["takerBuyRatio"] == 0.47


def test_imbalance_position_heartbeat_carries_stateful_review_metrics():
    snapshot = sample_snapshot()
    snapshot["price"] = 59531.0
    snapshot["timeframes"]["15m"]["close"] = 59531.0
    snapshot["timeframes"]["15m"]["latestCandle"]["close"] = 59531.0
    snapshot["timeframes"]["15m"]["latestCandle"]["volume"] = 1000.0
    snapshot["timeframes"]["15m"]["latestCandle"]["takerBuyBaseVolume"] = 470.0
    snapshot["timeframes"]["15m"]["volumeZscore"] = -0.65
    snapshot["derivatives"]["fundingRate"] = 0.000005
    snapshot["derivatives"]["takerBuySell"]["buyShare"] = 0.47
    position = PaperPositionRecord(
        trader_id="imbalance-hunter",
        symbol="BTCUSDT",
        status="open",
        side="short",
        quantity=Decimal("0.1"),
        entry_price=Decimal("59213.0"),
        leverage=Decimal("5"),
        notional=Decimal("29606.5"),
        margin=Decimal("5921.3"),
        unrealized_pnl=Decimal("-18.2"),
        take_profit_price=Decimal("58407.6"),
        stop_loss_price=Decimal("62853.7"),
    )

    event = heartbeat_event_for_position("imbalance-hunter", position, snapshot)

    assert event.eventType == "imbalance_hunter_position_heartbeat"
    assert "entry" in event.reason.lower()
    assert "invalidation line" in event.reason.lower()
    assert event.metrics["failureLine"] == 62853.7
    assert event.metrics["imbalanceMidpoint"] == 59213.0
    assert event.metrics["distanceToStopR"] == pytest.approx(0.9127)
    assert event.metrics["volumeZscore"] == -0.65
    assert event.metrics["fundingRate"] == pytest.approx(0.000005)
    assert event.metrics["takerBuyRatio"] == 0.47


def test_structured_review_normalizer_removes_list_syntax_from_action():
    review = MockAIProvider().normalize_management_result(
        {
            "decision": "HOLD",
            "confidence": 84,
            "riskLevel": "MEDIUM",
            "structuredReview": {
                "verdict": "유지",
                "headline": "숏은 보호됐지만 세션 우위가 약해지고 있습니다.",
                "action": "['- 숏 포지션은 유지하세요.', '- 손절을 넓히지 마세요.']",
                "keyReasons": ["- 손절이 이미 진입가에 있습니다."],
                "risks": ["- 세션 우위가 약해지고 있습니다."],
                "watchConditions": ["- 15분 종가가 트리거 위로 돌아오면 종료하세요."],
            },
            "actions": [{"type": "HOLD", "reason": "Hold."}],
        }
    )

    assert review.structuredReview is not None
    assert review.structuredReview.action == "숏 포지션은 유지하세요. 손절을 넓히지 마세요."
    assert review.structuredReview.keyReasons == ["손절이 이미 진입가에 있습니다."]


def test_stale_position_management_review_is_refreshed_from_live_metrics():
    review = PositionManagementResult(
        decision="HOLD",
        confidence=78,
        riskLevel="MEDIUM",
        reviewCode="IMBALANCE_HUNTER_POSITION_HEARTBEAT",
        structuredReview=StructuredReview(
            verdict="Approve with caution",
            headline="Fresh displacement and sound imbalance geometry support a cautious approach.",
            action="Hold current position and monitor volume and invalidation signals.",
            keyReasons=[
                "Current price 64038.4 is 289.3 pips below the most recent loss entry (64266.5), indicating a fresh pullback context."
            ],
            risks=["Weak volume may lead to stall."],
            watchConditions=["Cancel or reduce position if price stalls above 63900."],
            managerNote="Maintain cautious stance.",
        ),
        actions=[],
        riskChange="UNCHANGED",
        nextReviewInSeconds=1500,
        rationale="Position shows valid geometry but weak volume suggests patience.",
        counterThesis="If invalidation fires, hard risk rules take priority.",
        provider="openai",
        model="gpt-4.1-nano",
    )
    event = ManagementEvent(
        eventType="imbalance_hunter_position_heartbeat",
        phase="OPEN_POSITION",
        reason="Periodic agent review: actively monitor imbalance midpoint respect and displacement extension.",
        metrics={
            "price": 62301.4,
            "entryPrice": 62853.7,
            "stopLoss": 62853.7,
            "takeProfit": 61590.9,
            "progressR": 2.2163,
            "unrealizedPnl": 152.10438,
        },
    )
    exposure = ManagedExposure(
        kind="position",
        id=77,
        status="open",
        side="SHORT",
        entryPrice=62853.7,
        stopLoss=62853.7,
        takeProfit=61590.9,
    )

    refreshed = refresh_stale_position_management_review(review, event=event, exposure=exposure)

    assert refreshed.structuredReview is not None
    assert "62,301.4" in refreshed.structuredReview.headline
    assert "64,038.4" not in " ".join(refreshed.structuredReview.keyReasons)
    assert "STALE_STRUCTURED_REVIEW_REFRESHED" in refreshed.riskFlags
    assert "Current price 62,301.4" in refreshed.rationale
    refreshed_text = " ".join(
        [
            refreshed.structuredReview.headline or "",
            refreshed.structuredReview.action or "",
            *refreshed.structuredReview.keyReasons,
            refreshed.structuredReview.managerNote or "",
        ]
    )
    assert "Latest event" not in refreshed_text
    assert "previous wording" not in refreshed_text.lower()
    assert "risk box" not in refreshed_text.lower()
