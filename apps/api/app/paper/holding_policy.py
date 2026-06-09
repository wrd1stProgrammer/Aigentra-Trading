from dataclasses import asdict, dataclass
from decimal import Decimal
from typing import Dict, Union


@dataclass(frozen=True)
class HoldingPolicy:
    name: str
    breakeven_progress_r: Decimal
    profit_protect_target_progress: Decimal
    giveback_target_progress: Decimal
    early_failure_adverse_r: Decimal
    trail_review_progress_r: Decimal
    style_note: str

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
)


TRADER_HOLDING_POLICIES: dict[str, HoldingPolicy] = {
    "orderflow-sniper": HoldingPolicy(
        name="micro_scalp",
        breakeven_progress_r=Decimal("0.65"),
        profit_protect_target_progress=Decimal("0.68"),
        giveback_target_progress=Decimal("0.46"),
        early_failure_adverse_r=Decimal("0.45"),
        trail_review_progress_r=Decimal("0.80"),
        style_note="Fast orderflow scalp; protect quickly and do not wait for wide targets.",
    ),
    "leverage-hunter": HoldingPolicy(
        name="squeeze_derisk",
        breakeven_progress_r=Decimal("0.90"),
        profit_protect_target_progress=Decimal("0.72"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.50"),
        trail_review_progress_r=Decimal("1.00"),
        style_note="Crowded leverage trades de-risk earlier because squeeze reversals are violent.",
    ),
    "liquidity-reaper": HoldingPolicy(
        name="sweep_reversal",
        breakeven_progress_r=Decimal("0.85"),
        profit_protect_target_progress=Decimal("0.74"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.55"),
        trail_review_progress_r=Decimal("1.00"),
        style_note="Liquidity sweeps are tactical reversals; protect after the reclaim/fail displacement proves itself.",
    ),
    "volatility-squeezer": HoldingPolicy(
        name="expansion_follow",
        breakeven_progress_r=Decimal("0.95"),
        profit_protect_target_progress=Decimal("0.76"),
        giveback_target_progress=Decimal("0.40"),
        early_failure_adverse_r=Decimal("0.55"),
        trail_review_progress_r=Decimal("1.10"),
        style_note="Volatility expansion may travel fast; trail winners, but exit failed re-entries quickly.",
    ),
    "range-maker": HoldingPolicy(
        name="range_midpoint",
        breakeven_progress_r=Decimal("0.95"),
        profit_protect_target_progress=Decimal("0.62"),
        giveback_target_progress=Decimal("0.50"),
        early_failure_adverse_r=Decimal("0.55"),
        trail_review_progress_r=Decimal("0.90"),
        style_note="Range trades are mean-reversion; midpoint profit protection is allowed earlier than trend trades.",
    ),
    "volume-breaker": HoldingPolicy(
        name="breakout_retest",
        breakeven_progress_r=Decimal("1.10"),
        profit_protect_target_progress=Decimal("0.78"),
        giveback_target_progress=Decimal("0.38"),
        early_failure_adverse_r=Decimal("0.60"),
        trail_review_progress_r=Decimal("1.25"),
        style_note="Breakout/retest trades should not be strangled before continuation volume has a chance to expand.",
    ),
    "funding-contrarian": HoldingPolicy(
        name="funding_normalization",
        breakeven_progress_r=Decimal("1.20"),
        profit_protect_target_progress=Decimal("0.82"),
        giveback_target_progress=Decimal("0.40"),
        early_failure_adverse_r=Decimal("0.58"),
        trail_review_progress_r=Decimal("1.30"),
        style_note="Funding mean reversion can grind; avoid premature breakeven while premium normalization is still developing.",
    ),
    "channel-rider": HoldingPolicy(
        name="channel_swing",
        breakeven_progress_r=Decimal("1.35"),
        profit_protect_target_progress=Decimal("0.84"),
        giveback_target_progress=Decimal("0.44"),
        early_failure_adverse_r=Decimal("0.62"),
        trail_review_progress_r=Decimal("1.40"),
        style_note="Channel trades are tactical swings; use channel midline and opposite band, not scalp-style exits.",
    ),
    "pullback-architect": HoldingPolicy(
        name="staged_pullback",
        breakeven_progress_r=Decimal("1.45"),
        profit_protect_target_progress=Decimal("0.86"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.65"),
        trail_review_progress_r=Decimal("1.50"),
        style_note="Staged pullbacks need room to build; cancel weak remaining scales before forcing early breakeven.",
    ),
    "trend-sentinel": HoldingPolicy(
        name="durable_trend",
        breakeven_progress_r=Decimal("1.80"),
        profit_protect_target_progress=Decimal("0.93"),
        giveback_target_progress=Decimal("0.55"),
        early_failure_adverse_r=Decimal("0.75"),
        trail_review_progress_r=Decimal("1.80"),
        style_note="Trend follower; keep winners alive while HTF structure remains intact and prefer trailing over quick exits.",
    ),
    "donchian-breakout": HoldingPolicy(
        name="donchian_expansion",
        breakeven_progress_r=Decimal("1.25"),
        profit_protect_target_progress=Decimal("0.82"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.60"),
        trail_review_progress_r=Decimal("1.45"),
        style_note="Breakout follower; do not cut too early while price remains outside the broken range.",
    ),
    "ichimoku-cloud-pilot": HoldingPolicy(
        name="cloud_continuation",
        breakeven_progress_r=Decimal("1.55"),
        profit_protect_target_progress=Decimal("0.88"),
        giveback_target_progress=Decimal("0.48"),
        early_failure_adverse_r=Decimal("0.70"),
        trail_review_progress_r=Decimal("1.65"),
        style_note="Cloud continuation; protect only after trend proxy proves itself, then trail behind the cloud.",
    ),
    "vwap-reclaimer": HoldingPolicy(
        name="fair_value_reclaim",
        breakeven_progress_r=Decimal("0.95"),
        profit_protect_target_progress=Decimal("0.76"),
        giveback_target_progress=Decimal("0.44"),
        early_failure_adverse_r=Decimal("0.55"),
        trail_review_progress_r=Decimal("1.05"),
        style_note="Fair-value reclaim; protect quickly when reclaim stalls near the mean.",
    ),
    "wyckoff-spring": HoldingPolicy(
        name="spring_reversal",
        breakeven_progress_r=Decimal("0.90"),
        profit_protect_target_progress=Decimal("0.74"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.50"),
        trail_review_progress_r=Decimal("1.10"),
        style_note="Spring/upthrust reversal; trap setups should move quickly or be de-risked.",
    ),
    "rsi-divergence-scout": HoldingPolicy(
        name="divergence_reversal",
        breakeven_progress_r=Decimal("1.05"),
        profit_protect_target_progress=Decimal("0.78"),
        giveback_target_progress=Decimal("0.44"),
        early_failure_adverse_r=Decimal("0.58"),
        trail_review_progress_r=Decimal("1.20"),
        style_note="Divergence reversal; give structure confirmation some room, but exit if momentum re-accelerates.",
    ),
    "session-raider": HoldingPolicy(
        name="session_breakout",
        breakeven_progress_r=Decimal("0.75"),
        profit_protect_target_progress=Decimal("0.68"),
        giveback_target_progress=Decimal("0.46"),
        early_failure_adverse_r=Decimal("0.45"),
        trail_review_progress_r=Decimal("0.90"),
        style_note="Session breakout; manage fast because the edge decays after the active window.",
    ),
    "imbalance-hunter": HoldingPolicy(
        name="imbalance_retest",
        breakeven_progress_r=Decimal("1.15"),
        profit_protect_target_progress=Decimal("0.80"),
        giveback_target_progress=Decimal("0.42"),
        early_failure_adverse_r=Decimal("0.60"),
        trail_review_progress_r=Decimal("1.35"),
        style_note="Imbalance retest; let displacement continue while midpoint remains respected.",
    ),
    "momentum-ignition": HoldingPolicy(
        name="momentum_fast",
        breakeven_progress_r=Decimal("0.95"),
        profit_protect_target_progress=Decimal("0.74"),
        giveback_target_progress=Decimal("0.38"),
        early_failure_adverse_r=Decimal("0.45"),
        trail_review_progress_r=Decimal("1.05"),
        style_note="Momentum ignition; ride clean flow but reduce quickly when flow flips.",
    ),
    "bollinger-reversion": HoldingPolicy(
        name="band_reversion",
        breakeven_progress_r=Decimal("0.85"),
        profit_protect_target_progress=Decimal("0.65"),
        giveback_target_progress=Decimal("0.50"),
        early_failure_adverse_r=Decimal("0.55"),
        trail_review_progress_r=Decimal("0.90"),
        style_note="Band reversion; midpoint protection matters more than long trend holding.",
    ),
    "atr-trail-commander": HoldingPolicy(
        name="atr_trend",
        breakeven_progress_r=Decimal("1.80"),
        profit_protect_target_progress=Decimal("0.92"),
        giveback_target_progress=Decimal("0.55"),
        early_failure_adverse_r=Decimal("0.75"),
        trail_review_progress_r=Decimal("1.90"),
        style_note="ATR trend follower; avoid premature breakeven and trail only after enough profit cushion.",
    ),
}


def trader_holding_policy(trader_id: str) -> HoldingPolicy:
    return TRADER_HOLDING_POLICIES.get(trader_id, DEFAULT_HOLDING_POLICY)
