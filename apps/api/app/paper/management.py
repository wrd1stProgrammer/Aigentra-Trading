from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Optional

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.db import PaperOrderRecord, PaperPositionRecord, PositionManagementReviewRecord
from app.paper.holding_policy import trader_holding_policy
from app.repositories import from_json
from app.traders.models import ManagedExposure, ManagementEvent


PROTECTIVE_REVIEW_MIN_COOLDOWN_SECONDS = 900


TRADER_MANAGEMENT_PROFILES: dict[str, dict[str, Any]] = {
    "channel-rider": {
        "order_stale_seconds": 900,
        "cooldown_seconds": 300,
        "events": {
            "pending_invalid": "channel_order_invalidated",
            "pending_stale": "channel_entry_stale",
            "position_fail": "channel_thesis_failed",
            "protect": "channel_stop_tightened",
        },
    },
    "volume-breaker": {
        "order_stale_seconds": 600,
        "cooldown_seconds": 300,
        "events": {
            "pending_invalid": "retest_failed_cancel",
            "pending_stale": "volume_confirmation_lost",
            "position_fail": "breakout_failed_close",
            "protect": "volume_momentum_decay",
        },
    },
    "pullback-architect": {
        "order_stale_seconds": 1800,
        "cooldown_seconds": 420,
        "events": {
            "pending_invalid": "scale_entry_cancelled",
            "pending_stale": "funding_overheat_cancel",
            "position_fail": "ema50_failure_exit",
            "protect": "unfilled_scales_cancelled",
        },
    },
    "leverage-hunter": {
        "order_stale_seconds": 300,
        "cooldown_seconds": 180,
        "events": {
            "pending_invalid": "trigger_reclaimed_cancel",
            "pending_stale": "crowding_signal_flipped",
            "position_fail": "crowding_reversal_exit",
            "protect": "squeeze_risk_reduce",
        },
    },
    "liquidity-reaper": {
        "order_stale_seconds": 480,
        "cooldown_seconds": 240,
        "events": {
            "pending_invalid": "sweep_acceptance_cancel",
            "pending_stale": "wick_retest_volume_cancel",
            "position_fail": "sweep_failure_exit",
            "protect": "wick_extreme_defense_failed",
        },
    },
    "volatility-squeezer": {
        "order_stale_seconds": 360,
        "cooldown_seconds": 180,
        "events": {
            "pending_invalid": "squeeze_reentry_cancel",
            "pending_stale": "expansion_momentum_lost",
            "position_fail": "squeeze_breakout_failed",
            "protect": "squeeze_momentum_decay",
        },
    },
    "trend-sentinel": {
        "order_stale_seconds": 2400,
        "cooldown_seconds": 600,
        "events": {
            "pending_invalid": "htf_trend_invalidated",
            "pending_stale": "continuation_entry_stale",
            "position_fail": "htf_trend_break_exit",
            "protect": "trend_trail_stop_review",
        },
    },
    "range-maker": {
        "order_stale_seconds": 900,
        "cooldown_seconds": 300,
        "events": {
            "pending_invalid": "range_breakout_cancel",
            "pending_stale": "range_edge_missed",
            "position_fail": "range_acceptance_exit",
            "protect": "range_mid_profit_protection",
        },
    },
    "funding-contrarian": {
        "order_stale_seconds": 420,
        "cooldown_seconds": 240,
        "events": {
            "pending_invalid": "funding_trigger_reclaimed",
            "pending_stale": "funding_edge_normalized",
            "position_fail": "crowded_side_acceleration",
            "protect": "funding_normalization_profit",
        },
    },
    "orderflow-sniper": {
        "order_stale_seconds": 600,
        "cooldown_seconds": 240,
        "events": {
            "pending_invalid": "session_range_reentry_cancel",
            "pending_stale": "session_orb_retest_expired",
            "position_fail": "session_orb_range_reentry",
            "protect": "session_orb_profit_protection",
        },
    },
    "donchian-breakout": {
        "order_stale_seconds": 720,
        "cooldown_seconds": 300,
        "events": {
            "pending_invalid": "donchian_range_reentry_cancel",
            "pending_stale": "donchian_retest_missed",
            "position_fail": "donchian_breakout_failed",
            "protect": "donchian_atr_trail_review",
        },
    },
    "ichimoku-cloud-pilot": {
        "order_stale_seconds": 1500,
        "cooldown_seconds": 420,
        "events": {
            "pending_invalid": "cloud_proxy_lost_cancel",
            "pending_stale": "cloud_pullback_stale",
            "position_fail": "cloud_trend_failed",
            "protect": "cloud_trail_stop_review",
        },
    },
    "vwap-reclaimer": {
        "order_stale_seconds": 420,
        "cooldown_seconds": 240,
        "events": {
            "pending_invalid": "vwap_reclaim_lost_cancel",
            "pending_stale": "fair_value_edge_decayed",
            "position_fail": "vwap_acceptance_failed",
            "protect": "vwap_mean_profit_protection",
        },
    },
    "wyckoff-spring": {
        "order_stale_seconds": 540,
        "cooldown_seconds": 240,
        "events": {
            "pending_invalid": "spring_reclaim_failed_cancel",
            "pending_stale": "spring_retest_expired",
            "position_fail": "spring_trap_failed",
            "protect": "spring_fast_derisk",
        },
    },
    "rsi-divergence-scout": {
        "order_stale_seconds": 900,
        "cooldown_seconds": 300,
        "events": {
            "pending_invalid": "divergence_structure_lost",
            "pending_stale": "divergence_confirmation_stale",
            "position_fail": "momentum_reaccelerated_exit",
            "protect": "divergence_profit_protection",
        },
    },
    "session-raider": {
        "order_stale_seconds": 240,
        "cooldown_seconds": 120,
        "events": {
            "pending_invalid": "session_range_reentry_cancel",
            "pending_stale": "session_window_expired",
            "position_fail": "session_break_failed",
            "protect": "session_fast_take_profit",
        },
    },
    "imbalance-hunter": {
        "order_stale_seconds": 900,
        "cooldown_seconds": 300,
        "events": {
            "pending_invalid": "imbalance_midpoint_failed",
            "pending_stale": "imbalance_retest_missed",
            "position_fail": "displacement_origin_failed",
            "protect": "imbalance_extension_trail",
        },
    },
    "momentum-ignition": {
        "order_stale_seconds": 900,
        "cooldown_seconds": 300,
        "events": {
            "pending_invalid": "compression_box_reentered",
            "pending_stale": "compression_breakout_expired",
            "position_fail": "compression_breakout_failed",
            "protect": "compression_expansion_protection",
        },
    },
    "bollinger-reversion": {
        "order_stale_seconds": 600,
        "cooldown_seconds": 240,
        "events": {
            "pending_invalid": "band_walk_cancel",
            "pending_stale": "reversion_edge_decayed",
            "position_fail": "band_walk_failure_exit",
            "protect": "mean_reversion_midpoint_take",
        },
    },
    "atr-trail-commander": {
        "order_stale_seconds": 2100,
        "cooldown_seconds": 600,
        "events": {
            "pending_invalid": "atr_structure_invalidated",
            "pending_stale": "atr_pullback_stale",
            "position_fail": "atr_trend_break_exit",
            "protect": "atr_trailing_stop_review",
        },
    },
}


def trader_management_profile(trader_id: str) -> dict[str, Any]:
    return TRADER_MANAGEMENT_PROFILES.get(trader_id, TRADER_MANAGEMENT_PROFILES["channel-rider"])


def payload_dict(record: Any) -> dict[str, Any]:
    return from_json(getattr(record, "payload_json", None)) or {}


def as_float(value: Any, default: float = 0.0) -> float:
    try:
        if value is None:
            return default
        return float(value)
    except (TypeError, ValueError):
        return default


def aware_datetime(value: Optional[datetime]) -> datetime:
    if value is None:
        return datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value


def latest_candle(snapshot: dict, interval: str = "15m") -> dict:
    timeframe = snapshot.get("timeframes", {}).get(interval, {})
    return timeframe.get("latestCandle") or timeframe


def taker_buy_ratio(snapshot: dict) -> float:
    candle = latest_candle(snapshot, "15m")
    volume = as_float(candle.get("volume"), as_float(snapshot.get("timeframes", {}).get("15m", {}).get("volume"), 0.0))
    taker_buy = as_float(candle.get("takerBuyBaseVolume"), 0.0)
    if volume <= 0:
        return 0.5
    return max(0.0, min(taker_buy / volume, 1.0))


def managed_exposure_from_order(order: PaperOrderRecord) -> ManagedExposure:
    payload = payload_dict(order)
    return ManagedExposure(
        kind="order",
        id=int(order.id),
        status=order.status,
        side=order.side.upper() if order.side else None,
        quantity=as_float(order.quantity),
        limitPrice=as_float(order.limit_price) if order.limit_price is not None else None,
        stopLoss=as_float(order.stop_loss_price) if order.stop_loss_price is not None else None,
        takeProfit=as_float(order.take_profit_price) if order.take_profit_price is not None else None,
        leverage=as_float(order.leverage),
        createdAt=aware_datetime(order.created_at).isoformat() if order.created_at else None,
        updatedAt=aware_datetime(order.updated_at).isoformat() if order.updated_at else None,
        payload=payload,
    )


def managed_exposure_from_position(position: PaperPositionRecord) -> ManagedExposure:
    payload = payload_dict(position)
    return ManagedExposure(
        kind="position",
        id=int(position.id),
        status=position.status,
        side=position.side.upper() if position.side else None,
        quantity=as_float(position.quantity),
        entryPrice=as_float(position.entry_price),
        stopLoss=as_float(position.stop_loss_price) if position.stop_loss_price is not None else None,
        takeProfit=as_float(position.take_profit_price) if position.take_profit_price is not None else None,
        leverage=as_float(position.leverage),
        unrealizedPnl=as_float(position.unrealized_pnl),
        createdAt=aware_datetime(position.created_at).isoformat() if position.created_at else None,
        updatedAt=aware_datetime(position.updated_at).isoformat() if position.updated_at else None,
        payload=payload,
    )


def recent_management_review_exists(
    db: Session,
    *,
    trader_id: str,
    symbol: str,
    exposure_kind: str,
    exposure_id: int,
    event_type: str,
    cooldown_seconds: int,
    error_retry_seconds: int = 300,
) -> bool:
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=max(0, cooldown_seconds))
    base_stmt = (
        select(PositionManagementReviewRecord)
        .where(
            PositionManagementReviewRecord.trader_id == trader_id,
            PositionManagementReviewRecord.symbol == symbol,
            PositionManagementReviewRecord.event_type == event_type,
        )
    )
    if exposure_kind == "order":
        base_stmt = base_stmt.where(PositionManagementReviewRecord.order_id == exposure_id)
    else:
        base_stmt = base_stmt.where(PositionManagementReviewRecord.position_id == exposure_id)
    order_by = (desc(PositionManagementReviewRecord.created_at), desc(PositionManagementReviewRecord.id))
    successful = db.execute(
        base_stmt.where(
            PositionManagementReviewRecord.status == "ok",
            PositionManagementReviewRecord.created_at >= cutoff,
        ).order_by(*order_by).limit(1)
    ).scalar_one_or_none()
    if successful is not None:
        return True
    retry_cutoff = now - timedelta(seconds=max(30, error_retry_seconds))
    failed = db.execute(
        base_stmt.where(
            PositionManagementReviewRecord.status != "ok",
            PositionManagementReviewRecord.created_at >= retry_cutoff,
        ).order_by(*order_by).limit(1)
    ).scalar_one_or_none()
    return failed is not None


def management_review_cooldown_seconds(
    event: ManagementEvent,
    *,
    profile: dict[str, Any],
    base_cooldown_seconds: int,
    urgent_cooldown_seconds: int,
) -> int:
    profile_cooldown = max(0, int(profile.get("cooldown_seconds") or 0))
    event_type = str(event.eventType or "")
    base = urgent_cooldown_seconds if event.severity.upper() == "HIGH" else base_cooldown_seconds
    cooldown = max(0, int(base or 0), profile_cooldown)
    profile_events = profile.get("events") if isinstance(profile.get("events"), dict) else {}
    if event_type == str(profile_events.get("pending_stale") or ""):
        order_stale_seconds = int((event.metrics or {}).get("profileOrderStaleSeconds") or profile.get("order_stale_seconds") or 0)
        return max(cooldown, order_stale_seconds)
    if event_type.endswith("_heartbeat"):
        heartbeat = int((event.metrics or {}).get("heartbeatSeconds") or 0)
        # Heartbeats are the configured periodic review contract. A larger
        # event cooldown must not silently stretch a 25-minute heartbeat into
        # an irregular 30-60 minute review cadence.
        return max(60, heartbeat)
    if event_type in {"near_target_profit_protection", "near_stop_risk_reduction"}:
        return max(cooldown, PROTECTIVE_REVIEW_MIN_COOLDOWN_SECONDS)
    return cooldown


def order_management_events(trader_id: str, order: PaperOrderRecord, snapshot: dict) -> list[ManagementEvent]:
    profile = trader_management_profile(trader_id)
    event_names = profile["events"]
    price = as_float(snapshot.get("price"))
    side = (order.side or "").lower()
    limit_price = as_float(order.limit_price, price)
    one_hour = snapshot.get("timeframes", {}).get("1h", {})
    fifteen = snapshot.get("timeframes", {}).get("15m", {})
    four_hour = snapshot.get("timeframes", {}).get("4h", {})
    derivatives = snapshot.get("derivatives", {})
    channel = one_hour.get("channel", {})
    close_15m = as_float(latest_candle(snapshot, "15m").get("close"), price)
    ema50 = as_float(one_hour.get("ema50"), price)
    funding = as_float(derivatives.get("fundingRate"), 0.0)
    volume_z = as_float(fifteen.get("volumeZscore"), 0.0)
    ratio = taker_buy_ratio(snapshot)
    age_seconds = int((datetime.now(timezone.utc) - aware_datetime(order.submitted_at)).total_seconds())
    distance_percent = abs(price - limit_price) / price * 100 if price > 0 else 0.0
    events: list[ManagementEvent] = []

    def base_metrics(extra: dict[str, Any] = None) -> dict[str, Any]:
        return {
            "price": price,
            "limitPrice": limit_price,
            "ageSeconds": age_seconds,
            "distancePercent": round(distance_percent, 4),
            "volumeZscore": volume_z,
            "fundingRate": funding,
            "takerBuyRatio": round(ratio, 4),
            "profileOrderStaleSeconds": profile.get("order_stale_seconds"),
            **(extra or {}),
        }

    target = as_float(order.take_profit_price, 0.0)
    target_missed_before_fill = target > 0 and (
        (side == "long" and price >= target)
        or (side == "short" and price <= target)
    )
    if target_missed_before_fill:
        return [
            ManagementEvent(
                eventType=event_names["pending_stale"],
                phase="PENDING_ORDER",
                severity="HIGH",
                reason="Projected take-profit zone was reached before the pending entry filled.",
                suggestedAction="CANCEL_PENDING_ORDER",
                metrics=base_metrics({"takeProfit": target}),
            )
        ]

    if trader_id == "channel-rider":
        lower = as_float(channel.get("lower"), price * 0.99)
        mid = as_float(channel.get("mid"), price)
        upper = as_float(channel.get("upper"), price * 1.01)
        invalid = (side == "long" and close_15m < lower) or (side == "short" and close_15m > upper)
        stale = (side == "long" and price >= mid) or (side == "short" and price <= mid)
        if invalid:
            events.append(ManagementEvent(eventType=event_names["pending_invalid"], phase="PENDING_ORDER", severity="HIGH", reason="Channel edge setup invalidated before fill.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"channelLower": lower, "channelMid": mid, "channelUpper": upper})))
        elif stale or age_seconds >= profile["order_stale_seconds"]:
            events.append(ManagementEvent(eventType=event_names["pending_stale"], phase="PENDING_ORDER", severity="MEDIUM", reason="Price moved away from the edge toward channel midline before fill.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"channelMid": mid})))
    elif trader_id == "volume-breaker":
        failed = (side == "long" and close_15m < limit_price * 0.997) or (side == "short" and close_15m > limit_price * 1.003)
        weak_volume = volume_z < -0.25
        if failed:
            events.append(ManagementEvent(eventType=event_names["pending_invalid"], phase="PENDING_ORDER", severity="HIGH", reason="Retest level failed before the pending order filled.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics()))
        elif weak_volume or age_seconds >= profile["order_stale_seconds"]:
            events.append(ManagementEvent(eventType=event_names["pending_stale"], phase="PENDING_ORDER", severity="MEDIUM", reason="Breakout confirmation volume faded while the order was pending.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics()))
    elif trader_id == "pullback-architect":
        ema_fail = (side == "long" and close_15m < ema50) or (side == "short" and close_15m > ema50)
        funding_hot = abs(funding) >= 0.001
        if ema_fail:
            events.append(ManagementEvent(eventType=event_names["pending_invalid"], phase="PENDING_ORDER", severity="HIGH", reason="EMA50 decision band failed before all scales filled.", suggestedAction="CANCEL_REMAINING_ORDERS", metrics=base_metrics({"ema50": ema50})))
        elif funding_hot:
            events.append(ManagementEvent(eventType=event_names["pending_stale"], phase="PENDING_ORDER", severity="MEDIUM", reason="Funding became overheated while staged entries were pending.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics()))
    elif trader_id == "leverage-hunter":
        trigger_reclaimed = (side == "short" and close_15m > limit_price * 1.002) or (side == "long" and close_15m < limit_price * 0.998)
        crowding_flipped = (side == "short" and (funding <= 0 or ratio < 0.5)) or (side == "long" and (funding >= 0 or ratio > 0.5))
        if trigger_reclaimed:
            events.append(ManagementEvent(eventType=event_names["pending_invalid"], phase="PENDING_ORDER", severity="HIGH", reason="Structure trigger was reclaimed before fill.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics()))
        elif crowding_flipped or age_seconds >= profile["order_stale_seconds"]:
            events.append(ManagementEvent(eventType=event_names["pending_stale"], phase="PENDING_ORDER", severity="MEDIUM", reason="Crowding signal flipped while leverage setup was pending.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics()))
    elif trader_id == "liquidity-reaper":
        stop = as_float(order.stop_loss_price, price)
        volume_hot = volume_z > 0.75
        accepted = (side == "short" and close_15m >= stop * 0.998) or (side == "long" and close_15m <= stop * 1.002)
        if accepted:
            events.append(ManagementEvent(eventType=event_names["pending_invalid"], phase="PENDING_ORDER", severity="HIGH", reason="Price accepted beyond the swept wick zone before fill.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"stopLoss": stop})))
        elif volume_hot and distance_percent > 0.35:
            events.append(ManagementEvent(eventType=event_names["pending_stale"], phase="PENDING_ORDER", severity="MEDIUM", reason="Wick zone was retested with elevated opposing volume while pending.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"stopLoss": stop})))
    elif trader_id == "volatility-squeezer":
        ema20 = as_float(one_hour.get("ema20"), price)
        reentered = (side == "long" and close_15m < ema20) or (side == "short" and close_15m > ema20)
        if reentered:
            events.append(ManagementEvent(eventType=event_names["pending_invalid"], phase="PENDING_ORDER", severity="HIGH", reason="Breakout re-entered the compression mean before pending entry filled.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"ema20": ema20})))
        elif volume_z < -0.2 or age_seconds >= profile["order_stale_seconds"]:
            events.append(ManagementEvent(eventType=event_names["pending_stale"], phase="PENDING_ORDER", severity="MEDIUM", reason="Expansion momentum faded while squeeze entry was pending.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"ema20": ema20})))
    elif trader_id == "trend-sentinel":
        trend = four_hour.get("trend", "sideways")
        ema50_4h = as_float(four_hour.get("ema50"), price)
        invalid = (side == "long" and (trend == "bearish" or price < ema50_4h)) or (side == "short" and (trend == "bullish" or price > ema50_4h))
        stale = age_seconds >= profile["order_stale_seconds"]
        if invalid:
            events.append(ManagementEvent(eventType=event_names["pending_invalid"], phase="PENDING_ORDER", severity="HIGH", reason="Higher timeframe trend invalidated before continuation entry filled.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"fourHourTrend": trend, "ema50_4h": ema50_4h})))
        elif stale:
            events.append(ManagementEvent(eventType=event_names["pending_stale"], phase="PENDING_ORDER", severity="MEDIUM", reason="Continuation entry has stayed pending too long for the original trend pullback.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"fourHourTrend": trend})))
    elif trader_id == "range-maker":
        lower = as_float(channel.get("lower"), price * 0.99)
        mid = as_float(channel.get("mid"), price)
        upper = as_float(channel.get("upper"), price * 1.01)
        accepted_break = (side == "long" and close_15m < lower) or (side == "short" and close_15m > upper)
        edge_missed = (side == "long" and price >= mid) or (side == "short" and price <= mid)
        if accepted_break:
            events.append(ManagementEvent(eventType=event_names["pending_invalid"], phase="PENDING_ORDER", severity="HIGH", reason="Range edge broke before the mean-reversion order filled.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"rangeLower": lower, "rangeMid": mid, "rangeUpper": upper})))
        elif edge_missed or age_seconds >= profile["order_stale_seconds"]:
            events.append(ManagementEvent(eventType=event_names["pending_stale"], phase="PENDING_ORDER", severity="MEDIUM", reason="Price moved back toward range midpoint before the edge order filled.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"rangeMid": mid})))
    elif trader_id == "funding-contrarian":
        normalized = abs(funding) < 0.000025
        reclaimed = (side == "short" and close_15m > limit_price * 1.002) or (side == "long" and close_15m < limit_price * 0.998)
        if reclaimed:
            events.append(ManagementEvent(eventType=event_names["pending_invalid"], phase="PENDING_ORDER", severity="HIGH", reason="Contrarian structure trigger was reclaimed before fill.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics()))
        elif normalized or age_seconds >= profile["order_stale_seconds"]:
            events.append(ManagementEvent(eventType=event_names["pending_stale"], phase="PENDING_ORDER", severity="MEDIUM", reason="Funding edge normalized or became stale before pending entry filled.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics()))
    elif trader_id == "orderflow-sniper":
        lower = as_float(channel.get("lower"), limit_price)
        upper = as_float(channel.get("upper"), limit_price)
        range_reentered = (side == "long" and close_15m < upper) or (side == "short" and close_15m > lower)
        if range_reentered:
            events.append(ManagementEvent(eventType=event_names["pending_invalid"], phase="PENDING_ORDER", severity="HIGH", reason="Session breakout re-entered the range before the retest order filled.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"rangeLower": lower, "rangeUpper": upper})))
        elif age_seconds >= profile["order_stale_seconds"] or distance_percent > 0.45:
            events.append(ManagementEvent(eventType=event_names["pending_stale"], phase="PENDING_ORDER", severity="MEDIUM", reason="Session ORB retest is stale or too far from current price.", suggestedAction="CANCEL_PENDING_ORDER", metrics=base_metrics({"rangeLower": lower, "rangeUpper": upper})))
    return events[:2]


def position_management_events(trader_id: str, position: PaperPositionRecord, snapshot: dict) -> list[ManagementEvent]:
    profile = trader_management_profile(trader_id)
    holding_policy = trader_holding_policy(trader_id)
    event_names = profile["events"]
    price = as_float(snapshot.get("price"))
    side = (position.side or "").lower()
    entry = as_float(position.entry_price, price)
    stop = as_float(position.stop_loss_price, entry)
    take_profit = as_float(position.take_profit_price, entry)
    risk = abs(entry - stop) or max(price * 0.004, 1.0)
    progress_r = ((price - entry) / risk) if side == "long" else ((entry - price) / risk)
    distance_to_stop_r = ((price - stop) / risk) if side == "long" else ((stop - price) / risk)
    target_distance = abs(take_profit - entry) or risk
    target_progress = ((price - entry) / target_distance) if side == "long" else ((entry - price) / target_distance)
    one_hour = snapshot.get("timeframes", {}).get("1h", {})
    fifteen = snapshot.get("timeframes", {}).get("15m", {})
    derivatives = snapshot.get("derivatives", {})
    channel = one_hour.get("channel", {})
    close_15m = as_float(latest_candle(snapshot, "15m").get("close"), price)
    ema50 = as_float(one_hour.get("ema50"), price)
    funding = as_float(derivatives.get("fundingRate"), 0.0)
    volume_z = as_float(fifteen.get("volumeZscore"), 0.0)
    ratio = taker_buy_ratio(snapshot)
    events: list[ManagementEvent] = []
    position_payload = from_json(position.payload_json) or {}
    management_plan = position_payload.get("managementPlan") if isinstance(position_payload, dict) else None
    management_plan = management_plan if isinstance(management_plan, dict) else {}

    def base_metrics(extra: dict[str, Any] = None) -> dict[str, Any]:
        return {
            "price": price,
            "entryPrice": entry,
            "stopLoss": stop,
            "takeProfit": take_profit,
            "progressR": round(progress_r, 4),
            "distanceToStopR": round(distance_to_stop_r, 4),
            "targetProgress": round(target_progress, 4),
            "holdingPolicy": holding_policy.as_prompt_dict(),
            "breakevenProgressR": float(holding_policy.breakeven_progress_r),
            "profitProtectTargetProgress": float(holding_policy.profit_protect_target_progress),
            "trailReviewProgressR": float(holding_policy.trail_review_progress_r),
            "volumeZscore": volume_z,
            "fundingRate": funding,
            "takerBuyRatio": round(ratio, 4),
            "holdingHorizon": management_plan.get("holdingHorizon"),
            "strategyFamily": management_plan.get("strategyFamily"),
            "expectedHoldMinutes": management_plan.get("expectedHoldMinutes"),
            **(extra or {}),
        }

    event_triggers = management_plan.get("eventTriggers")
    expected_hold_minutes = management_plan.get("expectedHoldMinutes")
    if (
        isinstance(event_triggers, list)
        and "TIME_STOP" in event_triggers
        and isinstance(expected_hold_minutes, (int, float))
        and expected_hold_minutes > 0
    ):
        held_minutes = (datetime.now(timezone.utc) - aware_datetime(position.opened_at)).total_seconds() / 60
        if held_minutes >= float(expected_hold_minutes):
            events.append(
                ManagementEvent(
                    eventType="management_time_stop_due",
                    phase="OPEN_POSITION",
                    severity="MEDIUM",
                    reason="The frozen management plan reached its expected holding window and requires a fresh exit-or-extension decision.",
                    suggestedAction="REDUCE_RISK",
                    metrics=base_metrics({"heldMinutes": round(held_minutes, 1)}),
                )
            )

    if trader_id == "channel-rider":
        lower = as_float(channel.get("lower"), price * 0.99)
        mid = as_float(channel.get("mid"), price)
        upper = as_float(channel.get("upper"), price * 1.01)
        failed = (side == "long" and close_15m < lower) or (side == "short" and close_15m > upper)
        if failed:
            events.append(ManagementEvent(eventType=event_names["position_fail"], phase="OPEN_POSITION", severity="HIGH", reason="Channel thesis failed after entry.", suggestedAction="CLOSE_POSITION", metrics=base_metrics({"channelLower": lower, "channelMid": mid, "channelUpper": upper})))
        elif progress_r >= float(holding_policy.breakeven_progress_r) or (
            target_progress >= float(holding_policy.profit_protect_target_progress)
            and ((side == "long" and price >= mid) or (side == "short" and price <= mid))
        ):
            events.append(ManagementEvent(eventType=event_names["protect"], phase="OPEN_POSITION", severity="MEDIUM", reason="Channel trade reached protection zone.", suggestedAction="MOVE_STOP_TO_BREAKEVEN", metrics=base_metrics({"channelMid": mid})))
    elif trader_id == "volume-breaker":
        failed = (side == "long" and close_15m < entry * 0.997) or (side == "short" and close_15m > entry * 1.003)
        if failed:
            events.append(ManagementEvent(eventType=event_names["position_fail"], phase="OPEN_POSITION", severity="HIGH", reason="Broken level failed after fill.", suggestedAction="CLOSE_POSITION", metrics=base_metrics()))
        elif progress_r > 0.35 and volume_z < -0.5:
            events.append(ManagementEvent(eventType=event_names["protect"], phase="OPEN_POSITION", severity="MEDIUM", reason="Continuation volume decayed before target.", suggestedAction="REDUCE_RISK", metrics=base_metrics()))
    elif trader_id == "pullback-architect":
        ema_fail = (side == "long" and close_15m < ema50) or (side == "short" and close_15m > ema50)
        if ema_fail:
            events.append(ManagementEvent(eventType=event_names["position_fail"], phase="OPEN_POSITION", severity="HIGH", reason="EMA50 failed against pullback thesis.", suggestedAction="CLOSE_POSITION", metrics=base_metrics({"ema50": ema50})))
        elif abs(funding) >= 0.001 or target_progress >= float(holding_policy.profit_protect_target_progress):
            events.append(ManagementEvent(eventType=event_names["protect"], phase="OPEN_POSITION", severity="MEDIUM", reason="Staged pullback risk should be reduced as conditions changed.", suggestedAction="CANCEL_REMAINING_ORDERS", metrics=base_metrics({"ema50": ema50})))
    elif trader_id == "leverage-hunter":
        flow_flipped = (side == "short" and ratio >= 0.58 and funding > 0) or (side == "long" and ratio <= 0.42 and funding < 0)
        adverse = distance_to_stop_r <= 0.35
        if flow_flipped:
            events.append(ManagementEvent(eventType=event_names["position_fail"], phase="OPEN_POSITION", severity="HIGH", reason="Crowding flow moved back against the squeeze thesis.", suggestedAction="CLOSE_POSITION", metrics=base_metrics()))
        elif adverse or abs(funding) >= 0.00008:
            events.append(ManagementEvent(eventType=event_names["protect"], phase="OPEN_POSITION", severity="HIGH", reason="Leverage setup is near squeeze-risk reduction zone.", suggestedAction="REDUCE_RISK", metrics=base_metrics()))
    elif trader_id == "liquidity-reaper":
        sweep_failed = (side == "short" and close_15m > stop * 0.995) or (side == "long" and close_15m < stop * 1.005)
        if sweep_failed:
            events.append(ManagementEvent(eventType=event_names["position_fail"], phase="OPEN_POSITION", severity="HIGH", reason="Sweep level accepted against the reversal thesis.", suggestedAction="CLOSE_POSITION", metrics=base_metrics()))
        elif volume_z > 0.75 and distance_to_stop_r <= 0.5:
            events.append(ManagementEvent(eventType=event_names["protect"], phase="OPEN_POSITION", severity="HIGH", reason="Wick extreme is being defended aggressively against the position.", suggestedAction="REDUCE_RISK", metrics=base_metrics()))
    elif trader_id == "volatility-squeezer":
        ema20 = as_float(one_hour.get("ema20"), price)
        failed = (side == "long" and close_15m < ema20) or (side == "short" and close_15m > ema20)
        if failed:
            events.append(ManagementEvent(eventType=event_names["position_fail"], phase="OPEN_POSITION", severity="HIGH", reason="Squeeze breakout failed back through the 1H mean.", suggestedAction="CLOSE_POSITION", metrics=base_metrics({"ema20": ema20})))
        elif progress_r >= float(holding_policy.breakeven_progress_r) and volume_z < 0.0:
            events.append(ManagementEvent(eventType=event_names["protect"], phase="OPEN_POSITION", severity="MEDIUM", reason="Squeeze momentum is decaying after initial progress.", suggestedAction="MOVE_STOP_TO_BREAKEVEN", metrics=base_metrics({"ema20": ema20})))
    elif trader_id == "trend-sentinel":
        trend = one_hour.get("trend", "sideways")
        ema50_4h = as_float(snapshot.get("timeframes", {}).get("4h", {}).get("ema50"), price)
        failed = (side == "long" and (trend == "bearish" or price < ema50_4h)) or (side == "short" and (trend == "bullish" or price > ema50_4h))
        if failed:
            events.append(ManagementEvent(eventType=event_names["position_fail"], phase="OPEN_POSITION", severity="HIGH", reason="High timeframe continuation structure broke against the position.", suggestedAction="CLOSE_POSITION", metrics=base_metrics({"oneHourTrend": trend, "ema50_4h": ema50_4h})))
        elif progress_r >= float(holding_policy.trail_review_progress_r):
            events.append(ManagementEvent(eventType=event_names["protect"], phase="OPEN_POSITION", severity="MEDIUM", reason="Trend position reached profit zone where trailing stop should be reviewed.", suggestedAction="TRAIL_STOP", metrics=base_metrics({"oneHourTrend": trend})))
    elif trader_id == "range-maker":
        lower = as_float(channel.get("lower"), price * 0.99)
        mid = as_float(channel.get("mid"), price)
        upper = as_float(channel.get("upper"), price * 1.01)
        accepted_break = (side == "long" and close_15m < lower) or (side == "short" and close_15m > upper)
        at_mid = (side == "long" and price >= mid) or (side == "short" and price <= mid)
        if accepted_break:
            events.append(ManagementEvent(eventType=event_names["position_fail"], phase="OPEN_POSITION", severity="HIGH", reason="Range edge accepted beyond stop thesis after entry.", suggestedAction="CLOSE_POSITION", metrics=base_metrics({"rangeLower": lower, "rangeMid": mid, "rangeUpper": upper})))
        elif at_mid:
            events.append(ManagementEvent(eventType=event_names["protect"], phase="OPEN_POSITION", severity="MEDIUM", reason="Range trade reached midpoint; mean-reversion edge should be de-risked.", suggestedAction="TAKE_PARTIAL_PROFIT", metrics=base_metrics({"rangeMid": mid})))
    elif trader_id == "funding-contrarian":
        normalized = abs(funding) < 0.000025
        adverse = (side == "short" and ratio >= 0.58) or (side == "long" and ratio <= 0.42)
        if adverse and distance_to_stop_r <= 0.6:
            events.append(ManagementEvent(eventType=event_names["position_fail"], phase="OPEN_POSITION", severity="HIGH", reason="Crowded side accelerated against the funding contrarian position.", suggestedAction="REDUCE_RISK", metrics=base_metrics()))
        elif normalized or progress_r >= float(holding_policy.trail_review_progress_r):
            events.append(ManagementEvent(eventType=event_names["protect"], phase="OPEN_POSITION", severity="MEDIUM", reason="Funding edge normalized; secure profit or tighten risk.", suggestedAction="TAKE_PARTIAL_PROFIT", metrics=base_metrics()))
    elif trader_id == "orderflow-sniper":
        lower = as_float(channel.get("lower"), entry)
        upper = as_float(channel.get("upper"), entry)
        range_reentry = (side == "long" and close_15m < upper) or (side == "short" and close_15m > lower)
        if range_reentry and progress_r <= 0.15:
            events.append(ManagementEvent(eventType=event_names["position_fail"], phase="OPEN_POSITION", severity="HIGH", reason="Session breakout failed back into the range after entry.", suggestedAction="CLOSE_POSITION", metrics=base_metrics({"rangeLower": lower, "rangeUpper": upper})))
        elif progress_r >= float(holding_policy.breakeven_progress_r) or target_progress >= float(holding_policy.profit_protect_target_progress):
            events.append(ManagementEvent(eventType=event_names["protect"], phase="OPEN_POSITION", severity="MEDIUM", reason="Session breakout reached protection zone outside the range.", suggestedAction="MOVE_STOP_TO_BREAKEVEN", metrics=base_metrics({"rangeLower": lower, "rangeUpper": upper})))
    elif trader_id == "imbalance-hunter":
        failure_line = stop
        midpoint = entry
        failed = (side == "long" and close_15m <= failure_line) or (side == "short" and close_15m >= failure_line)
        losing_near_failure = progress_r < 0 and distance_to_stop_r <= 0.35
        extension_stalled = target_progress >= float(holding_policy.profit_protect_target_progress) and volume_z <= 0
        imbalance_metrics = {
            "imbalanceMidpoint": midpoint,
            "failureLine": failure_line,
            "fifteenMinuteClose": close_15m,
        }
        if failed:
            events.append(
                ManagementEvent(
                    eventType=event_names["position_fail"],
                    phase="OPEN_POSITION",
                    severity="HIGH",
                    reason="Imbalance failure line was accepted against the displacement thesis.",
                    suggestedAction="CLOSE_POSITION",
                    metrics=base_metrics(imbalance_metrics),
                )
            )
        elif losing_near_failure:
            events.append(
                ManagementEvent(
                    eventType=event_names["position_fail"],
                    phase="OPEN_POSITION",
                    severity="HIGH",
                    reason="Imbalance retest is drifting back toward the failure line before the displacement extends.",
                    suggestedAction="REDUCE_RISK",
                    metrics=base_metrics(imbalance_metrics),
                )
            )
        elif extension_stalled:
            events.append(
                ManagementEvent(
                    eventType=event_names["protect"],
                    phase="OPEN_POSITION",
                    severity="MEDIUM",
                    reason="Imbalance extension reached profit-protection progress while volume stopped confirming continuation.",
                    suggestedAction="MOVE_STOP_TO_BREAKEVEN",
                    metrics=base_metrics(imbalance_metrics),
                )
            )

    if not events and target_progress >= float(holding_policy.profit_protect_target_progress):
        events.append(ManagementEvent(eventType="near_target_profit_protection", phase="OPEN_POSITION", severity="MEDIUM", reason="Position reached the trader-specific profit protection zone before full take profit.", suggestedAction="TAKE_PARTIAL_PROFIT", metrics=base_metrics()))
    elif not events and distance_to_stop_r <= 0.3:
        events.append(ManagementEvent(eventType="near_stop_risk_reduction", phase="OPEN_POSITION", severity="HIGH", reason="Position is within 0.3R of the hard stop.", suggestedAction="REDUCE_RISK", metrics=base_metrics()))
    return events[:2]
