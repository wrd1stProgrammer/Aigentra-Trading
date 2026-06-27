import json
from pathlib import Path
from typing import Any

import pytest

from app.ai.factory import get_ai_provider, provider_status
from app.ai.league_sentiment_models import LeagueSentimentOpinionResult
from app.core.config import Settings

from test_openai_provider_models import (
    sample_league_sentiment_payload,
    sample_management_payload,
    sample_review_payload,
)


def fake_codex_executable(tmp_path: Path, final_json: dict[str, Any], *, exit_code: int = 0) -> tuple[Path, Path]:
    record_path = tmp_path / "codex-record.json"
    script_path = tmp_path / "codex"
    event = {"type": "item.completed", "item": {"type": "agent_message", "text": json.dumps(final_json)}}
    script_path.write_text(
        "\n".join(
            [
                "#!/usr/bin/env python3",
                "import json, os, pathlib, sys",
                f"record_path = pathlib.Path({str(record_path)!r})",
                "record_path.write_text(json.dumps({",
                "    'argv': sys.argv,",
                "    'stdin': sys.stdin.read(),",
                "    'env': {",
                "        'CODEX_HOME': os.environ.get('CODEX_HOME'),",
                "        'CODEX_ACCESS_TOKEN': os.environ.get('CODEX_ACCESS_TOKEN'),",
                "        'OPENAI_API_KEY': os.environ.get('OPENAI_API_KEY'),",
                "        'DATABASE_URL': os.environ.get('DATABASE_URL'),",
                "        'TELEGRAM_BOT_TOKEN': os.environ.get('TELEGRAM_BOT_TOKEN'),",
                "    },",
                "}, sort_keys=True))",
                f"print({json.dumps(json.dumps(event))})",
                f"raise SystemExit({exit_code})",
            ]
        )
    )
    script_path.chmod(0o755)
    return script_path, record_path


@pytest.mark.asyncio
async def test_codex_cli_client_invokes_safe_exec_and_parses_jsonl(tmp_path, monkeypatch):
    from app.ai.codex_cli_provider import CodexCliClient, CodexCliConfig

    monkeypatch.setenv("OPENAI_API_KEY", "should-not-leak")
    monkeypatch.setenv("DATABASE_URL", "postgresql://should-not-leak")
    monkeypatch.setenv("TELEGRAM_BOT_TOKEN", "should-not-leak")
    codex_bin, record_path = fake_codex_executable(tmp_path, {"decision": "HOLD"})
    client = CodexCliClient(
        CodexCliConfig(
            command=str(codex_bin),
            model="gpt-test",
            timeout_seconds=5.0,
            workdir=str(tmp_path),
            codex_home=str(tmp_path / "codex-home"),
            access_token="test-access-token",
        )
    )

    result = await client.run_json(
        system_prompt="Return JSON only.",
        user_prompt="payload-from-stdin",
        output_schema={"type": "object", "additionalProperties": True},
    )

    record = json.loads(record_path.read_text())
    argv = record["argv"]
    assert result == {"decision": "HOLD"}
    assert argv[1:3] == ["exec", "--json"]
    assert "--ephemeral" in argv
    assert "--sandbox" in argv
    assert "read-only" in argv
    assert "--ask-for-approval" in argv
    assert "never" in argv
    assert "--ignore-rules" in argv
    assert "--skip-git-repo-check" in argv
    assert "--output-schema" in argv
    assert "--dangerously-bypass-approvals-and-sandbox" not in argv
    assert record["stdin"] == "payload-from-stdin"
    assert record["env"]["CODEX_HOME"] == str(tmp_path / "codex-home")
    assert record["env"]["CODEX_ACCESS_TOKEN"] == "test-access-token"
    assert record["env"]["OPENAI_API_KEY"] is None
    assert record["env"]["DATABASE_URL"] is None
    assert record["env"]["TELEGRAM_BOT_TOKEN"] is None


def test_provider_status_accepts_codex_cli_aliases():
    settings = Settings(ai_provider="codex-cli", codex_cli_command="/usr/bin/false")

    status = provider_status(settings)

    assert settings.ai_provider == "codex_cli"
    assert status["codex_cli"]["configured"] is True
    assert status["codex_cli"]["selected"] is True
    assert status["codex_cli"]["active"] is True


def test_codex_cli_global_override_flag_preserves_existing_provider_env(monkeypatch):
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("AUTO_SCANNER_PROVIDER", "gemini")
    monkeypatch.setenv("POSITION_MANAGEMENT_PROVIDER", "gemini")
    monkeypatch.setenv("LEAGUE_SENTIMENT_PROVIDER", "gemini")
    monkeypatch.setenv("TRADER_STATUS_FEED_PROVIDER", "openai")
    monkeypatch.setenv("AI_TRANSLATION_PROVIDER", "openai")
    monkeypatch.setenv("AI_PROVIDER_CODEX", "true")

    settings = Settings()

    assert settings.ai_provider == "codex_cli"
    assert settings.auto_scanner_provider == "codex_cli"
    assert settings.position_management_provider == "codex_cli"
    assert settings.league_sentiment_provider == "codex_cli"
    assert settings.trader_status_feed_provider == "codex_cli"
    assert settings.ai_translation_provider == "codex_cli"


def test_codex_cli_surface_override_flag_only_changes_that_surface(monkeypatch):
    monkeypatch.delenv("AI_PROVIDER_CODEX", raising=False)
    monkeypatch.delenv("USE_CODEX_CLI", raising=False)
    monkeypatch.setenv("AI_PROVIDER", "gemini")
    monkeypatch.setenv("AUTO_SCANNER_PROVIDER", "gemini")
    monkeypatch.setenv("POSITION_MANAGEMENT_PROVIDER", "openai")
    monkeypatch.setenv("AUTO_SCANNER_PROVIDER_CODEX", "true")

    settings = Settings()

    assert settings.ai_provider == "gemini"
    assert settings.auto_scanner_provider == "codex_cli"
    assert settings.position_management_provider == "openai"


def test_codex_cli_surface_model_aliases_map_to_existing_model_fields(monkeypatch):
    monkeypatch.setenv("CODEX_CLI_MODEL", "gpt-default")
    monkeypatch.setenv("AUTO_SCANNER_CODEX_MODEL", "gpt-auto")
    monkeypatch.setenv("POSITION_MANAGEMENT_CODEX_MODEL", "gpt-management")
    monkeypatch.setenv("LEAGUE_SENTIMENT_CODEX_MODEL", "gpt-sentiment")
    monkeypatch.setenv("TRADER_STATUS_FEED_CODEX_MODEL", "gpt-feed")
    monkeypatch.setenv("AI_TRANSLATION_CODEX_MODEL", "gpt-translate")

    settings = Settings()

    assert settings.codex_cli_model == "gpt-default"
    assert settings.codex_cli_trade_review_model == "gpt-auto"
    assert settings.codex_cli_position_management_model == "gpt-management"
    assert settings.codex_cli_league_sentiment_model == "gpt-sentiment"
    assert settings.codex_cli_status_feed_model == "gpt-feed"
    assert settings.codex_cli_translation_model == "gpt-translate"


@pytest.mark.asyncio
async def test_get_ai_provider_falls_back_to_openai_when_codex_cli_fails(tmp_path, monkeypatch):
    codex_bin, _record_path = fake_codex_executable(tmp_path, {"error": "bad"}, exit_code=7)

    class FakeOpenAIProvider:
        name = "openai"
        model = "fallback-model"
        fallback = False

        def __init__(self, *args, **kwargs):
            self.args = args
            self.kwargs = kwargs

        async def review_trade_candidate(self, payload):
            return sample_review_payload_result(provider=self.name, model=self.model)

        async def review_position_management(self, payload):
            raise AssertionError("not used")

        async def review_league_sentiment(self, payload):
            return LeagueSentimentOpinionResult(
                bias="MIXED",
                confidence=60,
                riskLevel="MEDIUM",
                headline="Fallback sentiment.",
                summary="Fallback provider handled the failed CLI call.",
                keyDrivers=[],
                risks=[],
                watchConditions=[],
                action="Wait.",
                longShortContext="Mixed.",
                sourceCounts={},
                provider=self.name,
                model=self.model,
                fallback=False,
            )

    monkeypatch.setattr("app.ai.factory.OpenAIProvider", FakeOpenAIProvider)
    settings = Settings(
        ai_provider="codex_cli",
        codex_cli_command=str(codex_bin),
        codex_cli_workdir=str(tmp_path),
        openai_api_key="test-key",
        openai_model="fallback-model",
        ai_missing_key_fallback_to_mock=False,
    )

    provider = get_ai_provider(settings)
    review = await provider.review_trade_candidate(sample_review_payload())

    assert review.provider == "openai"
    assert review.model == "fallback-model"
    assert review.approvalReason == "Fallback approval."


@pytest.mark.asyncio
async def test_codex_cli_provider_normalizes_all_review_surfaces():
    from app.ai.codex_cli_provider import CodexCliAIProvider

    class FakeClient:
        def __init__(self) -> None:
            self.models: list[str] = []
            self.outputs = [
                {
                    "decision": "APPROVE",
                    "confidence": 82,
                    "riskLevel": "MEDIUM",
                    "reviewCode": "ENTRY_REVIEW",
                    "structuredReview": {"headline": "Entry is clear.", "action": "Approve the entry."},
                    "approvalReason": "Entry is clear.",
                    "counterThesis": "Cancel if invalidated.",
                },
                {
                    "decision": "HOLD",
                    "confidence": 77,
                    "riskLevel": "MEDIUM",
                    "reviewCode": "POSITION_MANAGEMENT_REVIEW",
                    "structuredReview": {"headline": "Position is early.", "action": "Hold for now."},
                    "actions": [{"type": "HOLD", "reason": "Still inside the risk box."}],
                    "riskChange": "UNCHANGED",
                    "nextReviewInSeconds": 300,
                    "rationale": "Position is early.",
                    "counterThesis": "Close if invalidated.",
                },
                {
                    "bias": "MIXED",
                    "confidence": 61,
                    "riskLevel": "MEDIUM",
                    "headline": "League is mixed.",
                    "summary": "Long and short exposure are balanced.",
                    "keyDrivers": ["One active long."],
                    "risks": ["Signals can flip."],
                    "watchConditions": ["Watch the next 1H close."],
                    "action": "Do not chase.",
                    "longShortContext": "LONG 1 / SHORT 0",
                    "sourceCounts": {"activePositions": 1},
                },
            ]

        async def run_json(self, *, system_prompt, user_prompt, output_schema, model):
            self.models.append(model)
            return self.outputs.pop(0)

    fake_client = FakeClient()
    provider = CodexCliAIProvider(
        client=fake_client,
        model="gpt-default",
        trade_review_model="gpt-entry",
        position_management_model="gpt-management",
        league_sentiment_model="gpt-sentiment",
    )

    entry = await provider.review_trade_candidate(sample_review_payload())
    management = await provider.review_position_management(sample_management_payload())
    sentiment = await provider.review_league_sentiment(sample_league_sentiment_payload())

    assert fake_client.models == ["gpt-entry", "gpt-management", "gpt-sentiment"]
    assert entry.provider == "codex_cli"
    assert management.provider == "codex_cli"
    assert sentiment.provider == "codex_cli"
    assert entry.model == "gpt-entry"
    assert management.model == "gpt-management"
    assert sentiment.model == "gpt-sentiment"

def sample_review_payload_result(*, provider: str, model: str):
    from app.traders.models import TradeReviewResult

    return TradeReviewResult(
        decision="APPROVE",
        confidence=80,
        riskLevel="MEDIUM",
        reviewCode="ENTRY_REVIEW",
        structuredReview={"headline": "Fallback headline.", "action": "Fallback action."},
        approvalReason="Fallback approval.",
        counterThesis="Fallback invalidation.",
        provider=provider,
        model=model,
        fallback=False,
    )
