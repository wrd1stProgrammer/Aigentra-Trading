import json
import os
import tempfile
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

import anyio

from app.ai.anthropic_provider import league_sentiment_schema, management_review_schema, trade_review_schema
from app.ai.base import (
    BaseAIProvider,
    entry_approval_prompt,
    extract_json_object,
    league_sentiment_prompt,
    position_management_review_prompt,
)
from app.ai.league_sentiment_models import LeagueSentimentOpinionResult, LeagueSentimentPayload
from app.repositories import sanitize_error_message
from app.traders.models import PositionManagementPayload, PositionManagementResult, TradeReviewPayload, TradeReviewResult


class CodexCliError(RuntimeError):
    pass


@dataclass(frozen=True, slots=True)
class CodexCliConfig:
    command: str = "codex"
    model: str = ""
    timeout_seconds: float = 120.0
    workdir: str = "."
    codex_home: str = ""
    access_token: str = ""


class CodexJsonClient(Protocol):
    async def run_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        output_schema: dict[str, Any],
        model: str = "",
    ) -> dict[str, Any]:
        ...


CODEX_JSON_SYSTEM_PROMPT = (
    "Return only strict JSON matching the supplied output schema. "
    "Do not inspect files, run commands, browse, or use tools. Use only the prompt payload."
)


def build_codex_cli_env(
    *,
    codex_home: str = "",
    access_token: str = "",
    extra_env: dict[str, str] | None = None,
) -> dict[str, str]:
    source = extra_env or os.environ
    env: dict[str, str] = {}
    for key in ("PATH", "HOME", "LANG", "LC_ALL", "SSL_CERT_FILE", "SSL_CERT_DIR", "CODEX_CA_CERTIFICATE"):
        value = source.get(key)
        if value:
            env[key] = value
    if codex_home:
        env["CODEX_HOME"] = codex_home
    if access_token:
        env["CODEX_ACCESS_TOKEN"] = access_token
    return env


class CodexCliClient:
    def __init__(self, config: CodexCliConfig) -> None:
        self.config = config

    async def run_json(
        self,
        *,
        system_prompt: str,
        user_prompt: str,
        output_schema: dict[str, Any],
        model: str = "",
    ) -> dict[str, Any]:
        schema_path = self._write_schema(output_schema)
        try:
            args = self._command_args(schema_path=schema_path, model=model or self.config.model, system_prompt=system_prompt)
            with anyio.fail_after(self.config.timeout_seconds):
                result = await anyio.run_process(
                    args,
                    input=user_prompt.encode("utf-8"),
                    cwd=self.config.workdir or None,
                    env=build_codex_cli_env(
                        codex_home=self.config.codex_home,
                        access_token=self.config.access_token,
                    ),
                    check=False,
                )
        except TimeoutError as exc:
            raise CodexCliError(f"Codex CLI timed out after {self.config.timeout_seconds:.1f}s.") from exc
        except OSError as exc:
            raise CodexCliError(f"Codex CLI could not start: {self._clean_error(str(exc))}") from exc
        finally:
            schema_path.unlink(missing_ok=True)
        stderr = result.stderr.decode("utf-8", errors="replace")
        stdout = result.stdout.decode("utf-8", errors="replace")
        if result.returncode != 0:
            raise CodexCliError(
                f"Codex CLI exited with {result.returncode}: {self._clean_error(stderr or stdout)}"
            )
        return self._parse_stdout(stdout)

    def _command_args(self, *, schema_path: Path, model: str, system_prompt: str) -> list[str]:
        args = [
            self.config.command,
            "exec",
            "--json",
            "--ephemeral",
            "--sandbox",
            "read-only",
            "--ask-for-approval",
            "never",
            "--ignore-rules",
            "--skip-git-repo-check",
            "--output-schema",
            str(schema_path),
        ]
        if model:
            args.extend(["-m", model])
        args.append(system_prompt)
        return args

    def _write_schema(self, schema: dict[str, Any]) -> Path:
        with tempfile.NamedTemporaryFile("w", encoding="utf-8", suffix=".schema.json", delete=False) as handle:
            json.dump(schema, handle, ensure_ascii=False, sort_keys=True)
            return Path(handle.name)

    def _parse_stdout(self, stdout: str) -> dict[str, Any]:
        final_text = ""
        for line in stdout.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            try:
                event = json.loads(stripped)
            except json.JSONDecodeError:
                final_text = stripped
                continue
            if self._is_agent_message(event):
                final_text = str(event["item"].get("text") or "")
                continue
            if isinstance(event, dict) and not event.get("type"):
                return event
        if final_text:
            try:
                parsed = json.loads(final_text)
            except json.JSONDecodeError:
                parsed = extract_json_object(final_text)
            if isinstance(parsed, dict):
                return parsed
        raise CodexCliError("Codex CLI did not return a JSON object.")

    def _is_agent_message(self, event: dict[str, Any]) -> bool:
        item = event.get("item")
        return event.get("type") == "item.completed" and isinstance(item, dict) and item.get("type") == "agent_message"

    def _clean_error(self, message: str) -> str:
        clean = sanitize_error_message(" ".join(message.split())[:600]) or ""
        return clean[:600]


class CodexCliAIProvider(BaseAIProvider):
    name = "codex_cli"

    def __init__(
        self,
        *,
        client: CodexJsonClient,
        model: str = "",
        trade_review_model: str = "",
        position_management_model: str = "",
        league_sentiment_model: str = "",
    ) -> None:
        self.client = client
        self.model = model
        self.trade_review_model = trade_review_model or model
        self.position_management_model = position_management_model or model
        self.league_sentiment_model = league_sentiment_model or model

    async def review_trade_candidate(self, payload: TradeReviewPayload) -> TradeReviewResult:
        raw = await self.client.run_json(
            system_prompt=CODEX_JSON_SYSTEM_PROMPT,
            user_prompt=entry_approval_prompt(payload),
            output_schema=trade_review_schema(),
            model=self.trade_review_model,
        )
        review = self.normalize_result(raw)
        return review.model_copy(update={"model": self.trade_review_model})

    async def review_position_management(self, payload: PositionManagementPayload) -> PositionManagementResult:
        raw = await self.client.run_json(
            system_prompt=CODEX_JSON_SYSTEM_PROMPT,
            user_prompt=position_management_review_prompt(payload),
            output_schema=management_review_schema(),
            model=self.position_management_model,
        )
        review = self.normalize_management_result(raw)
        return review.model_copy(update={"model": self.position_management_model})

    async def review_league_sentiment(self, payload: LeagueSentimentPayload) -> LeagueSentimentOpinionResult:
        raw = await self.client.run_json(
            system_prompt=CODEX_JSON_SYSTEM_PROMPT,
            user_prompt=league_sentiment_prompt(payload),
            output_schema=league_sentiment_schema(),
            model=self.league_sentiment_model,
        )
        opinion = self.normalize_league_sentiment_result(raw)
        return opinion.model_copy(update={"model": self.league_sentiment_model})


class FallbackAIProvider(BaseAIProvider):
    def __init__(self, *, primary: BaseAIProvider, fallback: BaseAIProvider) -> None:
        self.primary = primary
        self.fallback_provider = fallback
        self.name = primary.name
        self.model = getattr(primary, "model", primary.name)

    async def review_trade_candidate(self, payload: TradeReviewPayload) -> TradeReviewResult:
        try:
            return await self.primary.review_trade_candidate(payload)
        except CodexCliError:
            return await self.fallback_provider.review_trade_candidate(payload)

    async def review_position_management(self, payload: PositionManagementPayload) -> PositionManagementResult:
        try:
            return await self.primary.review_position_management(payload)
        except CodexCliError:
            return await self.fallback_provider.review_position_management(payload)

    async def review_league_sentiment(self, payload: LeagueSentimentPayload) -> LeagueSentimentOpinionResult:
        try:
            return await self.primary.review_league_sentiment(payload)
        except CodexCliError:
            return await self.fallback_provider.review_league_sentiment(payload)
