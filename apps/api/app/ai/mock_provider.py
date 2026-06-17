from app.ai.base import BaseAIProvider
from app.paper.holding_policy import trader_holding_policy
from app.traders.models import PositionManagementPayload, PositionManagementResult, TradeReviewPayload, TradeReviewResult
from app.traders.strategy_base import candidate_geometry_errors


class MockAIProvider(BaseAIProvider):
    name = "mock"
    model = "mock-reviewer-v1"

    def __init__(self, fallback: bool = False) -> None:
        self.fallback = fallback

    async def review_trade_candidate(
        self, payload: TradeReviewPayload
    ) -> TradeReviewResult:
        locale = "ko" if (payload.locale or "ko").lower().startswith("ko") else "en"
        candidate = payload.candidate
        score = candidate.setupScore
        risk = payload.trader.riskLevel
        structural_errors = []
        if candidate.created:
            if (
                candidate.side is None
                or candidate.stopLoss is None
                or not candidate.entries
                or not candidate.takeProfits
                or candidate.riskPlan is None
                or candidate.leveragePlan is None
                or candidate.orderIntent is None
                or not candidate.earlyExitRules
            ):
                structural_errors.append("Candidate is missing required execution/risk review fields.")
            else:
                structural_errors.extend(
                    candidate_geometry_errors(
                        candidate.side,
                        float(payload.marketSnapshot.get("price") or 0.0),
                        candidate.entries,
                        candidate.stopLoss,
                        candidate.takeProfits,
                        min_risk_reward=candidate.riskPlan.minRiskReward,
                        fee_buffer_percent=candidate.riskPlan.feeBufferPercent,
                    )
                )
                if candidate.leveragePlan.suggestedLeverage > candidate.leveragePlan.maxLeverage:
                    structural_errors.append("Suggested leverage exceeds max leverage.")
                if candidate.riskPlan.feeBufferPercent <= 0:
                    structural_errors.append("Fee buffer must be positive.")
        if structural_errors:
            decision = "REJECT"
            confidence = max(55, min(82, score))
        elif not candidate.created:
            decision = "NEEDS_MORE_DATA"
            confidence = max(35, score)
        elif score >= 78:
            decision = "APPROVE"
            confidence = min(88, score + 4)
        elif score >= 64:
            decision = "ADJUST_AND_APPROVE"
            confidence = score
        elif score >= 52:
            decision = "DEFER"
            confidence = score
        else:
            decision = "NEEDS_MORE_DATA"
            confidence = max(35, score)
        normalized_risk = "HIGH" if "HIGH" in risk else "MEDIUM"
        if locale == "ko":
            adjustment = "확인 캔들이 마감될 때까지 진입 규모를 20% 줄이고 수수료 버퍼를 유지하세요."
            approval_reason = (
                f"{payload.trader.name}의 {candidate.setupType or '셋업'} {candidate.side or ''} 진입은 현재 구조와 후보 가격대가 같은 방향으로 맞아 있습니다. "
                "진입가, 손절, 익절이 손익비와 수수료 버퍼 검사를 통과했고 레버리지 계획도 허용 범위 안입니다. "
                "조기 종료 조건과 무효화 규칙이 있어 승인하지만, 가격이 무효화 레벨에 안착하면 즉시 철회해야 합니다."
            )
            counter_thesis = "가격이 무효화 레벨 너머에서 안착하거나 조기 종료 조건이 발생하면 이 셋업은 더 이상 유효하지 않습니다."
            if structural_errors:
                approval_reason = "구조 검증 실패: " + " ".join(structural_errors)
                counter_thesis = "entry/SL/TP/leverage/fees/early-exit 중 하나라도 내부 모순이면 승인할 수 없습니다."
        else:
            adjustment = "Reduce size by 20% until confirmation candle closes and keep the fee buffer."
            approval_reason = (
                f"{payload.trader.name}'s {candidate.setupType or 'setup'} {candidate.side or ''} entry aligns the current structure with the proposed price map. "
                "Entries, stop, targets, fee-aware RR, and leverage are internally consistent. "
                "Approval remains valid only while the early-exit and invalidation rules stay intact."
            )
            counter_thesis = "If price accepts beyond invalidation or an early-exit rule fires, the setup is no longer valid."
            if structural_errors:
                approval_reason = "Structural validation failed: " + " ".join(structural_errors)
                counter_thesis = "The setup cannot be approved while entry/SL/TP/leverage/fees/early-exit fields conflict."
        facts = [
            {"code": "entry_geometry_checked", "labelKey": "reviewFact.entryGeometryChecked", "severity": "info"},
            {"code": "risk_plan_checked", "labelKey": "reviewFact.riskPlanChecked", "severity": "info"},
            {"code": "fee_buffer_checked", "labelKey": "reviewFact.feeBufferChecked", "severity": "info"},
        ]
        if payload.lossDiscipline:
            facts.append(
                {
                    "code": "loss_discipline_checked",
                    "labelKey": "reviewFact.lossDisciplineChecked",
                    "severity": "warn" if payload.lossDiscipline.get("active") else "info",
                }
            )
        return self.normalize_result(
            {
                "decision": decision,
                "confidence": confidence,
                "riskLevel": normalized_risk,
                "reviewCode": "ENTRY_REVIEW",
                "reviewFacts": facts,
                "riskFlags": structural_errors or [f"decision:{decision.lower()}"],
                "adjustments": (
                    [adjustment] + structural_errors
                    if decision in {"ADJUST_AND_APPROVE", "REJECT"}
                    else []
                ),
                "leverageOverride": None,
                "riskPercentOverride": None,
                "earlyExitRecommendations": candidate.earlyExitRules[:2],
                "approvalReason": approval_reason,
                "counterThesis": counter_thesis,
                "userSummary": None,
            }
        )

    async def review_position_management(
        self, payload: PositionManagementPayload
    ) -> PositionManagementResult:
        locale = "ko" if (payload.locale or "ko").lower().startswith("ko") else "en"
        event = payload.event
        suggested = (event.suggestedAction or "HOLD").upper()
        metrics = event.metrics or {}
        holding_policy = trader_holding_policy(payload.trader.id)
        progress_r = float(metrics.get("progressR") or 0)
        target_progress = float(metrics.get("targetProgress") or 0)
        age_seconds = float(metrics.get("ageSeconds") or 0)
        distance_percent = float(metrics.get("distancePercent") or 0)
        if event.eventType == "common_price_shock":
            adverse = bool(metrics.get("adverseToExposure"))
            favorable = bool(metrics.get("favorableToExposure"))
            if payload.exposure.kind == "order":
                suggested = "CANCEL_PENDING_ORDER" if adverse or distance_percent >= 0.45 else "HOLD"
            elif adverse and progress_r <= 0.1:
                suggested = "ADD_TO_POSITION" if progress_r >= -0.35 else "REDUCE_RISK"
            elif favorable and (target_progress >= 0.65 or progress_r >= 0.8):
                suggested = "TAKE_PARTIAL_PROFIT"
            elif favorable and progress_r >= 0.45 and target_progress < 0.65:
                suggested = "PYRAMID_POSITION"
            elif favorable and progress_r >= 0.35:
                suggested = "MOVE_STOP_TO_BREAKEVEN"
            else:
                suggested = "HOLD"
        elif event.eventType.endswith("_position_heartbeat"):
            if target_progress >= float(holding_policy.profit_protect_target_progress) or progress_r >= float(holding_policy.trail_review_progress_r):
                suggested = "TAKE_PARTIAL_PROFIT"
            elif progress_r >= 0.45 and target_progress < float(holding_policy.profit_protect_target_progress):
                suggested = "PYRAMID_POSITION"
            elif progress_r >= float(holding_policy.breakeven_progress_r):
                suggested = "MOVE_STOP_TO_BREAKEVEN"
            elif -0.45 < progress_r <= -0.2:
                suggested = "ADD_TO_POSITION"
            elif progress_r <= -0.45:
                suggested = "REDUCE_RISK"
            else:
                suggested = "HOLD"
        elif event.eventType.endswith("_pending_heartbeat"):
            if age_seconds >= 900 or distance_percent >= 0.45:
                suggested = "CANCEL_PENDING_ORDER"
            else:
                suggested = "HOLD"
        confidence = 82 if event.eventType == "common_price_shock" else 78 if event.severity == "HIGH" else 66
        action = {"type": suggested, "reason": event.reason}
        if suggested in {"MOVE_STOP", "MOVE_STOP_TO_BREAKEVEN", "TRAIL_STOP"}:
            entry = payload.exposure.entryPrice
            stop = payload.exposure.stopLoss
            price = float(payload.marketSnapshot.get("price") or entry or stop or 0)
            if suggested == "MOVE_STOP_TO_BREAKEVEN" and entry:
                action["price"] = entry
            elif payload.exposure.side == "LONG" and entry:
                action["price"] = max(float(stop or entry), min(float(entry), price))
            elif payload.exposure.side == "SHORT" and entry:
                action["price"] = min(float(stop or entry), max(float(entry), price))
        if suggested in {"TAKE_PARTIAL_PROFIT", "REDUCE_RISK", "REDUCE_SIZE"}:
            action["quantityFraction"] = 0.35 if event.severity == "HIGH" else 0.25
        if suggested in {"ADD_TO_POSITION", "PYRAMID_POSITION"}:
            action["quantityFraction"] = 0.2 if suggested == "ADD_TO_POSITION" else 0.25
            action["price"] = float(payload.marketSnapshot.get("price") or payload.exposure.entryPrice or payload.exposure.limitPrice or 0)
        if locale == "ko":
            if event.eventType == "common_price_shock":
                rationale = "BTC 1분 가격 변동이 급변 기준을 넘어 fast-market 모드로 진입했고 120초 후 재검토하도록 판단했습니다."
            else:
                rationale = f"{event.eventType} 이벤트를 감지했고 {holding_policy.name} 보유 정책 안에서 {suggested} 관리 판단을 검토했습니다."
            counter = "가격이 손절/익절 hard rule에 먼저 닿으면 AI 판단보다 paper risk engine 처리가 우선합니다."
        else:
            if event.eventType == "common_price_shock":
                rationale = "BTC one-minute price change crossed the fast-market threshold, so the agent set a 120-second follow-up review."
            else:
                rationale = f"Detected {event.eventType} and reviewed {suggested} inside the {holding_policy.name} holding policy."
            counter = "If hard stop/take-profit fires first, the paper risk engine overrides this AI decision."
        facts = [
            {"code": "management_event_reviewed", "labelKey": "reviewFact.managementEventReviewed", "severity": "info"},
            {"code": "holding_policy_checked", "labelKey": "reviewFact.holdingPolicyChecked", "severity": "info"},
            {"code": "hard_rules_priority", "labelKey": "reviewFact.hardRulesPriority", "severity": "warn"},
        ]
        return self.normalize_management_result(
            {
                "decision": suggested if suggested in {"HOLD", "CANCEL_PENDING_ORDER", "ADJUST_PENDING_ORDER", "MOVE_STOP", "MOVE_STOP_TO_BREAKEVEN", "TRAIL_STOP", "TAKE_PARTIAL_PROFIT", "CLOSE_POSITION", "REDUCE_RISK", "ADD_TO_POSITION", "PYRAMID_POSITION", "LET_PROFIT_RUN", "NEEDS_MORE_DATA"} else "HOLD",
                "confidence": confidence,
                "riskLevel": "HIGH" if event.severity == "HIGH" else "MEDIUM",
                "reviewCode": "POSITION_MANAGEMENT_REVIEW",
                "reviewFacts": facts,
                "riskFlags": [f"event:{event.eventType}", f"action:{suggested.lower()}"],
                "actions": [action],
                "riskChange": "REDUCE" if suggested not in {"HOLD", "LET_PROFIT_RUN"} else "UNCHANGED",
                "nextReviewInSeconds": 120 if event.eventType == "common_price_shock" else 300,
                "rationale": rationale,
                "counterThesis": counter,
                "userSummary": None,
            }
        )
