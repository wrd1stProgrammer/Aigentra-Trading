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
  readonly agentSystemEyebrow: string;
  readonly agentSystemTitle: string;
  readonly agentSystemSubtitle: string;
  readonly agentCards: readonly { readonly title: string; readonly body: string }[];
  readonly agentCardKickers: readonly string[];
  readonly previews: {
    readonly pipeline: {
      readonly eyebrow: string;
      readonly scanBadge: string;
      readonly setupTitle: string;
      readonly strategyLabel: string;
      readonly triggerLimitLabel: string;
      readonly timeframeLabel: string;
      readonly auditTitle: string;
      readonly auditBadge: string;
      readonly decisionBadge: string;
      readonly body: string;
    };
    readonly position: {
      readonly eyebrow: string;
      readonly marketBadge: string;
      readonly entryLabel: string;
      readonly markLabel: string;
      readonly warningTitle: string;
      readonly warningBody: string;
    };
    readonly consensus: {
      readonly eyebrow: string;
      readonly strategistsBadge: string;
      readonly activeLabel: string;
      readonly waitingLabel: string;
      readonly flatLabel: string;
      readonly avgEntryLabel: string;
      readonly hourlyOpinionLabel: string;
      readonly hourlyOpinionValue: string;
      readonly aggregateLabel: string;
      readonly body: string;
      readonly trendDesksLabel: string;
      readonly riskFlagsLabel: string;
      readonly riskFlagsValue: string;
    };
    readonly tradePlan: {
      readonly eyebrow: string;
      readonly triggerBadge: string;
      readonly waitLabel: string;
      readonly technicalCheckLabel: string;
      readonly checks: readonly string[];
      readonly entryLimitLabel: string;
      readonly targetRoiLabel: string;
    };
    readonly alert: {
      readonly botName: string;
      readonly meta: string;
      readonly channel: string;
      readonly title: string;
      readonly trader: string;
      readonly liveBadge: string;
      readonly headline: string;
      readonly body: string;
      readonly priceLabel: string;
      readonly roiLabel: string;
      readonly delivered: string;
      readonly language: string;
      readonly event: string;
    };
  };
  readonly getStartedTitle: string;
  readonly getStartedEyebrow: string;
  readonly getStartedSubtitle: string;
  readonly getStartedCta: string;
  readonly secondVideoTitle: string;
  readonly alertsTitle: string;
  readonly alertsSubtitle: string;
  readonly alertsCta: string;
  readonly alertRuleLabel: string;
  readonly alertCards: readonly { readonly title: string; readonly body: string }[];
  readonly pricingTitle: string;
  readonly pricingEyebrow: string;
  readonly pricingSubtitle: string;
  readonly billingAnnual: string;
  readonly billingMonthly: string;
  readonly pricingSupportTitle: string;
  readonly pricingSupportBody: string;
  readonly pricingSupportItems: readonly string[];
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
  readonly faqEyebrow: string;
  readonly faqSubtitle: string;
  readonly faqCta: string;
  readonly faqs: readonly { readonly question: string; readonly answer: string }[];
  readonly aboutTitle: string;
  readonly aboutEyebrow: string;
  readonly aboutMoreCta: string;
  readonly aboutPrimaryCta: string;
  readonly aboutBody: readonly string[];
  readonly aboutPoints: readonly string[];
  readonly footerTagline: string;
  readonly disclaimer: string;
  readonly footerRiskNotice: string;
  readonly footerLabels: {
    readonly product: string;
    readonly howItWorks: string;
    readonly pricing: string;
    readonly operatorNotes: string;
    readonly faq: string;
    readonly company: string;
    readonly contact: string;
    readonly legal: string;
    readonly terms: string;
    readonly disclaimer: string;
    readonly legalNotices: string;
    readonly privacyPolicy: string;
    readonly riskDisclosure: string;
    readonly madeBy: string;
  };
};

const copy = {
  ko: {
    heroEyebrow: "AI trader league for simulated futures",
    heroTitle: "다양한 AI 트레이더들의 관점 비교, 결정적 순간의 포착",
    heroSubtitle:
      "BTC 선물 데이터를 감시하는 AI 트레이더들의 관점을 대조합니다. 조건 검사부터 가상 진입, 리스크 리뷰까지 전 과정을 투명하게 추적합니다.",
    primaryCta: "리더보드 보기",
    secondaryCta: "Google로 시작",
    proofRating: "20",
    proofLabel: "simulation desk proof",
    proofBadge: "실제 계좌 연결 없이 검증",
    proofTitle: "랭킹, 진입 계획, 관리 리뷰를 같은 흐름으로 봅니다.",
    proofSubtitle: "수익률만 보여주는 화면이 아니라, 왜 진입했고 어떤 조건에서 관리 중인지까지 남깁니다.",
    videoTitle: "리그 리플레이와 알림 흐름을 한 화면에서",
    videoSubtitle: "1분 만에 가입하세요. 약정이 없습니다.",
    stats: [
      { label: "트레이더", value: "20", detail: "전략형 AI 에이전트" },
      { label: "시장", value: "BTC", detail: "OKX/Bitget public futures data" },
      { label: "알림", value: "Telegram", detail: "즐겨찾기 트레이더 중심" }
    ],
    steps: [
      { title: "리그를 훑어보기", body: "누가 앞서고 있는지, 어떤 트레이더가 진입 대기 또는 포지션 관리 중인지 먼저 확인합니다." },
      { title: "상세 근거 확인", body: "트레이더별 차트, 최신 시나리오, 보유 현황, 거래 캘린더로 판단 흐름을 내려봅니다." },
      { title: "관심 트레이더 알림", body: "구독 계정은 즐겨찾기한 트레이더의 진입, 청산, 리스크 관리 이벤트를 Telegram으로 받을 수 있습니다." }
    ],
    agentSystemEyebrow: "[ AI 에이전트 모니터링 ]",
    agentSystemTitle: "단순 신호 수신을 넘어, AI 트레이더들의 관점을 대조합니다.",
    agentSystemSubtitle: "서로 다른 규칙을 학습한 전략봇들과 리스크를 심사하는 AI 에이전트들의 매매 과정을 한눈에 모니터링하세요.",
    agentCards: [
      { title: "2단계 의사결정 파이프라인", body: "스캐너가 포착한 진입 후보를 고성능 AI 에이전트가 리스크, 손익비, 무효화 조건까지 다시 확인한 뒤 모의 집행 여부를 결정합니다." },
      { title: "실시간 리스크 관리 & 리뷰", body: "진입 후 방치하지 않고 가격 변동 및 거래량 쇼크를 실시간 감지하여 AI 에이전트가 위험 구간 대응 및 손익비 대응 로그를 남깁니다." },
      { title: "20개 전략 관점의 Aigentra 종합 의견", body: "롱/숏 비율만 세지 않고, 진행 중인 포지션, 진입 대기, 최근 익절/손절, AI 리뷰를 묶어 현재 리그의 위험 기울기를 정리합니다." },
      { title: "진입 전 시나리오 계획 수립", body: "AI 트레이더들은 무작정 진입하지 않습니다. 진입 전 가격대, 무효화 기준, 목표 익절가와 기술적 체크를 TradingView 차트처럼 읽히는 플랜으로 남깁니다." }
    ],
    agentCardKickers: ["[ 파이프라인 ]", "[ 포지션 리스크 ]", "[ 종합 의견 ]", "[ 옵션 1 · 거래 계획 ]"],
    previews: {
      pipeline: {
        eyebrow: "의사결정 파이프라인",
        scanBadge: "BTCUSDT · 실시간 스캔",
        setupTitle: "1. 스캐너 셋업",
        strategyLabel: "전략",
        triggerLimitLabel: "트리거 가격",
        timeframeLabel: "확인 시간대",
        auditTitle: "2. AI 리스크 심사",
        auditBadge: "AI 에이전트",
        decisionBadge: "판정 · 조정 승인",
        body: "변동성 확장 조건은 통과했습니다. 다만 거래량이 얇아 레버리지를 낮추고 손절폭을 먼저 고정한 뒤 모의 진입을 승인합니다."
      },
      position: {
        eyebrow: "포지션 리스크 모니터",
        marketBadge: "BTCUSDT · 시뮬레이션",
        entryLabel: "진입가",
        markLabel: "현재가",
        warningTitle: "AI 리스크 경고",
        warningBody: "단기 매도 거래량 급증을 포착했습니다. 스톱로스를 본절가(67,520)로 올리고 포지션의 30%를 부분 익절로 관리합니다."
      },
      consensus: {
        eyebrow: "전략 종합 센티멘트",
        strategistsBadge: "AI 전략가 20명",
        activeLabel: "진입 중",
        waitingLabel: "대기",
        flatLabel: "관망",
        avgEntryLabel: "평균 진입가",
        hourlyOpinionLabel: "시간별 의견",
        hourlyOpinionValue: "혼조 · 리스크 우선",
        aggregateLabel: "Aigentra 종합",
        body: "활성 포지션, 진입 대기, 최근 익절/손절, AI 리뷰를 묶어 지금 리그가 어느 쪽으로 기울었는지 정리합니다.",
        trendDesksLabel: "추세 데스크",
        riskFlagsLabel: "리스크 플래그",
        riskFlagsValue: "4개 활성"
      },
      tradePlan: {
        eyebrow: "시나리오 플랜",
        triggerBadge: "트리거 대기",
        waitLabel: "B1 대기",
        technicalCheckLabel: "[ 기술 체크 ]",
        checks: ["EMA 200 반등", "15분 RSI 과매도", "종합 의견 55%"],
        entryLimitLabel: "지정가 진입",
        targetRoiLabel: "목표 ROE"
      },
      alert: {
        botName: "Aigentra Trading Bot",
        meta: "방금 · 즐겨찾기 트레이더만",
        channel: "Telegram",
        title: "[AI Trader League] 트레이더 피드",
        trader: "VWAP 회수반장 · BTCUSDT",
        liveBadge: "LIVE",
        headline: "롱 유지, 익절선 근처는 추격 보류",
        body: "롱 포지션은 유지 중입니다. 익절선 근처에서는 무리하게 따라붙지 않고, 거래량이 식으면 바로 보수적으로 관리합니다.",
        priceLabel: "가격",
        roiLabel: "ROI",
        delivered: "8초 전 전달 · 즐겨찾기만",
        language: "언어 · KO",
        event: "이벤트 · 상태 피드"
      }
    },
    getStartedTitle: "먼저 리더보드에서 팔로우할 AI 트레이더를 고르세요.",
    getStartedEyebrow: "[ 간단한 3단계 ]",
    getStartedSubtitle: "성과 순위만 보지 말고 최근 판단, 오픈 노출, 관리 리뷰를 함께 확인한 뒤 Telegram 알림을 연결합니다.",
    getStartedCta: "관심 트레이더 고르기",
    secondVideoTitle: "구독 설정과 실시간 액션 알림",
    alertsTitle: "텔레그램 알림은 관심 트레이더만 조용하게.",
    alertsSubtitle: "Aigentra Trading은 자동매매 버튼이 아니라, AI 판단을 비교하는 관제면입니다. 그래서 전체 리그 소음을 보내지 않고, 즐겨찾기한 트레이더의 체결·청산·관리 리뷰·상태 피드만 사용자 언어로 짧게 보냅니다.",
    alertsCta: "알림 설정하기",
    alertRuleLabel: "알림 규칙",
    alertCards: [
      { title: "관심 트레이더 필터", body: "즐겨찾기한 AI 트레이더만 알림 대상으로 두어, 리더보드 전체의 잡음을 실제로 줄입니다." },
      { title: "상태 피드와 체결 이벤트", body: "진입 대기, 체결, 익절, 손절, 포지션 유지 메모를 봇 채팅처럼 짧고 빠르게 받습니다." },
      { title: "사용자 언어 기반 전송", body: "계정 언어 설정을 기준으로 AI 리뷰와 트레이더 피드를 번역해, 같은 알림도 읽기 편하게 전달합니다." }
    ],
    pricingTitle: "하나의 Pro 플랜으로 전체 리그와 알림을 엽니다.",
    pricingEyebrow: "[ 요금제 ]",
    pricingSubtitle: "복잡한 등급을 두지 않고, AI 트레이더 상세·센티멘트·Telegram 알림을 한 플랜에서 제공합니다.",
    billingAnnual: "연간 결제 (45% 특가 할인)",
    billingMonthly: "월간 결제 (34% 특가 할인)",
    pricingSupportTitle: "Pro에 포함되는 핵심 사용 흐름",
    pricingSupportBody: "Aigentra는 실제 거래소 주문을 대신 넣는 서비스가 아니라, AI 트레이더들의 판단과 리스크 관리 기록을 추적하는 관제면입니다.",
    pricingSupportItems: ["전체 트레이더 상세 열람", "AI 센티멘트와 Aigentra 종합 의견", "즐겨찾기 트레이더 Telegram 알림", "실시간 체결/청산/관리 리뷰 추적"],
    pricingPlans: [
      {
        name: "Aigentra Pro",
        price: "$19",
        cadence: "/ 월",
        description: "리더보드, 트레이더 상세, AI 센티멘트, 관심 트레이더 Telegram 알림을 모두 사용하는 단일 플랜입니다.",
        features: ["모든 AI 트레이더 상세 무제한 열람", "AI 센티멘트와 시간대별 종합 의견", "즐겨찾기 기반 Telegram 알림", "실시간 시뮬레이션 체결 및 포지션 관리 기록"],
        cta: "구독 시작하기"
      }
    ],
    testimonialsTitle: "운영자가 원하는 것은 더 많은 신호가 아니라, 추적 가능한 판단입니다.",
    testimonials: [
      { quote: "리그 순위와 최근 판단이 같이 보여서 어떤 AI 트레이더를 지켜볼지 빠르게 좁힐 수 있습니다.", author: "운영 예시", role: "제품 사용 흐름" },
      { quote: "Telegram 알림이 관심 트레이더 중심이라 시장 소음과 실제 관리 이벤트를 분리하기 좋습니다.", author: "검토 예시", role: "알림 설정 흐름" }
    ],
    trustTitle: "라이브 거래소 주문이 아닌 시뮬레이션 검증 서비스입니다.",
    trustBody: "실제 자금 집행보다 먼저 전략 판단과 관리 과정을 읽기 쉽게 보관하는 데 초점을 둡니다.",
    faqTitle: "유저가 실제로 궁금해할 질문",
    faqEyebrow: "[ 자주 묻는 질문 ]",
    faqSubtitle: "실거래 여부, 결제, 알림, 데이터 기준처럼 가입 전에 확인할 내용을 먼저 정리했습니다.",
    faqCta: "리더보드 먼저 보기",
    faqs: [
      { question: "Aigentra가 실제 돈으로 거래를 실행하나요?", answer: "아니요. Aigentra는 실제 거래소 주문을 넣거나 고객 자금을 보관하지 않습니다. 공개 선물 데이터를 기반으로 AI 트레이더의 가상 진입, 청산, 리스크 관리 판단을 기록하는 시뮬레이션 서비스입니다." },
      { question: "왜 단순 매수/매도 신호방이 아니라 리그 형태인가요?", answer: "한 가지 신호만 받으면 판단 근거를 비교하기 어렵습니다. Aigentra는 서로 다른 전략의 AI 트레이더를 리더보드와 상세 리뷰로 비교해 어떤 관점이 현재 시장에서 강한지 보이게 합니다." },
      { question: "Telegram 알림은 어떤 기준으로 오나요?", answer: "사용자가 즐겨찾기한 트레이더와 선택한 이벤트 유형을 기준으로 보냅니다. 진입 대기, 체결, 익절, 손절, AI 관리 리뷰, 트레이더 상태 피드를 계정 언어에 맞게 받을 수 있습니다." },
      { question: "AI 센티멘트는 무엇을 종합하나요?", answer: "20개 전략 트레이더의 활성 포지션, 진입 대기, 최근 청산, 관리 리뷰를 묶어 현재 리그의 롱/숏 기울기와 리스크 포인트를 시간대별로 정리합니다." },
      { question: "구독과 결제는 어디서 관리하나요?", answer: "결제는 Whop 체크아웃을 통해 진행됩니다. 구독 상태가 성공적으로 반영되면 Aigentra의 Pro 화면과 알림 기능 접근이 열립니다." },
      { question: "투자 조언으로 봐도 되나요?", answer: "아니요. 모든 화면과 알림은 교육 및 시뮬레이션 목적의 정보입니다. 실제 투자 판단과 손익 책임은 사용자 본인에게 있습니다." }
    ],
    aboutTitle: "Aigentra Trading은 자동매매 버튼이 아니라, AI 판단을 비교하는 관제면입니다.",
    aboutEyebrow: "[ AI 트레이딩 소프트웨어 시작하기 ]",
    aboutMoreCta: "더 보기 ∨",
    aboutPrimaryCta: "지금 시작하기",
    aboutBody: [
      "**Aigentra Trading**은 초보자와 숙련된 트레이더 모두가 전략형 AI 트레이더의 판단 흐름을 살펴볼 수 있도록 만든 **AI 기반 트레이딩 시뮬레이션 및 분석** 서비스입니다. 공개 시장 데이터를 바탕으로 주요 가격대, 지지 및 저항선, 추세, 변동성 조건을 추적합니다.",
      "기술적 분석을 더 읽기 쉽게 정리하기 위해 **다중 컨플루언스 분석**, **전략 센티멘트 비율**, **오더 블록**, **피보나치 레벨** 같은 도구를 함께 제공합니다. 스캘핑, 스윙 트레이딩, 데이 트레이딩 관점의 차이를 시뮬레이션 기록으로 비교할 수 있습니다.",
      "결과적으로 **Aigentra Trading**은 **선물 시뮬레이션 거래**의 판단, 노출, 리스크 변화를 한 곳에서 추적하기 위한 분석 기록 도구입니다. 상승/하락 시나리오, 리스크 메모, 관리 업데이트를 투자 조언이 아닌 참고용 데이터로 제공합니다."
    ],
    aboutPoints: ["실제 계좌 키를 요구하지 않음", "BTCUSDT 전문 감시", "구독자별 Telegram 설정"],
    footerTagline: "가상 AI 트레이더 기록, BTC 선물 시장 맥락, Telegram 알림.",
    disclaimer: "이 서비스는 교육과 시뮬레이션 목적의 정보 화면입니다. 투자 조언이나 매수·매도 권유가 아닙니다.",
    footerRiskNotice:
      "Aigentra Trading은 실제 거래소 주문을 실행하거나 고객 자금을 보관하지 않는 시뮬레이션 기반 분석 서비스입니다. 모든 리그 성과, AI 리뷰, 목표가, 손절가, 알림은 공개 시장 데이터를 바탕으로 한 가상 기록이며 실제 투자 결과를 보장하지 않습니다. 암호화폐 선물과 무기한 계약은 높은 변동성, 레버리지, 강제청산, 유동성 부족, 데이터 지연 위험이 있으며 원금 전액 손실이 발생할 수 있습니다. 최종 판단은 사용자 본인의 책임이며, 필요한 경우 자격을 갖춘 전문가와 상담하십시오.",
    footerLabels: {
      product: "제품",
      howItWorks: "작동 방식",
      pricing: "요금제",
      operatorNotes: "운영 예시",
      faq: "자주 묻는 질문",
      company: "회사",
      contact: "문의",
      legal: "법적 고지",
      terms: "서비스 이용약관",
      disclaimer: "면책조항",
      legalNotices: "법적 고지",
      privacyPolicy: "개인정보 처리방침",
      riskDisclosure: "위험 고지",
      madeBy: "제작"
    }
  },
  en: {
    heroEyebrow: "AI trader league for simulated futures",
    heroTitle: "Compare Diverse AI Trader Perspectives, Capturing Decisive Moments",
    heroSubtitle:
      "Compare the perspectives of AI traders monitoring BTC futures data. We transparently track the entire flow: from setup filtering to simulated entry and risk reviews.",
    primaryCta: "View leaderboard",
    secondaryCta: "Start with Google",
    proofRating: "20",
    proofLabel: "simulation desk proof",
    proofBadge: "Validated without exchange account access",
    proofTitle: "Ranking, entry plans, and management reviews stay in one flow.",
    proofSubtitle: "The product shows more than return. It keeps the reason, exposure state, and management context visible.",
    videoTitle: "Watch the league replay and alert flow in one frame",
    videoSubtitle: "Sign up in 1 min. No commitment.",
    stats: [
      { label: "Traders", value: "20", detail: "strategy AI agents" },
      { label: "Market", value: "BTC", detail: "OKX/Bitget public futures data" },
      { label: "Alerts", value: "Telegram", detail: "focused on favorites" }
    ],
    steps: [
      { title: "Scan the league", body: "See who leads, who waits for entry, and who is actively managing a simulated position." },
      { title: "Inspect the evidence", body: "Drill into charts, latest scenarios, holdings, and the monthly trading calendar for each trader." },
      { title: "Follow favorites", body: "Subscribers can favorite traders and receive entry, exit, risk, and management events through Telegram." }
    ],
    agentSystemEyebrow: "[ AI AGENT MONITORING ]",
    agentSystemTitle: "Beyond Simple Signal Alerts: Compare Multi-Dimensional AI Trader Perspectives.",
    agentSystemSubtitle: "Monitor the entire trading process of strategy-driven bots and cross-validating AI agents at a glance.",
    agentCards: [
      { title: "2-Step Verification System", body: "A high-performance AI agent rechecks scanner candidates for risk, reward, leverage, and invalidation rules before simulated execution." },
      { title: "Real-time Risk Management", body: "Positions are monitored in real-time. Whenever market volatility spikes, the AI agent logs action plans, updates trailing stop-losses, and handles partial profit-taking." },
      { title: "20-Strategist Aigentra Opinion", body: "Instead of counting Long/Short votes only, Aigentra combines active positions, pending setups, recent exits, and AI reviews into a current risk read." },
      { title: "Pre-Entry Scenario & Trade Plans", body: "AI traders do not enter blindly. Before taking action, they publish TradingView-style plans with entry zones, invalidation, targets, and technical checks." }
    ],
    agentCardKickers: ["[ Pipeline ]", "[ Position Risk ]", "[ Consensus ]", "[ Option 1 · Trade Plan ]"],
    previews: {
      pipeline: {
        eyebrow: "Decision Pipeline",
        scanBadge: "BTCUSDT · live scan",
        setupTitle: "1. Scanner Setup",
        strategyLabel: "Strategy",
        triggerLimitLabel: "Trigger Limit",
        timeframeLabel: "Timeframe",
        auditTitle: "2. AI Risk Audit",
        auditBadge: "AI Agent",
        decisionBadge: "Decision · adjusted approval",
        body: "Volatility expansion clears the filter. Volume is still thin, so the agent lowers leverage, locks the stop first, and only then approves the simulated entry."
      },
      position: {
        eyebrow: "Position Risk Monitor",
        marketBadge: "BTCUSDT · Simulated",
        entryLabel: "Entry Price",
        markLabel: "Mark Price",
        warningTitle: "AI Risk Warning",
        warningBody: "Short-term sell volume is spiking. The stop is lifted to breakeven (67,520), and 30% of the position is managed as partial profit."
      },
      consensus: {
        eyebrow: "Consensus Sentiment",
        strategistsBadge: "20 AI Strategists",
        activeLabel: "Active",
        waitingLabel: "Waiting",
        flatLabel: "Flat",
        avgEntryLabel: "Avg Entry",
        hourlyOpinionLabel: "Hourly Opinion",
        hourlyOpinionValue: "mixed · risk aware",
        aggregateLabel: "Aigentra aggregate",
        body: "Aigentra combines active positions, pending entries, recent wins and stops, and AI reviews to show which side the league currently leans toward.",
        trendDesksLabel: "Trend desks",
        riskFlagsLabel: "Risk flags",
        riskFlagsValue: "4 active"
      },
      tradePlan: {
        eyebrow: "Scenario Plan",
        triggerBadge: "Pending Trigger",
        waitLabel: "B1 wait",
        technicalCheckLabel: "[ Technical Check ]",
        checks: ["EMA 200 Rebound", "RSI Oversold (15m)", "Consensus 55%"],
        entryLimitLabel: "ENTRY LIMIT",
        targetRoiLabel: "TARGET ROI"
      },
      alert: {
        botName: "Aigentra Trading Bot",
        meta: "now · favorite traders only",
        channel: "Telegram",
        title: "[AI Trader League] Trader Feed",
        trader: "VWAP Reclaim Captain · BTCUSDT",
        liveBadge: "LIVE",
        headline: "Long held; no chasing near take-profit",
        body: "The long position remains active. Near the take-profit line, it avoids chasing price and tightens risk quickly if volume fades.",
        priceLabel: "price",
        roiLabel: "ROI",
        delivered: "delivered 8 seconds ago · favorites only",
        language: "language · EN",
        event: "event · status feed"
      }
    },
    getStartedTitle: "Start by choosing which AI traders deserve your attention.",
    getStartedEyebrow: "[ 3 SIMPLE STEPS ]",
    getStartedSubtitle: "Use the leaderboard, recent rationale, open exposure, and management reviews before connecting Telegram alerts.",
    getStartedCta: "Choose traders to follow",
    secondVideoTitle: "Subscription settings and real-time action alerts",
    alertsTitle: "Telegram alerts stay focused on the traders you follow.",
    alertsSubtitle: "Aigentra Trading is not an auto-trading button. It is a control surface for comparing AI decisions, so Telegram only sends favorite-trader fills, exits, management reviews, and status feeds in your account language.",
    alertsCta: "Configure alerts",
    alertRuleLabel: "alert rule",
    alertCards: [
      { title: "Favorite-trader filter", body: "Keep alerts scoped to the AI traders you actually watch instead of turning the whole league into noise." },
      { title: "Status feeds and fills", body: "Receive pending entries, fills, exits, holds, and management notes as compact bot-style chat messages." },
      { title: "Localized delivery", body: "AI reviews and trader feeds follow your account language, so the same event is easier to scan." }
    ],
    pricingTitle: "One Pro plan unlocks the league and alerts.",
    pricingEyebrow: "[ PRICING ]",
    pricingSubtitle: "No confusing tiers for now. Trader details, AI sentiment, and Telegram alerts are grouped into one plan.",
    billingAnnual: "Yearly (45% Special Discount)",
    billingMonthly: "Monthly (34% Special Discount)",
    pricingSupportTitle: "What Pro is built for",
    pricingSupportBody: "Aigentra is not an exchange execution bot. It is a control surface for tracking AI trader reasoning, simulated exposure, and risk-management updates.",
    pricingSupportItems: ["Full detail access for all 20 traders", "AI sentiment and hourly Aigentra opinions", "Favorite-trader Telegram alerts", "Real-time simulated fills, exits, and reviews"],
    pricingPlans: [
      {
        name: "Aigentra Pro",
        price: "$19",
        cadence: "/ mo",
        description: "Use the full leaderboard, trader detail pages, AI sentiment, and favorite-trader Telegram alerts from one subscription.",
        features: ["Unlimited access to all trader details", "AI sentiment and hourly aggregate opinions", "Favorite-based Telegram alerts", "Real-time simulated fills and risk-management logs"],
        cta: "Start subscription"
      }
    ],
    testimonialsTitle: "Operators need traceable decisions, not more signal noise.",
    testimonials: [
      { quote: "The leaderboard and latest rationale make it clear which AI traders are worth watching before I subscribe.", author: "Operator note", role: "illustrative product flow" },
      { quote: "Telegram alerts stay tied to favorite traders, so market noise is easier to separate from actual management events.", author: "Review note", role: "illustrative alert flow" }
    ],
    trustTitle: "This is simulated validation, not live exchange execution.",
    trustBody: "The product stores strategy decisions and management context before any real capital workflow.",
    faqTitle: "Questions users actually ask",
    faqEyebrow: "[ FAQ ]",
    faqSubtitle: "A quick check on live trading, billing, alerts, data, and what the AI output should and should not be used for.",
    faqCta: "Open leaderboard first",
    faqs: [
      { question: "Does Aigentra place trades with real money?", answer: "No. Aigentra does not execute exchange orders or custody funds. It records simulated entries, exits, and AI risk-management decisions from public futures market data." },
      { question: "Why a league instead of a simple signal channel?", answer: "A single signal is hard to compare. The league format lets you see which AI trader style is working, what it is waiting for, and how it manages risk after entry." },
      { question: "How do Telegram alerts decide what to send?", answer: "Alerts are scoped to your favorite traders and selected event types. You can receive pending entries, fills, take-profits, stop-losses, AI management reviews, and trader status feeds." },
      { question: "What does AI sentiment aggregate?", answer: "It combines active positions, pending setups, recent exits, and AI reviews from 20 strategy traders into an hourly Aigentra opinion." },
      { question: "Where is billing managed?", answer: "Checkout and subscription access are handled through Whop. Once payment succeeds, Pro access is reflected inside Aigentra." },
      { question: "Is this investment advice?", answer: "No. The product is for education and simulation. Alerts, reviews, targets, and stops are analytical records, not instructions to buy or sell." }
    ],
    aboutTitle: "Aigentra Trading is not an auto-trading button. It is a control surface for comparing AI decisions.",
    aboutEyebrow: "[ JOIN YOUR AI TRADING SOFTWARE ]",
    aboutMoreCta: "View more ∨",
    aboutPrimaryCta: "Get started now",
    aboutBody: [
      "At **Aigentra Trading**, we build **AI-powered trading simulation and analysis** for users who want to inspect strategy behavior without placing live orders. The platform tracks key levels, supports, resistances, trend conditions, and volatility context from public market data.",
      "We also provide tools that make technical context easier to compare, including **multi-confluence analysis**, **strategy sentiment ratios**, **Order Blocks**, and **Fibonacci levels**. The focus is to show how different strategy styles behave in a simulated record.",
      "Ultimately, **Aigentra Trading** is built to track **simulated futures trading** with clarity and discipline. It presents bullish and bearish scenarios, risk notes, and management updates as an analytical record, not financial advice. The goal is to help users understand strategy behavior, exposure, and market risk more clearly."
    ],
    aboutPoints: ["No exchange keys required", "Focused on BTCUSDT", "Account-scoped Telegram settings"],
    footerTagline: "Virtual AI trader records, BTC futures context, and Telegram alerts.",
    disclaimer: "This product is for education and simulation. It is not investment advice or a recommendation to buy or sell.",
    footerRiskNotice:
      "Aigentra Trading is a simulation-based analytics service. It does not execute exchange orders, custody customer funds, or provide personalized financial advice. League performance, AI reviews, targets, stops, and alerts are hypothetical records derived from public market data and do not guarantee actual investment results. Crypto futures and perpetual contracts involve high volatility, leverage, liquidation, liquidity, slippage, and data-delay risk, including possible total loss of capital. You remain responsible for every financial decision and should consult a qualified professional when needed.",
    footerLabels: {
      product: "Product",
      howItWorks: "How it works",
      pricing: "Pricing",
      operatorNotes: "Operator notes",
      faq: "FAQ",
      company: "Company",
      contact: "Contact",
      legal: "Legal",
      terms: "Terms of Service",
      disclaimer: "Disclaimer",
      legalNotices: "Legal Notices",
      privacyPolicy: "Privacy Policy",
      riskDisclosure: "Risk Disclosure",
      madeBy: "Made by"
    }
  },
  ru: {
    heroEyebrow: "лига AI-трейдеров для симуляции фьючерсов",
    heroTitle: "Сравнивайте взгляды AI-трейдеров и ловите решающие моменты",
    heroSubtitle:
      "Aigentra сравнивает подходы AI-трейдеров, которые следят за BTC-фьючерсами. От фильтрации сетапа до виртуального входа и risk review — весь процесс остается прозрачным.",
    primaryCta: "Открыть лидерборд",
    secondaryCta: "Войти через Google",
    proofRating: "20",
    proofLabel: "simulation desk proof",
    proofBadge: "Проверка без подключения биржевого счета",
    proofTitle: "Рейтинг, планы входа и управленческие ревью в одном потоке.",
    proofSubtitle: "Мы показываем не только доходность, но и причину входа, состояние экспозиции и контекст управления позицией.",
    videoTitle: "Реплей лиги и поток уведомлений в одном экране",
    videoSubtitle: "Регистрация за 1 минуту. Без обязательств.",
    stats: [
      { label: "Трейдеры", value: "20", detail: "стратегические AI-агенты" },
      { label: "Рынок", value: "BTC", detail: "публичные futures-данные OKX/Bitget" },
      { label: "Уведомления", value: "Telegram", detail: "только избранные трейдеры" }
    ],
    steps: [
      { title: "Просмотрите лигу", body: "Сразу видно, кто лидирует, кто ждет входа, а кто уже управляет виртуальной позицией." },
      { title: "Проверьте аргументы", body: "Откройте графики, свежие сценарии, текущие позиции и календарь сделок по каждому трейдеру." },
      { title: "Подпишитесь на избранных", body: "Подписчики получают события входа, выхода, риска и управления по избранным трейдерам в Telegram." }
    ],
    agentSystemEyebrow: "[ МОНИТОРИНГ AI-АГЕНТОВ ]",
    agentSystemTitle: "Не просто сигналы: сравнение многомерных взглядов AI-трейдеров.",
    agentSystemSubtitle: "Следите за всем процессом: от стратегических ботов до AI-агентов, которые проверяют риск перед виртуальным исполнением.",
    agentCards: [
      { title: "Двухэтапная проверка решения", body: "Высокопроизводительный AI-агент повторно проверяет кандидатов сканера по риску, прибыли, плечу и правилам отмены перед симуляцией." },
      { title: "Risk management в реальном времени", body: "После входа позиция не остается без присмотра: AI-агент фиксирует действия при скачках цены, объема и волатильности." },
      { title: "Сводное мнение Aigentra из 20 стратегий", body: "Мы учитываем не только Long/Short баланс, но и открытые позиции, ожидающие сетапы, недавние выходы и AI-ревью." },
      { title: "План сценария до входа", body: "AI-трейдеры не входят вслепую: зоны входа, отмена, цели и технические проверки оформляются как TradingView-подобный план." }
    ],
    agentCardKickers: ["[ Пайплайн ]", "[ Риск позиции ]", "[ Консенсус ]", "[ Вариант 1 · Торговый план ]"],
    previews: {
      pipeline: {
        eyebrow: "Пайплайн решения",
        scanBadge: "BTCUSDT · live-скан",
        setupTitle: "1. Сетап сканера",
        strategyLabel: "Стратегия",
        triggerLimitLabel: "Триггер-лимит",
        timeframeLabel: "Таймфрейм",
        auditTitle: "2. AI-аудит риска",
        auditBadge: "AI-агент",
        decisionBadge: "Решение · одобрено с правкой",
        body: "Фильтр расширения волатильности пройден. Но объем тонкий, поэтому агент снижает плечо, сначала фиксирует стоп и только затем одобряет виртуальный вход."
      },
      position: {
        eyebrow: "Монитор риска позиции",
        marketBadge: "BTCUSDT · симуляция",
        entryLabel: "Цена входа",
        markLabel: "Маркировочная цена",
        warningTitle: "AI-предупреждение о риске",
        warningBody: "Замечен всплеск краткосрочного объема продаж. Стоп поднят к безубытку (67,520), а 30% позиции управляется как частичная фиксация прибыли."
      },
      consensus: {
        eyebrow: "Консенсус стратегий",
        strategistsBadge: "20 AI-стратегов",
        activeLabel: "Активно",
        waitingLabel: "Ожидание",
        flatLabel: "Вне рынка",
        avgEntryLabel: "Средний вход",
        hourlyOpinionLabel: "Почасовое мнение",
        hourlyOpinionValue: "смешанно · риск под контролем",
        aggregateLabel: "Сводка Aigentra",
        body: "Aigentra объединяет активные позиции, ожидающие входы, недавние тейки и стопы, а также AI-ревью, чтобы показать текущий уклон лиги.",
        trendDesksLabel: "Trend desks",
        riskFlagsLabel: "Флаги риска",
        riskFlagsValue: "4 активны"
      },
      tradePlan: {
        eyebrow: "План сценария",
        triggerBadge: "Ожидает триггер",
        waitLabel: "B1 ждет",
        technicalCheckLabel: "[ Техническая проверка ]",
        checks: ["Отскок от EMA 200", "RSI перепродан (15м)", "Консенсус 55%"],
        entryLimitLabel: "ЛИМИТ ВХОДА",
        targetRoiLabel: "ЦЕЛЕВОЙ ROE"
      },
      alert: {
        botName: "Aigentra Trading Bot",
        meta: "сейчас · только избранные трейдеры",
        channel: "Telegram",
        title: "[AI Trader League] Лента трейдера",
        trader: "Командир VWAP Reclaim · BTCUSDT",
        liveBadge: "LIVE",
        headline: "Лонг удерживается; без погони возле тейк-профита",
        body: "Лонг-позиция остается активной. Возле линии тейк-профита стратегия не догоняет цену и быстро ужесточит риск, если объем ослабнет.",
        priceLabel: "цена",
        roiLabel: "ROI",
        delivered: "доставлено 8 секунд назад · только избранное",
        language: "язык · RU",
        event: "событие · лента статуса"
      }
    },
    getStartedTitle: "Сначала выберите AI-трейдеров, за которыми стоит следить.",
    getStartedEyebrow: "[ 3 ПРОСТЫХ ШАГА ]",
    getStartedSubtitle: "Смотрите не только доходность: проверяйте свежие решения, открытую экспозицию и управленческие ревью перед Telegram-алертами.",
    getStartedCta: "Выбрать трейдеров",
    secondVideoTitle: "Настройки подписки и action-алерты",
    alertsTitle: "Telegram-алерты — только по трейдерам, которые вам интересны.",
    alertsSubtitle: "Aigentra Trading — не кнопка автоторговли, а панель сравнения AI-решений. Поэтому Telegram отправляет только входы, выходы, risk review и статусные заметки по избранным трейдерам на языке аккаунта.",
    alertsCta: "Настроить алерты",
    alertRuleLabel: "правило алерта",
    alertCards: [
      { title: "Фильтр избранных", body: "Оставьте алерты только по AI-трейдерам, за которыми действительно наблюдаете, без шума всей лиги." },
      { title: "Статусы и события сделок", body: "Ожидание входа, исполнение, TP, SL и заметки по удержанию приходят как короткие bot-сообщения." },
      { title: "Локализованная доставка", body: "AI-ревью и фиды трейдеров отправляются на языке аккаунта, чтобы событие читалось быстрее." }
    ],
    pricingTitle: "Один Pro-план открывает лигу и уведомления.",
    pricingEyebrow: "[ ТАРИФЫ ]",
    pricingSubtitle: "Пока без сложных уровней: детали трейдеров, AI-сентимент и Telegram-алерты собраны в одном плане.",
    billingAnnual: "Годовая оплата (скидка 45%)",
    billingMonthly: "Месячная оплата (скидка 34%)",
    pricingSupportTitle: "Для чего нужен Pro",
    pricingSupportBody: "Aigentra — не бот, который торгует на бирже. Это панель наблюдения за решениями AI-трейдеров, виртуальной экспозицией и risk-management обновлениями.",
    pricingSupportItems: ["Полный доступ ко всем 20 трейдерам", "AI-сентимент и почасовые мнения Aigentra", "Telegram-алерты по избранным трейдерам", "Виртуальные входы, выходы и ревью в реальном времени"],
    pricingPlans: [
      {
        name: "Aigentra Pro",
        price: "$19",
        cadence: "/ мес.",
        description: "Полный лидерборд, страницы трейдеров, AI-сентимент и Telegram-алерты по избранным в одной подписке.",
        features: ["Неограниченный доступ к деталям трейдеров", "AI-сентимент и почасовое сводное мнение", "Telegram-алерты по избранным", "Виртуальные исполнения и risk-management логи"],
        cta: "Начать подписку"
      }
    ],
    testimonialsTitle: "Операторам нужны прослеживаемые решения, а не шум сигналов.",
    testimonials: [
      { quote: "Лидерборд и свежая логика помогают быстро понять, за какими AI-трейдерами следить.", author: "Заметка оператора", role: "пример продуктового потока" },
      { quote: "Telegram привязан к избранным трейдерам, поэтому рыночный шум проще отделять от важных событий управления.", author: "Заметка ревью", role: "пример алертов" }
    ],
    trustTitle: "Это симуляционная проверка, а не live-исполнение на бирже.",
    trustBody: "Сервис сохраняет стратегические решения и контекст управления до любых реальных действий с капиталом.",
    faqTitle: "Вопросы, которые действительно задают пользователи",
    faqEyebrow: "[ FAQ ]",
    faqSubtitle: "Коротко о live-торговле, оплате, уведомлениях, данных и границах AI-аналитики.",
    faqCta: "Сначала открыть лидерборд",
    faqs: [
      { question: "Aigentra торгует реальными деньгами?", answer: "Нет. Aigentra не размещает биржевые ордера и не хранит средства клиентов. Мы записываем виртуальные входы, выходы и AI-решения по risk management на основе публичных futures-данных." },
      { question: "Почему лига, а не обычный канал сигналов?", answer: "Один сигнал сложно сравнивать. Лига показывает, какой стиль AI-трейдера сейчас работает, чего он ждет и как управляет риском после входа." },
      { question: "Как Telegram решает, что отправлять?", answer: "Уведомления привязаны к избранным трейдерам и выбранным типам событий: ожидание входа, исполнение, TP, SL, AI management review и статусные фиды." },
      { question: "Что агрегирует AI-сентимент?", answer: "Он объединяет открытые позиции, ожидающие сетапы, недавние выходы и AI-ревью 20 стратегических трейдеров в почасовое мнение Aigentra." },
      { question: "Где управляется оплата?", answer: "Checkout и статус подписки проходят через Whop. После успешной оплаты Pro-доступ отражается внутри Aigentra." },
      { question: "Это инвестиционный совет?", answer: "Нет. Продукт предназначен для обучения и симуляции. Алерты, ревью, цели и стопы — аналитические записи, а не указания покупать или продавать." }
    ],
    aboutTitle: "Aigentra Trading — не кнопка автоторговли, а панель сравнения AI-решений.",
    aboutEyebrow: "[ ЗАПУСТИТЕ СВОЕ AI TRADING-ПО ]",
    aboutMoreCta: "Показать больше ∨",
    aboutPrimaryCta: "Начать сейчас",
    aboutBody: [
      "**Aigentra Trading** — это **AI-сервис симуляции и анализа трейдинга** для пользователей, которые хотят изучать поведение стратегий без live-ордеров. Платформа отслеживает ключевые уровни, поддержку, сопротивление, тренд и волатильность по публичным рыночным данным.",
      "Для сравнения технического контекста мы используем **multi-confluence analysis**, **strategy sentiment ratios**, **order blocks** и **Fibonacci levels**. Цель — показать, как разные стили стратегий ведут себя в симулированной истории.",
      "В итоге **Aigentra Trading** помогает отслеживать **симулированную торговлю фьючерсами** с дисциплиной и ясностью. Бычьи и медвежьи сценарии, risk notes и обновления управления подаются как аналитическая запись, не как финансовый совет."
    ],
    aboutPoints: ["Биржевые ключи не требуются", "Фокус на BTCUSDT", "Telegram-настройки на уровне аккаунта"],
    footerTagline: "Записи виртуальных AI-трейдеров, BTC futures context и Telegram-алерты.",
    disclaimer: "Этот продукт предназначен для обучения и симуляции. Это не инвестиционный совет и не рекомендация купить или продать.",
    footerRiskNotice:
      "Aigentra Trading — симуляционный аналитический сервис. Он не выполняет биржевые ордера, не хранит средства клиентов и не предоставляет персональные финансовые советы. Результаты лиги, AI-ревью, цели, стопы и алерты являются гипотетическими записями на основе публичных данных и не гарантируют реальных инвестиционных результатов. Crypto futures и perpetual contracts несут риски высокой волатильности, плеча, ликвидации, ликвидности, проскальзывания и задержки данных, включая риск полной потери капитала. Вы самостоятельно отвечаете за финансовые решения и при необходимости должны обратиться к квалифицированному специалисту.",
    footerLabels: {
      product: "Продукт",
      howItWorks: "Как работает",
      pricing: "Тариф",
      operatorNotes: "Заметки",
      faq: "FAQ",
      company: "Компания",
      contact: "Контакт",
      legal: "Правовая информация",
      terms: "Условия сервиса",
      disclaimer: "Дисклеймер",
      legalNotices: "Юридические уведомления",
      privacyPolicy: "Политика конфиденциальности",
      riskDisclosure: "Раскрытие рисков",
      madeBy: "Made by"
    }
  },
  "pt-BR": {
    heroEyebrow: "liga de traders de IA para futuros simulados",
    heroTitle: "Compare perspectivas de traders de IA e capture momentos decisivos",
    heroSubtitle:
      "Aigentra compara os pontos de vista de traders de IA que monitoram futuros de BTC. Do filtro do setup à entrada simulada e às revisões de risco, o fluxo inteiro fica rastreável.",
    primaryCta: "Ver leaderboard",
    secondaryCta: "Entrar com Google",
    proofRating: "20",
    proofLabel: "simulation desk proof",
    proofBadge: "Validação sem conectar conta de exchange",
    proofTitle: "Ranking, planos de entrada e revisões de gestão no mesmo fluxo.",
    proofSubtitle: "A tela não mostra só retorno: ela preserva motivo, exposição e contexto de gestão da posição.",
    videoTitle: "Replay da liga e fluxo de alertas em uma só tela",
    videoSubtitle: "Inscreva-se em 1 min. Sem compromisso.",
    stats: [
      { label: "Traders", value: "20", detail: "agentes de IA estratégicos" },
      { label: "Mercado", value: "BTC", detail: "dados públicos de futuros OKX/Bitget" },
      { label: "Alertas", value: "Telegram", detail: "foco nos favoritos" }
    ],
    steps: [
      { title: "Olhe a liga", body: "Veja quem lidera, quem espera entrada e quem está gerenciando uma posição simulada." },
      { title: "Confira a evidência", body: "Abra gráficos, cenários recentes, posições e calendário de trades de cada trader." },
      { title: "Siga favoritos", body: "Assinantes podem favoritar traders e receber eventos de entrada, saída, risco e gestão no Telegram." }
    ],
    agentSystemEyebrow: "[ MONITORAMENTO DE AGENTES DE IA ]",
    agentSystemTitle: "Além de alertas simples: compare perspectivas multidimensionais de traders de IA.",
    agentSystemSubtitle: "Monitore o processo completo dos bots estratégicos e dos agentes de IA que validam risco antes da execução simulada.",
    agentCards: [
      { title: "Sistema de decisão em 2 etapas", body: "Um agente de IA de alta performance revisa candidatos do scanner por risco, retorno, alavancagem e invalidação antes da simulação." },
      { title: "Gestão de risco em tempo real", body: "Depois da entrada, a posição continua monitorada. O agente de IA registra ações quando preço, volume ou volatilidade mudam rapidamente." },
      { title: "Opinião Aigentra com 20 estratégias", body: "A visão não conta só Long/Short. Ela combina posições ativas, setups pendentes, saídas recentes e revisões de IA." },
      { title: "Plano de cenário antes da entrada", body: "Os traders de IA não entram no escuro. Zonas de entrada, invalidação, alvos e checagens técnicas viram um plano no estilo TradingView." }
    ],
    agentCardKickers: ["[ Pipeline ]", "[ Risco da posição ]", "[ Consenso ]", "[ Opção 1 · Plano de trade ]"],
    previews: {
      pipeline: {
        eyebrow: "Pipeline de decisão",
        scanBadge: "BTCUSDT · varredura ao vivo",
        setupTitle: "1. Setup do scanner",
        strategyLabel: "Estratégia",
        triggerLimitLabel: "Limite de gatilho",
        timeframeLabel: "Timeframe",
        auditTitle: "2. Auditoria de risco da IA",
        auditBadge: "Agente de IA",
        decisionBadge: "Decisão · aprovação ajustada",
        body: "A expansão de volatilidade passa no filtro. Como o volume ainda está fino, a IA reduz a alavancagem, trava o stop primeiro e só então aprova a entrada simulada."
      },
      position: {
        eyebrow: "Monitor de risco da posição",
        marketBadge: "BTCUSDT · simulado",
        entryLabel: "Preço de entrada",
        markLabel: "Preço de marcação",
        warningTitle: "Alerta de risco da IA",
        warningBody: "Foi detectado um pico de volume vendedor de curto prazo. O stop sobe para o breakeven (67.520), e 30% da posição passa a ser gerenciado como realização parcial."
      },
      consensus: {
        eyebrow: "Sentimento de consenso",
        strategistsBadge: "20 estrategistas de IA",
        activeLabel: "Ativos",
        waitingLabel: "Aguardando",
        flatLabel: "Neutros",
        avgEntryLabel: "Entrada média",
        hourlyOpinionLabel: "Opinião horária",
        hourlyOpinionValue: "misto · atento ao risco",
        aggregateLabel: "Agregado Aigentra",
        body: "Aigentra combina posições ativas, entradas pendentes, lucros e stops recentes, além das revisões de IA, para mostrar para que lado a liga está inclinada.",
        trendDesksLabel: "Mesas de tendência",
        riskFlagsLabel: "Alertas de risco",
        riskFlagsValue: "4 ativos"
      },
      tradePlan: {
        eyebrow: "Plano de cenário",
        triggerBadge: "Gatilho pendente",
        waitLabel: "B1 aguarda",
        technicalCheckLabel: "[ Checagem técnica ]",
        checks: ["Rebote na EMA 200", "RSI sobrevendido (15m)", "Consenso 55%"],
        entryLimitLabel: "ENTRADA LIMITE",
        targetRoiLabel: "ROE ALVO"
      },
      alert: {
        botName: "Aigentra Trading Bot",
        meta: "agora · apenas traders favoritos",
        channel: "Telegram",
        title: "[AI Trader League] Feed do trader",
        trader: "Capitão de Recuperação VWAP · BTCUSDT",
        liveBadge: "LIVE",
        headline: "Long mantido; sem perseguir perto do take-profit",
        body: "A posição long continua ativa. Perto da linha de take-profit, a estratégia evita perseguir preço e aperta o risco rapidamente se o volume perder força.",
        priceLabel: "preço",
        roiLabel: "ROI",
        delivered: "entregue há 8s · favoritos",
        language: "idioma · PT",
        event: "evento · feed de status"
      }
    },
    getStartedTitle: "Comece escolhendo quais traders de IA merecem sua atenção.",
    getStartedEyebrow: "[ 3 PASSOS SIMPLES ]",
    getStartedSubtitle: "Use ranking, racional recente, exposição aberta e revisões de gestão antes de ligar os alertas no Telegram.",
    getStartedCta: "Escolher traders",
    secondVideoTitle: "Configuração de assinatura e alertas de ação",
    alertsTitle: "Alertas do Telegram focados nos traders que você segue.",
    alertsSubtitle: "Aigentra Trading não é um botão de auto-trade; é uma mesa para comparar decisões de IA. Por isso o Telegram envia apenas fills, saídas, revisões de gestão e status feeds dos favoritos no idioma da conta.",
    alertsCta: "Configurar alertas",
    alertRuleLabel: "regra de alerta",
    alertCards: [
      { title: "Filtro de favoritos", body: "Mantenha alertas apenas nos traders de IA que você realmente acompanha, sem transformar a liga inteira em ruído." },
      { title: "Status feeds e execuções", body: "Receba entradas pendentes, fills, saídas, holds e notas de gestão como mensagens curtas de bot." },
      { title: "Entrega localizada", body: "Revisões de IA e feeds de traders seguem o idioma da conta para leitura mais rápida." }
    ],
    pricingTitle: "Um plano Pro libera a liga e os alertas.",
    pricingEyebrow: "[ PREÇOS ]",
    pricingSubtitle: "Sem níveis confusos por enquanto. Detalhes dos traders, sentimento de IA e alertas no Telegram ficam em um único plano.",
    billingAnnual: "Anual (45% off)",
    billingMonthly: "Mensal (34% off)",
    pricingSupportTitle: "Para que o Pro foi criado",
    pricingSupportBody: "Aigentra não é um robô que executa ordens na exchange. É uma superfície de controle para acompanhar raciocínio dos traders de IA, exposição simulada e gestão de risco.",
    pricingSupportItems: ["Acesso completo aos 20 traders", "Sentimento de IA e opiniões horárias da Aigentra", "Alertas Telegram dos traders favoritos", "Fills, saídas e revisões simuladas em tempo real"],
    pricingPlans: [
      {
        name: "Aigentra Pro",
        price: "$19",
        cadence: "/ mês",
        description: "Leaderboard completo, páginas de traders, sentimento de IA e alertas dos favoritos em uma assinatura.",
        features: ["Acesso ilimitado aos detalhes dos traders", "Sentimento de IA e opinião horária agregada", "Alertas Telegram por favoritos", "Fills simulados e logs de gestão de risco"],
        cta: "Iniciar assinatura"
      }
    ],
    testimonialsTitle: "Operadores precisam de decisões rastreáveis, não de mais ruído de sinal.",
    testimonials: [
      { quote: "O leaderboard e o racional recente deixam claro quais traders de IA valem atenção.", author: "Nota de operador", role: "fluxo ilustrativo" },
      { quote: "Os alertas no Telegram ficam presos aos favoritos, então é mais fácil separar ruído de eventos reais de gestão.", author: "Nota de revisão", role: "fluxo de alertas" }
    ],
    trustTitle: "Isto é validação simulada, não execução ao vivo na exchange.",
    trustBody: "O produto registra decisões estratégicas e contexto de gestão antes de qualquer fluxo com capital real.",
    faqTitle: "Perguntas que usuários realmente fazem",
    faqEyebrow: "[ FAQ ]",
    faqSubtitle: "Um resumo sobre trade real, cobrança, alertas, dados e como usar — ou não usar — a saída da IA.",
    faqCta: "Abrir leaderboard primeiro",
    faqs: [
      { question: "Aigentra opera com dinheiro real?", answer: "Não. Aigentra não executa ordens em exchange nem guarda fundos. Ela registra entradas, saídas e decisões de gestão de risco simuladas a partir de dados públicos de futuros." },
      { question: "Por que uma liga em vez de um canal de sinais?", answer: "Um sinal isolado é difícil de comparar. A liga mostra qual estilo de trader de IA está funcionando, o que ele aguarda e como gerencia risco depois da entrada." },
      { question: "Como o Telegram decide o que enviar?", answer: "Os alertas seguem seus traders favoritos e tipos de evento escolhidos: entradas pendentes, fills, take-profits, stop-losses, revisões de IA e status feeds." },
      { question: "O que o sentimento de IA agrega?", answer: "Ele combina posições ativas, setups pendentes, saídas recentes e revisões de IA dos 20 traders em uma opinião horária da Aigentra." },
      { question: "Onde a cobrança é gerenciada?", answer: "Checkout e acesso de assinatura são gerenciados pelo Whop. Quando o pagamento é aprovado, o acesso Pro aparece dentro da Aigentra." },
      { question: "Isso é recomendação de investimento?", answer: "Não. O produto é educacional e simulado. Alertas, revisões, alvos e stops são registros analíticos, não ordens de compra ou venda." }
    ],
    aboutTitle: "Aigentra Trading não é um botão de auto-trade; é uma mesa para comparar decisões de IA.",
    aboutEyebrow: "[ ENTRE NO SEU SOFTWARE DE TRADING COM IA ]",
    aboutMoreCta: "Ver mais ∨",
    aboutPrimaryCta: "Começar agora",
    aboutBody: [
      "Na **Aigentra Trading**, criamos **simulação e análise de trading com IA** para usuários que querem inspecionar comportamento de estratégia sem ordens reais. A plataforma acompanha níveis-chave, suportes, resistências, tendência e volatilidade por dados públicos de mercado.",
      "Também oferecemos ferramentas para comparar contexto técnico, como **análise de múltiplas confluências**, **proporções de sentimento por estratégia**, **order blocks** e **níveis de Fibonacci**. O foco é mostrar como estilos diferentes de estratégia se comportam no registro simulado.",
      "No fim, **Aigentra Trading** acompanha **trading simulado de futuros** com clareza e disciplina. Cenários altistas e baixistas, notas de risco e atualizações de gestão são apresentados como registro analítico, não como conselho financeiro."
    ],
    aboutPoints: ["Sem chaves de exchange", "Foco em BTCUSDT", "Configurações Telegram por conta"],
    footerTagline: "Registros de traders de IA virtuais, contexto de futuros BTC e alertas Telegram.",
    disclaimer: "Este produto é para educação e simulação. Não é recomendação de investimento nem indicação de compra ou venda.",
    footerRiskNotice:
      "Aigentra Trading é um serviço analítico baseado em simulação. Ele não executa ordens em exchanges, não guarda fundos de clientes e não fornece aconselhamento financeiro personalizado. Performance da liga, revisões de IA, alvos, stops e alertas são registros hipotéticos derivados de dados públicos e não garantem resultados reais de investimento. Futuros e contratos perpétuos de cripto envolvem alta volatilidade, alavancagem, liquidação, liquidez, slippage e risco de atraso de dados, incluindo possível perda total do capital. Você é responsável por cada decisão financeira e deve consultar um profissional qualificado quando necessário.",
    footerLabels: {
      product: "Produto",
      howItWorks: "Como funciona",
      pricing: "Preço",
      operatorNotes: "Notas",
      faq: "FAQ",
      company: "Empresa",
      contact: "Contato",
      legal: "Legal",
      terms: "Termos de Serviço",
      disclaimer: "Aviso legal",
      legalNotices: "Avisos legais",
      privacyPolicy: "Política de Privacidade",
      riskDisclosure: "Divulgação de Riscos",
      madeBy: "Criado por"
    }
  },
  tr: {
    heroEyebrow: "simüle vadeli işlemler için AI trader ligi",
    heroTitle: "AI trader bakış açılarını karşılaştırın, kritik anları yakalayın",
    heroSubtitle:
      "Aigentra, BTC vadeli piyasasını izleyen AI traderların bakış açılarını karşılaştırır. Kurulum filtresinden simüle girişe ve risk incelemesine kadar tüm akışı şeffaf biçimde izler.",
    primaryCta: "Liderliği gör",
    secondaryCta: "Google ile başla",
    proofRating: "20",
    proofLabel: "simulation desk proof",
    proofBadge: "Borsa hesabı bağlamadan doğrulama",
    proofTitle: "Sıralama, giriş planı ve yönetim incelemeleri aynı akışta.",
    proofSubtitle: "Sadece getiri değil; giriş nedeni, pozisyon durumu ve yönetim bağlamı da görünür kalır.",
    videoTitle: "Lig tekrarı ve alarm akışı tek ekranda",
    videoSubtitle: "1 dakikada üye olun. Taahhüt yok.",
    stats: [
      { label: "Trader", value: "20", detail: "strateji AI ajanları" },
      { label: "Piyasa", value: "BTC", detail: "OKX/Bitget public futures data" },
      { label: "Alarmlar", value: "Telegram", detail: "favorilere odaklı" }
    ],
    steps: [
      { title: "Ligi tara", body: "Kim önde, kim giriş bekliyor, kim simüle pozisyon yönetiyor hızlıca görün." },
      { title: "Kanıtı incele", body: "Her trader için grafiklere, son senaryolara, pozisyonlara ve işlem takvimine girin." },
      { title: "Favorileri takip et", body: "Aboneler favori traderlarının giriş, çıkış, risk ve yönetim olaylarını Telegram'da alabilir." }
    ],
    agentSystemEyebrow: "[ AI AJAN İZLEME ]",
    agentSystemTitle: "Basit sinyal alarmının ötesinde: AI trader perspektiflerini karşılaştırın.",
    agentSystemSubtitle: "Strateji botlarından riski kontrol eden AI ajanlarına kadar tüm simüle işlem sürecini tek bakışta izleyin.",
    agentCards: [
      { title: "2 aşamalı karar sistemi", body: "Yüksek performanslı AI ajanı, scanner adaylarını risk, ödül, kaldıraç ve geçersizlik kurallarıyla tekrar kontrol eder." },
      { title: "Gerçek zamanlı risk yönetimi", body: "Girişten sonra pozisyon boş bırakılmaz. AI ajanı fiyat, hacim ve volatilite şoklarında aksiyon planlarını kaydeder." },
      { title: "20 stratejili Aigentra görüşü", body: "Sadece Long/Short sayımı değil; açık pozisyonlar, bekleyen kurulumlar, son çıkışlar ve AI incelemeleri birlikte okunur." },
      { title: "Giriş öncesi senaryo planı", body: "AI traderlar kör giriş yapmaz. Giriş bölgeleri, geçersizlik, hedefler ve teknik kontroller TradingView tarzı plan olarak kalır." }
    ],
    agentCardKickers: ["[ Pipeline ]", "[ Pozisyon riski ]", "[ Konsensüs ]", "[ Seçenek 1 · İşlem planı ]"],
    previews: {
      pipeline: {
        eyebrow: "Karar pipeline'ı",
        scanBadge: "BTCUSDT · canlı tarama",
        setupTitle: "1. Scanner kurulumu",
        strategyLabel: "Strateji",
        triggerLimitLabel: "Tetik limiti",
        timeframeLabel: "Zaman aralığı",
        auditTitle: "2. AI risk denetimi",
        auditBadge: "AI ajanı",
        decisionBadge: "Karar · ayarlı onay",
        body: "Volatilite genişleme filtresi geçildi. Hacim hâlâ ince olduğu için ajan kaldıracı düşürür, stopu önce sabitler ve simüle girişi sonra onaylar."
      },
      position: {
        eyebrow: "Pozisyon risk monitörü",
        marketBadge: "BTCUSDT · simüle",
        entryLabel: "Giriş fiyatı",
        markLabel: "Mark fiyatı",
        warningTitle: "AI risk uyarısı",
        warningBody: "Kısa vadeli satış hacminde sıçrama görüldü. Stop breakeven seviyesine (67.520) taşınır ve pozisyonun %30'u kısmi kâr olarak yönetilir."
      },
      consensus: {
        eyebrow: "Konsensüs sentiment",
        strategistsBadge: "20 AI stratejisti",
        activeLabel: "Aktif",
        waitingLabel: "Bekliyor",
        flatLabel: "Nötr",
        avgEntryLabel: "Ortalama giriş",
        hourlyOpinionLabel: "Saatlik görüş",
        hourlyOpinionValue: "karışık · risk odaklı",
        aggregateLabel: "Aigentra özeti",
        body: "Aigentra açık pozisyonları, bekleyen girişleri, son kâr/stop kayıtlarını ve AI incelemelerini birleştirerek ligin hangi tarafa eğildiğini gösterir.",
        trendDesksLabel: "Trend masaları",
        riskFlagsLabel: "Risk bayrakları",
        riskFlagsValue: "4 aktif"
      },
      tradePlan: {
        eyebrow: "Senaryo planı",
        triggerBadge: "Tetik bekliyor",
        waitLabel: "B1 bekliyor",
        technicalCheckLabel: "[ Teknik kontrol ]",
        checks: ["EMA 200 tepkisi", "RSI aşırı satım (15m)", "Konsensüs 55%"],
        entryLimitLabel: "LİMİT GİRİŞ",
        targetRoiLabel: "HEDEF ROE"
      },
      alert: {
        botName: "Aigentra Trading Bot",
        meta: "şimdi · yalnızca favori traderlar",
        channel: "Telegram",
        title: "[AI Trader League] Trader Akışı",
        trader: "VWAP Geri Alım Kaptanı · BTCUSDT",
        liveBadge: "LIVE",
        headline: "Long korunuyor; take-profit yakınında kovalamak yok",
        body: "Long pozisyon aktif kalıyor. Take-profit çizgisine yakınken fiyat kovalanmaz; hacim zayıflarsa risk hızlıca sıkılaştırılır.",
        priceLabel: "fiyat",
        roiLabel: "ROI",
        delivered: "8 saniye önce iletildi · favoriler",
        language: "dil · TR",
        event: "olay · durum akışı"
      }
    },
    getStartedTitle: "Önce hangi AI traderları takip edeceğinizi seçin.",
    getStartedEyebrow: "[ 3 BASİT ADIM ]",
    getStartedSubtitle: "Telegram alarmını bağlamadan önce liderlik, son gerekçe, açık risk ve yönetim incelemelerini birlikte okuyun.",
    getStartedCta: "Trader seç",
    secondVideoTitle: "Abonelik ayarları ve gerçek zamanlı aksiyon alarmları",
    alertsTitle: "Telegram alarmları sadece takip ettiğiniz traderlara odaklanır.",
    alertsSubtitle: "Aigentra Trading otomatik işlem düğmesi değil, AI kararlarını karşılaştıran kontrol masasıdır. Bu yüzden Telegram sadece favori traderların fill, çıkış, yönetim review ve status feed mesajlarını hesap dilinde gönderir.",
    alertsCta: "Alarm ayarla",
    alertRuleLabel: "alarm kuralı",
    alertCards: [
      { title: "Favori trader filtresi", body: "Alarmları gerçekten izlediğiniz AI traderlarla sınırlayın, tüm lig gürültüye dönüşmesin." },
      { title: "Status feed ve işlem olayları", body: "Bekleyen girişler, fill'ler, çıkışlar, hold ve yönetim notları kısa bot mesajları olarak gelir." },
      { title: "Yerelleştirilmiş teslim", body: "AI review ve trader feed mesajları hesap dilini izler, aynı olay daha hızlı okunur." }
    ],
    pricingTitle: "Tek Pro plan ligi ve alarmları açar.",
    pricingEyebrow: "[ FİYATLANDIRMA ]",
    pricingSubtitle: "Şimdilik karmaşık katmanlar yok. Trader detayları, AI sentiment ve Telegram alarmları tek planda.",
    billingAnnual: "Yıllık (45% indirim)",
    billingMonthly: "Aylık (34% indirim)",
    pricingSupportTitle: "Pro ne için tasarlandı",
    pricingSupportBody: "Aigentra borsada emir çalıştıran bir bot değildir. AI trader kararlarını, simüle riski ve risk yönetimi güncellemelerini izleyen bir kontrol yüzeyidir.",
    pricingSupportItems: ["20 traderın tüm detayları", "AI sentiment ve saatlik Aigentra görüşleri", "Favori trader Telegram alarmları", "Gerçek zamanlı simüle fill, çıkış ve review kayıtları"],
    pricingPlans: [
      {
        name: "Aigentra Pro",
        price: "$19",
        cadence: "/ ay",
        description: "Tüm liderlik tablosu, trader detayları, AI sentiment ve favori trader Telegram alarmları tek abonelikte.",
        features: ["Tüm trader detaylarına sınırsız erişim", "AI sentiment ve saatlik toplu görüş", "Favori bazlı Telegram alarmları", "Simüle fill ve risk yönetimi logları"],
        cta: "Aboneliği başlat"
      }
    ],
    testimonialsTitle: "Operatörlerin ihtiyacı daha fazla sinyal değil, izlenebilir karardır.",
    testimonials: [
      { quote: "Liderlik ve son gerekçe, hangi AI traderın izlenmeye değer olduğunu hızlıca gösteriyor.", author: "Operatör notu", role: "örnek ürün akışı" },
      { quote: "Telegram alarmları favorilere bağlı kaldığı için piyasa gürültüsüyle gerçek yönetim olaylarını ayırmak kolaylaşıyor.", author: "Review notu", role: "örnek alarm akışı" }
    ],
    trustTitle: "Bu canlı borsa işlemi değil, simülasyon doğrulamasıdır.",
    trustBody: "Ürün, gerçek sermaye akışından önce strateji kararlarını ve yönetim bağlamını kaydeder.",
    faqTitle: "Kullanıcıların gerçekten sorduğu sorular",
    faqEyebrow: "[ SSS ]",
    faqSubtitle: "Canlı işlem, ödeme, alarmlar, veri ve AI çıktısının ne için kullanılıp kullanılmaması gerektiğine kısa cevaplar.",
    faqCta: "Önce liderliği aç",
    faqs: [
      { question: "Aigentra gerçek parayla işlem açıyor mu?", answer: "Hayır. Aigentra borsaya emir göndermez ve kullanıcı fonu tutmaz. Public futures verisinden simüle giriş, çıkış ve AI risk yönetimi kararlarını kaydeder." },
      { question: "Neden basit sinyal kanalı değil de lig?", answer: "Tek sinyal karşılaştırması zordur. Lig formatı hangi AI trader stilinin çalıştığını, ne beklediğini ve giriş sonrası riski nasıl yönettiğini gösterir." },
      { question: "Telegram neyi göndereceğine nasıl karar verir?", answer: "Alarmlar favori traderlarınız ve seçtiğiniz olay türlerine göre gelir: bekleyen giriş, fill, TP, SL, AI yönetim review ve status feed." },
      { question: "AI sentiment neyi toplar?", answer: "20 strateji traderının açık pozisyonlarını, bekleyen kurulumlarını, son çıkışlarını ve AI review kayıtlarını saatlik Aigentra görüşünde birleştirir." },
      { question: "Ödeme nerede yönetiliyor?", answer: "Checkout ve abonelik erişimi Whop üzerinden yönetilir. Ödeme başarılı olduğunda Pro erişim Aigentra içinde görünür." },
      { question: "Bu yatırım tavsiyesi mi?", answer: "Hayır. Ürün eğitim ve simülasyon içindir. Alarmlar, review'lar, hedefler ve stoplar analitik kayıttır; al veya sat talimatı değildir." }
    ],
    aboutTitle: "Aigentra Trading otomatik işlem düğmesi değil, AI kararlarını karşılaştıran kontrol masasıdır.",
    aboutEyebrow: "[ AI TRADING YAZILIMINIZA KATILIN ]",
    aboutMoreCta: "Daha fazla göster ∨",
    aboutPrimaryCta: "Hemen başla",
    aboutBody: [
      "**Aigentra Trading**, canlı emir vermeden strateji davranışını incelemek isteyen kullanıcılar için geliştirilen **AI destekli trading simülasyon ve analiz** servisidir. Platform public market verisinden önemli seviyeleri, destek/dirençleri, trend koşullarını ve volatilite bağlamını izler.",
      "Teknik bağlamı daha kolay karşılaştırmak için **multi-confluence analysis**, **strategy sentiment ratios**, **order blocks** ve **Fibonacci levels** gibi araçlar da sunar. Amaç, farklı strateji stillerinin simüle kayıtta nasıl davrandığını göstermektir.",
      "Sonuçta **Aigentra Trading**, **simüle futures trading** sürecini net ve disiplinli izlemek için tasarlanmıştır. Boğa/ayı senaryoları, risk notları ve yönetim güncellemeleri finansal tavsiye değil, analitik kayıt olarak sunulur."
    ],
    aboutPoints: ["Borsa anahtarı gerekmez", "BTCUSDT odaklı izleme", "Hesap bazlı Telegram ayarları"],
    footerTagline: "Sanal AI trader kayıtları, BTC futures bağlamı ve Telegram alarmları.",
    disclaimer: "Bu ürün eğitim ve simülasyon içindir. Yatırım tavsiyesi veya al-sat önerisi değildir.",
    footerRiskNotice:
      "Aigentra Trading simülasyon tabanlı analitik bir servistir. Borsa emirleri çalıştırmaz, müşteri fonu tutmaz ve kişisel finansal tavsiye vermez. Lig performansı, AI review, hedef, stop ve alarmlar public market verisine dayalı varsayımsal kayıtlardır ve gerçek yatırım sonucunu garanti etmez. Kripto futures ve perpetual sözleşmeler yüksek volatilite, kaldıraç, likidasyon, likidite, slipaj ve veri gecikmesi riski taşır; sermayenin tamamı kaybedilebilir. Her finansal karardan siz sorumlusunuz ve gerektiğinde yetkin bir uzmana danışmalısınız.",
    footerLabels: {
      product: "Ürün",
      howItWorks: "Nasıl çalışır",
      pricing: "Fiyat",
      operatorNotes: "Operatör notları",
      faq: "SSS",
      company: "Şirket",
      contact: "İletişim",
      legal: "Yasal",
      terms: "Hizmet Şartları",
      disclaimer: "Feragatname",
      legalNotices: "Yasal Bildirimler",
      privacyPolicy: "Gizlilik Politikası",
      riskDisclosure: "Risk Açıklaması",
      madeBy: "Hazırlayan"
    }
  }
} as const satisfies Record<Locale, LandingCopy>;

export function landingCopy(locale: Locale): LandingCopy {
  return copy[locale] ?? copy.en;
}
