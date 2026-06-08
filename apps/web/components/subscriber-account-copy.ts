export const SUBSCRIBER_ACCOUNT_COPY = {
  ko: {
    title: "구독자 계정",
    subtitle: "관심 트레이더와 Telegram 알림 조건을 한 곳에서 관리합니다.",
    active: "활성 구독",
    favorites: "관심 트레이더",
    favoritesHint: "리더보드에서 우선 확인할 전략 데스크를 선택하세요.",
    alerts: "Telegram 알림",
    alertsHint: "진입, 청산, 관리, 리스크 이벤트 중 필요한 신호만 받습니다.",
    enabled: "알림 켜짐",
    disabled: "알림 꺼짐",
    chatId: "Telegram chat ID",
    minReturnPct: "최소 수익률 %",
    saved: "저장됨",
    saving: "저장 중",
    saveFailed: "저장 실패",
    noFavorites: "선택 없음",
    signaled: "전송 준비",
    eventLabels: { entry: "진입", exit: "청산", management: "관리", risk: "리스크" },
    readiness: {
      disabled: "알림이 꺼져 있습니다.",
      missing_server_token: "서버 Telegram 토큰이 필요합니다.",
      missing_chat_id: "chat ID를 입력하세요.",
      missing_event_types: "알림 유형을 하나 이상 선택하세요.",
      ready: "Telegram 전송 준비 완료"
    }
  },
  en: {
    title: "Subscriber account",
    subtitle: "Manage favorite traders and Telegram alert rules in one place.",
    active: "Active subscription",
    favorites: "Favorite traders",
    favoritesHint: "Choose the strategy desks to scan first on the leaderboard.",
    alerts: "Telegram alerts",
    alertsHint: "Receive only the entry, exit, management, or risk events you need.",
    enabled: "Alerts on",
    disabled: "Alerts off",
    chatId: "Telegram chat ID",
    minReturnPct: "Minimum return %",
    saved: "Saved",
    saving: "Saving",
    saveFailed: "Save failed",
    noFavorites: "None selected",
    signaled: "Ready to send",
    eventLabels: { entry: "Entry", exit: "Exit", management: "Management", risk: "Risk" },
    readiness: {
      disabled: "Alerts are turned off.",
      missing_server_token: "Server Telegram token is required.",
      missing_chat_id: "Enter a chat ID.",
      missing_event_types: "Select at least one alert type.",
      ready: "Telegram delivery is ready"
    }
  }
} as const;
