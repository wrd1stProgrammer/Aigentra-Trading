from app.ai.base import BaseAIProvider
from app.ai.league_sentiment_models import LeagueSentimentLocalizedOpinion, LeagueSentimentOpinionResult, LeagueSentimentPayload
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
        if payload.lossDiscipline or payload.recentLossReviews:
            facts.append(
                {
                    "code": "loss_discipline_checked",
                    "labelKey": "reviewFact.lossDisciplineChecked",
                    "severity": "warn" if payload.lossDiscipline.get("active") or payload.recentLossReviews else "info",
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
        counts = payload.sourceCounts
        long_count = int(counts.get("activeLongPositions", 0)) + int(counts.get("pendingLongOrders", 0))
        short_count = int(counts.get("activeShortPositions", 0)) + int(counts.get("pendingShortOrders", 0))
        active_count = int(counts.get("activePositions", 0))
        pending_count = int(counts.get("pendingOrders", 0))
        losses = int(counts.get("recentStopLosses", 0))
        wins = int(counts.get("recentTakeProfits", 0))
        active_position_word = "position" if active_count == 1 else "positions"
        pending_entry_word = "entry" if pending_count == 1 else "entries"

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
        display_symbol = payload.symbol.upper().removesuffix("USDT") or payload.symbol.upper()
        market = payload.market if isinstance(payload.market, dict) else {}
        timeframes = market.get("timeframes") if isinstance(market.get("timeframes"), dict) else {}
        primary_key = next((key for key in ("1h", "15m", "4h", "1d") if isinstance(timeframes.get(key), dict)), None)
        primary = timeframes.get(primary_key, {}) if primary_key else {}
        primary_label = (primary_key or "1h").upper()
        primary_trend = str(primary.get("trend") or "mixed").replace("_", " ")
        primary_trend_ko = {
            "uptrend": "상승",
            "bullish": "상승",
            "downtrend": "하락",
            "bearish": "하락",
            "range": "박스권",
            "sideways": "횡보",
            "mixed": "혼조",
        }.get(str(primary.get("trend") or "mixed").lower(), "혼조")
        primary_trend_by_locale = {
            "en": primary_trend,
            "ru": {
                "uptrend": "восходящего тренда",
                "bullish": "бычьего тренда",
                "downtrend": "нисходящего тренда",
                "bearish": "медвежьего тренда",
                "range": "диапазона",
                "sideways": "бокового движения",
                "mixed": "смешанной структуры",
            }.get(str(primary.get("trend") or "mixed").lower(), "смешанной структуры"),
            "pt-BR": {
                "uptrend": "de alta",
                "bullish": "compradora",
                "downtrend": "de baixa",
                "bearish": "vendedora",
                "range": "em faixa",
                "sideways": "lateral",
                "mixed": "mista",
            }.get(str(primary.get("trend") or "mixed").lower(), "mista"),
            "tr": {
                "uptrend": "yükseliş trendi",
                "bullish": "alıcı ağırlıklı trend",
                "downtrend": "düşüş trendi",
                "bearish": "satıcı ağırlıklı trend",
                "range": "bant yapısı",
                "sideways": "yatay yapı",
                "mixed": "karışık yapı",
            }.get(str(primary.get("trend") or "mixed").lower(), "karışık yapı"),
        }
        anchor_value = primary.get("ema50") or primary.get("close") or market.get("price")
        try:
            anchor = f"{float(anchor_value):,.0f}"
        except (TypeError, ValueError):
            anchor = ""

        def localized(locale: str) -> LeagueSentimentLocalizedOpinion:
            if locale == "ko":
                direction = "롱" if bias == "LONG_BIASED" else "숏" if bias == "SHORT_BIASED" else "혼조" if bias == "MIXED" else "방어"
                headline = (
                    f"{display_symbol}는 {primary_label} {primary_trend_ko} 흐름에서 리그 기준 {direction} 압력이 보이지만, "
                    "지금은 새 방향 추격보다 무효화 확인이 먼저입니다."
                )
                summary = (
                    f"리그 트레이더의 활성 포지션 {active_count}건과 진입 대기 {pending_count}건은 LONG {long_count}건, SHORT {short_count}건의 압력을 만듭니다. "
                    f"최근 익절 {wins}건과 손절 {losses}건은 방향보다 신뢰도와 방어 필요성을 더 크게 흔듭니다. "
                    "따라서 한쪽 숫자만 따라가기보다 실제 체결 변화와 무효화 조건을 같이 확인해야 합니다."
                )
                action = (
                    f"다음 생성 전까지 {primary_label} 기준 {anchor} 유지 여부와 대기 주문 체결 변화를 확인하세요; "
                    "유지하면 현재 리그 해석을 유지하고, 이탈하면 방어 우선으로 읽습니다."
                    if anchor
                    else "다음 생성 전까지 활성 포지션의 보호 손절/무효화 조건과 대기 주문의 실제 체결 변화를 확인하세요."
                )
                context = f"LONG {long_count}건 / SHORT {short_count}건이며, 최근 결과는 익절 {wins}건 / 손절 {losses}건입니다."
                drivers = [
                    f"활성 포지션 {active_count}건은 이미 리스크가 걸린 트레이더 수라 현재 방향 압력을 보여줍니다.",
                    f"진입 대기 주문 {pending_count}건은 아직 확정 포지션이 아니므로 체결 전까지는 방향 신뢰도를 낮춥니다.",
                ]
                risks = ["활성 수와 대기 수를 같은 강도로 보면 아직 체결되지 않은 셋업을 과신할 수 있습니다."]
                confidence_reason = "시장 흐름과 리그 노출은 읽을 수 있지만, mock 경로는 실제 AI 재검증이 없어 신뢰도를 제한합니다."
            elif locale == "ru":
                direction = "LONG" if bias == "LONG_BIASED" else "SHORT" if bias == "SHORT_BIASED" else "смешанный" if bias == "MIXED" else "защитный"
                headline = f"{display_symbol} находится в структуре {primary_label} {primary_trend_by_locale['ru']}; давление лиги {direction}, но сейчас важнее проверка инвалидирования, а не погоня."
                summary = (
                    f"У трейдеров лиги {active_count} активных позиций и {pending_count} ожидающих входов: LONG {long_count} против SHORT {short_count}. "
                    f"Недавние тейк-профиты {wins} и стоп-лоссы {losses} важнее для доверия и защиты, чем для направления. "
                    "Смотрите не только на счет сторон, а на исполнение ожидающих входов и сохранение зон инвалидирования."
                )
                action = (
                    f"До следующей генерации проверьте, удерживает ли {display_symbol} зону {primary_label} около {anchor}; "
                    "удержание сохраняет чтение лиги, потеря делает защиту приоритетом."
                    if anchor
                    else "До следующей генерации сначала проверьте уровни инвалидирования активных позиций, затем исполнение ожидающих входов."
                )
                context = f"LONG {long_count} / SHORT {short_count}; недавние TP {wins} / SL {losses}."
                drivers = [
                    f"{active_count} активных позиций показывают, где трейдеры уже держат риск.",
                    f"{pending_count} ожидающих входов могут изменить перекос только после исполнения.",
                ]
                risks = ["Если считать ожидающие ордера исполненной экспозицией, перекос будет выглядеть сильнее реального."]
                confidence_reason = "Доверие ограничено: mock-путь видит рынок и лигу, но не выполняет живой второй AI-синтез."
            elif locale == "pt-BR":
                direction = "LONG" if bias == "LONG_BIASED" else "SHORT" if bias == "SHORT_BIASED" else "mista" if bias == "MIXED" else "defensiva"
                headline = f"{display_symbol} está em leitura {primary_label} {primary_trend_by_locale['pt-BR']} com pressão {direction} da liga, mas a prioridade ainda é validar a invalidação, não perseguir."
                summary = (
                    f"Os traders da liga têm {active_count} posições ativas e {pending_count} entradas pendentes, com LONG {long_count} contra SHORT {short_count}. "
                    f"Os take-profits {wins} e stop-losses {losses} recentes pesam mais na confiança e defesa do que na direção. "
                    "Não leia só a contagem de lados; confirme se entradas pendentes executam e se as áreas de invalidação seguem válidas."
                )
                action = (
                    f"Até a próxima geração, veja se {display_symbol} mantém a área {primary_label} perto de {anchor}; "
                    "se mantiver, preserva a leitura da liga, se perder, a defesa vira prioridade."
                    if anchor
                    else "Até a próxima geração, confira primeiro as áreas de invalidação ativas e depois se as entradas pendentes executam."
                )
                context = f"LONG {long_count} / SHORT {short_count}; TP recentes {wins} / SL {losses}."
                drivers = [
                    f"{active_count} posições ativas mostram onde os traders já colocaram risco.",
                    f"{pending_count} entradas pendentes só mudam o viés depois de executarem.",
                ]
                risks = ["Tratar ordens pendentes como exposição preenchida pode deixar a leitura mais forte do que ela é."]
                confidence_reason = "A confiança fica limitada porque o mock vê mercado e liga, mas não roda uma segunda síntese de AI ao vivo."
            elif locale == "tr":
                direction = "LONG" if bias == "LONG_BIASED" else "SHORT" if bias == "SHORT_BIASED" else "karışık" if bias == "MIXED" else "savunmacı"
                headline = f"{display_symbol} {primary_label} {primary_trend_by_locale['tr']} okumasında ve lig baskısı {direction}; yine de bu yeni kovalamadan çok geçersizlik kontrolü."
                summary = (
                    f"Lig traderlarında {active_count} aktif pozisyon ve {pending_count} bekleyen giriş var; LONG {long_count}, SHORT {short_count}. "
                    f"Son take-profit {wins} ve stop-loss {losses} sonuçları yön tahmininden çok güven ve savunma filtresi olarak okunmalı. "
                    "Sadece taraf sayısına bakmayın; bekleyen girişlerin gerçekleşmesini ve aktif geçersizlik alanlarının korunmasını doğrulayın."
                )
                action = (
                    f"Sonraki üretime kadar {display_symbol} {primary_label} alanını {anchor} civarında koruyor mu izleyin; "
                    "korursa lig okuması sürer, kaybederse savunma öncelik kazanır."
                    if anchor
                    else "Sonraki üretime kadar önce aktif geçersizlik/stop alanlarını, sonra bekleyen girişlerin gerçekleşip gerçekleşmediğini kontrol edin."
                )
                context = f"LONG {long_count} / SHORT {short_count}; son TP {wins} / SL {losses}."
                drivers = [
                    f"{active_count} aktif pozisyon traderların nerede risk aldığını gösterir.",
                    f"{pending_count} bekleyen giriş ancak gerçekleşirse eğilimi değiştirir.",
                ]
                risks = ["Bekleyen emirleri gerçekleşmiş pozisyon gibi okumak eğilimi olduğundan güçlü gösterebilir."]
                confidence_reason = "Güven sınırlı; mock yolu piyasa ve lig durumunu görür ama canlı ikinci AI sentezi çalıştırmaz."
            else:
                direction = "long" if bias == "LONG_BIASED" else "short" if bias == "SHORT_BIASED" else "mixed" if bias == "MIXED" else "defensive"
                headline = f"{display_symbol} is in a {primary_label} {primary_trend} read with a {direction} league skew, but this is still an invalidation-check read rather than a fresh chase."
                summary = (
                    f"League traders have {active_count} active {active_position_word} and {pending_count} pending {pending_entry_word}, with LONG {long_count} versus SHORT {short_count}. "
                    f"Recent take-profits {wins} and stop-losses {losses} matter less as direction and more as a confidence and defense filter. "
                    "Do not read the side count alone as a signal; confirm whether pending entries fill and whether active invalidation levels hold."
                )
                action = (
                    f"Until the next generation, check whether {display_symbol} holds the {primary_label} area near {anchor}; "
                    "holding preserves the league read, losing it makes defense the priority."
                    if anchor
                    else "Until the next generation, check active invalidation/stop levels first, then see whether pending entries actually fill."
                )
                context = f"LONG {long_count} / SHORT {short_count}; recent TP {wins} / SL {losses}."
                drivers = [
                    f"{active_count} active positions show where traders already have risk on.",
                    f"{pending_count} pending entries can change the skew, but only after they fill.",
                ]
                risks = ["Treating pending orders like filled exposure can make the read look stronger than it is."]
                confidence_reason = "Confidence is capped because this mock path has market and league state, but no live second-pass AI synthesis."
            return LeagueSentimentLocalizedOpinion(
                confidenceReason=confidence_reason,
                brief={"conclusion": headline, "reason": summary, "watch": action},
                headline=headline,
                summary=summary,
                keyDrivers=drivers,
                risks=risks,
                watchConditions=[action],
                action=action,
                longShortContext=context,
            )

        translations = {
            "en": localized("en"),
            "ko": localized("ko"),
            "ru": localized("ru"),
            "pt-BR": localized("pt-BR"),
            "tr": localized("tr"),
        }
        source = translations["en"]

        return self.normalize_league_sentiment_result(
            {
                "bias": bias,
                "confidence": confidence,
                "riskLevel": risk_level,
                "confidenceReason": source.confidenceReason,
                "brief": source.brief.model_dump(),
                "headline": source.headline,
                "summary": source.summary,
                "keyDrivers": source.keyDrivers,
                "risks": source.risks,
                "watchConditions": source.watchConditions,
                "action": source.action,
                "longShortContext": source.longShortContext,
                "sourceCounts": counts,
                "translations": {locale: localized_opinion.model_dump() for locale, localized_opinion in translations.items()},
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
                "title": f"{label}보다 조건을 먼저 봅니다",
                "verdict": label,
                "headline": f"현재 포지션은 {label} 판단이지만, 트레이더 기준의 다음 조건이 먼저입니다.",
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
            "title": f"{label} needs a trigger",
            "verdict": label,
            "headline": f"The current call is {label}, but the trader trigger decides the next change.",
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
