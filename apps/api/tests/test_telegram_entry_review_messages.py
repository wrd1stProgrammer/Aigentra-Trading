from decimal import Decimal

from app.db import PositionManagementReviewRecord, TradeEventRecord
from app.repositories import to_json
from app.subscribers import SubscriberPreferencesView, TelegramSettingsView
from app.telegram_messages import compose_event_message, compose_management_message


def test_entry_alert_uses_ai_review_summary_when_available():
    preferences = SubscriberPreferencesView(
        user_id="google-1",
        email="operator@example.com",
        subscription_status="active",
        favorite_trader_ids=["session-raider"],
        telegram_settings=TelegramSettingsView(
            enabled=True,
            chat_id="123456789",
            event_types=["pending_entry"],
            min_return_pct=0,
        ),
        locale="ko",
    )
    event = TradeEventRecord(
        trader_id="session-raider",
        symbol="BTCUSDT",
        event_type="paper_order_created",
        price=Decimal("64862.2"),
        realized_pnl=Decimal("0"),
        payload_json=to_json(
            {
                "reason": "Confirmed BTC setup participation",
                "aiStructuredReview": {
                    "verdict": "조정 후 승인",
                    "headline": "BTC가 세션 범위 아래로 확인된 하락 돌파를 보이고 있습니다.",
                    "action": "주문이 채워지지 않으면 2개의 15분 캔들 후 자동 취소하세요.",
                    "keyReasons": ["1시간 약세 추세가 SHORT 방향을 확인합니다.", "위험 보상 비율 1.45가 최소값을 초과합니다."],
                    "risks": ["15분 거래량이 약합니다."],
                    "watchConditions": ["15분 종가가 64862.2 위로 돌파하면 종료하세요."],
                    "managerNote": "크기 감소와 엄격한 만료 규칙이 필수입니다.",
                },
                "aiApprovalReason": "승인 근거가 여기에 있습니다.",
            }
        ),
    )

    text = compose_event_message(preferences, event, "pending_entry")

    assert "Session Raider · BTCUSDT" in text
    assert "조정 후 승인" in text
    assert "BTC가 세션 범위 아래로 확인된 하락 돌파" in text
    assert "지금 할 일: 주문이 채워지지 않으면 2개의 15분 캔들 후 자동 취소하세요." in text
    assert "핵심 이유: 1시간 약세 추세가 SHORT 방향을 확인합니다. · 위험 보상 비율 1.45가 최소값을 초과합니다." in text
    assert "주의할 점: 15분 거래량이 약합니다." in text
    assert "다음 확인 조건: 15분 종가가 64862.2 위로 돌파하면 종료하세요." in text
    assert "Event:" not in text
    assert "Reason: Confirmed BTC setup participation" not in text


def test_entry_alert_uses_nested_ai_review_summary_when_available():
    preferences = SubscriberPreferencesView(
        user_id="google-1",
        email="operator@example.com",
        subscription_status="active",
        favorite_trader_ids=["session-raider"],
        telegram_settings=TelegramSettingsView(
            enabled=True,
            chat_id="123456789",
            event_types=["position_entry"],
            min_return_pct=0,
        ),
        locale="ko",
    )
    event = TradeEventRecord(
        trader_id="session-raider",
        symbol="BTCUSDT",
        event_type="order_filled",
        price=Decimal("65342.2"),
        realized_pnl=Decimal("0"),
        payload_json=to_json(
            {
                "reason": "Confirmed BTC setup participation",
                "aiReview": {
                    "decision": "ADJUST_AND_APPROVE",
                    "structuredReview": {
                        "verdict": "조정 후 승인",
                        "headline": "1시간 약세 추세가 SHORT 방향을 지지합니다.",
                        "action": "빠른 만료 규칙을 적용해 주문을 관리하세요.",
                    },
                    "approvalReason": "승인 근거가 여기에 있습니다.",
                },
            }
        ),
    )

    text = compose_event_message(preferences, event, "position_entry")

    assert "조정 후 승인" in text
    assert "1시간 약세 추세가 SHORT 방향을 지지합니다." in text
    assert "지금 할 일: 빠른 만료 규칙을 적용해 주문을 관리하세요." in text
    assert "Event:" not in text
    assert "Reason: Confirmed BTC setup participation" not in text


def test_management_alert_includes_position_context_readably():
    preferences = SubscriberPreferencesView(
        user_id="google-1",
        email="operator@example.com",
        subscription_status="active",
        favorite_trader_ids=["liquidity-reaper"],
        telegram_settings=TelegramSettingsView(
            enabled=True,
            chat_id="123456789",
            event_types=["ai_review_high"],
            min_return_pct=0,
        ),
        locale="ko",
    )
    review = PositionManagementReviewRecord(
        trader_id="liquidity-reaper",
        symbol="BTCUSDT",
        status="ok",
        event_type="liquidity_position_heartbeat",
        phase="OPEN_POSITION",
        provider="anthropic",
        model="claude-haiku-4-5",
        decision="HOLD",
        confidence=84,
        action_type="MOVE_STOP_TO_BREAKEVEN",
        payload_json=to_json(
            {
                "event": {
                    "severity": "HIGH",
                    "phase": "OPEN_POSITION",
                    "metrics": {
                        "price": 63920.25,
                        "entryPrice": 63800,
                        "stopLoss": 63666,
                        "takeProfit": 64500,
                        "unrealizedPnl": 42.3,
                    },
                },
                "exposure": {
                    "kind": "position",
                    "id": 7,
                    "status": "open",
                    "side": "LONG",
                    "quantity": 0.2,
                    "entryPrice": 63800,
                    "stopLoss": 63666,
                    "takeProfit": 64500,
                    "leverage": 5,
                    "unrealizedPnl": 42.3,
                },
                "review": {
                    "decision": "HOLD",
                    "confidence": 84,
                    "riskLevel": "HIGH",
                    "structuredReview": {
                        "verdict": "유지",
                        "headline": "스윕 재수집 논리는 아직 살아 있습니다.",
                        "action": "손절은 본전으로 두고 15분 종가가 63666 아래로 내려가면 즉시 종료하세요.",
                        "keyReasons": ["포지션은 소폭 이익 상태입니다.", "손절이 본전으로 올라와 있습니다."],
                        "risks": ["1시간 약세 헤드윈드가 남아 있습니다."],
                        "watchConditions": ["15분 종가 63666 이탈을 확인하세요."],
                        "managerNote": "즉시 방어 조치보다는 무효화 조건 감시가 우선입니다.",
                    },
                    "rationale": "현재 포지션은 소폭 이익 상태이며 손절이 본전으로 올라와 있습니다.",
                },
            }
        ),
    )

    text = compose_management_message(preferences, review, "ai_review_high")

    assert "[AI Trader League] AI 중간 리뷰 높음" in text
    assert "Liquidity Reaper · BTCUSDT" in text
    assert "\n\n상태\n  단계: OPEN_POSITION\n  판단: HOLD\n  조치: MOVE_STOP_TO_BREAKEVEN\n  신뢰도: 84" in text
    assert "\n\n포지션\n  방향: LONG · 5x\n  진입가: 63,800\n  현재가: 63,920.25" in text
    assert "  손절가: 63,666\n  익절가: 64,500\n  PnL: +42.30" in text
    assert "\n\n요약\n  유지 · 스윕 재수집 논리는 아직 살아 있습니다." in text
    assert "\n\n지금 할 일\n  손절은 본전으로 두고 15분 종가가 63666 아래로 내려가면 즉시 종료하세요." in text
    assert "\n\n핵심 이유\n  포지션은 소폭 이익 상태입니다. · 손절이 본전으로 올라와 있습니다." in text
    assert "\n\n주의할 점\n  1시간 약세 헤드윈드가 남아 있습니다." in text
    assert "\n\n다음 확인 조건\n  15분 종가 63666 이탈을 확인하세요." in text
    assert "\n\n관리 메모\n  즉시 방어 조치보다는 무효화 조건 감시가 우선입니다." in text
    assert "\n\n판단 근거\n  현재 포지션은 소폭 이익 상태이며 손절이 본전으로 올라와 있습니다." in text
    assert "Reason:" not in text


def test_management_alert_respects_selected_review_sections():
    preferences = SubscriberPreferencesView(
        user_id="google-1",
        email="operator@example.com",
        subscription_status="active",
        favorite_trader_ids=["range-maker"],
        telegram_settings=TelegramSettingsView(
            enabled=True,
            chat_id="123456789",
            event_types=["ai_review_medium"],
            review_sections=["position", "action", "risks"],
            min_return_pct=0,
        ),
        locale="ko",
    )
    review = PositionManagementReviewRecord(
        trader_id="range-maker",
        symbol="BTCUSDT",
        status="ok",
        event_type="range_position_heartbeat",
        phase="OPEN_POSITION",
        provider="openai",
        model="gpt-4.1-mini",
        decision="HOLD",
        confidence=83,
        action_type="HOLD",
        payload_json=to_json(
            {
                "event": {"severity": "MEDIUM", "phase": "OPEN_POSITION", "metrics": {"price": 64574.2}},
                "exposure": {
                    "kind": "position",
                    "side": "LONG",
                    "entryPrice": 64092.24,
                    "stopLoss": 63236.5,
                    "takeProfit": 65464.3,
                    "leverage": 5,
                    "unrealizedPnl": 246.44,
                },
                "review": {
                    "structuredReview": {
                        "verdict": "유지",
                        "headline": "범위 하단 반등 논리는 유지됩니다.",
                        "action": "지금은 보유하세요.",
                        "keyReasons": ["4시간 횡보 범위가 유지됩니다."],
                        "risks": ["1시간 약세가 남아 있습니다."],
                        "watchConditions": ["15분 종가 64650 위 수용 여부를 확인하세요."],
                    },
                    "rationale": "짧은 근거",
                },
            }
        ),
    )

    text = compose_management_message(preferences, review, "ai_review_medium")

    assert "\n\n포지션\n  방향: LONG · 5x" in text
    assert "\n\n지금 할 일\n  지금은 보유하세요." in text
    assert "\n\n주의할 점\n  1시간 약세가 남아 있습니다." in text
    assert "\n\n상태\n" not in text
    assert "\n\n요약\n" not in text
    assert "\n\n핵심 이유\n" not in text
    assert "\n\n다음 확인 조건\n" not in text
    assert "\n\n판단 근거\n" not in text
