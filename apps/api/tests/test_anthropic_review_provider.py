import pytest

import app.main as main
from app.db import ProviderCallLogRecord, init_db, reset_db_engine, session_scope
from app.traders.models import ManagedExposure, ManagementEvent, PositionManagementPayload, TradeReviewPayload
from app.traders.registry import get_strategy


def sample_review_payload() -> TradeReviewPayload:
    strategy = get_strategy("channel-rider")
    candidate = strategy.evaluate(
        {
            "symbol": "BTCUSDT",
            "price": 66000.0,
            "timeframes": {
                "15m": {"close": 66000, "rsi14": 42, "atr14": 120, "volumeZscore": 1.2, "trend": "UP"},
                "1h": {"close": 66000, "rsi14": 45, "atr14": 320, "volumeZscore": 1.0, "trend": "UP"},
                "4h": {"close": 66000, "ema20": 65500, "ema50": 64000, "rsi14": 55, "trend": "UP"},
            },
            "derivatives": {"fundingRate": 0.0001, "openInterest": 1000000},
            "marketRegime": {"primary": "trend"},
        }
    )
    return TradeReviewPayload(
        trader=strategy.profile,
        symbol="BTCUSDT",
        marketSnapshot={"symbol": "BTCUSDT", "price": 66000.0, "timeframes": {}, "derivatives": {}},
        candidate=candidate,
        locale="ko",
    )


def sample_management_payload() -> PositionManagementPayload:
    strategy = get_strategy("channel-rider")
    return PositionManagementPayload(
        trader=strategy.profile,
        symbol="BTCUSDT",
        marketSnapshot={"symbol": "BTCUSDT", "price": 66000.0, "timeframes": {}, "derivatives": {}},
        event=ManagementEvent(
            eventType="position_heartbeat",
            phase="OPEN_POSITION",
            severity="MEDIUM",
            reason="Scheduled open-position review.",
            suggestedAction="HOLD",
        ),
        exposure=ManagedExposure(
            kind="position",
            id=7,
            status="OPEN",
            side="LONG",
            quantity=0.01,
            entryPrice=65500.0,
            stopLoss=65000.0,
            takeProfit=67000.0,
        ),
        locale="ko",
    )


@pytest.mark.asyncio
async def test_anthropic_entry_review_uses_json_output_schema(monkeypatch):
    from app.ai.anthropic_provider import ANTHROPIC_REVIEW_MAX_TOKENS, AnthropicProvider

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "{"
                            '"decision":"APPROVE",'
                            '"confidence":84,'
                            '"riskLevel":"MEDIUM",'
                            '"reviewCode":"ENTRY_REVIEW",'
                            '"reviewFacts":[{"code":"entry_geometry_checked","labelKey":"reviewFact.entryGeometryChecked","severity":"info"}],'
                            '"riskFlags":["risk_level:medium"],'
                            '"structuredReview":{"verdict":"진입 승인","headline":"채널 근거가 유지돼 진입을 승인합니다.","action":"손절 기준을 먼저 확인하고 계획대로 대기 주문을 유지하세요.","keyReasons":["진입 구조가 맞습니다."],"risks":["채널 하단이 깨지면 취소입니다."],"watchConditions":["15m 종가가 채널을 이탈하는지 확인"],"managerNote":"무효화가 먼저 깨지면 진입하지 않습니다."},'
                            '"adjustments":[],'
                            '"earlyExitRecommendations":["15m 종가가 진입 근거를 훼손하면 철회"],'
                            '"approvalReason":"1차 조건과 리스크 구조가 일치합니다.",'
                            '"counterThesis":"채널 하단이 깨지면 진입 근거가 사라집니다."'
                            "}"
                        ),
                    }
                ]
            }

    class FakeAsyncClient:
        def __init__(self, *, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["body"] = json
            return FakeResponse()

    monkeypatch.setattr("app.ai.anthropic_provider.httpx.AsyncClient", FakeAsyncClient)

    review = await AnthropicProvider("test-key", "claude-haiku-4-5").review_trade_candidate(sample_review_payload())

    assert review.decision == "APPROVE"
    assert review.provider == "anthropic"
    assert review.reviewFacts[0].code == "entry_geometry_checked"
    assert "tools" not in captured["body"]
    assert "tool_choice" not in captured["body"]
    schema = captured["body"]["output_config"]["format"]["schema"]
    assert captured["body"]["output_config"]["format"]["type"] == "json_schema"
    assert "decision" in schema["required"]
    assert "structuredReview" in schema["required"]
    assert schema["additionalProperties"] is False
    assert "maxItems" not in repr(schema)
    approval_description = schema["properties"]["approvalReason"]["description"]
    assert "Legacy entry approval rationale" in approval_description
    assert "1-2" in approval_description
    assert captured["body"]["max_tokens"] == ANTHROPIC_REVIEW_MAX_TOKENS
    assert "under 140 characters" not in captured["body"]["system"]
    assert review.structuredReview is not None
    assert review.structuredReview.headline == "채널 근거가 유지돼 진입을 승인합니다."


@pytest.mark.asyncio
async def test_anthropic_management_review_uses_json_output_schema(monkeypatch):
    from app.ai.anthropic_provider import ANTHROPIC_REVIEW_MAX_TOKENS, AnthropicProvider

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "content": [
                    {
                        "type": "text",
                        "text": (
                            "{"
                            '"decision":"HOLD",'
                            '"confidence":73,'
                            '"riskLevel":"MEDIUM",'
                            '"reviewCode":"POSITION_MANAGEMENT_REVIEW",'
                            '"reviewFacts":[{"code":"management_event_reviewed","labelKey":"reviewFact.managementEventReviewed","severity":"info"}],'
                            '"riskFlags":["risk_level:medium"],'
                            '"structuredReview":{"verdict":"유지","headline":"가격이 아직 관리 범위 안에 있습니다.","action":"현재 포지션을 유지하고 다음 리뷰까지 손절 접근 여부를 확인하세요.","keyReasons":["관리 이벤트를 확인했습니다."],"risks":["65000 이탈 시 손절 기준이 우선입니다."],"watchConditions":["65000 이탈 여부"],"managerNote":"하드룰은 AI 판단보다 우선합니다."},'
                            '"actions":[{"type":"HOLD","reason":"추세 훼손 전까지 유지"}],'
                            '"riskChange":"UNCHANGED",'
                            '"nextReviewInSeconds":300,'
                            '"rationale":"가격이 아직 관리 범위 안에 있습니다.",'
                            '"counterThesis":"65000 이탈 시 손절 기준이 우선입니다."'
                            "}"
                        ),
                    }
                ]
            }

    class FakeAsyncClient:
        def __init__(self, *, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            captured["body"] = json
            return FakeResponse()

    monkeypatch.setattr("app.ai.anthropic_provider.httpx.AsyncClient", FakeAsyncClient)

    review = await AnthropicProvider("test-key", "claude-haiku-4-5").review_position_management(sample_management_payload())

    assert review.decision == "HOLD"
    assert review.provider == "anthropic"
    assert review.actions[0].type == "HOLD"
    assert "tools" not in captured["body"]
    assert "tool_choice" not in captured["body"]
    schema = captured["body"]["output_config"]["format"]["schema"]
    assert captured["body"]["output_config"]["format"]["type"] == "json_schema"
    assert "decision" in schema["required"]
    assert "structuredReview" in schema["required"]
    assert schema["additionalProperties"] is False
    assert "maxItems" not in repr(schema)
    assert captured["body"]["max_tokens"] == ANTHROPIC_REVIEW_MAX_TOKENS
    assert "beginner-readable" in captured["body"]["system"]
    assert review.structuredReview is not None
    assert review.structuredReview.action.startswith("현재 포지션")


def test_anthropic_json_output_error_includes_stop_reason_and_content_types():
    from app.ai.anthropic_provider import extract_anthropic_json_output

    with pytest.raises(ValueError) as exc:
        extract_anthropic_json_output(
            {
                "stop_reason": "refusal",
                "content": [{"type": "redacted_thinking"}, {"type": "text", "text": ""}],
            }
        )

    message = str(exc.value)
    assert "stop_reason=refusal" in message
    assert "content_types=redacted_thinking,text" in message


def test_anthropic_json_output_parse_error_includes_preview():
    from app.ai.anthropic_provider import extract_anthropic_json_output

    with pytest.raises(ValueError) as exc:
        extract_anthropic_json_output(
            {
                "stop_reason": "end_turn",
                "content": [{"type": "text", "text": "I cannot return that as JSON."}],
            }
        )

    message = str(exc.value)
    assert "stop_reason=end_turn" in message
    assert "content_types=text" in message
    assert "I cannot return that as JSON." in message


def test_management_review_prompt_allows_ai_profit_actions_without_forcing_visible_numbers():
    from app.ai.base import position_management_review_prompt
    from app.ai.anthropic_provider import management_action_schema

    prompt = position_management_review_prompt(sample_management_payload())
    schema = management_action_schema()
    action_description = schema["properties"]["type"].get("description", "")

    assert "current price, entry, stop, target, PnL" not in prompt
    assert "only when they change the management decision" in prompt
    assert "TAKE_PARTIAL_PROFIT" in prompt
    assert "CLOSE_POSITION" in prompt
    assert "early full take-profit" in prompt
    assert "partial take-profit" in action_description
    assert "early full close" in action_description


def test_management_result_normalizes_full_take_profit_aliases():
    from app.ai.base import BaseAIProvider

    provider = BaseAIProvider()
    provider.name = "test"
    provider.model = "test-model"

    review = provider.normalize_management_result(
        {
            "decision": "TAKE_FULL_PROFIT",
            "confidence": 81,
            "riskLevel": "MEDIUM",
            "structuredReview": {"headline": "Exit the winner.", "action": "Close all now."},
            "actions": [{"type": "CLOSE_ALL", "reason": "Target path is exhausted."}],
            "riskChange": "REDUCED",
            "nextReviewInSeconds": 180,
            "rationale": "Exit all while the move is extended.",
            "counterThesis": "If the trend extends, we already protected the simulated gain.",
        }
    )

    assert review.decision == "CLOSE_POSITION"
    assert review.actions[0].type == "CLOSE_POSITION"


@pytest.mark.asyncio
async def test_anthropic_entry_review_still_accepts_tool_input_compatibility(monkeypatch):
    from app.ai.anthropic_provider import AnthropicProvider

    captured = {}

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "content": [
                    {
                        "type": "tool_use",
                        "name": "submit_trade_review",
                        "input": {
                            "decision": "APPROVE",
                            "confidence": 84,
                            "riskLevel": "MEDIUM",
                            "reviewCode": "ENTRY_REVIEW",
                            "reviewFacts": [
                                {
                                    "code": "entry_geometry_checked",
                                    "labelKey": "reviewFact.entryGeometryChecked",
                                    "severity": "info",
                                }
                            ],
                            "riskFlags": ["risk_level:medium"],
                            "adjustments": [],
                            "earlyExitRecommendations": ["15m 종가가 진입 근거를 훼손하면 철회"],
                            "approvalReason": "1차 조건과 리스크 구조가 일치합니다.",
                            "counterThesis": "채널 하단이 깨지면 진입 근거가 사라집니다.",
                        },
                    }
                ]
            }

    class FakeAsyncClient:
        def __init__(self, *, timeout):
            self.timeout = timeout

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def post(self, url, *, headers, json):
            captured["url"] = url
            captured["headers"] = headers
            captured["body"] = json
            return FakeResponse()

    monkeypatch.setattr("app.ai.anthropic_provider.httpx.AsyncClient", FakeAsyncClient)

    review = await AnthropicProvider("test-key", "claude-haiku-4-5").review_trade_candidate(sample_review_payload())

    assert review.decision == "APPROVE"
    assert review.provider == "anthropic"
    assert review.reviewFacts[0].code == "entry_geometry_checked"
    assert captured["body"]["output_config"]["format"]["type"] == "json_schema"


@pytest.mark.asyncio
async def test_review_logging_persists_provider_failure_after_caller_rolls_back(tmp_path, monkeypatch):
    from app.ai import review_logging

    db_path = tmp_path / "provider-log.db"
    reset_db_engine(f"sqlite:///{db_path}")
    init_db()

    class FailingProvider:
        name = "anthropic"
        model = "claude-haiku-4-5"

        async def review_trade_candidate(self, payload):
            raise ValueError("Provider response did not contain valid JSON.")

    monkeypatch.setattr(review_logging, "get_ai_provider", lambda settings, provider_name: FailingProvider())
    monkeypatch.setattr(main.settings, "ai_missing_key_fallback_to_mock", False)

    with pytest.raises(RuntimeError):
        with session_scope() as db:
            await review_logging.run_review_with_logging(db, sample_review_payload(), "anthropic", settings=main.settings)

    with session_scope() as db:
        records = db.query(ProviderCallLogRecord).all()

    assert len(records) == 1
    assert records[0].provider == "anthropic"
    assert records[0].success is False
    assert records[0].status == "error"

    reset_db_engine("sqlite:///:memory:")
    init_db()
