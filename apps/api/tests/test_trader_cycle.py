import pytest

from app.ai.mock_provider import MockAIProvider
from app.ai.base import (
    entry_approval_prompt,
    management_prompt,
    position_management_review_prompt,
    review_prompt,
    trader_review_policy,
)
from app.market.snapshot import classify_market_regime, derivative_context
from app.main import enforce_pending_order_cancel_event, refresh_stale_position_management_review, trade_plan_from_review
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
    )
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


def test_breakeven_profit_protection_prompt_has_dedicated_decision_contract():
    management = position_management_review_prompt(
        PositionManagementPayload(
            trader=get_strategy("vwap-reclaimer").profile,
            symbol="BTCUSDT",
            marketSnapshot=sample_snapshot(),
            event=ManagementEvent(
                eventType="breakeven_profit_protection_review",
                phase="OPEN_POSITION",
                severity="MEDIUM",
                reason="Halfway to target.",
                suggestedAction="MOVE_STOP_TO_BREAKEVEN",
                metrics={"targetProgress": 0.52},
            ),
            exposure=ManagedExposure(
                kind="position",
                id=327,
                status="open",
                side="LONG",
                entryPrice=64591.6,
                stopLoss=64335.3,
                takeProfit=65150.5,
            ),
            locale="ko",
        )
    )

    contract = management.split("Payload:", 1)[0]
    assert "BREAKEVEN PROFIT PROTECTION REVIEW" in contract
    assert "MOVE_STOP_TO_BREAKEVEN or HOLD/LET_PROFIT_RUN" in contract
    assert "Set nextReviewInSeconds to at least 900" in contract


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
