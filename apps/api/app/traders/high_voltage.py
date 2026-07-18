from app.traders.alternative_data_specialists import LiquidationPressureSniper
from app.traders.breakout_specialists import MomentumIgnition
from app.traders.channel_rider import ChannelRider
from app.traders.donchian_breakout import DonchianBreakout
from app.traders.trend_sentinel import TrendSentinel


class HighVoltageChannelRaider(ChannelRider):
    profile = ChannelRider.profile.model_copy(
        update={
            "id": "high-voltage-channel-raider",
            "name": "Channel Raider",
            "description": "An aggressive channel-edge trader that commits early near a valid boundary and completes size as the reaction proves itself.",
            "concept": "The original channel pullback concept with wider actionable edges, larger staged entries, and isolated 10-12x execution.",
            "baseRiskPercent": 1.5,
            "riskLevel": "EXTREME",
            "entryRules": ["40% at the actionable channel edge", "30% on retest", "30% on completed reaction confirmation"],
            "takeProfitRules": ["Take 35% near channel midline", "Run 65% toward the opposite channel edge"],
            "currentPlan": "Hunting a broad but structurally valid channel edge for an aggressive staged entry.",
            "launchMonth": "2026-07",
        }
    )


class HighVoltageDonchianOverdrive(DonchianBreakout):
    profile = DonchianBreakout.profile.model_copy(
        update={
            "id": "high-voltage-donchian-overdrive",
            "name": "Donchian Overdrive",
            "description": "An aggressive completed-candle range breakout trader that enters before every participation signal fully aligns.",
            "concept": "The original frozen Donchian boundary breakout with one required participation confirmation and 14-16x isolated execution.",
            "baseRiskPercent": 2.0,
            "riskLevel": "EXTREME",
            "entryRules": ["50% on the completed breakout close", "25% on shallow retest", "25% on deeper controlled retest"],
            "takeProfitRules": ["Take 25% on the first expansion", "Run 75% toward extended range liquidity"],
            "currentPlan": "Waiting for a completed Donchian break with at least one real participation signal.",
            "launchMonth": "2026-07",
        }
    )


class HighVoltageTrendTitan(TrendSentinel):
    profile = TrendSentinel.profile.model_copy(
        update={
            "id": "high-voltage-trend-titan",
            "name": "Trend Titan",
            "description": "An aggressive higher-timeframe continuation trader that accepts earlier pullbacks while preserving structural invalidation.",
            "concept": "The original 4H trend continuation concept with softer strength gates, three-stage deployment, and a larger trailing runner.",
            "baseRiskPercent": 1.6,
            "riskLevel": "EXTREME",
            "entryRules": ["40% on the first valid 1H pullback", "30% at the mean", "30% on continuation confirmation"],
            "takeProfitRules": ["Take 20% at 1.5R", "Trail 80% with 4H structure"],
            "currentPlan": "Seeking an intact 4H trend with enough 1H structure to deploy before perfect confirmation.",
            "launchMonth": "2026-07",
        }
    )


class HighVoltageLiquidationShock(LiquidationPressureSniper):
    profile = LiquidationPressureSniper.profile.model_copy(
        update={
            "id": "high-voltage-liquidation-shock",
            "name": "Liquidation Shock",
            "description": "A fast forced-flow reversal trader that reacts to smaller liquidation imbalances once price structure turns.",
            "concept": "The original Coinalyze liquidation-pressure reversal with looser imbalance thresholds and 18-20x isolated execution.",
            "baseRiskPercent": 1.8,
            "riskLevel": "EXTREME",
            "entryRules": ["60% on the pressure reversal", "40% on the controlled retest"],
            "takeProfitRules": ["Take 50% on the pressure release", "Run 50% toward the next liquidation pocket"],
            "currentPlan": "Watching for a fresh forced-flow imbalance and the first opposing 15m structure turn.",
            "launchMonth": "2026-07",
        }
    )


class HighVoltageCompressionDetonator(MomentumIgnition):
    profile = MomentumIgnition.profile.model_copy(
        update={
            "id": "high-voltage-compression-detonator",
            "name": "Compression Detonator",
            "description": "An aggressive volatility-release trader that joins a completed box break on moderate body and volume expansion.",
            "concept": "The original frozen compression breakout with softer squeeze and expansion thresholds and 16-20x isolated execution.",
            "baseRiskPercent": 2.2,
            "riskLevel": "EXTREME",
            "entryRules": ["70% on the completed compression break", "30% on the first controlled retest"],
            "takeProfitRules": ["Take 25% on the first expansion", "Run 75% while closes hold outside the box"],
            "currentPlan": "Waiting for a completed release from a frozen box with moderate expansion confirmation.",
            "launchMonth": "2026-07",
        }
    )


__all__ = [
    "HighVoltageChannelRaider",
    "HighVoltageCompressionDetonator",
    "HighVoltageDonchianOverdrive",
    "HighVoltageLiquidationShock",
    "HighVoltageTrendTitan",
]
