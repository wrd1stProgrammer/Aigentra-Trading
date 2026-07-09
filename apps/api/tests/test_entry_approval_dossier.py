import json

from app.ai.base import entry_approval_prompt
from app.ai.entry_approval_dossier import build_entry_approval_dossier
from app.traders.models import TradeReviewPayload
from app.traders.registry import get_strategy
from tests.test_trader_cycle import prompt_payload, sample_snapshot


def test_entry_approval_prompt_uses_compact_data_dossier_instead_of_raw_payload_dump():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(snapshot)
    candidate.audit["debugDump"] = {
        "rawCandles": [{"open": 1, "high": 2, "low": 0, "close": 1}] * 24,
        "internalScoreTrace": "do not send this to the LLM",
    }

    prompt = entry_approval_prompt(
        TradeReviewPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            candidate=candidate,
            locale="en",
            recentAiReviews=[
                {
                    "decision": "APPROVE",
                    "approvalReason": "The old approval sentence should only appear as memory.",
                    "structuredReview": {"headline": "The old headline should only appear as memory."},
                }
            ],
            recentManagementReviews=[
                {
                    "decision": "HOLD",
                    "structuredReview": {"headline": "A management note should not be copied in full."},
                    "appliedActions": [{"type": "MOVE_STOP_TO_BREAKEVEN"}, {"type": "TRAIL_STOP"}],
                }
            ],
            recentTradeEvents=[
                {
                    "eventType": "position_closed",
                    "payload": {"oversizedExecutionTrace": "this raw payload should be stripped"},
                }
            ],
        )
    )

    data = prompt_payload(prompt)
    assert sorted(data) == ["approvalDossier", "requestedLocale", "symbol"]
    assert "candidate" not in data
    assert "marketSnapshot" not in data
    assert "recentAiReviews" not in data
    assert "recentManagementReviews" not in data
    assert "recentTradeEvents" not in data

    dossier = data["approvalDossier"]
    assert dossier["candidate"]["side"] == candidate.side
    assert dossier["strategyReviewerPolicy"]
    assert dossier["geometry"]["weightedEntry"] > 0
    assert dossier["market"]["price"] == snapshot["price"]
    assert "15m" in dossier["market"]["timeframes"]
    assert "debugDump" not in json.dumps(dossier, ensure_ascii=False)
    assert "oversizedExecutionTrace" not in json.dumps(dossier, ensure_ascii=False)
    assert "allowedDecisions" in dossier["decisionGate"]
    assert "dataChecks" in dossier


def test_entry_approval_dossier_hard_gate_blocks_approval_for_invalid_geometry():
    snapshot = sample_snapshot()
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(snapshot)
    assert candidate.side == "LONG"
    candidate.entries[0].price = snapshot["price"] + 500.0
    candidate.stopLoss = snapshot["price"] + 250.0

    dossier = build_entry_approval_dossier(
        TradeReviewPayload(
            trader=strategy.profile,
            symbol="BTCUSDT",
            marketSnapshot=snapshot,
            candidate=candidate,
            locale="en",
        )
    )

    assert dossier["decisionGate"]["severity"] == "hard_fail"
    assert dossier["decisionGate"]["allowedDecisions"] == ["REJECT", "NEEDS_MORE_DATA"]
    assert "APPROVE" in dossier["decisionGate"]["blockedDecisions"]
    assert "ADJUST_AND_APPROVE" in dossier["decisionGate"]["blockedDecisions"]
    failed_checks = [check for check in dossier["dataChecks"] if check["status"] == "fail"]
    assert failed_checks
    assert any("entry" in check["detail"].lower() or "stop" in check["detail"].lower() for check in failed_checks)
