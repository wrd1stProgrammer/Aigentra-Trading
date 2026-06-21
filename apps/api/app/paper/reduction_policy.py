from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, InvalidOperation
from typing import Final

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import PaperPositionRecord, TradeEventRecord, utc_now
from app.repositories import from_json


REDUCTION_ACTION_TYPES: Final[frozenset[str]] = frozenset(
    {"TAKE_PARTIAL_PROFIT", "REDUCE_RISK", "REDUCE_SIZE"}
)
PROTECTIVE_SIZE_EVENT_TYPES: Final[tuple[str, ...]] = (
    "position_reduced_by_ai",
    "take_partial_profit",
)
FULL_CLOSE_KEYWORDS_KO: Final[tuple[str, ...]] = ("전량", "전부", "완전히")
FULL_CLOSE_PHRASES_EN: Final[tuple[str, ...]] = (
    "close all",
    "close full",
    "close the position",
    "close position",
    "close remaining",
    "exit all",
    "exit full",
    "exit the position",
    "exit position",
    "exit remaining",
    "flatten",
    "liquidate",
)
PROTECTIVE_REDUCTION_COOLDOWN: Final[timedelta] = timedelta(minutes=30)
MIN_RUNNER_INITIAL_FRACTION: Final[Decimal] = Decimal("0.25")
MIN_CAPPED_REDUCTION_FRACTION: Final[Decimal] = Decimal("0.05")
DEFAULT_RISK_REDUCTION_FRACTION: Final[Decimal] = Decimal("0.10")
DEFAULT_PARTIAL_PROFIT_FRACTION: Final[Decimal] = Decimal("0.25")

DecimalLike = Decimal | int | float | str


@dataclass(frozen=True, slots=True)
class ReductionDecision:
    should_apply: bool
    quantity_fraction: Decimal | None
    reason: str


def build_reduction_decision(
    db: Session,
    *,
    position: PaperPositionRecord,
    action_type: str,
    requested_fraction: DecimalLike | None,
    review_decision: str,
    reason: str,
    now: datetime | None = None,
) -> ReductionDecision:
    clean_action = action_type.upper()
    if clean_action not in REDUCTION_ACTION_TYPES:
        return ReductionDecision(False, None, f"{clean_action} is not a size reduction action.")

    fraction = _requested_or_default_fraction(clean_action, requested_fraction, review_decision, reason)
    if fraction <= 0:
        return ReductionDecision(False, None, "Skipped size reduction because quantity fraction was zero.")
    if fraction >= Decimal("0.999"):
        return ReductionDecision(True, Decimal("1"), reason)

    checked_at = now or utc_now()
    recent_event = _latest_protective_size_event(db, position)
    if recent_event is not None and _within_cooldown(recent_event.created_at, checked_at):
        return ReductionDecision(
            False,
            None,
            "Skipped size reduction because a recent protective size reduction already ran for this position.",
        )

    initial_quantity = _initial_quantity(db, position)
    remaining_quantity = position.quantity * (Decimal("1") - fraction)
    minimum_runner = initial_quantity * MIN_RUNNER_INITIAL_FRACTION
    if remaining_quantity < minimum_runner:
        maximum_allowed_fraction = (position.quantity - minimum_runner) / position.quantity
        if maximum_allowed_fraction >= MIN_CAPPED_REDUCTION_FRACTION:
            capped_reason = (
                f"{reason} Size reduction capped to preserve the minimum runner floor "
                f"({minimum_runner.normalize()})."
            )
            return ReductionDecision(True, maximum_allowed_fraction, capped_reason)
        return ReductionDecision(
            False,
            None,
            (
                "Skipped size reduction because it would leave the position below the "
                f"minimum runner floor ({minimum_runner.normalize()})."
            ),
        )

    return ReductionDecision(True, fraction, reason)


def _requested_or_default_fraction(
    action_type: str,
    requested_fraction: DecimalLike | None,
    review_decision: str,
    reason: str,
) -> Decimal:
    if requested_fraction is not None:
        return _clamp_fraction(requested_fraction)
    if _is_full_close_intent(review_decision, reason):
        return Decimal("1")

    match action_type:
        case "TAKE_PARTIAL_PROFIT":
            return DEFAULT_PARTIAL_PROFIT_FRACTION
        case "REDUCE_RISK" | "REDUCE_SIZE":
            return DEFAULT_RISK_REDUCTION_FRACTION
        case _:
            return Decimal("0")


def _clamp_fraction(value: DecimalLike) -> Decimal:
    try:
        fraction = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("quantity_fraction must be decimal-compatible.") from exc
    if not fraction.is_finite():
        raise ValueError("quantity_fraction must be finite.")
    if fraction <= 0:
        return Decimal("0")
    return min(fraction, Decimal("1"))


def _is_full_close_intent(review_decision: str, reason: str) -> bool:
    if review_decision.upper() == "CLOSE_POSITION":
        return True
    lowered_reason = reason.lower()
    return (
        any(keyword in reason for keyword in FULL_CLOSE_KEYWORDS_KO)
        or any(phrase in lowered_reason for phrase in FULL_CLOSE_PHRASES_EN)
    )


def _initial_quantity(db: Session, position: PaperPositionRecord) -> Decimal:
    payload = from_json(position.payload_json)
    if isinstance(payload, dict):
        raw_quantity = payload.get("initialQuantity")
        if raw_quantity is not None:
            try:
                return max(_clamp_fractionless_decimal(raw_quantity), position.quantity)
            except ValueError:
                pass
    return max(_filled_quantity(db, position), position.quantity)


def _filled_quantity(db: Session, position: PaperPositionRecord) -> Decimal:
    if position.id is not None:
        quantities = db.execute(
            select(TradeEventRecord.quantity)
            .where(
                TradeEventRecord.position_id == position.id,
                TradeEventRecord.event_type == "order_filled",
            )
            .order_by(TradeEventRecord.id)
        ).scalars().all()
        total_quantity = _sum_quantities(quantities)
        if total_quantity > 0:
            return total_quantity

    if position.order_id is None:
        return position.quantity

    quantities = db.execute(
        select(TradeEventRecord.quantity)
        .where(
            TradeEventRecord.order_id == position.order_id,
            TradeEventRecord.event_type == "order_filled",
        )
        .order_by(TradeEventRecord.id)
    ).scalars().all()
    total_quantity = _sum_quantities(quantities)
    if total_quantity > 0:
        return total_quantity
    return position.quantity


def _sum_quantities(quantities: list[Decimal | None]) -> Decimal:
    total = Decimal("0")
    for quantity in quantities:
        if quantity is not None:
            total += quantity
    return total


def _clamp_fractionless_decimal(value: DecimalLike) -> Decimal:
    try:
        decimal = Decimal(str(value))
    except (InvalidOperation, ValueError) as exc:
        raise ValueError("initialQuantity must be decimal-compatible.") from exc
    if not decimal.is_finite() or decimal <= 0:
        raise ValueError("initialQuantity must be positive and finite.")
    return decimal


def _latest_protective_size_event(
    db: Session,
    position: PaperPositionRecord,
) -> TradeEventRecord | None:
    if position.id is None:
        return None
    return db.execute(
        select(TradeEventRecord)
        .where(
            TradeEventRecord.position_id == position.id,
            TradeEventRecord.event_type.in_(PROTECTIVE_SIZE_EVENT_TYPES),
        )
        .order_by(desc(TradeEventRecord.created_at), desc(TradeEventRecord.id))
        .limit(1)
    ).scalar_one_or_none()


def _within_cooldown(event_time: datetime, now: datetime) -> bool:
    normalized_event_time = event_time
    if normalized_event_time.tzinfo is None:
        normalized_event_time = normalized_event_time.replace(tzinfo=timezone.utc)
    normalized_now = now
    if normalized_now.tzinfo is None:
        normalized_now = normalized_now.replace(tzinfo=timezone.utc)
    return normalized_now - normalized_event_time < PROTECTIVE_REDUCTION_COOLDOWN
