from typing import Any, Final

from app.paper.holding_policy import trader_holding_horizon
from app.traders.models import HoldingHorizon


STATUS_FEED_INTERVAL_SECONDS: Final = {
    HoldingHorizon.SCALP: 1_800,
    HoldingHorizon.INTRADAY: 3_600,
    HoldingHorizon.SWING: 10_800,
    HoldingHorizon.POSITION: 21_600,
}
NO_SETUP_HEARTBEAT_SECONDS: Final = 21_600


def status_feed_interval_seconds(horizon: HoldingHorizon | str) -> int:
    try:
        parsed = HoldingHorizon(str(horizon).upper())
    except ValueError:
        parsed = HoldingHorizon.INTRADAY
    return STATUS_FEED_INTERVAL_SECONDS[parsed]


def status_feed_horizon(trader_id: str, trigger: dict[str, Any]) -> HoldingHorizon:
    for entity_key in ("position", "order"):
        entity = trigger.get(entity_key)
        if not isinstance(entity, dict):
            continue
        payload = entity.get("payload")
        if not isinstance(payload, dict):
            continue
        management_plan = payload.get("managementPlan")
        raw_horizon = management_plan.get("holdingHorizon") if isinstance(management_plan, dict) else None
        raw_horizon = raw_horizon or payload.get("holdingHorizon")
        if raw_horizon:
            try:
                return HoldingHorizon(str(raw_horizon).upper())
            except ValueError:
                break
    return trader_holding_horizon(trader_id)


def material_status_snapshot(trigger: dict[str, Any]) -> dict[str, Any]:
    for entity_key in ("position", "order"):
        entity = trigger.get(entity_key)
        if not isinstance(entity, dict):
            continue
        return {entity_key: _material_entity(entity)}
    return {}


def _material_entity(entity: dict[str, Any]) -> dict[str, Any]:
    field_aliases = {
        "id": ("id",),
        "status": ("status",),
        "side": ("side",),
        "quantity": ("quantity",),
        "filledQuantity": ("filledQuantity", "filled_quantity"),
        "leverage": ("leverage",),
        "entryPrice": ("entryPrice", "entry_price"),
        "limitPrice": ("limitPrice", "limit_price"),
        "stopLossPrice": ("stopLossPrice", "stop_loss_price"),
        "takeProfitPrice": ("takeProfitPrice", "take_profit_price"),
        "unrealizedPnl": ("unrealizedPnl", "unrealized_pnl"),
        "realizedPnl": ("realizedPnl", "realized_pnl"),
    }
    snapshot: dict[str, Any] = {}
    for canonical, aliases in field_aliases.items():
        value = next((entity[key] for key in aliases if key in entity), None)
        if value is not None:
            snapshot[canonical] = value
    payload = entity.get("payload")
    if isinstance(payload, dict):
        management_plan = payload.get("managementPlan")
        if isinstance(management_plan, dict):
            snapshot["managementPlan"] = {
                key: management_plan[key]
                for key in ("holdingHorizon", "strategyFamily", "expectedHoldMinutes")
                if key in management_plan
            }
    return snapshot
