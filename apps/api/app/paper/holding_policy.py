from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Dict, Final, Union

from app.traders.models import HoldingHorizon, StrategyFamily


@dataclass(frozen=True)
class HoldingPolicy:
    name: str
    breakeven_progress_r: Decimal
    profit_protect_target_progress: Decimal
    giveback_target_progress: Decimal
    early_failure_adverse_r: Decimal
    trail_review_progress_r: Decimal
    style_note: str
    horizon: str = "intraday"
    primary_timeframe: str = "1h"
    secondary_timeframe: str = "15m"
    expected_hold_minutes: int = 240
    order_ttl_seconds: int = 900
    target_profile: str = "balanced"
    risk_uplift_multiplier: Decimal = Decimal("1.0")
    first_take_profit_breakeven_progress: Decimal = Decimal("0.50")

    def as_prompt_dict(self) -> Dict[str, Union[float, str]]:
        data = asdict(self)
        return {
            key: float(value) if isinstance(value, Decimal) else value
            for key, value in data.items()
        }


DEFAULT_HOLDING_POLICY = HoldingPolicy(
    name="balanced",
    breakeven_progress_r=Decimal("1.00"),
    profit_protect_target_progress=Decimal("0.80"),
    giveback_target_progress=Decimal("0.35"),
    early_failure_adverse_r=Decimal("0.65"),
    trail_review_progress_r=Decimal("1.20"),
    style_note="Balanced paper management; protect after one full R unless the strategy has a stronger style override.",
    horizon="intraday",
    primary_timeframe="1h",
    expected_hold_minutes=240,
    order_ttl_seconds=900,
    target_profile="balanced",
    risk_uplift_multiplier=Decimal("1.00"),
)


HOLDING_HORIZON_REVIEW_SECONDS: Final[dict[HoldingHorizon, int]] = {
    HoldingHorizon.SCALP: 300,
    HoldingHorizon.INTRADAY: 900,
    HoldingHorizon.SWING: 3600,
    HoldingHorizon.POSITION: 6000,
}

TRADER_HOLDING_HORIZONS: Final[dict[str, HoldingHorizon]] = {
    "liquidation-pressure-sniper": HoldingHorizon.SCALP,
    "session-raider": HoldingHorizon.SCALP,
    "volatility-skew-sentinel": HoldingHorizon.SWING,
    "funding-contrarian": HoldingHorizon.SWING,
    "channel-rider": HoldingHorizon.SWING,
    "pullback-architect": HoldingHorizon.SWING,
    "donchian-breakout": HoldingHorizon.SWING,
    "trend-sentinel": HoldingHorizon.POSITION,
    "ichimoku-cloud-pilot": HoldingHorizon.POSITION,
    "atr-trail-commander": HoldingHorizon.POSITION,
}

TRADER_STRATEGY_FAMILIES: Final[dict[str, StrategyFamily]] = {
    "orderflow-sniper": StrategyFamily.BREAKOUT,
    "leverage-hunter": StrategyFamily.FLOW_CONTRARIAN,
    "liquidation-pressure-sniper": StrategyFamily.LIQUIDITY_REVERSAL,
    "volatility-skew-sentinel": StrategyFamily.VOLATILITY,
    "liquidity-reaper": StrategyFamily.LIQUIDITY_REVERSAL,
    "volatility-squeezer": StrategyFamily.VOLATILITY,
    "range-maker": StrategyFamily.MEAN_REVERSION,
    "volume-breaker": StrategyFamily.BREAKOUT,
    "funding-contrarian": StrategyFamily.FLOW_CONTRARIAN,
    "channel-rider": StrategyFamily.PULLBACK,
    "pullback-architect": StrategyFamily.PULLBACK,
    "trend-sentinel": StrategyFamily.TREND_FOLLOW,
    "donchian-breakout": StrategyFamily.BREAKOUT,
    "ichimoku-cloud-pilot": StrategyFamily.TREND_FOLLOW,
    "vwap-reclaimer": StrategyFamily.MEAN_REVERSION,
    "wyckoff-spring": StrategyFamily.LIQUIDITY_REVERSAL,
    "rsi-divergence-scout": StrategyFamily.MEAN_REVERSION,
    "session-raider": StrategyFamily.BREAKOUT,
    "imbalance-hunter": StrategyFamily.PULLBACK,
    "momentum-ignition": StrategyFamily.BREAKOUT,
    "bollinger-reversion": StrategyFamily.MEAN_REVERSION,
    "atr-trail-commander": StrategyFamily.TREND_FOLLOW,
}


TRADER_HOLDING_POLICIES: dict[str, HoldingPolicy] = {
    "orderflow-sniper": HoldingPolicy(
        name="session_orb_breakout",
        breakeven_progress_r=Decimal("0.78"),
        profit_protect_target_progress=Decimal("0.70"),
        giveback_target_progress=Decimal("0.44"),
        early_failure_adverse_r=Decimal("0.45"),
        trail_review_progress_r=Decimal("0.95"),
        style_note="Session opening-range breakout; protect if price re-enters the broken range.",
        horizon="intraday",
        primary_timeframe="15m",
        expected_hold_minutes=150,
        order_ttl_seconds=600,
        target_profile="range_breakout",
        risk_uplift_multiplier=Decimal("0.92"),
    ),
    "leverage-hunter": HoldingPolicy(
        name="squeeze_derisk",
        breakeven_progress_r=Decimal("0.90"),
        profit_protect_target_progress=Decimal("0.72"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.50"),
        trail_review_progress_r=Decimal("1.00"),
        style_note="Crowded leverage trades de-risk earlier because squeeze reversals are violent.",
        horizon="tactical",
        primary_timeframe="15m",
        expected_hold_minutes=180,
        order_ttl_seconds=720,
        target_profile="squeeze_derisk",
        risk_uplift_multiplier=Decimal("0.95"),
    ),
    "liquidation-pressure-sniper": HoldingPolicy(
        name="liquidation_pressure_reversal",
        breakeven_progress_r=Decimal("0.80"),
        profit_protect_target_progress=Decimal("0.70"),
        giveback_target_progress=Decimal("0.44"),
        early_failure_adverse_r=Decimal("0.48"),
        trail_review_progress_r=Decimal("0.95"),
        style_note="Liquidation pressure reversal; forced-flow trades must prove quickly and de-risk when pressure normalizes.",
        horizon="micro",
        primary_timeframe="15m",
        expected_hold_minutes=90,
        order_ttl_seconds=480,
        target_profile="forced_flow_reversal",
        risk_uplift_multiplier=Decimal("0.88"),
    ),
    "volatility-skew-sentinel": HoldingPolicy(
        name="options_skew_reversal",
        breakeven_progress_r=Decimal("1.30"),
        profit_protect_target_progress=Decimal("0.84"),
        giveback_target_progress=Decimal("0.46"),
        early_failure_adverse_r=Decimal("0.62"),
        trail_review_progress_r=Decimal("1.40"),
        style_note="Options-skew reversal; let confirmed skew/spot divergence develop, but reduce if skew normalizes before price follows through.",
        horizon="swing",
        primary_timeframe="4h",
        expected_hold_minutes=720,
        order_ttl_seconds=1800,
        target_profile="options_skew_reversal",
        risk_uplift_multiplier=Decimal("1.03"),
    ),
    "liquidity-reaper": HoldingPolicy(
        name="sweep_reversal",
        breakeven_progress_r=Decimal("0.85"),
        profit_protect_target_progress=Decimal("0.74"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.55"),
        trail_review_progress_r=Decimal("1.00"),
        style_note="Liquidity sweeps are tactical reversals; protect after the reclaim/fail displacement proves itself.",
        horizon="tactical",
        primary_timeframe="15m",
        expected_hold_minutes=180,
        order_ttl_seconds=720,
        target_profile="sweep_reversal",
        risk_uplift_multiplier=Decimal("0.95"),
        first_take_profit_breakeven_progress=Decimal("0.60"),
    ),
    "volatility-squeezer": HoldingPolicy(
        name="expansion_follow",
        breakeven_progress_r=Decimal("0.95"),
        profit_protect_target_progress=Decimal("0.76"),
        giveback_target_progress=Decimal("0.40"),
        early_failure_adverse_r=Decimal("0.55"),
        trail_review_progress_r=Decimal("1.10"),
        style_note="Volatility expansion may travel fast; trail winners, but exit failed re-entries quickly.",
        horizon="tactical",
        primary_timeframe="15m",
        expected_hold_minutes=240,
        order_ttl_seconds=900,
        target_profile="expansion_follow",
        risk_uplift_multiplier=Decimal("1.00"),
    ),
    "range-maker": HoldingPolicy(
        name="range_midpoint",
        breakeven_progress_r=Decimal("0.95"),
        profit_protect_target_progress=Decimal("0.62"),
        giveback_target_progress=Decimal("0.50"),
        early_failure_adverse_r=Decimal("0.55"),
        trail_review_progress_r=Decimal("0.90"),
        style_note="Range trades are mean-reversion; midpoint profit protection is allowed earlier than trend trades.",
        horizon="tactical",
        primary_timeframe="1h",
        expected_hold_minutes=360,
        order_ttl_seconds=1200,
        target_profile="range_midpoint",
        risk_uplift_multiplier=Decimal("1.00"),
    ),
    "volume-breaker": HoldingPolicy(
        name="breakout_retest",
        breakeven_progress_r=Decimal("1.10"),
        profit_protect_target_progress=Decimal("0.78"),
        giveback_target_progress=Decimal("0.38"),
        early_failure_adverse_r=Decimal("0.60"),
        trail_review_progress_r=Decimal("1.25"),
        style_note="Breakout/retest trades should not be strangled before continuation volume has a chance to expand.",
        horizon="tactical",
        primary_timeframe="1h",
        expected_hold_minutes=360,
        order_ttl_seconds=1200,
        target_profile="breakout_retest",
        risk_uplift_multiplier=Decimal("1.05"),
    ),
    "funding-contrarian": HoldingPolicy(
        name="funding_normalization",
        breakeven_progress_r=Decimal("1.20"),
        profit_protect_target_progress=Decimal("0.82"),
        giveback_target_progress=Decimal("0.40"),
        early_failure_adverse_r=Decimal("0.58"),
        trail_review_progress_r=Decimal("1.30"),
        style_note="Funding mean reversion can grind; avoid premature breakeven while premium normalization is still developing.",
        horizon="swing",
        primary_timeframe="4h",
        expected_hold_minutes=720,
        order_ttl_seconds=1800,
        target_profile="funding_normalization",
        risk_uplift_multiplier=Decimal("1.12"),
    ),
    "channel-rider": HoldingPolicy(
        name="channel_swing",
        breakeven_progress_r=Decimal("1.35"),
        profit_protect_target_progress=Decimal("0.84"),
        giveback_target_progress=Decimal("0.44"),
        early_failure_adverse_r=Decimal("0.62"),
        trail_review_progress_r=Decimal("1.40"),
        style_note="Channel trades are tactical swings; use channel midline and opposite band, not scalp-style exits.",
        horizon="swing",
        primary_timeframe="4h",
        expected_hold_minutes=720,
        order_ttl_seconds=1800,
        target_profile="channel_swing",
        risk_uplift_multiplier=Decimal("1.15"),
        first_take_profit_breakeven_progress=Decimal("0.80"),
    ),
    "pullback-architect": HoldingPolicy(
        name="staged_pullback",
        breakeven_progress_r=Decimal("1.45"),
        profit_protect_target_progress=Decimal("0.86"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.65"),
        trail_review_progress_r=Decimal("1.50"),
        style_note="Staged pullbacks need room to build; cancel weak remaining scales before forcing early breakeven.",
        horizon="swing",
        primary_timeframe="4h",
        expected_hold_minutes=960,
        order_ttl_seconds=2400,
        target_profile="staged_pullback",
        risk_uplift_multiplier=Decimal("1.15"),
    ),
    "trend-sentinel": HoldingPolicy(
        name="durable_trend",
        breakeven_progress_r=Decimal("1.80"),
        profit_protect_target_progress=Decimal("0.93"),
        giveback_target_progress=Decimal("0.55"),
        early_failure_adverse_r=Decimal("0.75"),
        trail_review_progress_r=Decimal("1.80"),
        style_note="Trend follower; keep winners alive while HTF structure remains intact and prefer trailing over quick exits.",
        horizon="trend",
        primary_timeframe="4h",
        expected_hold_minutes=1440,
        order_ttl_seconds=2700,
        target_profile="durable_trend",
        risk_uplift_multiplier=Decimal("1.20"),
        first_take_profit_breakeven_progress=Decimal("0.90"),
    ),
    "donchian-breakout": HoldingPolicy(
        name="donchian_expansion",
        breakeven_progress_r=Decimal("1.25"),
        profit_protect_target_progress=Decimal("0.82"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.60"),
        trail_review_progress_r=Decimal("1.45"),
        style_note="Breakout follower; do not cut too early while price remains outside the broken range.",
        horizon="swing",
        primary_timeframe="4h",
        expected_hold_minutes=840,
        order_ttl_seconds=1800,
        target_profile="range_expansion",
        risk_uplift_multiplier=Decimal("1.12"),
        first_take_profit_breakeven_progress=Decimal("0.75"),
    ),
    "ichimoku-cloud-pilot": HoldingPolicy(
        name="cloud_continuation",
        breakeven_progress_r=Decimal("1.55"),
        profit_protect_target_progress=Decimal("0.88"),
        giveback_target_progress=Decimal("0.48"),
        early_failure_adverse_r=Decimal("0.70"),
        trail_review_progress_r=Decimal("1.65"),
        style_note="Cloud continuation; protect only after trend proxy proves itself, then trail behind the cloud.",
        horizon="trend",
        primary_timeframe="4h",
        expected_hold_minutes=1200,
        order_ttl_seconds=2400,
        target_profile="cloud_continuation",
        risk_uplift_multiplier=Decimal("1.18"),
    ),
    "vwap-reclaimer": HoldingPolicy(
        name="fair_value_reclaim",
        breakeven_progress_r=Decimal("0.95"),
        profit_protect_target_progress=Decimal("0.76"),
        giveback_target_progress=Decimal("0.44"),
        early_failure_adverse_r=Decimal("0.55"),
        trail_review_progress_r=Decimal("1.05"),
        style_note="Fair-value reclaim; protect quickly when reclaim stalls near the mean.",
        horizon="intraday",
        primary_timeframe="15m",
        expected_hold_minutes=150,
        order_ttl_seconds=720,
        target_profile="fair_value_reclaim",
        risk_uplift_multiplier=Decimal("0.90"),
    ),
    "wyckoff-spring": HoldingPolicy(
        name="spring_reversal",
        breakeven_progress_r=Decimal("0.90"),
        profit_protect_target_progress=Decimal("0.74"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.50"),
        trail_review_progress_r=Decimal("1.10"),
        style_note="Spring/upthrust reversal; trap setups should move quickly or be de-risked.",
        horizon="tactical",
        primary_timeframe="15m",
        expected_hold_minutes=240,
        order_ttl_seconds=900,
        target_profile="spring_reversal",
        risk_uplift_multiplier=Decimal("0.95"),
    ),
    "rsi-divergence-scout": HoldingPolicy(
        name="divergence_reversal",
        breakeven_progress_r=Decimal("1.05"),
        profit_protect_target_progress=Decimal("0.78"),
        giveback_target_progress=Decimal("0.44"),
        early_failure_adverse_r=Decimal("0.58"),
        trail_review_progress_r=Decimal("1.20"),
        style_note="Divergence reversal; give structure confirmation some room, but exit if momentum re-accelerates.",
        horizon="tactical",
        primary_timeframe="1h",
        expected_hold_minutes=360,
        order_ttl_seconds=1200,
        target_profile="divergence_reversal",
        risk_uplift_multiplier=Decimal("1.00"),
    ),
    "session-raider": HoldingPolicy(
        name="session_breakout",
        breakeven_progress_r=Decimal("0.75"),
        profit_protect_target_progress=Decimal("0.68"),
        giveback_target_progress=Decimal("0.46"),
        early_failure_adverse_r=Decimal("0.45"),
        trail_review_progress_r=Decimal("0.90"),
        style_note="Session breakout; manage fast because the edge decays after the active window.",
        horizon="micro",
        primary_timeframe="15m",
        expected_hold_minutes=90,
        order_ttl_seconds=420,
        target_profile="session_breakout",
        risk_uplift_multiplier=Decimal("0.82"),
    ),
    "imbalance-hunter": HoldingPolicy(
        name="imbalance_retest",
        breakeven_progress_r=Decimal("1.15"),
        profit_protect_target_progress=Decimal("0.80"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.60"),
        trail_review_progress_r=Decimal("1.35"),
        style_note="Imbalance retest; let displacement continue while midpoint remains respected.",
        horizon="tactical",
        primary_timeframe="1h",
        expected_hold_minutes=480,
        order_ttl_seconds=1500,
        target_profile="imbalance_retest",
        risk_uplift_multiplier=Decimal("1.05"),
    ),
    "momentum-ignition": HoldingPolicy(
        name="compression_ignition",
        breakeven_progress_r=Decimal("0.88"),
        profit_protect_target_progress=Decimal("0.72"),
        giveback_target_progress=Decimal("0.40"),
        early_failure_adverse_r=Decimal("0.45"),
        trail_review_progress_r=Decimal("1.10"),
        style_note="Compression ignition; hold the expansion only while price stays outside the squeeze box.",
        horizon="intraday",
        primary_timeframe="15m",
        expected_hold_minutes=210,
        order_ttl_seconds=900,
        target_profile="compression_breakout",
        risk_uplift_multiplier=Decimal("0.96"),
    ),
    "bollinger-reversion": HoldingPolicy(
        name="band_reversion",
        breakeven_progress_r=Decimal("0.85"),
        profit_protect_target_progress=Decimal("0.65"),
        giveback_target_progress=Decimal("0.50"),
        early_failure_adverse_r=Decimal("0.55"),
        trail_review_progress_r=Decimal("0.90"),
        style_note="Band reversion; midpoint protection matters more than long trend holding.",
        horizon="intraday",
        primary_timeframe="1h",
        expected_hold_minutes=240,
        order_ttl_seconds=900,
        target_profile="band_reversion",
        risk_uplift_multiplier=Decimal("0.90"),
    ),
    "atr-trail-commander": HoldingPolicy(
        name="atr_trend",
        breakeven_progress_r=Decimal("1.80"),
        profit_protect_target_progress=Decimal("0.92"),
        giveback_target_progress=Decimal("0.55"),
        early_failure_adverse_r=Decimal("0.75"),
        trail_review_progress_r=Decimal("1.90"),
        style_note="ATR trend follower; protect a proven winner at breakeven, then delay trailing until a larger profit cushion.",
        horizon="trend",
        primary_timeframe="4h",
        expected_hold_minutes=1800,
        order_ttl_seconds=2700,
        target_profile="atr_trend",
        risk_uplift_multiplier=Decimal("1.22"),
        first_take_profit_breakeven_progress=Decimal("0.60"),
    ),
}


def trader_holding_policy(trader_id: str) -> HoldingPolicy:
    return TRADER_HOLDING_POLICIES.get(trader_id, DEFAULT_HOLDING_POLICY)


def trader_holding_horizon(trader_id: str) -> HoldingHorizon:
    return TRADER_HOLDING_HORIZONS.get(trader_id, HoldingHorizon.INTRADAY)


def trader_strategy_family(trader_id: str) -> StrategyFamily:
    return TRADER_STRATEGY_FAMILIES.get(trader_id, StrategyFamily.MEAN_REVERSION)


def review_seconds_for_horizon(horizon: HoldingHorizon | str) -> int:
    try:
        parsed_horizon = HoldingHorizon(str(horizon).upper())
    except ValueError:
        parsed_horizon = HoldingHorizon.INTRADAY
    return HOLDING_HORIZON_REVIEW_SECONDS[parsed_horizon]


def trader_execution_profile_payload(trader_id: str) -> dict[str, Union[float, int, str]]:
    policy = trader_holding_policy(trader_id)
    holding_horizon = trader_holding_horizon(trader_id)
    strategy_family = trader_strategy_family(trader_id)
    return {
        "holdingProfile": policy.horizon,
        "policyName": policy.name,
        "primaryTimeframe": policy.primary_timeframe,
        "secondaryTimeframe": policy.secondary_timeframe,
        "expectedHoldMinutes": policy.expected_hold_minutes,
        "orderTtlSeconds": policy.order_ttl_seconds,
        "targetProfile": policy.target_profile,
        "riskUpliftMultiplier": float(policy.risk_uplift_multiplier),
        "holdingHorizon": holding_horizon.value,
        "strategyFamily": strategy_family.value,
        "reviewIntervalSeconds": review_seconds_for_horizon(holding_horizon),
    }
