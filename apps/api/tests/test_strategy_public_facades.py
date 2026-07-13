from pathlib import Path

from app.traders.alternative_data_specialists import VolatilitySkewSentinel as FacadeVolatilitySkewSentinel
from app.traders.breakout_specialists import MomentumIgnition, SessionRaider
from app.traders.btc_specialists import (
    AtrTrailCommander as FacadeAtrTrailCommander,
    BollingerReversion as FacadeBollingerReversion,
    DonchianBreakout as FacadeDonchianBreakout,
    IchimokuCloudPilot as FacadeIchimokuCloudPilot,
    ImbalanceHunter as FacadeImbalanceHunter,
    MomentumIgnition as FacadeMomentumIgnition,
    RsiDivergenceScout as FacadeRsiDivergenceScout,
    SessionRaider as FacadeSessionRaider,
    VwapReclaimer as FacadeVwapReclaimer,
    WyckoffSpring as FacadeWyckoffSpring,
)
from app.traders.btc_continuation_specialists import AtrTrailCommander, ImbalanceHunter
from app.traders.donchian_breakout import DonchianBreakout
from app.traders.ichimoku_cloud_pilot import IchimokuCloudPilot
from app.traders.pullback_architect import PullbackArchitect
from app.traders.registry import TRADER_STRATEGIES
from app.traders.reversion_specialists import BollingerReversion, RsiDivergenceScout, VwapReclaimer, WyckoffSpring
from app.traders.volatility_skew_sentinel import VolatilitySkewSentinel


def test_legacy_public_facades_export_the_redesigned_class_identities() -> None:
    expected_identities = {
        FacadeDonchianBreakout: DonchianBreakout,
        FacadeImbalanceHunter: ImbalanceHunter,
        FacadeAtrTrailCommander: AtrTrailCommander,
        FacadeSessionRaider: SessionRaider,
        FacadeMomentumIgnition: MomentumIgnition,
        FacadeIchimokuCloudPilot: IchimokuCloudPilot,
        FacadeVwapReclaimer: VwapReclaimer,
        FacadeRsiDivergenceScout: RsiDivergenceScout,
        FacadeWyckoffSpring: WyckoffSpring,
        FacadeBollingerReversion: BollingerReversion,
        FacadeVolatilitySkewSentinel: VolatilitySkewSentinel,
    }

    for public_class, redesigned_class in expected_identities.items():
        assert public_class is redesigned_class


def test_registry_instances_use_the_same_public_strategy_classes() -> None:
    expected_classes = {
        "donchian-breakout": DonchianBreakout,
        "imbalance-hunter": ImbalanceHunter,
        "atr-trail-commander": AtrTrailCommander,
        "session-raider": SessionRaider,
        "momentum-ignition": MomentumIgnition,
        "ichimoku-cloud-pilot": IchimokuCloudPilot,
        "vwap-reclaimer": VwapReclaimer,
        "rsi-divergence-scout": RsiDivergenceScout,
        "wyckoff-spring": WyckoffSpring,
        "bollinger-reversion": BollingerReversion,
        "volatility-skew-sentinel": VolatilitySkewSentinel,
    }

    for trader_id, expected_class in expected_classes.items():
        assert type(TRADER_STRATEGIES[trader_id]) is expected_class


def test_redesigned_modules_depend_on_neutral_support_modules() -> None:
    trader_dir = Path(__file__).parents[1] / "app" / "traders"
    source_by_module = {
        name: (trader_dir / name).read_text(encoding="utf-8")
        for name in (
            "breakout_specialists.py",
            "reversion_specialists.py",
            "ichimoku_cloud_pilot.py",
            "volatility_skew_sentinel.py",
        )
    }

    for source in source_by_module.values():
        assert "from app.traders.btc_specialists import _" not in source
        assert "from app.traders.alternative_data_specialists import (" not in source


def test_btc_specialists_is_a_thin_public_facade() -> None:
    source = (Path(__file__).parents[1] / "app" / "traders" / "btc_specialists.py").read_text(encoding="utf-8")
    pure_lines = [line for line in source.splitlines() if line.strip() and not line.lstrip().startswith("#")]

    assert len(pure_lines) <= 200
    assert "class " not in source


def test_public_profiles_describe_the_implemented_signal_and_entry_contracts() -> None:
    vwap_profile = VwapReclaimer.profile
    pullback_profile = PullbackArchitect.profile

    assert "bar VWAP" in f"{vwap_profile.description} {vwap_profile.concept}"
    assert "EMA20 as VWAP" not in f"{vwap_profile.description} {vwap_profile.concept}"
    assert pullback_profile.entryRules == [
        "40% after a completed EMA20 recovery or rejection",
        "60% on a controlled EMA-zone retest",
    ]
    assert "completed" in pullback_profile.currentPlan.lower()
    assert TRADER_STRATEGIES["pullback-architect"].profile.entryRules == pullback_profile.entryRules
