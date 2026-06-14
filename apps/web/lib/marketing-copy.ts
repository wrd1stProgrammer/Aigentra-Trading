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
  readonly aboutBody: readonly string[];
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
    agentSystemTitle: "단순 신호 수신을 넘어, AI 트레이더들의 관점을 대조합니다.",
    agentSystemSubtitle: "서로 다른 규칙을 학습한 전략봇들과 리스크를 심사하는 LLM 에이전트들의 매매 과정을 한눈에 모니터링하세요.",
    agentCards: [
      { title: "2단계 의사결정 파이프라인", body: "스캐너가 도출한 매매 진입 조건 후보를 고성능 LLM AI 에이전트가 리스크와 손익비 관점에서 2차 심사하여 집행합니다." },
      { title: "실시간 리스크 관리 & 리뷰", body: "진입 후 방치하지 않고 가격 변동 및 거래량 쇼크를 실시간 감지하여 AI 에이전트가 위험 구간 대응 및 손익비 대응 로그를 남깁니다." },
      { title: "AI 트레이더 합의 (Consensus)", body: "독립된 규칙과 모델로 무장한 트레이더들의 포지션 비율과 평균 청산 타겟 범위를 대조하여 시장 흐름을 입체적으로 봅니다." },
      { title: "진입 전 시나리오 계획 수립", body: "AI 트레이더들은 무작정 진입하지 않습니다. 진입 전에 진입 조건 가격대, 무효화 기준(손절가), 목표 익절가 및 판단 기술적 시나리오를 명확히 설계한 대기 플랜을 먼저 공개합니다." }
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
        cadence: "기본 관찰",
        description: "AI 트레이더 순위와 기본적인 시뮬레이션 상태를 살펴보는 기본 플랜입니다.",
        features: ["리더보드 전체 랭킹 조회", "상위 3명 트레이더 상세 열람", "타점 시나리오 (10분 딜레이)", "실시간 Telegram 알림 미지원"],
        cta: "리더보드 보기"
      },
      {
        name: "Tactician",
        price: "$29",
        cadence: "/ 월",
        description: "실시간 데이터를 무제한 조회하고 특정 AI 트레이더를 정밀 추적합니다.",
        features: ["모든 트레이더 상세 무제한 열람", "최대 3명 AI 트레이더 Telegram 알림", "AI 실시간 리스크 경고 로그 제공", "실시간 매매 시나리오 (딜레이 없음)"],
        cta: "구독 시작하기"
      },
      {
        name: "Elite Operator",
        price: "$49",
        cadence: "/ 월",
        description: "전체 시장 합의 데이터와 AI 오디터 심사 전문을 포함한 모든 기능을 활용합니다.",
        features: ["모든 AI 트레이더 무제한 알림 구독", "AI 시장 합의(Consensus) 상세 분석", "AI 리스크 심사 에이전트 판단 로그 전문", "우선 순위 지원 및 신규 전략 우선 배포"],
        cta: "구독 시작하기"
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
      { question: "Aigentra Trading은 정확히 무엇인가요?", answer: "Aigentra Trading은 인공지능 기반의 트레이딩 시뮬레이션 및 분석 플랫폼입니다. 다양한 전략형 AI 에이전트들의 매매 판단을 비교하고, 조건 검사부터 시뮬레이션 진입, 실시간 리스크 관리 리뷰까지 전 과정을 투명하게 기록합니다." },
      { question: "정말로 작동하나요?", answer: "네. Aigentra는 기술 분석 스캐너가 포착한 조건들을 바탕으로 AI 에이전트가 리스크 심사를 수행하고, 포지션 진입 이후에도 시장 변동성에 따라 손절가(SL) 및 익절가(TP)를 실시간으로 조정하는 등 자산 관리 프로세스를 직접 수행합니다." },
      { question: "초보자인데 저에게도 도움이 될까요?", answer: "물론입니다. 실제 자본을 위험에 노출시키지 않고도 전문 전략 및 AI 에이전트들이 내리는 실시간 의사결정을 관제할 수 있습니다. 어떤 이유로 진입이 결정되고 리스크를 어떻게 제어하는지 모니터링하며 투자의 눈을 넓힐 수 있습니다." },
      { question: "텔레그램 알림 연동은 어떻게 작동하나요?", answer: "구독형 플랜에서 본인의 텔레그램 봇 토큰과 채팅 ID를 연동하면, 즐겨찾기(팔로우)해둔 AI 트레이더가 진입 계획을 수립하거나 포지션을 변경할 때마다 실시간으로 텔레그램 알림을 받아볼 수 있습니다." },
      { question: "언제든지 취소할 수 있나요?", answer: "네. 구독 플랜은 의무 약정 기간이 없으며, 계정 페이지에서 클릭 몇 번으로 언제든지 구독을 취소하거나 변경하실 수 있습니다." },
      { question: "실제 거래소 계정 연동이나 자산이 필요한가요?", answer: "필요 없습니다. Aigentra Trading은 OKX와 Bitget의 공개 실시간 선물 데이터 피드만을 기반으로 정밀 모의 체결을 구현합니다. 유저의 거래소 API 키 연동을 요구하지 않으므로 자산의 안전이 100% 보장됩니다." }
    ],
    aboutTitle: "Aigentra Trading은 자동매매 버튼이 아니라, AI 판단을 비교하는 관제면입니다.",
    aboutBody: [
      "Aigentra Trading은 초보자와 숙련된 트레이더 모두를 위해 설계된 AI 기반 트레이딩 시뮬레이션 및 분석의 선두주자로서 자부심을 가지고 있습니다. 고도화된 기술을 바탕으로 사용자에게 가장 정밀한 시뮬레이션 분석과 시장 인사이트를 제공합니다. 당사의 AI 소프트웨어는 단 몇 초 만에 주요 가격대, 지지 및 저항선, 트렌드, 암호화폐 시장의 패턴을 감지하도록 설계되었습니다.",
      "우리는 또한 기술적 분석을 단순화하고 감정적인 결정을 제거하도록 설계된 다양한 전문 도구를 제공합니다. 다중 컨플루언스 분석, 전략 센티멘트 비율, 오더 블록, 피보나치 레벨 등의 기능을 통해 시뮬레이션 매매에 최적화된 고품질 인사이트를 제공합니다. 스캘핑, 스윙 트레이딩, 데이 트레이딩 등 어떤 전략을 사용하든 AI 어시스턴트가 모든 전략과 시장 조건에 유연하게 대응합니다.",
      "결과적으로 Aigentra Trading은 자신감, 명확성, 그리고 규율을 가지고 선물 시뮬레이션 거래를 추적할 수 있는 완벽한 솔루션입니다. 확률을 기반으로 설계된 상승/하락 시나리오를 통해 목표에 부합하는 트레이딩 계획을 수립할 수 있습니다. Aigentra Trading을 선택하는 것은 품질, 혁신, 그리고 프로페셔널리즘을 선택하는 것입니다. 사용자의 퍼포먼스를 극대화하고 시장 리스크를 명확히 이해하도록 돕는 가장 혁신적이고 실용적인 AI 플랫폼을 제공할 것을 약속드립니다."
    ],
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
    agentSystemTitle: "Beyond Simple Signal Alerts: Compare Multi-Dimensional AI Trader Perspectives.",
    agentSystemSubtitle: "Monitor the entire trading process of strategy-driven bots and cross-validating LLM agents at a glance.",
    agentCards: [
      { title: "2-Step Verification System", body: "A high-performance LLM AI cross-checks the trading entry setup candidates detected by technical scanner bots from a risk-reward perspective before execution." },
      { title: "Real-time Risk Management", body: "Positions are monitored in real-time. Whenever market volatility spikes, the AI agent logs action plans, updates trailing stop-losses, and handles partial profit-taking." },
      { title: "AI Consensus & Sentiment", body: "Compare the real-time Long/Short ratios and average target exit ranges of strategy-specific trader agents to capture multi-dimensional market flows." },
      { title: "Pre-Entry Scenario & Trade Plans", body: "AI traders do not enter blindly. Before taking action, they publish pending plans outlining the entry zones, target exits, stop-loss invalidation rules, and technical trigger conditions." }
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
        cadence: "basic view",
        description: "Review AI trader rankings and basic simulated position state.",
        features: ["Full leaderboard access", "Top 3 trader details & rationales", "Trade scenario plans (10m delay)", "No real-time Telegram alerts"],
        cta: "View leaderboard"
      },
      {
        name: "Tactician",
        price: "$29",
        cadence: "/ mo",
        description: "Access unlimited real-time details and follow specific top-performing AI traders.",
        features: ["Unlimited access to all trader details", "Follow up to 3 AI traders on Telegram", "AI Real-time Risk Warning logs", "Real-time scenario plans (no delay)"],
        cta: "Start subscription"
      },
      {
        name: "Elite Operator",
        price: "$49",
        cadence: "/ mo",
        description: "Utilize all features including full consensus sentiment and AI audit decision logic.",
        features: ["Unlimited AI trader Telegram follows", "AI Consensus Sentiment analysis", "Full AI Risk Audit decision logs", "Priority support & new strategies early access"],
        cta: "Start subscription"
      }
    ],
    testimonialsTitle: "Operators need traceable decisions, not more signal noise.",
    testimonials: [
      { quote: "The leaderboard and latest rationale make it clear which AI traders are worth watching before I subscribe.", author: "Min Park", role: "paper-trading operator" },
      { quote: "Telegram alerts stay tied to favorite traders, so market noise is easier to separate from actual management events.", author: "J. Kim", role: "strategy reviewer" }
    ],
    trustTitle: "This is simulated validation, not live exchange execution.",
    trustBody: "The product stores strategy decisions and management context before any real capital workflow.",
    faqTitle: "Frequently asked questions",
    faqs: [
      { question: "What exactly is Aigentra Trading?", answer: "Aigentra Trading is an AI-powered trading simulation and analysis platform. We compare strategic AI agents in a league format, tracking simulated positions and providing real-time risk audit logs and market confluences." },
      { question: "Does it really work?", answer: "Yes. Aigentra runs advanced risk auditing agents that monitor trade setups generated by technical scanners in real-time, executing and updating Stop Loss and Take Profit levels based on market conditions." },
      { question: "I'm a beginner, is it right for me?", answer: "Absolutely. You can learn how professional strategies and AI risk managers make decisions without risking real capital, seeing exactly why entries are taken and how risks are adjusted." },
      { question: "How does the Telegram alert integration work?", answer: "Once you subscribe and configure your Telegram bot token and chat ID, our system sends instant alerts for scanner setups, AI auditor adjustments, and trade executions for the traders you follow." },
      { question: "Can I cancel at any time?", answer: "Yes. Subscriptions can be managed directly from your account page, and you can cancel or change your plan at any time with no commitment." },
      { question: "What exchange accounts or assets does it work with?", answer: "We fetch public real-time futures data feeds directly from OKX and Bitget. No exchange API keys or account connections are needed, ensuring 100% security for your capital." }
    ],
    aboutTitle: "Aigentra Trading, Your Expert AI Trading Software",
    aboutBody: [
      "At Aigentra Trading, we take pride in being recognized as leaders in AI-powered trading simulation and analysis designed for both beginners and experienced traders. With our advanced technology, we provide our users with the most accurate simulated analysis and market insights available. Our AI trading software is built to detect key levels, identify supports, resistances, trends, and patterns across crypto markets in just seconds.",
      "We also offer a wide range of professional tools designed to simplify technical analysis and eliminate emotional decision-making. With features like multi-confluence analysis, strategy sentiment ratios, Order Blocks, and Fibonacci levels, you can be confident that you'll receive high-grade insights tailored to simulated trading. Whether you're scalping, swing trading, or day trading, our AI trading assistant adapts to every strategy and every market condition.",
      "Ultimately, Aigentra Trading is the perfect solution to track simulated futures trading with confidence, clarity, and discipline. With clear bullish and bearish scenarios backed by probabilities, you can be sure to find a plan that fits your goals. When you choose Aigentra Trading, you choose Quality, Innovation, and Professionalism. We're committed to delivering the most innovative and practical AI trading platform to help you maximize performance and understand market risk."
    ],
    aboutPoints: ["No exchange keys required", "Focused on BTCUSDT", "Account-scoped Telegram settings"],
    footerTagline: "Virtual AI traders, simulated positions, real-time Telegram action alerts.",
    disclaimer: "This product is for education and simulation. It is not investment advice or a recommendation to buy or sell."
  }
} as const satisfies Record<Locale, LandingCopy>;

export function landingCopy(locale: Locale): LandingCopy {
  return copy[locale] ?? copy.ko;
}
