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
from app.main import trade_plan_from_review
from app.traders.models import ManagedExposure, ManagementEvent, PositionManagementPayload, TradeReviewPayload, TradeReviewResult
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
    assert "reviewCode" in management
    assert "reviewFacts" in management
    assert "structuredReview" in management
    assert "early_failure_adverse_r is a review-warning signal only" in management
    assert "rationale is a legacy compatibility field" in management


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
