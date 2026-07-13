from dataclasses import dataclass
from decimal import Decimal
from enum import StrEnum, unique
from typing import TypedDict, assert_never


@unique
class ExecutionSide(StrEnum):
    LONG = "long"
    SHORT = "short"


@unique
class EntryOrderType(StrEnum):
    LIMIT = "limit"
    MARKET = "market"


@unique
class ExecutionCostGateReason(StrEnum):
    NET_COST_HURDLE_FAILED = "net_cost_hurdle_failed"
    NET_RISK_REWARD_BELOW_MINIMUM = "net_risk_reward_below_minimum"


@dataclass(frozen=True, slots=True)
class ExecutionCostRates:
    maker_fee_rate: Decimal
    taker_fee_rate: Decimal
    slippage_rate: Decimal


@dataclass(frozen=True, slots=True)
class PlannedExecutionEntry:
    price: Decimal
    weight: Decimal
    order_type: EntryOrderType


@dataclass(frozen=True, slots=True)
class PlannedExecutionTarget:
    price: Decimal
    weight: Decimal


@dataclass(frozen=True, slots=True)
class ExecutionCostRequest:
    side: ExecutionSide
    entries: tuple[PlannedExecutionEntry, ...]
    stop_loss: Decimal
    targets: tuple[PlannedExecutionTarget, ...]
    rates: ExecutionCostRates


class ExecutionCostPayload(TypedDict):
    entryOrderTypes: list[str]
    makerFeeRate: float
    takerFeeRate: float
    slippageRate: float
    averagePlannedEntry: float
    averageEntryFill: float
    averageTargetFill: float
    expectedStopFill: float
    entryFee: float
    targetExitFee: float
    stopExitFee: float
    netRisk: float
    netReward: float
    netRiskReward: float
    firstTargetDistance: float
    firstTargetRoundtripCost: float
    firstTargetCostMultiple: float | None


@dataclass(frozen=True, slots=True)
class ExecutionCostAssessment:
    entry_order_types: tuple[EntryOrderType, ...]
    rates: ExecutionCostRates
    average_planned_entry: Decimal
    average_entry_fill: Decimal
    average_target_fill: Decimal
    expected_stop_fill: Decimal
    entry_fee: Decimal
    target_exit_fee: Decimal
    stop_exit_fee: Decimal
    net_risk: Decimal
    net_reward: Decimal
    net_risk_reward: Decimal
    first_target_distance: Decimal
    first_target_roundtrip_cost: Decimal
    first_target_cost_multiple: Decimal | None

    def to_payload(self) -> ExecutionCostPayload:
        return {
            "entryOrderTypes": [order_type.value for order_type in self.entry_order_types],
            "makerFeeRate": float(self.rates.maker_fee_rate),
            "takerFeeRate": float(self.rates.taker_fee_rate),
            "slippageRate": float(self.rates.slippage_rate),
            "averagePlannedEntry": float(self.average_planned_entry),
            "averageEntryFill": float(self.average_entry_fill),
            "averageTargetFill": float(self.average_target_fill),
            "expectedStopFill": float(self.expected_stop_fill),
            "entryFee": float(self.entry_fee),
            "targetExitFee": float(self.target_exit_fee),
            "stopExitFee": float(self.stop_exit_fee),
            "netRisk": float(self.net_risk),
            "netReward": float(self.net_reward),
            "netRiskReward": float(self.net_risk_reward),
            "firstTargetDistance": float(self.first_target_distance),
            "firstTargetRoundtripCost": float(self.first_target_roundtrip_cost),
            "firstTargetCostMultiple": (
                float(self.first_target_cost_multiple) if self.first_target_cost_multiple is not None else None
            ),
        }


def calculate_execution_costs(request: ExecutionCostRequest) -> ExecutionCostAssessment | None:
    entries = tuple(entry for entry in request.entries if entry.price > 0 and entry.weight > 0)
    targets = tuple(target for target in request.targets if target.price > 0 and target.weight > 0)
    entry_weight = sum((entry.weight for entry in entries), Decimal("0"))
    target_weight = sum((target.weight for target in targets), Decimal("0"))
    if entry_weight <= 0 or target_weight <= 0 or request.stop_loss <= 0:
        return None

    average_planned_entry = sum(
        (entry.price * entry.weight for entry in entries), Decimal("0")
    ) / entry_weight
    average_entry_fill = sum(
        (_entry_fill(request.side, entry, request.rates.slippage_rate) * entry.weight for entry in entries),
        Decimal("0"),
    ) / entry_weight
    entry_fee = sum(
        (
            _entry_fill(request.side, entry, request.rates.slippage_rate)
            * _entry_fee_rate(entry.order_type, request.rates)
            * entry.weight
            for entry in entries
        ),
        Decimal("0"),
    ) / entry_weight
    average_target_fill = sum(
        (_exit_fill(request.side, target.price, request.rates.slippage_rate) * target.weight for target in targets),
        Decimal("0"),
    ) / target_weight
    expected_stop_fill = _exit_fill(request.side, request.stop_loss, request.rates.slippage_rate)
    target_exit_fee = average_target_fill * request.rates.taker_fee_rate
    stop_exit_fee = expected_stop_fill * request.rates.taker_fee_rate
    gross_risk = _directional_distance(request.side, average_entry_fill, expected_stop_fill)
    gross_reward = _directional_distance(request.side, average_target_fill, average_entry_fill)
    net_risk = gross_risk + entry_fee + stop_exit_fee
    net_reward = gross_reward - entry_fee - target_exit_fee
    net_risk_reward = max(net_reward, Decimal("0")) / net_risk if net_risk > 0 else Decimal("0")

    first_target = targets[0].price
    first_target_fill = _exit_fill(request.side, first_target, request.rates.slippage_rate)
    first_target_distance = _directional_distance(request.side, first_target, average_planned_entry)
    first_target_net_reward = (
        _directional_distance(request.side, first_target_fill, average_entry_fill)
        - entry_fee
        - first_target_fill * request.rates.taker_fee_rate
    )
    first_target_roundtrip_cost = max(first_target_distance - first_target_net_reward, Decimal("0"))
    first_target_cost_multiple = (
        first_target_distance / first_target_roundtrip_cost
        if first_target_roundtrip_cost > 0
        else None
    )
    return ExecutionCostAssessment(
        entry_order_types=tuple(entry.order_type for entry in entries),
        rates=request.rates,
        average_planned_entry=average_planned_entry,
        average_entry_fill=average_entry_fill,
        average_target_fill=average_target_fill,
        expected_stop_fill=expected_stop_fill,
        entry_fee=entry_fee,
        target_exit_fee=target_exit_fee,
        stop_exit_fee=stop_exit_fee,
        net_risk=net_risk,
        net_reward=net_reward,
        net_risk_reward=net_risk_reward,
        first_target_distance=first_target_distance,
        first_target_roundtrip_cost=first_target_roundtrip_cost,
        first_target_cost_multiple=first_target_cost_multiple,
    )


def execution_cost_gate(
    assessment: ExecutionCostAssessment,
    minimum_risk_reward: Decimal,
) -> tuple[ExecutionCostGateReason, ...]:
    reasons: list[ExecutionCostGateReason] = []
    if (
        assessment.first_target_cost_multiple is not None
        and assessment.first_target_cost_multiple < Decimal("2.5")
    ):
        reasons.append(ExecutionCostGateReason.NET_COST_HURDLE_FAILED)
    if assessment.net_risk_reward < minimum_risk_reward:
        reasons.append(ExecutionCostGateReason.NET_RISK_REWARD_BELOW_MINIMUM)
    return tuple(reasons)


def _entry_fill(side: ExecutionSide, entry: PlannedExecutionEntry, slippage_rate: Decimal) -> Decimal:
    match entry.order_type:
        case EntryOrderType.LIMIT:
            return entry.price
        case EntryOrderType.MARKET:
            return entry.price * _entry_slippage_multiplier(side, slippage_rate)
        case unreachable:
            assert_never(unreachable)


def _entry_fee_rate(order_type: EntryOrderType, rates: ExecutionCostRates) -> Decimal:
    match order_type:
        case EntryOrderType.LIMIT:
            return rates.maker_fee_rate
        case EntryOrderType.MARKET:
            return rates.taker_fee_rate
        case unreachable:
            assert_never(unreachable)


def _entry_slippage_multiplier(side: ExecutionSide, slippage_rate: Decimal) -> Decimal:
    match side:
        case ExecutionSide.LONG:
            return Decimal("1") + slippage_rate
        case ExecutionSide.SHORT:
            return Decimal("1") - slippage_rate
        case unreachable:
            assert_never(unreachable)


def _exit_fill(side: ExecutionSide, price: Decimal, slippage_rate: Decimal) -> Decimal:
    match side:
        case ExecutionSide.LONG:
            return price * (Decimal("1") - slippage_rate)
        case ExecutionSide.SHORT:
            return price * (Decimal("1") + slippage_rate)
        case unreachable:
            assert_never(unreachable)


def _directional_distance(side: ExecutionSide, favorable: Decimal, adverse: Decimal) -> Decimal:
    match side:
        case ExecutionSide.LONG:
            return favorable - adverse
        case ExecutionSide.SHORT:
            return adverse - favorable
        case unreachable:
            assert_never(unreachable)
