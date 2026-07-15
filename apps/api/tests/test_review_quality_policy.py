import json
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.ai.base import BaseAIProvider, current_management_review_delta
from app.ai.context import _management_summary
from app.ai.entry_approval_dossier import build_entry_approval_dossier
from app.ai.review_logging import enforce_entry_review_decision
from app.db import PaperPositionRecord
from app.main import agent_mode_for_event, heartbeat_event_for_position
from app.paper.signal_deduplication import candidate_signal_fingerprint
from app.traders.models import (
    ManagedExposure,
    ManagementEvent,
    PositionManagementPayload,
    TradeReviewPayload,
    TradeReviewResult,
)
from app.traders.registry import get_strategy
from tests.test_trader_cycle import sample_snapshot


def review_payload_with_guardrail_multiplier(multiplier: float) -> TradeReviewPayload:
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(snapshot)
    return TradeReviewPayload(
        trader=strategy.profile,
        symbol="BTCUSDT",
        marketSnapshot=snapshot,
        candidate=candidate,
        entryGuardrails={"blocked": False, "riskMultiplier": multiplier},
    )


def test_entry_gate_is_neutral_and_server_cap_normalizes_approved_risk():
    payload = review_payload_with_guardrail_multiplier(0.6)
    candidate_risk = float(payload.candidate.riskPercent or 0.0)
    review = TradeReviewResult(
        decision="APPROVE",
        confidence=83,
        riskLevel="MEDIUM",
        approvalReason="The entry thesis is coherent.",
        counterThesis="The stop invalidates the setup.",
        translations={"en": {"approvalReason": "The entry thesis is coherent."}},
    )

    dossier = build_entry_approval_dossier(payload)
    enforced = enforce_entry_review_decision(payload, review)

    assert "preferredDecisions" not in dossier["decisionGate"]
    assert dossier["context"]["entryGuardrails"]["riskCapPercent"] == pytest.approx(candidate_risk * 0.6)
    assert enforced.decision == "APPROVE"
    assert enforced.riskPercentOverride == pytest.approx(candidate_risk * 0.6)
    assert "server_risk_cap_applied" in enforced.riskFlags
    assert enforced.approvalReason == review.approvalReason
    assert enforced.translations == review.translations


def test_entry_review_policy_keeps_new_completed_candles_eligible():
    payload = review_payload_with_guardrail_multiplier(1.0)
    policy = build_entry_approval_dossier(payload)["context"]["repeatEntryPolicy"]
    first = candidate_signal_fingerprint(
        {"timeframes": {"15m": {"completedCandle": {"closeTime": 1000}}}},
        trader_id="channel-rider",
        symbol="BTCUSDT",
        setup_type="CHANNEL_REVERSION",
        side="LONG",
    )
    second = candidate_signal_fingerprint(
        {"timeframes": {"15m": {"completedCandle": {"closeTime": 2000}}}},
        trader_id="channel-rider",
        symbol="BTCUSDT",
        setup_type="CHANNEL_REVERSION",
        side="LONG",
    )

    assert policy == {"sameCompletedCandle": "BLOCK", "newCompletedCandle": "ELIGIBLE"}
    assert first != second


def test_management_delta_compares_persisted_previous_frame():
    strategy = get_strategy("channel-rider")
    payload = PositionManagementPayload(
        trader=strategy.profile,
        symbol="BTCUSDT",
        marketSnapshot={"symbol": "BTCUSDT", "price": 66150.0},
        event=ManagementEvent(
            eventType="channel_rider_position_heartbeat",
            phase="OPEN_POSITION",
            severity="MEDIUM",
            reason="Scheduled review.",
            suggestedAction="HOLD",
            metrics={
                "price": 66150.0,
                "entryPrice": 65500.0,
                "stopLoss": 65000.0,
                "takeProfit": 67000.0,
                "unrealizedPnl": 18.0,
                "progressR": 1.3,
                "targetProgress": 0.4333,
                "distanceToStopR": 2.3,
                "channelMid": 65950.0,
            },
        ),
        exposure=ManagedExposure(
            kind="position",
            id=7,
            status="OPEN",
            side="LONG",
            entryPrice=65500.0,
            stopLoss=65000.0,
            takeProfit=67000.0,
            unrealizedPnl=18.0,
        ),
        recentManagementReviews=[
            {
                "decision": "HOLD",
                "actionType": "HOLD",
                "eventType": "channel_rider_position_heartbeat",
                "phase": "OPEN_POSITION",
                "eventMetrics": {
                    "price": 66000.0,
                    "entryPrice": 65500.0,
                    "stopLoss": 65000.0,
                    "takeProfit": 67000.0,
                    "unrealizedPnl": 10.0,
                    "progressR": 1.0,
                    "targetProgress": 0.3333,
                    "distanceToStopR": 2.0,
                    "channelMid": 65900.0,
                },
                "exposure": {"unrealizedPnl": 10.0},
            }
        ],
    )

    delta = current_management_review_delta(payload)

    assert delta["previousPriceBox"]["price"] == 66000.0
    assert delta["changes"]["price"]["delta"] == pytest.approx(150.0)
    assert delta["changes"]["progressR"]["delta"] == pytest.approx(0.3)
    assert delta["changes"]["unrealizedPnl"]["delta"] == pytest.approx(8.0)
    assert delta["reviewContinuity"] == "MATERIAL_CHANGE"


def test_management_context_keeps_persisted_numeric_frame_for_next_delta():
    record = SimpleNamespace(
        id=9,
        created_at=None,
        event_type="channel_rider_position_heartbeat",
        phase="OPEN_POSITION",
        decision="HOLD",
        action_type="HOLD",
        confidence=78,
        payload_json=json.dumps(
            {
                "event": {
                    "metrics": {
                        "price": 66000.0,
                        "progressR": 1.0,
                        "nestedDebug": {"ignored": True},
                    }
                },
                "exposure": {
                    "kind": "position",
                    "id": 7,
                    "side": "LONG",
                    "entryPrice": 65500.0,
                    "stopLoss": 65000.0,
                    "unrealizedPnl": 10.0,
                    "payload": {"ignored": True},
                },
                "review": {"rationale": "Hold."},
            }
        ),
    )

    summary = _management_summary(record)

    assert summary["eventMetrics"] == {"price": 66000.0, "progressR": 1.0}
    assert summary["exposure"] == {
        "kind": "position",
        "id": 7,
        "side": "LONG",
        "entryPrice": 65500.0,
        "stopLoss": 65000.0,
        "unrealizedPnl": 10.0,
    }


def test_adverse_heartbeat_is_high_and_defensive_when_position_is_down():
    snapshot = sample_snapshot()
    snapshot["price"] = 65700.0
    position = PaperPositionRecord(
        trader_id="channel-rider",
        symbol="BTCUSDT",
        status="open",
        side="long",
        quantity=Decimal("0.1"),
        entry_price=Decimal("66000"),
        leverage=Decimal("5"),
        notional=Decimal("6600"),
        margin=Decimal("1320"),
        unrealized_pnl=Decimal("-30"),
        stop_loss_price=Decimal("65000"),
        take_profit_price=Decimal("68000"),
    )

    event = heartbeat_event_for_position("channel-rider", position, snapshot)

    assert event.metrics["progressR"] == pytest.approx(-0.3)
    assert event.severity == "HIGH"
    assert agent_mode_for_event(event) == "DEFENSIVE"


def test_management_translation_localizes_reason_without_changing_action_machine_fields():
    raw = {
        "decision": "MOVE_STOP",
        "confidence": 80,
        "riskLevel": "MEDIUM",
        "actions": [{"type": "MOVE_STOP", "price": 65500.0, "quantityFraction": 0.25, "reason": "Canonical."}],
        "riskChange": "REDUCED",
        "nextReviewInSeconds": 300,
        "rationale": "Canonical rationale.",
        "counterThesis": "Canonical counter-thesis.",
        "translations": {
            "en": {
                "structuredReview": {"headline": "English headline.", "action": "English action."},
                "actions": [{"type": "CLOSE_POSITION", "price": 1.0, "quantityFraction": 1.0, "reason": "English reason."}],
                "rationale": "English rationale.",
                "counterThesis": "English counter-thesis.",
            },
            "ko": {
                "structuredReview": {"headline": "한국어 헤드라인.", "action": "한국어 행동."},
                "actions": [{"type": "HOLD", "price": 2.0, "quantityFraction": 0.0, "reason": "한국어 이유."}],
                "rationale": "한국어 근거.",
                "counterThesis": "한국어 반대 가설.",
            },
        },
    }

    review = BaseAIProvider().normalize_management_result(raw)

    assert review.actions[0].type == "MOVE_STOP"
    assert review.actions[0].price == 65500.0
    assert review.actions[0].quantityFraction == 0.25
    assert review.actions[0].reason == "English reason."
    for locale in ("en", "ko"):
        action = review.translations[locale]["actions"][0]
        assert action["type"] == "MOVE_STOP"
        assert action["price"] == 65500.0
        assert action["quantityFraction"] == 0.25
    assert review.translations["ko"]["actions"][0]["reason"] == "한국어 이유."
