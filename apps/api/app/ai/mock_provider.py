from app.ai.base import BaseAIProvider
from app.ai.league_sentiment_models import LeagueSentimentOpinionResult, LeagueSentimentPayload
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
                "structuredReview": self._entry_structured_review(
                    payload=payload,
                    locale=locale,
                    decision=decision,
                    counter_thesis=counter_thesis,
                    structural_errors=structural_errors,
                ),
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
        next_review_seconds = 120 if event.eventType == "common_price_shock" else 300
        return self.normalize_management_result(
            {
                "decision": suggested if suggested in {"HOLD", "CANCEL_PENDING_ORDER", "ADJUST_PENDING_ORDER", "MOVE_STOP", "MOVE_STOP_TO_BREAKEVEN", "TRAIL_STOP", "TAKE_PARTIAL_PROFIT", "CLOSE_POSITION", "REDUCE_RISK", "ADD_TO_POSITION", "PYRAMID_POSITION", "LET_PROFIT_RUN", "NEEDS_MORE_DATA"} else "HOLD",
                "confidence": confidence,
                "riskLevel": "HIGH" if event.severity == "HIGH" else "MEDIUM",
                "reviewCode": "POSITION_MANAGEMENT_REVIEW",
                "reviewFacts": facts,
                "riskFlags": [f"event:{event.eventType}", f"action:{suggested.lower()}"],
                "structuredReview": self._management_structured_review(
                    payload=payload,
                    locale=locale,
                    suggested=suggested,
                    rationale=rationale,
                    counter_thesis=counter,
                    next_review_seconds=next_review_seconds,
                ),
                "actions": [action],
                "riskChange": "REDUCE" if suggested not in {"HOLD", "LET_PROFIT_RUN"} else "UNCHANGED",
                "nextReviewInSeconds": next_review_seconds,
                "rationale": rationale,
                "counterThesis": counter,
                "userSummary": None,
            }
        )

    async def review_league_sentiment(
        self, payload: LeagueSentimentPayload
    ) -> LeagueSentimentOpinionResult:
        locale = "ko" if (payload.locale or "ko").lower().startswith("ko") else "en"
        counts = payload.sourceCounts
        long_count = int(counts.get("activeLongPositions", 0)) + int(counts.get("pendingLongOrders", 0))
        short_count = int(counts.get("activeShortPositions", 0)) + int(counts.get("pendingShortOrders", 0))
        active_count = int(counts.get("activePositions", 0))
        pending_count = int(counts.get("pendingOrders", 0))
        losses = int(counts.get("recentStopLosses", 0))
        wins = int(counts.get("recentTakeProfits", 0))

        if losses >= max(2, wins + 2):
            bias = "RISK_OFF"
            confidence = 62
        elif long_count > short_count:
            bias = "LONG_BIASED"
            confidence = 64 if short_count else 70
        elif short_count > long_count:
            bias = "SHORT_BIASED"
            confidence = 64 if long_count else 70
        elif active_count or pending_count:
            bias = "MIXED"
            confidence = 55
        else:
            bias = "NEUTRAL"
            confidence = 45

        risk_level = "HIGH" if losses >= 2 or bias == "RISK_OFF" else "MEDIUM"
        if locale == "ko":
            headline = "Aigentra 트레이더들의 방향이 한 시간 단위로 다시 정리됐습니다."
            summary = (
                f"현재 활성 포지션 {active_count}건, 진입 대기 {pending_count}건을 기준으로 보면 LONG {long_count}건과 SHORT {short_count}건이 비교됩니다. "
                "최근 익절과 손절 기록은 방향보다 리스크 판단에 더 크게 반영했습니다."
            )
            action = "새로운 한 시간 캔들이 마감될 때까지 활성 포지션의 무효화 조건과 신규 대기 주문 체결 여부를 함께 확인하세요."
            context = f"LONG {long_count}건 / SHORT {short_count}건, 최근 익절 {wins}건 / 손절 {losses}건입니다."
            drivers = [
                f"진입 중 포지션 {active_count}건",
                f"진입 대기 주문 {pending_count}건",
                f"최근 익절 {wins}건과 손절 {losses}건",
            ]
            risks = ["한쪽 방향으로 확실히 쏠리지 않으면 짧은 변동에 해석이 흔들릴 수 있습니다."]
            watch = ["다음 1시간 마감 후 LONG/SHORT 활성 건수가 바뀌는지 확인하세요."]
        else:
            headline = "Aigentra trader context has been refreshed for the current hour."
            summary = (
                f"The league currently has {active_count} active positions and {pending_count} pending entries, "
                f"with LONG {long_count} versus SHORT {short_count}. Recent TP/SL history is used mostly as risk context."
            )
            action = "Until the next hourly close, monitor invalidation levels and whether pending entries actually fill."
            context = f"LONG {long_count} / SHORT {short_count}; recent TP {wins} / SL {losses}."
            drivers = [
                f"{active_count} active positions",
                f"{pending_count} pending entries",
                f"{wins} recent take-profits and {losses} stop-losses",
            ]
            risks = ["If direction remains split, short-term moves can change the read quickly."]
            watch = ["Check whether active LONG/SHORT counts change after the next hourly close."]

        return self.normalize_league_sentiment_result(
            {
                "bias": bias,
                "confidence": confidence,
                "riskLevel": risk_level,
                "headline": headline,
                "summary": summary,
                "keyDrivers": drivers,
                "risks": risks,
                "watchConditions": watch,
                "action": action,
                "longShortContext": context,
                "sourceCounts": counts,
            }
        )

    def _entry_structured_review(
        self,
        *,
        payload: TradeReviewPayload,
        locale: str,
        decision: str,
        counter_thesis: str,
        structural_errors: list[str],
    ) -> dict:
        candidate = payload.candidate
        if locale == "ko":
            verdicts = {
                "APPROVE": "진입 승인",
                "ADJUST_AND_APPROVE": "조정 후 승인",
                "DEFER": "보류",
                "REJECT": "진입 거절",
                "NEEDS_MORE_DATA": "추가 확인 필요",
            }
            setup = candidate.setupType or "셋업"
            headline = f"{payload.trader.name}의 {setup}은 {verdicts.get(decision, '검토 완료')}입니다."
            action = "진입 계획을 유지하되 손절과 조기 종료 조건을 먼저 확인하세요."
            if decision == "ADJUST_AND_APPROVE":
                action = "규모나 레버리지를 낮춘 뒤 진입 계획을 진행하세요."
            elif decision in {"REJECT", "DEFER", "NEEDS_MORE_DATA"}:
                action = "지금은 진입하지 말고 부족한 확인 조건이 채워질 때까지 기다리세요."
            key_reasons = structural_errors[:3] or [
                "진입가, 손절, 익절 위치가 같은 매매 방향으로 정렬돼 있습니다.",
                "손익비와 수수료 버퍼가 최소 조건을 통과했습니다.",
                "무효화와 조기 종료 규칙이 있어 손실 확대 전에 끊을 기준이 있습니다.",
            ]
            risks = structural_errors[:2] or [counter_thesis]
            watch = candidate.earlyExitRules[:2] or ([candidate.invalidation] if candidate.invalidation else [])
            return {
                "verdict": verdicts.get(decision, "검토 완료"),
                "headline": headline,
                "action": action,
                "keyReasons": key_reasons,
                "risks": risks,
                "watchConditions": watch or ["가격이 무효화 기준에 안착하는지 확인하세요."],
                "managerNote": "숫자가 좋아도 무효화 기준이 먼저 깨지면 진입 논리는 취소됩니다.",
            }

        verdicts = {
            "APPROVE": "Entry approved",
            "ADJUST_AND_APPROVE": "Approve with adjustment",
            "DEFER": "Defer",
            "REJECT": "Reject",
            "NEEDS_MORE_DATA": "Needs more data",
        }
        setup = candidate.setupType or "setup"
        action = "Keep the entry plan, but confirm the stop and early-exit rules first."
        if decision == "ADJUST_AND_APPROVE":
            action = "Proceed only after reducing size or leverage."
        elif decision in {"REJECT", "DEFER", "NEEDS_MORE_DATA"}:
            action = "Do not enter until the missing confirmation appears."
        return {
            "verdict": verdicts.get(decision, "Reviewed"),
            "headline": f"{payload.trader.name}'s {setup} is {verdicts.get(decision, 'reviewed').lower()}.",
            "action": action,
            "keyReasons": structural_errors[:3] or [
                "Entry, stop, and targets point in the same trade direction.",
                "Risk/reward and fee buffer meet the minimum checks.",
                "Invalidation and early-exit rules define when the thesis is wrong.",
            ],
            "risks": structural_errors[:2] or [counter_thesis],
            "watchConditions": candidate.earlyExitRules[:2] or ([candidate.invalidation] if candidate.invalidation else ["Watch for price acceptance beyond invalidation."]),
            "managerNote": "Even with good geometry, the setup is cancelled if invalidation breaks first.",
        }

    def _management_structured_review(
        self,
        *,
        payload: PositionManagementPayload,
        locale: str,
        suggested: str,
        rationale: str,
        counter_thesis: str,
        next_review_seconds: int,
    ) -> dict:
        if locale == "ko":
            action_labels = {
                "HOLD": "유지",
                "CANCEL_PENDING_ORDER": "대기 주문 취소",
                "ADJUST_PENDING_ORDER": "대기 주문 조정",
                "MOVE_STOP": "손절선 조정",
                "MOVE_STOP_TO_BREAKEVEN": "손절선 본절 이동",
                "TRAIL_STOP": "추적 손절",
                "TAKE_PARTIAL_PROFIT": "부분 익절",
                "CLOSE_POSITION": "포지션 종료",
                "REDUCE_RISK": "리스크 축소",
                "ADD_TO_POSITION": "계획 내 추가 진입",
                "PYRAMID_POSITION": "수익 중 추가 진입",
                "LET_PROFIT_RUN": "수익 추세 유지",
            }
            label = action_labels.get(suggested, "관리 보류")
            return {
                "verdict": label,
                "headline": f"현재 판단은 {label}입니다.",
                "action": f"{label} 기준으로 관리하고 {next_review_seconds}초 뒤 다시 확인하세요.",
                "keyReasons": [
                    payload.event.reason,
                    "트레이더별 보유 정책과 현재 노출 상태를 함께 확인했습니다.",
                    "손절/익절 하드룰은 AI 판단보다 먼저 적용됩니다.",
                ],
                "risks": [counter_thesis],
                "watchConditions": [
                    "가격이 손절 또는 익절 기준에 먼저 닿는지 확인하세요.",
                    f"{next_review_seconds}초 뒤 같은 논리가 유지되는지 재검토하세요.",
                ],
                "managerNote": rationale,
            }

        label = suggested.replace("_", " ").title()
        return {
            "verdict": label,
            "headline": f"The current management call is {label}.",
            "action": f"Manage under {label} and review again in {next_review_seconds} seconds.",
            "keyReasons": [
                payload.event.reason,
                "The trader holding policy was checked against the current exposure.",
                "Hard stop/take-profit rules still override the AI decision.",
            ],
            "risks": [counter_thesis],
            "watchConditions": [
                "Watch whether price reaches stop or take-profit first.",
                f"Review whether the same thesis still holds in {next_review_seconds} seconds.",
            ],
            "managerNote": rationale,
        }
