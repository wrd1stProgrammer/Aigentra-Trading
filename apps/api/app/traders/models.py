from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


Decision = str
RiskLevel = str
Side = str


class TraderProfile(BaseModel):
    id: str
    name: str
    description: str
    concept: str
    baseRiskPercent: float
    riskLevel: str
    longConditions: List[str]
    shortConditions: List[str]
    entryRules: List[str]
    takeProfitRules: List[str]
    stopLossRules: List[str]
    aiReviewChecklist: List[str]
    mockPerformance: Dict[str, Any]
    currentPlan: str


class EntryPlan(BaseModel):
    price: float
    weight: float
    reason: str


class TakeProfitPlan(BaseModel):
    price: float
    weight: float
    reason: str


class OrderIntent(BaseModel):
    orderType: str = "LIMIT"
    timeInForce: str = "GTC"
    postOnly: bool = True
    reduceOnly: bool = False
    execution: str = "PENDING_ENTRY"
    chaseLimitPercent: float = 0.0


class LeveragePlan(BaseModel):
    suggestedLeverage: int = 1
    maxLeverage: int = 1
    marginMode: str = "ISOLATED"
    reason: str


class CandidateRiskPlan(BaseModel):
    minRiskReward: float = 1.3
    estimatedRiskReward: Optional[float] = None
    feeBufferPercent: float = 0.08
    maxLossPercent: Optional[float] = None
    sizingNote: str


class TradeCandidate(BaseModel):
    created: bool
    reason: Optional[str] = None
    side: Optional[Side] = None
    setupType: Optional[str] = None
    setupScore: int = 0
    entries: List[EntryPlan] = Field(default_factory=list)
    stopLoss: Optional[float] = None
    takeProfits: List[TakeProfitPlan] = Field(default_factory=list)
    riskPercent: Optional[float] = None
    orderIntent: Optional[OrderIntent] = None
    leveragePlan: Optional[LeveragePlan] = None
    riskPlan: Optional[CandidateRiskPlan] = None
    earlyExitRules: List[str] = Field(default_factory=list)
    managementNotes: List[str] = Field(default_factory=list)
    invalidation: Optional[str] = None
    notes: List[str] = Field(default_factory=list)


class TradeReviewPayload(BaseModel):
    trader: TraderProfile
    symbol: str
    marketSnapshot: Dict[str, Any]
    candidate: TradeCandidate
    locale: str = "ko"
    recentAiReviews: List[Dict[str, Any]] = Field(default_factory=list)
    recentManagementReviews: List[Dict[str, Any]] = Field(default_factory=list)
    activeExposure: Dict[str, Any] = Field(default_factory=dict)
    recentTradeEvents: List[Dict[str, Any]] = Field(default_factory=list)


class TradeReviewResult(BaseModel):
    decision: Decision
    confidence: int
    riskLevel: RiskLevel
    adjustments: List[str] = Field(default_factory=list)
    leverageOverride: Optional[float] = None
    riskPercentOverride: Optional[float] = None
    earlyExitRecommendations: List[str] = Field(default_factory=list)
    approvalReason: str
    counterThesis: str
    userSummary: str
    provider: str = "mock"
    model: str = "mock-reviewer"
    fallback: bool = False


class ManagementEvent(BaseModel):
    eventType: str
    phase: str
    severity: str = "MEDIUM"
    reason: str
    suggestedAction: str = "HOLD"
    metrics: Dict[str, Any] = Field(default_factory=dict)


class ManagedExposure(BaseModel):
    kind: str
    id: int
    status: str
    side: Optional[Side] = None
    quantity: Optional[float] = None
    entryPrice: Optional[float] = None
    limitPrice: Optional[float] = None
    stopLoss: Optional[float] = None
    takeProfit: Optional[float] = None
    leverage: Optional[float] = None
    unrealizedPnl: Optional[float] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)


class PositionManagementPayload(BaseModel):
    trader: TraderProfile
    symbol: str
    marketSnapshot: Dict[str, Any]
    event: ManagementEvent
    exposure: ManagedExposure
    locale: str = "ko"
    recentManagementReviews: List[Dict[str, Any]] = Field(default_factory=list)
    recentTradeEvents: List[Dict[str, Any]] = Field(default_factory=list)
    siblingExposures: Dict[str, Any] = Field(default_factory=dict)
    accountState: Dict[str, Any] = Field(default_factory=dict)


class ManagementAction(BaseModel):
    type: str = "HOLD"
    price: Optional[float] = None
    quantityFraction: Optional[float] = None
    reason: str = ""


class PositionManagementResult(BaseModel):
    decision: str
    confidence: int
    riskLevel: RiskLevel = "MEDIUM"
    actions: List[ManagementAction] = Field(default_factory=list)
    riskChange: str = "UNCHANGED"
    nextReviewInSeconds: int = 300
    rationale: str
    counterThesis: str
    userSummary: str
    provider: str = "mock"
    model: str = "mock-position-manager"
    fallback: bool = False


class TradePlan(BaseModel):
    status: str
    symbol: str
    side: Optional[Side] = None
    entries: List[EntryPlan] = Field(default_factory=list)
    stopLoss: Optional[float] = None
    takeProfits: List[TakeProfitPlan] = Field(default_factory=list)
    riskPercent: Optional[float] = None
    leverage: Optional[float] = None
    orderStyle: str = "LIMIT_STAGED"
    feeMode: str = "maker_entry_taker_exit"
    estimatedFees: Optional[float] = None
    notes: List[str] = Field(default_factory=list)
    earlyExitRules: List[str] = Field(default_factory=list)
    managementNotes: List[str] = Field(default_factory=list)


class RunCycleRequest(BaseModel):
    symbol: str = "BTCUSDT"
    locale: str = "ko"


class RunCycleResponse(BaseModel):
    runId: Optional[int] = None
    persisted: bool = False
    recordIds: Dict[str, Any] = Field(default_factory=dict)
    trader: str
    traderId: str
    symbol: str
    marketSnapshot: Dict[str, Any]
    candidate: TradeCandidate
    aiReview: Optional[TradeReviewResult] = None
    tradePlan: Optional[TradePlan] = None
    paper: Optional[Dict[str, Any]] = None
    paperOrder: Optional[Dict[str, Any]] = None
    paperOrders: List[Dict[str, Any]] = Field(default_factory=list)
    paperPosition: Optional[Dict[str, Any]] = None
    paperPositions: List[Dict[str, Any]] = Field(default_factory=list)
    tradeEvents: List[Dict[str, Any]] = Field(default_factory=list)
    equitySnapshot: Optional[Dict[str, Any]] = None
    managementReviews: List[Dict[str, Any]] = Field(default_factory=list)
