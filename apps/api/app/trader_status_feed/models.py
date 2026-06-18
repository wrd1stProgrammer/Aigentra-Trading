from datetime import datetime
from typing import Any, Protocol

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StatusFeedPersona(BaseModel):
    model_config = ConfigDict(frozen=True)

    traderId: str
    name: str
    alias: str
    voice: str
    cadence: str
    avoid: str


class StatusFeedRequest(BaseModel):
    model_config = ConfigDict(frozen=True)

    trader: StatusFeedPersona
    symbol: str
    stateKey: str
    eventType: str
    generatedAt: datetime
    trigger: dict[str, Any] = Field(default_factory=dict)
    context: dict[str, Any] = Field(default_factory=dict)


class StatusFeedResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    headline: str
    message: str
    mood: str = "focused"
    stance: str = "patient"
    watch: str = ""
    provider: str
    model: str
    fallback: bool = False

    @field_validator("headline", "message", "mood", "stance", "watch", mode="before")
    @classmethod
    def clean_text(cls, value: Any) -> str:
        return " ".join(str(value or "").split())


class TraderStatusFeedGenerator(Protocol):
    name: str
    model: str

    async def generate(self, request: StatusFeedRequest) -> StatusFeedResult:
        ...
