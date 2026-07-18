from decimal import Decimal


HIGH_VOLTAGE_SOURCE_TRADER_IDS = {
    "high-voltage-channel-raider": "channel-rider",
    "high-voltage-donchian-overdrive": "donchian-breakout",
    "high-voltage-trend-titan": "trend-sentinel",
    "high-voltage-liquidation-shock": "liquidation-pressure-sniper",
    "high-voltage-compression-detonator": "momentum-ignition",
}
HIGH_VOLTAGE_TRADER_IDS = frozenset(HIGH_VOLTAGE_SOURCE_TRADER_IDS)

HIGH_VOLTAGE_INITIAL_EQUITY = Decimal("10000")
HIGH_VOLTAGE_MAX_LEVERAGE = Decimal("20")
HIGH_VOLTAGE_MIN_LEVERAGE = Decimal("10")
HIGH_VOLTAGE_FIRST_ENTRY_MARGIN_PERCENT = Decimal("6")
HIGH_VOLTAGE_MIN_TOTAL_MARGIN_PERCENT = Decimal("15")
HIGH_VOLTAGE_MAX_TOTAL_MARGIN_PERCENT = Decimal("20")


def is_high_voltage_trader(trader_id: str) -> bool:
    return trader_id in HIGH_VOLTAGE_TRADER_IDS


def is_high_voltage_candidate(candidate: object) -> bool:
    audit = getattr(candidate, "audit", None)
    return isinstance(audit, dict) and audit.get("leagueVariant") == "high_voltage"
