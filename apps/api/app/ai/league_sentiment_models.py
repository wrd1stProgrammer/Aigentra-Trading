from typing import Any, Dict, List, Optional

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
    sourceBreakdown: Dict[str, Any] = Field(default_factory=dict)
    dataFreshness: Dict[str, Any] = Field(default_factory=dict)
    evidenceRefs: List[Dict[str, Any]] = Field(default_factory=list)
    derivedSignals: Dict[str, Any] = Field(default_factory=dict)
    previousOpinion: Optional[Dict[str, Any]] = None


class LeagueSentimentBrief(BaseModel):
    conclusion: str = ""
    reason: str = ""
    watch: str = ""


class LeagueSentimentLocalizedOpinion(BaseModel):
    confidenceReason: str = ""
    brief: LeagueSentimentBrief = Field(default_factory=LeagueSentimentBrief)
    headline: str = ""
    summary: str = ""
    keyDrivers: List[str] = Field(default_factory=list)
    risks: List[str] = Field(default_factory=list)
    watchConditions: List[str] = Field(default_factory=list)
    action: str = ""
    longShortContext: str = ""


class LeagueSentimentOpinionResult(BaseModel):
    bias: str
    confidence: int
    riskLevel: str
    confidenceReason: str = ""
    brief: LeagueSentimentBrief = Field(default_factory=LeagueSentimentBrief)
    headline: str
    summary: str
    keyDrivers: List[str] = Field(default_factory=list)
    risks: List[str] = Field(default_factory=list)
    watchConditions: List[str] = Field(default_factory=list)
    action: str
    longShortContext: str
    sourceCounts: Dict[str, int] = Field(default_factory=dict)
    sourceBreakdown: Dict[str, Any] = Field(default_factory=dict)
    dataFreshness: Dict[str, Any] = Field(default_factory=dict)
    evidenceRefs: List[Dict[str, Any]] = Field(default_factory=list)
    invalidatesAt: Optional[str] = None
    provider: str = "mock"
    model: str = "mock-league-opinion"
    fallback: bool = False
    translations: Dict[str, LeagueSentimentLocalizedOpinion] = Field(default_factory=dict)
