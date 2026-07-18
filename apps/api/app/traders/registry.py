from datetime import datetime, timezone
from typing import Dict, List, Optional

from app.traders.alternative_data_specialists import LiquidationPressureSniper, VolatilitySkewSentinel
from app.traders.btc_specialists import (
    AtrTrailCommander,
    BollingerReversion,
    DonchianBreakout,
    IchimokuCloudPilot,
    ImbalanceHunter,
    MomentumIgnition,
    RsiDivergenceScout,
    SessionRaider,
    VwapReclaimer,
    WyckoffSpring,
)
from app.traders.channel_rider import ChannelRider
from app.traders.funding_contrarian import FundingContrarian
from app.traders.high_voltage import (
    HighVoltageChannelRaider,
    HighVoltageCompressionDetonator,
    HighVoltageDonchianOverdrive,
    HighVoltageLiquidationShock,
    HighVoltageTrendTitan,
)
from app.traders.high_voltage_config import HIGH_VOLTAGE_TRADER_IDS, is_high_voltage_trader
from app.traders.leverage_hunter import LeverageHunter
from app.traders.liquidity_reaper import LiquidityReaper
from app.traders.models import TraderProfile, TradeCandidate
from app.traders.orderflow_sniper import OrderflowSniper
from app.traders.pullback_architect import PullbackArchitect
from app.traders.range_maker import RangeMaker
from app.traders.strategy_base import TraderStrategy, apply_execution_profile, candidate_with_audit
from app.traders.trend_sentinel import TrendSentinel
from app.traders.volume_breaker import VolumeBreaker
from app.traders.volatility_squeezer import VolatilitySqueezer


NEW_TRADER_IDS = {
    "liquidation-pressure-sniper",
    "volatility-skew-sentinel",
    *HIGH_VOLTAGE_TRADER_IDS,
}
TRADER_RETIRED_FROM_MONTH = {
    "volatility-squeezer": "2026-07",
    "imbalance-hunter": "2026-07",
    "leverage-hunter": "2026-07",
}


class UnknownTraderError(KeyError):
    def __init__(self, trader_id: str) -> None:
        self.trader_id = trader_id
        super().__init__(f"Unknown trader id: {trader_id}")


def _month_key(value: Optional[datetime] = None) -> str:
    current = value or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    current = current.astimezone(timezone.utc)
    return f"{current.year:04d}-{current.month:02d}"


def _is_same_or_after_month(value: str, floor: str) -> bool:
    return value >= floor


def apply_trader_lifecycle(profile: TraderProfile) -> TraderProfile:
    update = {}
    if profile.id in NEW_TRADER_IDS:
        update.update({"launchMonth": "2026-07", "lifecycleStatus": "new", "lifecycleLabel": "NEW"})
    if profile.id in TRADER_RETIRED_FROM_MONTH:
        update.update(
            {
                "retiredFromMonth": TRADER_RETIRED_FROM_MONTH[profile.id],
                "lifecycleStatus": "retired",
                "lifecycleLabel": "RETIRED",
            }
        )
    return profile.model_copy(update=update) if update else profile


def is_trader_retired_for_month(trader_id: str, league_month: Optional[str]) -> bool:
    retired_from = TRADER_RETIRED_FROM_MONTH.get(trader_id)
    return bool(retired_from and league_month and _is_same_or_after_month(league_month, retired_from))


def is_trader_launched_for_month(trader: TraderProfile, league_month: Optional[str]) -> bool:
    if not league_month or not trader.launchMonth:
        return True
    return _is_same_or_after_month(league_month, trader.launchMonth)


def _with_execution_profile(strategy: TraderStrategy) -> TraderStrategy:
    strategy.profile = apply_trader_lifecycle(apply_execution_profile(strategy.profile))
    original_evaluate = strategy.evaluate

    def evaluate_with_execution_profile(snapshot: dict) -> TradeCandidate:
        candidate = original_evaluate(snapshot)
        audit = {
            **(candidate.audit or {}),
            **({"leagueVariant": "high_voltage"} if is_high_voltage_trader(strategy.profile.id) else {}),
        }
        candidate = candidate.model_copy(update={"audit": audit})
        if audit.get("executionProfile"):
            return candidate
        return candidate_with_audit(candidate, trader_id=strategy.profile.id)

    setattr(strategy, "evaluate", evaluate_with_execution_profile)
    return strategy


TRADER_STRATEGIES: Dict[str, TraderStrategy] = {
    strategy.profile.id: strategy
    for raw_strategy in [
        ChannelRider(),
        VolumeBreaker(),
        PullbackArchitect(),
        LeverageHunter(),
        LiquidationPressureSniper(),
        VolatilitySkewSentinel(),
        LiquidityReaper(),
        VolatilitySqueezer(),
        TrendSentinel(),
        RangeMaker(),
        FundingContrarian(),
        OrderflowSniper(),
        DonchianBreakout(),
        IchimokuCloudPilot(),
        VwapReclaimer(),
        WyckoffSpring(),
        RsiDivergenceScout(),
        SessionRaider(),
        ImbalanceHunter(),
        MomentumIgnition(),
        BollingerReversion(),
        AtrTrailCommander(),
        HighVoltageChannelRaider(),
        HighVoltageDonchianOverdrive(),
        HighVoltageTrendTitan(),
        HighVoltageLiquidationShock(),
        HighVoltageCompressionDetonator(),
    ]
    for strategy in [_with_execution_profile(raw_strategy)]
}


EMPTY_PUBLIC_PERFORMANCE = {
    "return7d": 0.0,
    "return30d": 0.0,
    "winRate": 0.0,
    "maxDrawdown": 0.0,
    "currentEquity": 10000.0,
}


def public_trader_profile(profile: TraderProfile) -> TraderProfile:
    return profile.model_copy(update={"mockPerformance": dict(EMPTY_PUBLIC_PERFORMANCE)})


def list_traders() -> List[TraderProfile]:
    return [public_trader_profile(strategy.profile) for strategy in TRADER_STRATEGIES.values()]


def list_traders_for_league_month(league_month: Optional[str]) -> List[TraderProfile]:
    return [
        trader
        for trader in list_traders()
        if is_trader_launched_for_month(trader, league_month)
    ]


def list_scanner_traders(started_at: Optional[datetime] = None) -> List[TraderProfile]:
    scanner_month = _month_key(started_at)
    return [
        trader
        for trader in list_traders_for_league_month(scanner_month)
        if not is_trader_retired_for_month(trader.id, scanner_month)
    ]


def get_strategy(trader_id: str) -> TraderStrategy:
    if trader_id not in TRADER_STRATEGIES:
        raise UnknownTraderError(trader_id)
    return TRADER_STRATEGIES[trader_id]


def evaluate_candidate(trader_id: str, snapshot: dict) -> TradeCandidate:
    return get_strategy(trader_id).evaluate(snapshot)
