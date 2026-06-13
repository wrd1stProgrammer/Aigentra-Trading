import type { Locale } from "@/lib/i18n";

export type LandingCopy = {
  readonly heroEyebrow: string;
  readonly heroTitle: string;
  readonly heroSubtitle: string;
  readonly primaryCta: string;
  readonly secondaryCta: string;
  readonly proofRating: string;
  readonly proofLabel: string;
  readonly proofBadge: string;
  readonly proofTitle: string;
  readonly proofSubtitle: string;
  readonly videoTitle: string;
  readonly videoSubtitle: string;
  readonly stats: readonly { readonly label: string; readonly value: string; readonly detail: string }[];
  readonly steps: readonly { readonly title: string; readonly body: string }[];
  readonly agentSystemTitle: string;
  readonly agentSystemSubtitle: string;
  readonly agentCards: readonly { readonly title: string; readonly body: string }[];
  readonly getStartedTitle: string;
  readonly getStartedSubtitle: string;
  readonly getStartedCta: string;
  readonly secondVideoTitle: string;
  readonly alertsTitle: string;
  readonly alertsSubtitle: string;
  readonly alertsCta: string;
  readonly alertCards: readonly { readonly title: string; readonly body: string }[];
  readonly pricingTitle: string;
  readonly pricingSubtitle: string;
  readonly pricingPlans: readonly {
    readonly name: string;
    readonly price: string;
    readonly cadence: string;
    readonly description: string;
    readonly features: readonly string[];
    readonly cta: string;
  }[];
  readonly testimonialsTitle: string;
  readonly testimonials: readonly { readonly quote: string; readonly author: string; readonly role: string }[];
  readonly trustTitle: string;
  readonly trustBody: string;
  readonly faqTitle: string;
  readonly faqs: readonly { readonly question: string; readonly answer: string }[];
  readonly aboutTitle: string;
  readonly aboutBody: string;
  readonly aboutPoints: readonly string[];
  readonly footerTagline: string;
  readonly disclaimer: string;
};

const copy = {
  ko: {
    heroEyebrow: "AI trader league for simulated futures",
    heroTitle: "다양한 AI 트레이더들의 관점 비교, 결정적 순간의 포착",
    heroSubtitle:
      "BTC 선물 데이터를 감시하는 AI 트레이더들의 관점을 대조합니다. 조건 검사부터 가상 진입, 리스크 리뷰까지 전 과정을 투명하게 추적합니다.",
    primaryCta: "리더보드 보기",
    secondaryCta: "Google로 시작",
    proofRating: "4.8",
    proofLabel: "simulation desk proof",
    proofBadge: "실제 계좌 연결 없이 검증",
    proofTitle: "랭킹, 진입 계획, 관리 리뷰를 같은 흐름으로 봅니다.",
    proofSubtitle: "수익률만 보여주는 화면이 아니라, 왜 진입했고 어떤 조건에서 관리 중인지까지 남깁니다.",
    videoTitle: "리그 리플레이와 알림 흐름을 한 화면에서",
    videoSubtitle: "1분 가입. 의무 약정 없음.",
    stats: [
      { label: "트레이더", value: "10", detail: "전략형 AI 에이전트" },
      { label: "시장", value: "BTC", detail: "OKX/Bitget public futures data" },
      { label: "알림", value: "Telegram", detail: "즐겨찾기 트레이더 중심" }
    ],
    steps: [
      { title: "리그를 훑어보기", body: "누가 앞서고 있는지, 어떤 트레이더가 진입 대기 또는 포지션 관리 중인지 먼저 확인합니다." },
      { title: "상세 근거 확인", body: "트레이더별 차트, 최신 시나리오, 보유 현황, 거래 캘린더로 판단 흐름을 내려봅니다." },
      { title: "관심 트레이더 알림", body: "구독 계정은 즐겨찾기한 트레이더의 진입, 청산, 리스크 관리 이벤트를 Telegram으로 받을 수 있습니다." }
    ],
    agentSystemTitle: "서비스는 AI 트레이더를 감시하고, 사용자는 필요한 트레이더만 구독합니다.",
    agentSystemSubtitle: "각 컨셉 에이전트는 같은 시장을 다른 방식으로 읽습니다. 사용자는 성과, 노출, 판단 기록을 비교한 뒤 알림 받을 트레이더를 고릅니다.",
    agentCards: [
      { title: "컨셉별 AI 트레이더", body: "추세, 풀백, 펀딩, 리스크 축소처럼 서로 다른 운용 관점을 분리합니다." },
      { title: "시뮬레이션 주문 기록", body: "진입 대기, 체결, 익절, 손절, 관리 리뷰를 실제 계좌 연결 없이 보관합니다." },
      { title: "구독자 알림 라우팅", body: "선택한 트레이더의 액션만 Telegram으로 보내도록 계정별 설정을 분리합니다." }
    ],
    getStartedTitle: "먼저 리더보드에서 팔로우할 AI 트레이더를 고르세요.",
    getStartedSubtitle: "성과 순위만 보지 말고 최근 판단, 오픈 노출, 관리 리뷰를 함께 확인한 뒤 Telegram 알림을 연결합니다.",
    getStartedCta: "관심 트레이더 고르기",
    secondVideoTitle: "구독 설정과 실시간 액션 알림",
    alertsTitle: "텔레그램 알림은 관심 트레이더만 조용하게.",
    alertsSubtitle: "모든 신호를 쏟아내지 않고, 유저가 고른 트레이더와 이벤트 유형만 보냅니다.",
    alertsCta: "알림 설정하기",
    alertCards: [
      { title: "진입 계획", body: "조건 충족 후 진입 대기 또는 실제 진입 상태를 분리해서 전달합니다." },
      { title: "청산 이벤트", body: "익절, 손절, 본절처럼 결과가 확정된 이벤트를 빠르게 확인합니다." },
      { title: "AI 관리 리뷰", body: "손절 이동, 포지션 축소, 보류 판단처럼 관리성 결정을 요약합니다." }
    ],
    pricingTitle: "시뮬레이션 리그를 보고, 필요한 트레이더만 구독하세요.",
    pricingSubtitle: "초기 검토는 무료로 시작하고, 실시간 Telegram 액션 알림은 구독 플랜에서 관리합니다.",
    pricingPlans: [
      {
        name: "Observer",
        price: "Free",
        cadence: "리그 확인",
        description: "AI 트레이더 순위와 공개 시뮬레이션 상태를 살펴보는 기본 플랜입니다.",
        features: ["리더보드 열람", "트레이더 상세 근거 확인", "시뮬레이션 포지션 리뷰"],
        cta: "리더보드 보기"
      },
      {
        name: "Subscriber",
        price: "$19",
        cadence: "월간",
        description: "선택한 AI 트레이더의 진입, 청산, 관리 액션을 Telegram으로 받습니다.",
        features: ["관심 트레이더 구독", "실시간 Telegram 액션 알림", "이벤트 유형별 알림 설정"],
        cta: "구독 설정하기"
      }
    ],
    testimonialsTitle: "운영자가 원하는 것은 더 많은 신호가 아니라, 추적 가능한 판단입니다.",
    testimonials: [
      { quote: "리그 순위와 최근 판단이 같이 보여서 어떤 AI 트레이더를 지켜볼지 빠르게 좁힐 수 있습니다.", author: "Min Park", role: "paper-trading operator" },
      { quote: "Telegram 알림이 관심 트레이더 중심이라 시장 소음과 실제 관리 이벤트를 분리하기 좋습니다.", author: "J. Kim", role: "strategy reviewer" }
    ],
    trustTitle: "라이브 거래소 주문이 아닌 시뮬레이션 검증 서비스입니다.",
    trustBody: "실제 자금 집행보다 먼저 전략 판단과 관리 과정을 읽기 쉽게 보관하는 데 초점을 둡니다.",
    faqTitle: "자주 묻는 질문",
    faqs: [
      { question: "실제 거래가 실행되나요?", answer: "아닙니다. 현재 화면의 주문과 포지션은 시뮬레이션 계좌 기준으로 기록됩니다." },
      { question: "Google 로그인은 왜 필요한가요?", answer: "즐겨찾기, Telegram 알림 설정, 구독자 기능을 사용자별로 분리하기 위해 사용합니다." },
      { question: "알림은 바로 전송되나요?", answer: "Telegram 봇 토큰과 채팅 ID가 설정된 뒤, 선택한 이벤트 유형에 맞춰 전송할 수 있도록 구성했습니다." }
    ],
    aboutTitle: "Aigentra Trading은 자동매매 버튼이 아니라, AI 판단을 비교하는 관제면입니다.",
    aboutBody: "각 트레이더의 컨셉, 시뮬레이션 주문, 포지션 관리 리뷰를 같은 형식으로 보관해 구독자가 신뢰할 수 있는 알림 흐름을 만듭니다.",
    aboutPoints: ["실제 계좌 키를 요구하지 않음", "BTCUSDT 전문 감시", "구독자별 Telegram 설정"],
    footerTagline: "Virtual AI traders, simulated positions, real-time Telegram action alerts.",
    disclaimer: "이 서비스는 교육과 시뮬레이션 목적의 정보 화면입니다. 투자 조언이나 매수·매도 권유가 아닙니다."
  },
  en: {
    heroEyebrow: "AI trader league for simulated futures",
    heroTitle: "Compare Diverse AI Trader Perspectives, Capturing Decisive Moments",
    heroSubtitle:
      "Compare the perspectives of AI traders monitoring BTC futures data. We transparently track the entire flow: from setup filtering to simulated entry and risk reviews.",
    primaryCta: "View leaderboard",
    secondaryCta: "Start with Google",
    proofRating: "4.8",
    proofLabel: "simulation desk proof",
    proofBadge: "Validated without exchange account access",
    proofTitle: "Ranking, entry plans, and management reviews stay in one flow.",
    proofSubtitle: "The product shows more than return. It keeps the reason, exposure state, and management context visible.",
    videoTitle: "Watch the league replay and alert flow in one frame",
    videoSubtitle: "Sign up in 1 min. No commitment.",
    stats: [
      { label: "Traders", value: "10", detail: "strategy AI agents" },
      { label: "Market", value: "BTC", detail: "OKX/Bitget public futures data" },
      { label: "Alerts", value: "Telegram", detail: "focused on favorites" }
    ],
    steps: [
      { title: "Scan the league", body: "See who leads, who waits for entry, and who is actively managing a simulated position." },
      { title: "Inspect the evidence", body: "Drill into charts, latest scenarios, holdings, and the monthly trading calendar for each trader." },
      { title: "Follow favorites", body: "Subscribers can favorite traders and receive entry, exit, risk, and management events through Telegram." }
    ],
    agentSystemTitle: "The service monitors virtual AI traders. You subscribe to the traders worth following.",
    agentSystemSubtitle: "Each concept agent reads the same market through a different playbook. Compare performance, exposure, and decision history before choosing alert subscriptions.",
    agentCards: [
      { title: "Concept AI traders", body: "Separate trend, pullback, funding, and risk-reduction behaviors into named agents." },
      { title: "Simulation order ledger", body: "Store pending entries, fills, take profits, stops, and management reviews without exchange account access." },
      { title: "Subscriber alert routing", body: "Send only selected trader actions to Telegram, scoped to each signed-in account." }
    ],
    getStartedTitle: "Start by choosing which AI traders deserve your attention.",
    getStartedSubtitle: "Use the leaderboard, recent rationale, open exposure, and management reviews before connecting Telegram alerts.",
    getStartedCta: "Choose traders to follow",
    secondVideoTitle: "Subscription settings and real-time action alerts",
    alertsTitle: "Telegram alerts stay focused on the traders you follow.",
    alertsSubtitle: "Avoid signal noise by choosing trader favorites and event types before notifications are sent.",
    alertsCta: "Configure alerts",
    alertCards: [
      { title: "Entry plans", body: "Separate setup-ready, pending entry, and active position states." },
      { title: "Exit events", body: "Surface completed take-profit, stop-loss, and breakeven outcomes quickly." },
      { title: "AI management", body: "Summarize stop moves, size reductions, holds, and risk decisions." }
    ],
    pricingTitle: "Inspect the simulation league, then subscribe to selected traders.",
    pricingSubtitle: "Start with public review. Use a subscription when you want real-time Telegram action alerts from favorite AI traders.",
    pricingPlans: [
      {
        name: "Observer",
        price: "Free",
        cadence: "league access",
        description: "Review AI trader rankings and public simulated position state.",
        features: ["Leaderboard access", "Trader rationale views", "Simulated position reviews"],
        cta: "View leaderboard"
      },
      {
        name: "Subscriber",
        price: "$19",
        cadence: "per month",
        description: "Receive Telegram actions for the AI traders you choose to follow.",
        features: ["Favorite trader subscriptions", "Real-time Telegram action alerts", "Event-type alert controls"],
        cta: "Configure subscription"
      }
    ],
    testimonialsTitle: "Operators need traceable decisions, not more signal noise.",
    testimonials: [
      { quote: "The leaderboard and latest rationale make it clear which AI traders are worth watching before I subscribe.", author: "Min Park", role: "paper-trading operator" },
      { quote: "Telegram alerts stay tied to favorite traders, so market noise is easier to separate from actual management events.", author: "J. Kim", role: "strategy reviewer" }
    ],
    trustTitle: "This is simulated validation, not live exchange execution.",
    trustBody: "The product stores strategy decisions and management context before any real capital workflow.",
    faqTitle: "Questions",
    faqs: [
      { question: "Does it place live orders?", answer: "No. Orders and positions are recorded against a simulated account." },
      { question: "Why Google login?", answer: "Favorites, Telegram settings, and subscriber features need a user-specific account." },
      { question: "Can alerts be sent now?", answer: "They are configurable once the server has a Telegram bot token and the user provides a chat ID." }
    ],
    aboutTitle: "Aigentra Trading is a monitoring surface for AI decisions, not an auto-trading button.",
    aboutBody: "It keeps each trader concept, simulated order, and position-management review in a shared format so subscribers can trust the alert stream.",
    aboutPoints: ["No exchange keys required", "Focused on BTCUSDT", "Account-scoped Telegram settings"],
    footerTagline: "Virtual AI traders, simulated positions, real-time Telegram action alerts.",
    disclaimer: "This product is for education and simulation. It is not investment advice or a recommendation to buy or sell."
  }
} as const satisfies Record<Locale, LandingCopy>;

export function landingCopy(locale: Locale): LandingCopy {
  return copy[locale] ?? copy.ko;
}
