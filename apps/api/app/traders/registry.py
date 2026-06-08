from typing import Dict, List

from app.traders.channel_rider import ChannelRider
from app.traders.funding_contrarian import FundingContrarian
from app.traders.leverage_hunter import LeverageHunter
from app.traders.liquidity_reaper import LiquidityReaper
from app.traders.models import TraderProfile, TradeCandidate
from app.traders.orderflow_sniper import OrderflowSniper
from app.traders.pullback_architect import PullbackArchitect
from app.traders.range_maker import RangeMaker
from app.traders.strategy_base import TraderStrategy
from app.traders.trend_sentinel import TrendSentinel
from app.traders.volume_breaker import VolumeBreaker
from app.traders.volatility_squeezer import VolatilitySqueezer


TRADER_STRATEGIES: Dict[str, TraderStrategy] = {
    strategy.profile.id: strategy
    for strategy in [
        ChannelRider(),
        VolumeBreaker(),
        PullbackArchitect(),
        LeverageHunter(),
        LiquidityReaper(),
        VolatilitySqueezer(),
        TrendSentinel(),
        RangeMaker(),
        FundingContrarian(),
        OrderflowSniper(),
    ]
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


def get_strategy(trader_id: str) -> TraderStrategy:
    if trader_id not in TRADER_STRATEGIES:
        raise KeyError(f"Unknown trader id: {trader_id}")
    return TRADER_STRATEGIES[trader_id]


def evaluate_candidate(trader_id: str, snapshot: dict) -> TradeCandidate:
    return get_strategy(trader_id).evaluate(snapshot)
