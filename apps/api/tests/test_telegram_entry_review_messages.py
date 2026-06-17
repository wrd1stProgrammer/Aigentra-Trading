from decimal import Decimal

from app.db import TradeEventRecord
from app.repositories import to_json
from app.subscribers import SubscriberPreferencesView, TelegramSettingsView
from app.telegram_messages import compose_event_message


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
