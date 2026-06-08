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
}


def trader_holding_policy(trader_id: str) -> HoldingPolicy:
    return TRADER_HOLDING_POLICIES.get(trader_id, DEFAULT_HOLDING_POLICY)
