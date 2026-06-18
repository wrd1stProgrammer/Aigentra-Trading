from typing import Any, Dict, List

from pydantic import BaseModel, Field


class LeagueSentimentPayload(BaseModel):
    symbol: str
    locale: str = "en"
    generatedAt: str
    intervalStart: str
    intervalEnd: str
    market: Dict[str, Any] = Field(default_factory=dict)
    sourceCounts: Dict[str, int] = Field(default_factory=dict)
    activePositions: List[Dict[str, Any]] = Field(default_factory=list)
    pendingOrders: List[Dict[str, Any]] = Field(default_factory=list)
    recentClosedPositions: List[Dict[str, Any]] = Field(default_factory=list)
    recentTradeEvents: List[Dict[str, Any]] = Field(default_factory=list)
    recentEntryReviews: List[Dict[str, Any]] = Field(default_factory=list)
    recentManagementReviews: List[Dict[str, Any]] = Field(default_factory=list)
    longShortContext: Dict[str, Any] = Field(default_factory=dict)
    dataQuality: List[str] = Field(default_factory=list)


class LeagueSentimentOpinionResult(BaseModel):
    bias: str
    confidence: int
    riskLevel: str
    headline: str
    summary: str
    keyDrivers: List[str] = Field(default_factory=list)
    risks: List[str] = Field(default_factory=list)
    watchConditions: List[str] = Field(default_factory=list)
    action: str
    longShortContext: str
    dataQuality: List[str] = Field(default_factory=list)
    sourceCounts: Dict[str, int] = Field(default_factory=dict)
    provider: str = "mock"
    model: str = "mock-league-opinion"
    fallback: bool = False
