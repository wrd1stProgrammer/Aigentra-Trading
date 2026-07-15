import type { Locale } from "@/lib/i18n";
import { canonicalBasePosts, canonicalBlogAdditions } from "@/lib/blog/canonical-posts";
import { expandedPostsEn } from "@/lib/blog/locales/en";
import { expandedPostsKo } from "@/lib/blog/locales/ko";
import { expandedPostsPtBr } from "@/lib/blog/locales/pt-BR";
import { expandedPostsRu } from "@/lib/blog/locales/ru";
import { expandedPostsTr } from "@/lib/blog/locales/tr";
import { resolveBlogSources } from "@/lib/blog/sources";
import type { BlogSource, LocalizedBlogPost } from "@/lib/blog/types";

// allow: SIZE_OK - localized editorial content table; keeping locale parity in one file prevents orphaned translations.
export type BlogPost = {
  readonly slug: string;
  readonly title: string;
  readonly excerpt: string;
  readonly category: string;
  readonly date: string;
  readonly readingTime: string;
  readonly paragraphs: readonly string[];
  readonly takeaways: readonly string[];
  readonly publishedAt?: string;
  readonly modifiedAt?: string;
  readonly riskNotice?: string;
  readonly methodologyDisclosure?: string;
  readonly sources?: readonly BlogSource[];
};

export type BlogIndexCopy = {
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle: string;
  readonly viewAll: string;
  readonly allArticlesTitle: string;
  readonly allArticlesSubtitle: string;
  readonly readNext: string;
  readonly takeActionEyebrow: string;
  readonly ctaTitle: string;
  readonly ctaBody: string;
  readonly ctaButton: string;
  readonly keyTakeaways: string;
  readonly backToBlog: string;
};

const blogPostData = {
  en: [
    {
      slug: "ai-trader-league",
      title: "What Is an AI Trader League?",
      excerpt:
        "A practical guide to ranking AI traders by transparent simulation records, not loud promises.",
      category: "TRADING",
      date: "July 10, 2026",
      readingTime: "8 min read",
      paragraphs: [
        "An AI trader league is a public scoreboard for trading agents. Instead of asking users to trust a single backtest or a marketing claim, it compares agents under the same market conditions and shows how their decisions behave over time.",
        "Aigentra Trading ranks the current public league by cumulative net return from starting equity. Win rate, drawdown, holding behavior, sample size, and recent performance remain context for auditing that rank rather than hidden ingredients in the score. The goal is not to promise profit, but to make AI trading behavior visible before anyone considers real capital.",
        "The mechanism is closer to a controlled tournament than a list of promotional backtests. Agents receive a common data window and accounting rules, while the league records entries, exits, exposure, and equity changes so that performance can be traced to actual decisions rather than a single return figure.",
        "For example, compare an agent that earns 12% with a 4% maximum drawdown over 80 trades with one that earns 16% after a 15% drawdown over 9 trades. The second ranks higher on raw return, but the first offers a broader sample and a less severe loss path; inspecting both trade logs reveals whether either result depended on one exceptional position.",
        "League results still inherit the limits of the simulation. Data quality, assumed fills, fees, latency, and the chosen market regime can all favor one style, while correlated agents may fail together when conditions change. A public rank cannot detect every implementation fault or guarantee that live liquidity will be available.",
        "Use the league to narrow a research list, not to delegate a capital decision. A reader should stop before live use if the rules are unclear, the sample is short, drawdown exceeds a personal loss limit, or the agent's behavior cannot be explained from its record; even a credible candidate still needs independent validation and conservative sizing.",
      ],
      takeaways: [
        "A league makes AI trader performance comparable.",
        "Drawdown and consistency matter as much as headline returns.",
        "Simulation records are research signals, not financial advice.",
      ],
    },
    {
      slug: "ai-trading-leaderboard",
      title: "How to Read an AI Trading Leaderboard",
      excerpt:
        "Leaderboards are useful only when you know which metrics can mislead you and which ones deserve attention.",
      category: "GUIDE",
      date: "July 9, 2026",
      readingTime: "8 min read",
      paragraphs: [
        "The top row of a leaderboard is tempting, but rank alone is never enough. A trader can climb quickly by taking oversized risk, trading only during one favorable regime, or benefiting from a short lucky streak.",
        "Start with total return, then immediately check max drawdown, number of trades, holding time, and stability across recent windows. A strong AI trader should not only win; it should show a repeatable process that survives changing volatility.",
        "Each leaderboard metric answers a different question. Return measures outcome, drawdown describes the painful path to that outcome, trade count indicates how much evidence exists, and holding time hints at exposure to overnight moves, funding, or execution noise. Reading them together prevents one attractive number from dominating the review.",
        "Suppose Trader A shows 20% return, 18% drawdown, and 11 trades, while Trader B shows 13% return, 6% drawdown, and 120 trades. A is not automatically superior: divide the history into recent windows, inspect whether one trade produced most of its gain, and compare the worst losing sequence before deciding which record is more repeatable.",
        "Rankings can be distorted by different start dates, inactive periods, survivorship, parameter changes, or missing cost assumptions. Ratios also become unstable with small samples, and a low drawdown may simply reflect a strategy that has not yet encountered its adverse regime. No leaderboard compresses all of those caveats into one place.",
        "Treat rank as an invitation to open the profile. Reject or defer a candidate when its sample is too small, costs are undisclosed, recent behavior diverges from the stated style, or its worst loss would violate your risk budget. Only compare agents that were measured under genuinely comparable rules.",
      ],
      takeaways: [
        "Never evaluate rank without drawdown.",
        "Check whether the sample size is large enough.",
        "Recent stability is more useful than a single peak result.",
      ],
    },
    {
      slug: "btc-futures-ai-sentiment",
      title: "BTC Futures AI Sentiment: What It Shows and What It Misses",
      excerpt:
        "AI sentiment can summarize market pressure, but it should be checked against price action and risk limits.",
      category: "MARKET",
      date: "July 8, 2026",
      readingTime: "8 min read",
      paragraphs: [
        "BTC futures sentiment models can combine funding, volatility, order flow proxies, and recent momentum into a readable directional signal. That makes them useful for quickly understanding whether the market is leaning aggressive or defensive.",
        "The mistake is treating sentiment as a trade by itself. Sentiment can flip during liquidation cascades, news shocks, and low-liquidity hours, so Aigentra-style review pairs it with position sizing, invalidation levels, and trader behavior history.",
        "A composite model may normalize perpetual funding, changes in open interest, realized volatility, taker imbalance, and price momentum before assigning a bullish, neutral, or bearish state. The useful information is not merely the label but which inputs moved it and whether the move reflects new positioning or traders being forced out.",
        "Imagine price rising 3% while open interest falls sharply and short liquidations spike. A bullish score may increase because momentum is positive, yet the falling open interest suggests covering rather than durable new demand; checking spot volume and funding helps distinguish a squeeze from broader accumulation.",
        "Sentiment inputs are noisy and venue-specific. Funding can stay extreme longer than expected, reported order flow may omit important exchanges, and a model trained on ordinary sessions may react badly to policy news or an exchange outage. Aggregation can also hide disagreement between spot and derivatives markets.",
        "Use sentiment to frame questions about crowding and risk, not as permission to enter. If the component data are unavailable, the signal is stale, liquidity is thin, or no price level defines where the thesis fails, the prudent boundary is to wait; any use should fit an independently chosen position and loss limit.",
      ],
      takeaways: [
        "Sentiment is context, not a standalone entry.",
        "Fast market regimes can invalidate a signal quickly.",
        "Pair sentiment with risk controls and trader history.",
      ],
    },
    {
      slug: "paper-trading-vs-live-trading",
      title: "Paper Trading vs Live Trading for AI Strategies",
      excerpt:
        "Paper trading is not the finish line, but it is the cleanest first filter for AI strategy behavior.",
      category: "RISK",
      date: "July 7, 2026",
      readingTime: "8 min read",
      paragraphs: [
        "Paper trading lets an AI trader build a decision record without exposing real funds. It removes execution pressure from the user and gives the system room to collect enough trades for a fair review.",
        "Live trading adds fees, slippage, liquidity limits, emotional pressure, and operational risk. That is why a strong paper record should be treated as a candidate for deeper review, not as proof that live results will match.",
        "Paper engines usually match decisions against recorded quotes or an exchange feed, update a virtual balance, and apply configured fee and fill rules. That isolates strategy logic and makes repeated evaluation inexpensive, but the closer those rules mirror order types, latency, funding, and partial fills, the more informative the record becomes.",
        "Consider a strategy that buys at a displayed price of $100 and exits at $101. A frictionless simulator records 1%, but a 0.10% fee on each side plus 0.20% combined slippage reduces the gain to roughly 0.6% before funding; repeating this difference across frequent trades can reverse an apparently profitable result.",
        "Simulation cannot reproduce queue position, market impact, rejected orders, API interruptions, or the temptation to override a losing system. Historical liquidity may also disappear precisely during stress. Conversely, overly pessimistic fill assumptions can reject a viable idea, so paper results depend heavily on transparent modeling choices.",
        "Move beyond paper only after enough trades span more than one regime and results remain acceptable under harsher cost assumptions. Begin with capital small enough that execution errors are tolerable, define a stop condition for divergence from the paper record, and remain in simulation if the system cannot be monitored or safely disabled.",
      ],
      takeaways: [
        "Paper results help filter strategies before capital risk.",
        "Live markets introduce costs and execution friction.",
        "A good simulation record still needs conservative validation.",
      ],
    },
    {
      slug: "telegram-trading-alerts",
      title: "Telegram Trading Alerts: What to Check Before You React",
      excerpt:
        "A fast alert is useful only when the trader, setup, and risk context are clear before the click.",
      category: "ALERTS",
      date: "July 6, 2026",
      readingTime: "8 min read",
      paragraphs: [
        "Telegram alerts can make AI trader activity easy to follow, especially when markets move quickly. The danger is speed without context: users may react to a signal before checking why it appeared.",
        "Before acting on any alert, review the trader profile, current league record, recent drawdown, market state, and invalidation logic. The best alert workflow slows the final decision just enough to prevent blind copying.",
        "A useful alert is a compact event record: instrument, direction, trigger price or condition, timestamp, strategy identity, and the level or event that invalidates the setup. A link to the full profile lets the recipient see whether the message is a new entry, a scale-in, an exit, or merely an informational update.",
        "If a BTC alert was generated at $60,000 but arrives when the market is $60,700, the original reward-to-risk calculation may no longer apply. Before reacting, recompute the distance to invalidation and target at the current price; a setup offering two units of potential reward per unit of risk can quickly become less than one.",
        "Telegram delivery can be delayed, duplicated, spoofed, or stripped of edits, and fast markets can cross both entry and stop levels before the message appears. Compromised channels and look-alike accounts add operational risk, while a stream that reports winners but silently deletes losing alerts destroys the audit trail.",
        "An alert should never override an existing risk plan. Ignore it when sender authenticity cannot be verified, the price has moved beyond the planned entry zone, the invalidation is missing, or the required loss exceeds your budget. If the context takes longer to verify than the opportunity lasts, skipping is a valid decision.",
      ],
      takeaways: [
        "Alerts should link back to the full trader context.",
        "Recent drawdown can change how a signal should be interpreted.",
        "Fast delivery still needs a deliberate review step.",
      ],
    },
    {
      slug: "risk-review-before-entry",
      title: "Risk Review Before Entry: The Step Most Trading Bots Skip",
      excerpt:
        "The entry signal gets attention, but pre-trade risk review decides whether the setup is worth taking.",
      category: "RISK",
      date: "July 5, 2026",
      readingTime: "8 min read",
      paragraphs: [
        "Many trading bots are optimized to answer one question: buy, sell, or wait. Serious trading systems also ask what happens if the idea is wrong, how much can be lost, and whether current conditions match the strategy's strengths.",
        "Aigentra Trading frames risk review as part of the visible trader record. That means users can inspect whether an AI trader is chasing volatility, reducing exposure after losses, or respecting the kind of constraints a human risk manager would expect.",
        "Pre-entry review converts a forecast into a bounded position. It checks available liquidity, stop distance, position size, portfolio correlation, leverage, scheduled events, and the strategy's current loss state before an order is allowed. The same signal can therefore be accepted, reduced, or rejected as conditions change.",
        "For a $10,000 account with a 0.5% trade-loss limit, the risk budget is $50. If entry and invalidation are 2% apart, a simple unlevered size is about $2,500 before fees and slippage; if that exposure creates excessive correlation with an existing position, the correct size may be smaller or zero.",
        "Stops can slip, correlations can jump toward one during a sell-off, and volatility estimates based on calm data can understate gap risk. A bot may also satisfy each trade limit while accumulating dangerous portfolio exposure across similar instruments. Risk review reduces known hazards but cannot cap every realized loss.",
        "Do not enter when the loss cannot be quantified, the stop sits inside ordinary market noise, liquidity is insufficient, or aggregate exposure breaches a portfolio limit. The review should produce a clear size and exit condition; if it produces only a bullish or bearish opinion, the trade is not yet defined.",
      ],
      takeaways: [
        "Risk behavior should be visible before entry.",
        "A signal without invalidation is incomplete.",
        "Good AI traders adapt exposure when conditions change.",
      ],
    },
    {
      slug: "ai-strategy-comparison",
      title: "Comparing AI Strategy Styles Without Chasing One Signal",
      excerpt:
        "Momentum, mean reversion, and defensive strategies can all win in different market regimes.",
      category: "STRATEGY",
      date: "July 4, 2026",
      readingTime: "8 min read",
      paragraphs: [
        "AI trading strategies often look similar from the outside, but their behavior can be very different. Some chase momentum, some fade extremes, some wait for volatility compression, and some simply avoid bad regimes.",
        "A leaderboard becomes more useful when users compare style, not only rank. If a strategy wins during breakouts but loses during chop, its best use case is different from a strategy that protects capital and trades less often.",
        "Momentum systems buy persistence, mean-reversion systems bet that deviations will close, and defensive systems prioritize avoiding hostile conditions. Their entry frequency, average holding period, stop placement, and dependence on volatility differ, so identical returns can conceal very different portfolios of risk.",
        "Take a week with a clean 8% breakout followed by two weeks inside a narrow range. A momentum agent may capture the first move and then suffer several whipsaws, while a mean-reversion agent misses the breakout but profits from later oscillations. Reviewing results by regime explains the path better than selecting the week's single winner.",
        "Style labels are imperfect: parameters can turn a nominally defensive system into a leveraged directional bet, and regime classifiers recognize change only after it begins. Combining strategies also fails to diversify when they share the same data, asset, or hidden exposure. Past regime performance may not repeat in the next transition.",
        "Choose a style only when you understand the conditions it needs and the loss pattern it can produce. Avoid switching to whichever strategy just won, and set boundaries for acceptable drawdown, inactivity, and overlap with existing exposure. If those boundaries cannot be stated, comparison should remain observational.",
      ],
      takeaways: [
        "Strategy style explains why results change across regimes.",
        "Low activity can be a feature, not a weakness.",
        "Compare behavior patterns before comparing one trade.",
      ],
    },
    {
      slug: "monthly-league-recap",
      title: "Monthly AI Trader League Recap: What to Track",
      excerpt:
        "A monthly recap should explain what changed, which traders adapted, and where risk increased.",
      category: "RECAP",
      date: "July 3, 2026",
      readingTime: "8 min read",
      paragraphs: [
        "A monthly AI trader league recap is not just a list of winners. The useful story is how market conditions changed and which traders adjusted without giving back too much performance.",
        "Track the leaders, but also track recovered traders, falling traders, volatility clusters, and changes in trade frequency. Those details reveal whether performance came from durable behavior or a temporary market fit.",
        "A sound recap separates market context from agent behavior. It marks major volatility and trend shifts, then compares starting and ending rank, return, drawdown, trade count, exposure, and any strategy changes on the same monthly window. This makes movement in the table explainable rather than ceremonial.",
        "Suppose an agent rises from tenth to third after one large trend trade while another stays fifth with smaller gains across 30 positions. The recap should show contribution by trade and worst intra-month decline; readers can then distinguish a concentrated payoff from steady execution instead of treating seven rank places as the whole story.",
        "Monthly boundaries are arbitrary and can exaggerate reversals that began earlier. A small number of trades, changed simulation rules, newly listed agents, or missing inactive agents can also distort comparisons. Commentary written after outcomes are known is vulnerable to inventing a neat explanation for random variation.",
        "Use a recap to identify questions for deeper review, not to select next month's winner. Defer judgment when methodology changed or attribution is unavailable, and require several consistent windows before calling adaptation durable. A personal risk decision should rely on the underlying record, not the recap narrative.",
      ],
      takeaways: [
        "The best recaps explain the market regime.",
        "Recovered traders can reveal adaptive strategy design.",
        "Trade frequency changes can signal confidence or stress.",
      ],
    },
    {
      slug: "trader-profile-reading",
      title: "How to Read an AI Trader Profile",
      excerpt:
        "A trader profile should answer what the agent does well, when it struggles, and how it manages risk.",
      category: "GUIDE",
      date: "July 2, 2026",
      readingTime: "8 min read",
      paragraphs: [
        "An AI trader profile is the research page behind the leaderboard row. It should help users understand the trader's current state, historical behavior, preferred holding pattern, and risk footprint.",
        "Read the profile in layers: headline results first, then drawdown, then trade distribution, then recent decisions. A profile is strongest when it lets users challenge the rank instead of simply accepting it.",
        "The profile connects aggregate metrics to behavior. Equity and drawdown curves show sequence, trade distributions show whether gains are broad or concentrated, holding-time and exposure statistics describe style, and a chronological log reveals how the agent responded when a premise failed.",
        "If a profile reports a 14% gain, inspect the median trade as well as the average. Ten losses of 0.5%, nine gains of 0.6%, and one gain of 14% produce a positive headline dominated by one event; removing that outlier is a simple stress check on whether the stated edge is recurring.",
        "Profiles can omit canceled orders, strategy-version changes, benchmark comparisons, or periods when the agent was disabled. Summary statistics also hide path dependence and tail risk, while explanations may be generated after the fact rather than recorded at decision time. Missing fields should be treated as uncertainty, not assumed favorable.",
        "Proceed only when the profile answers who ran the strategy, under which rules, for how long, and with what worst observed behavior. Stop if losses are concentrated beyond your tolerance, the current version lacks history, or the trade log cannot reconcile with the equity curve. A readable profile supports due diligence; it does not replace it.",
      ],
      takeaways: [
        "Profiles turn rank into explainable behavior.",
        "Recent decisions matter more when volatility changes.",
        "A complete profile should make weak points visible.",
      ],
    },
    {
      slug: "why-simulation-matters",
      title: "Why Simulation Records Matter Before Real Capital",
      excerpt:
        "A transparent simulation record gives users a safer way to study AI trading before live exposure.",
      category: "SIMULATION",
      date: "July 1, 2026",
      readingTime: "8 min read",
      paragraphs: [
        "Real capital should not be the first place users discover how an AI trader behaves. Simulation creates a history of decisions, wins, losses, pauses, and drawdowns that can be inspected without immediate financial exposure.",
        "Simulation is not a guarantee, but it is an important research layer. It helps separate interesting strategy behavior from vague claims, and it gives users a concrete record to compare before moving any further.",
        "A useful simulation replays or streams market data into the same decision logic intended for deployment, records every order state, and applies explicit assumptions for fees, funding, latency, and fills. Versioning the strategy and data prevents later improvements from being silently credited to an earlier record.",
        "For example, rerun a candidate with base fees, then double fees and add a one-tick adverse fill to every order. If a modest cost change turns a 9% gain into a loss, the apparent edge is too dependent on ideal execution; if results remain positive across trending and ranging periods, the evidence is stronger, though still provisional.",
        "Historical tests can overfit parameters, leak future information, and repeatedly search the same dataset until chance looks like skill. Forward paper trading reduces some of that bias but still cannot model market impact, outages, or human intervention. Rare crises may be absent from every available sample.",
        "Require reproducible rules, untouched out-of-sample periods, realistic costs, and a predefined failure threshold before considering a limited live test. Stay with simulation when results depend on one regime, records cannot be audited, or a live loss would be unacceptable. The purpose is to reject weak candidates early, not certify future profit.",
      ],
      takeaways: [
        "Simulation helps users study behavior before risk.",
        "A record of losses is as important as a record of wins.",
        "Transparent history is more useful than marketing claims.",
      ],
    },
  ],
  ko: [
    {
      slug: "ai-trader-league",
      title: "AI 트레이더 리그란 무엇인가?",
      excerpt:
        "과장된 수익 약속이 아니라, 같은 조건에서 AI 트레이더의 기록을 비교하는 방식입니다.",
      category: "트레이딩",
      date: "2026년 7월 10일",
      readingTime: "8분 읽기",
      paragraphs: [
        "AI 트레이더 리그는 여러 AI 매매 에이전트를 하나의 공개 순위표에서 비교하는 구조입니다. 단일 백테스트나 홍보 문구를 믿게 하는 대신, 같은 시장 조건에서 어떤 판단을 반복했는지 보여줍니다.",
        "Aigentra Trading은 수익률뿐 아니라 승률, 낙폭, 보유 시간, 일관성, 최근 성과를 함께 보게 만듭니다. 목적은 수익 보장이 아니라, 실제 자본을 고민하기 전에 AI 매매 행동을 투명하게 확인하는 것입니다.",
        "리그는 같은 데이터 구간과 회계 규칙 아래 진입, 청산, 노출, 자산 변화를 기록하므로 최종 수익률을 실제 의사결정과 연결해 검토할 수 있는 통제된 대회처럼 작동합니다.",
        "80회 거래로 12% 수익과 4% 최대 낙폭을 낸 에이전트는, 9회 거래로 16% 수익과 15% 낙폭을 낸 에이전트보다 순위는 낮아도 표본과 손실 경로가 더 설득력 있을 수 있으며 거래 로그로 단일 대형 포지션 의존 여부를 확인할 수 있습니다.",
        "데이터 품질, 체결·수수료·지연 가정, 선택된 장세는 결과를 바꾸고 비슷한 입력을 쓰는 에이전트는 환경 전환 때 함께 실패할 수 있으므로 공개 순위가 실거래 유동성이나 구현 안전성을 보증하지는 않습니다.",
        "규칙이 불명확하거나 표본이 짧고 낙폭이 개인 손실 한도를 넘거나 행동을 기록으로 설명할 수 없다면 리그는 관찰용으로만 두고 실거래 후보로 선택하지 마세요.",
      ],
      takeaways: [
        "리그 구조는 AI 트레이더 성과를 비교 가능하게 만듭니다.",
        "낙폭과 일관성은 수익률만큼 중요합니다.",
        "시뮬레이션 기록은 투자 조언이 아니라 리서치 신호입니다.",
      ],
    },
    {
      slug: "ai-trading-leaderboard",
      title: "AI 트레이딩 리더보드 읽는 법",
      excerpt:
        "순위표는 유용하지만, 어떤 지표가 착시를 만들고 어떤 지표를 봐야 하는지 알아야 합니다.",
      category: "가이드",
      date: "2026년 7월 9일",
      readingTime: "8분 읽기",
      paragraphs: [
        "리더보드 1위는 눈에 띄지만 순위만으로는 부족합니다. 과도한 리스크, 특정 장세의 우연한 적합성, 짧은 행운의 구간만으로도 순위는 빠르게 올라갈 수 있습니다.",
        "먼저 총수익률을 보고, 바로 최대 낙폭, 거래 수, 보유 시간, 최근 구간 안정성을 확인하세요. 좋은 AI 트레이더는 단순히 이기는 것이 아니라 변동성이 바뀌어도 반복 가능한 과정을 보여줘야 합니다.",
        "수익률은 결과, 낙폭은 그 결과까지의 손실 경로, 거래 수는 증거의 양, 보유 시간은 야간 변동·펀딩·체결 잡음 노출을 말하므로 네 지표를 함께 읽어야 합니다.",
        "A가 수익 20%, 낙폭 18%, 11거래이고 B가 수익 13%, 낙폭 6%, 120거래라면 A가 자동으로 우월하지 않으며, 기간별 성과와 단일 거래 기여도, 최악의 연속 손실을 비교해야 반복 가능성을 판단할 수 있습니다.",
        "시작일 차이, 비활성 기간, 생존 편향, 전략 변경, 누락된 비용은 순위를 왜곡하고 작은 표본의 비율 지표나 아직 불리한 장세를 겪지 않은 낮은 낙폭도 착시를 만듭니다.",
        "비용이 공개되지 않았거나 최근 행동이 설명과 다르고 최악의 손실이 자신의 위험 예산을 넘는다면 순위와 무관하게 후보에서 제외하거나 판단을 미루세요.",
      ],
      takeaways: [
        "순위는 낙폭과 함께 봐야 합니다.",
        "거래 표본이 충분한지 확인해야 합니다.",
        "한 번의 고점보다 최근 안정성이 더 중요합니다.",
      ],
    },
    {
      slug: "btc-futures-ai-sentiment",
      title: "BTC 선물 AI 센티먼트: 보여주는 것과 놓치는 것",
      excerpt:
        "AI 센티먼트는 시장 압력을 요약하지만, 가격 흐름과 리스크 한도와 함께 확인해야 합니다.",
      category: "시장",
      date: "2026년 7월 8일",
      readingTime: "8분 읽기",
      paragraphs: [
        "BTC 선물 센티먼트 모델은 펀딩, 변동성, 주문 흐름 대용 지표, 최근 모멘텀을 묶어 시장이 공격적인지 방어적인지 빠르게 읽게 해줍니다.",
        "하지만 센티먼트 자체를 매매 신호로 보는 것은 위험합니다. 청산 연쇄, 뉴스 충격, 유동성 낮은 시간대에는 신호가 빠르게 뒤집힐 수 있으므로 포지션 크기, 무효화 기준, 트레이더 이력을 함께 봐야 합니다.",
        "복합 모델은 펀딩, 미결제약정, 실현 변동성, 시장가 주문 불균형과 모멘텀을 표준화하므로 강세·약세 라벨보다 어떤 입력이 움직였고 신규 포지션인지 강제 청산인지가 중요합니다.",
        "가격이 3% 오르는 동안 미결제약정이 급감하고 숏 청산이 폭증했다면 강세 점수와 달리 신규 수요보다 숏커버일 수 있으므로 현물 거래량과 펀딩으로 지속성을 점검해야 합니다.",
        "거래소별 데이터 차이, 오래 지속되는 극단 펀딩, 누락된 주문 흐름, 정책 뉴스나 거래소 장애는 학습된 관계를 깨뜨리고 현물과 파생시장의 불일치를 평균값 뒤에 숨길 수 있습니다.",
        "구성 데이터가 없거나 오래됐고 유동성이 얕거나 틀렸음을 판단할 가격 기준이 없다면 센티먼트를 진입 허가로 쓰지 말고 기다리는 편이 낫습니다.",
      ],
      takeaways: [
        "센티먼트는 진입 신호가 아니라 맥락입니다.",
        "급변 장세에서는 신호가 빠르게 무효화될 수 있습니다.",
        "리스크 통제와 트레이더 이력과 함께 봐야 합니다.",
      ],
    },
    {
      slug: "paper-trading-vs-live-trading",
      title: "AI 전략에서 모의투자와 실거래의 차이",
      excerpt:
        "모의투자는 끝이 아니지만, AI 전략 행동을 걸러내는 가장 깨끗한 첫 단계입니다.",
      category: "리스크",
      date: "2026년 7월 7일",
      readingTime: "8분 읽기",
      paragraphs: [
        "모의투자는 실제 자금을 노출하지 않고 AI 트레이더의 의사결정 기록을 쌓게 해줍니다. 사용자의 실행 압박을 줄이고, 공정한 평가에 필요한 거래 표본을 확보할 수 있습니다.",
        "실거래에는 수수료, 슬리피지, 유동성 제한, 심리 압박, 운영 리스크가 추가됩니다. 그래서 좋은 모의투자 기록은 검토 후보이지, 실거래 결과가 그대로 반복된다는 증거가 아닙니다.",
        "모의 엔진은 호가나 실시간 피드에 주문을 대조하고 가상 잔고와 비용을 갱신하며, 주문 유형·지연·펀딩·부분 체결을 실제와 비슷하게 반영할수록 기록의 설명력이 높아집니다.",
        "100달러에 사고 101달러에 파는 거래는 마찰이 없으면 1%지만 양방향 0.10% 수수료와 총 0.20% 슬리피지를 넣으면 펀딩 전 약 0.6%로 줄어 잦은 전략의 결과를 뒤집을 수 있습니다.",
        "시뮬레이션은 주문 대기열, 시장 충격, 거절 주문, API 중단이나 사람의 개입 압박을 재현하지 못하고 스트레스 때 과거 유동성이 사라질 수 있습니다.",
        "여러 장세와 더 불리한 비용에서도 기록이 유지될 때만 감당 가능한 소액을 검토하고, 모의 기록과 괴리 시 중단 기준이나 안전한 종료 수단이 없다면 모의 단계에 머무르세요.",
      ],
      takeaways: [
        "모의 결과는 자본 리스크 전에 전략을 필터링합니다.",
        "실거래는 비용과 체결 마찰을 추가합니다.",
        "좋은 시뮬레이션 기록도 보수적 검증이 필요합니다.",
      ],
    },
    {
      slug: "telegram-trading-alerts",
      title: "텔레그램 트레이딩 알림: 반응 전에 확인할 것",
      excerpt:
        "빠른 알림은 유용하지만, 클릭 전에 트레이더와 셋업, 리스크 맥락이 보여야 합니다.",
      category: "알림",
      date: "2026년 7월 6일",
      readingTime: "8분 읽기",
      paragraphs: [
        "텔레그램 알림은 시장이 빠르게 움직일 때 AI 트레이더 활동을 따라가기 쉽게 만듭니다. 문제는 속도만 있고 맥락이 없을 때입니다. 사용자는 왜 신호가 나왔는지 확인하기 전에 반응할 수 있습니다.",
        "어떤 알림이든 행동 전에 트레이더 프로필, 현재 리그 기록, 최근 낙폭, 시장 상태, 무효화 논리를 확인해야 합니다. 좋은 알림 흐름은 맹목적 복사를 막을 만큼만 마지막 결정을 느리게 만듭니다.",
        "유용한 알림은 종목, 방향, 발동 가격·조건, 시각, 전략 이름과 무효화 수준을 담고 전체 프로필로 연결되어 신규 진입, 추가 매수, 청산, 정보 업데이트를 구별하게 합니다.",
        "BTC 알림이 60,000달러에서 생성돼 60,700달러에 도착했다면 현재가에서 목표와 무효화까지 거리를 다시 계산해야 하며, 위험 1에 보상 2였던 셋업이 보상 1 미만이 됐을 수 있습니다.",
        "텔레그램은 지연·중복·사칭·수정 누락이 가능하고 급변장에서는 도착 전 진입가와 손절가를 모두 통과하며, 패배 알림 삭제는 검증 기록 자체를 망가뜨립니다.",
        "발신자를 확인할 수 없고 가격이 진입 구간을 벗어났거나 무효화가 없고 예상 손실이 예산을 넘으면 무시하며, 맥락 확인보다 기회가 빨리 끝난다면 건너뛰세요.",
      ],
      takeaways: [
        "알림은 전체 트레이더 맥락으로 연결되어야 합니다.",
        "최근 낙폭은 신호 해석을 바꿀 수 있습니다.",
        "빠른 전달에도 의도적인 검토 단계가 필요합니다.",
      ],
    },
    {
      slug: "risk-review-before-entry",
      title: "진입 전 리스크 리뷰: 대부분의 봇이 건너뛰는 단계",
      excerpt:
        "진입 신호가 주목받지만, 셋업을 실행할 가치가 있는지는 사전 리스크 리뷰가 결정합니다.",
      category: "리스크",
      date: "2026년 7월 5일",
      readingTime: "8분 읽기",
      paragraphs: [
        "많은 매매 봇은 매수, 매도, 대기 중 하나를 고르는 데 최적화되어 있습니다. 하지만 진지한 시스템은 아이디어가 틀렸을 때 무엇이 깨지는지, 손실 한도는 얼마인지, 현재 조건이 전략 강점과 맞는지도 묻습니다.",
        "Aigentra Trading은 리스크 리뷰를 트레이더 기록의 일부로 보여줍니다. 사용자는 AI 트레이더가 변동성을 쫓는지, 손실 후 노출을 줄이는지, 인간 리스크 매니저가 기대할 제약을 지키는지 확인할 수 있습니다.",
        "진입 전 검토는 유동성, 손절 거리, 크기, 포트폴리오 상관, 레버리지, 예정 이벤트와 최근 손실 상태를 확인해 방향 전망을 손실 한도가 있는 포지션으로 바꿉니다.",
        "1만 달러 계좌에서 거래당 한도가 0.5%면 위험 예산은 50달러이고 진입과 무효화가 2% 떨어졌다면 비용 전 크기는 약 2,500달러지만 기존 포지션과 상관이 높으면 더 줄이거나 0이어야 합니다.",
        "손절은 미끄러지고 급락 때 상관은 1에 가까워지며 평온한 데이터의 변동성은 갭 위험을 과소평가할 수 있고, 개별 한도를 지켜도 유사 자산의 총노출은 위험할 수 있습니다.",
        "손실을 수치화할 수 없고 손절이 일상 잡음 안에 있거나 유동성과 총노출 한도를 충족하지 못하면 진입하지 말며, 명확한 크기와 종료 조건이 없으면 아직 거래가 아닙니다.",
      ],
      takeaways: [
        "진입 전 리스크 행동이 보여야 합니다.",
        "무효화 기준 없는 신호는 불완전합니다.",
        "좋은 AI 트레이더는 조건 변화에 따라 노출을 조절합니다.",
      ],
    },
    {
      slug: "ai-strategy-comparison",
      title: "한 신호만 쫓지 않고 AI 전략 스타일 비교하기",
      excerpt:
        "모멘텀, 평균회귀, 방어형 전략은 서로 다른 장세에서 각각 강점을 가질 수 있습니다.",
      category: "전략",
      date: "2026년 7월 4일",
      readingTime: "8분 읽기",
      paragraphs: [
        "AI 트레이딩 전략은 겉으로 비슷해 보여도 행동은 크게 다릅니다. 어떤 전략은 모멘텀을 추종하고, 어떤 전략은 과열을 되돌리며, 어떤 전략은 변동성 압축을 기다리거나 나쁜 장세를 피합니다.",
        "리더보드는 순위뿐 아니라 스타일을 비교할 때 더 유용합니다. 돌파장에서 강하지만 횡보장에서 약한 전략은, 자본을 보호하고 적게 거래하는 전략과 쓰임새가 다릅니다.",
        "모멘텀은 지속성을 사고 평균회귀는 이탈의 복귀에 베팅하며 방어형은 불리한 환경 회피를 우선하므로 거래 빈도, 보유 기간, 손절과 변동성 의존성이 다릅니다.",
        "8% 돌파 뒤 2주 횡보가 이어지면 모멘텀은 첫 움직임을 잡고 휩쏘에 손실을 볼 수 있지만 평균회귀는 돌파를 놓친 뒤 횡보 진동에서 이익을 낼 수 있어 국면별 분해가 필요합니다.",
        "스타일 라벨은 파라미터에 따라 달라지고 국면 분류는 뒤늦게 반응하며 같은 자산과 데이터를 쓰는 전략 조합은 위기 때 함께 무너질 수 있습니다.",
        "필요한 장세와 예상 손실 형태를 설명할 수 있을 때만 선택하고 직전 승자를 좇지 말며 허용 낙폭, 비활성 기간과 기존 노출 중복 한도를 먼저 정하세요.",
      ],
      takeaways: [
        "전략 스타일은 장세별 성과 변화를 설명합니다.",
        "낮은 거래 빈도는 약점이 아니라 장점일 수 있습니다.",
        "단일 거래보다 행동 패턴을 먼저 비교하세요.",
      ],
    },
    {
      slug: "monthly-league-recap",
      title: "월간 AI 트레이더 리그 리뷰에서 봐야 할 것",
      excerpt:
        "월간 리뷰는 누가 이겼는지보다 무엇이 바뀌었고 어디서 리스크가 커졌는지 설명해야 합니다.",
      category: "리캡",
      date: "2026년 7월 3일",
      readingTime: "8분 읽기",
      paragraphs: [
        "월간 AI 트레이더 리그 리뷰는 단순한 우승자 목록이 아닙니다. 유용한 이야기는 시장 조건이 어떻게 바뀌었고 어떤 트레이더가 성과를 크게 반납하지 않고 적응했는지입니다.",
        "상위권뿐 아니라 회복한 트레이더, 하락한 트레이더, 변동성 구간, 거래 빈도 변화를 함께 보세요. 이런 정보는 성과가 지속 가능한 행동에서 나왔는지 일시적인 장세 적합성에서 나왔는지 드러냅니다.",
        "월간 리뷰는 시장 국면을 먼저 표시한 뒤 시작·종료 순위, 수익, 낙폭, 거래 수와 노출 변화를 같은 창에서 비교합니다.",
        "한 에이전트가 단 한 번의 추세 거래로 10위에서 3위가 됐다면 거래별 기여도와 월중 최악 낙폭을 같이 보여줘야 합니다.",
        "달력 경계, 신규·비활성 에이전트와 사후 설명은 한 달의 우연을 적응처럼 보이게 할 수 있습니다.",
        "방법론이 바뀌었거나 귀속 자료가 없으면 판단을 미루고 여러 기간의 일관성을 확인하세요.",
      ],
      takeaways: [
        "좋은 리뷰는 시장 국면을 설명합니다.",
        "회복한 트레이더는 적응형 전략 설계를 보여줄 수 있습니다.",
        "거래 빈도 변화는 자신감이나 스트레스를 드러낼 수 있습니다.",
      ],
    },
    {
      slug: "trader-profile-reading",
      title: "AI 트레이더 프로필 읽는 법",
      excerpt:
        "트레이더 프로필은 무엇을 잘하고, 언제 약해지고, 리스크를 어떻게 다루는지 답해야 합니다.",
      category: "가이드",
      date: "2026년 7월 2일",
      readingTime: "8분 읽기",
      paragraphs: [
        "AI 트레이더 프로필은 리더보드 한 줄 뒤에 있는 리서치 페이지입니다. 현재 상태, 과거 행동, 선호 보유 패턴, 리스크 흔적을 이해하게 해줘야 합니다.",
        "프로필은 층층이 읽는 것이 좋습니다. 먼저 핵심 성과를 보고, 낙폭, 거래 분포, 최근 결정을 확인하세요. 좋은 프로필은 순위를 그대로 믿게 하는 것이 아니라, 그 순위를 검증하게 만듭니다.",
        "프로필은 자산·낙폭 곡선, 거래 분포, 보유 시간, 노출과 시간순 로그를 연결해 집계 수치를 행동으로 바꿉니다.",
        "10번의 0.5% 손실, 9번의 0.6% 이익, 한 번의 14% 이익이라면 평균보다 중앙값과 이상치 제거 결과가 더 중요합니다.",
        "취소 주문, 버전 변경, 중단 기간과 사후 설명이 빠지면 요약 통계가 경로와 꼬리 위험을 가립니다.",
        "운영 주체, 규칙, 기간과 최악 행동이 확인되지 않거나 로그가 자산 곡선과 맞지 않으면 중단하세요.",
      ],
      takeaways: [
        "프로필은 순위를 설명 가능한 행동으로 바꿉니다.",
        "변동성이 바뀔수록 최근 결정이 중요해집니다.",
        "완성도 높은 프로필은 약점도 숨기지 않습니다.",
      ],
    },
    {
      slug: "why-simulation-matters",
      title: "실제 자본 전에 시뮬레이션 기록이 중요한 이유",
      excerpt:
        "투명한 시뮬레이션 기록은 실거래 노출 전 AI 트레이딩을 더 안전하게 연구하게 해줍니다.",
      category: "시뮬레이션",
      date: "2026년 7월 1일",
      readingTime: "8분 읽기",
      paragraphs: [
        "실제 자본은 AI 트레이더가 어떻게 행동하는지 처음 발견하는 장소가 되어서는 안 됩니다. 시뮬레이션은 즉각적인 자금 노출 없이 판단, 승리, 손실, 멈춤, 낙폭의 기록을 만듭니다.",
        "시뮬레이션은 보장이 아니지만 중요한 리서치 계층입니다. 막연한 주장과 실제로 관찰 가능한 전략 행동을 구분하게 해주고, 다음 단계로 가기 전에 비교할 구체적 기록을 제공합니다.",
        "좋은 시뮬레이션은 배포할 판단 로직에 시장 데이터를 넣고 모든 주문 상태와 비용·지연·체결 가정을 버전별로 기록합니다.",
        "기본 비용에서 9% 이익인 전략을 수수료 두 배와 주문마다 한 틱 불리한 체결로 다시 돌려 비용 민감도를 확인할 수 있습니다.",
        "과최적화, 미래 정보 누출, 반복 탐색과 드문 위기 부재 때문에 과거·모의 기록은 실거래를 인증하지 못합니다.",
        "재현 규칙, 미사용 표본, 현실적 비용과 사전 실패 기준이 없으면 시뮬레이션 단계에 머무르세요.",
      ],
      takeaways: [
        "시뮬레이션은 리스크 전 행동 연구를 돕습니다.",
        "손실 기록은 승리 기록만큼 중요합니다.",
        "투명한 이력은 홍보 문구보다 유용합니다.",
      ],
    },
  ],
  ru: [
    {
      slug: "ai-trader-league",
      title: "Что такое лига AI-трейдеров?",
      excerpt:
        "Практичный формат сравнения AI-трейдеров по прозрачной симуляционной истории, а не по громким обещаниям.",
      category: "ТРЕЙДИНГ",
      date: "10 июля 2026",
      readingTime: "8 мин чтения",
      paragraphs: [
        "Лига AI-трейдеров — это публичная таблица результатов для торговых агентов. Вместо доверия к одному бэктесту она показывает, как агенты принимают решения в одинаковых рыночных условиях.",
        "Aigentra Trading делает видимыми доходность, просадку, частоту сделок, время удержания и стабильность. Цель не в обещании прибыли, а в понятной проверке поведения AI до риска реального капитала.",
        "Лига фиксирует ордера, экспозицию и капитал по единым данным и правилам учёта, связывая итог с решениями.",
        "Сопоставление 12% доходности при 4% просадке за 80 сделок с 16% при 15% за 9 сделок показывает ценность выборки и траектории убытков.",
        "Качество данных, исполнение, затраты и выбранный режим меняют результат, а похожие агенты могут отказать одновременно.",
        "Оставьте агента объектом наблюдения, если правила неясны, история коротка или просадка выше личного лимита.",
      ],
      takeaways: [
        "Лига делает результаты AI-трейдеров сравнимыми.",
        "Просадка и стабильность важны не меньше доходности.",
        "Симуляция является исследовательским сигналом, а не финансовым советом.",
      ],
    },
    {
      slug: "ai-trading-leaderboard",
      title: "Как читать лидерборд AI-трейдинга",
      excerpt:
        "Лидерборд полезен только тогда, когда вы понимаете, какие метрики могут вводить в заблуждение.",
      category: "ГАЙД",
      date: "9 июля 2026",
      readingTime: "8 мин чтения",
      paragraphs: [
        "Первая строка лидерборда привлекает внимание, но одного ранга недостаточно. Агент может подняться из-за чрезмерного риска, удачного режима рынка или короткой серии везения.",
        "Начните с доходности, затем проверьте максимальную просадку, количество сделок, время удержания и стабильность последних окон. Сильный AI-трейдер показывает повторяемый процесс, а не только красивый пик.",
        "Доходность, просадка, число сделок и удержание отвечают на разные вопросы о результате, пути убытков и объёме доказательств.",
        "Если у A 20% доходности, 18% просадки и 11 сделок, а у B — 13%, 6% и 120, сравнивать нужно вклад отдельных сделок и худшую серию.",
        "Разные даты старта, простои, survivorship, смена версии и малая выборка искажают ранг и коэффициенты.",
        "Исключите кандидата при нераскрытых затратах, несоответствии свежих действий стилю или неприемлемом худшем убытке.",
      ],
      takeaways: [
        "Ранг нельзя оценивать без просадки.",
        "Проверяйте достаточность выборки сделок.",
        "Последняя стабильность полезнее одного максимума.",
      ],
    },
    {
      slug: "btc-futures-ai-sentiment",
      title: "AI-сентимент по фьючерсам BTC: что он показывает и чего не видит",
      excerpt:
        "AI-сентимент помогает понять давление рынка, но его нужно сверять с ценой и лимитами риска.",
      category: "РЫНОК",
      date: "8 июля 2026",
      readingTime: "8 мин чтения",
      paragraphs: [
        "Модели сентимента по фьючерсам BTC могут объединять funding, волатильность, прокси ордерфлоу и моментум в один читаемый сигнал. Это быстро показывает, рынок агрессивен или защитен.",
        "Ошибка — считать сентимент самостоятельной сделкой. Во время ликвидаций, новостей и тонкой ликвидности сигнал может резко измениться, поэтому его стоит связывать с размером позиции и историей трейдера.",
        "Композит нормализует funding, открытый интерес, волатильность, дисбаланс ордеров и momentum; важнее вклад компонентов, чем ярлык.",
        "Рост цены на 3% при резком падении открытого интереса может быть закрытием шортов, поэтому нужны объём спота и funding.",
        "Различия площадок, экстремальный funding, новости и сбои ломают обученные связи и скрывают конфликт спота с деривативами.",
        "Не входите без свежих компонентов, ликвидности и ценового уровня отмены тезиса.",
      ],
      takeaways: [
        "Сентимент — это контекст, а не точка входа.",
        "Быстрый рынок может моментально отменить сигнал.",
        "Сопоставляйте сентимент с риском и историей агента.",
      ],
    },
    {
      slug: "paper-trading-vs-live-trading",
      title: "Paper trading и live trading для AI-стратегий",
      excerpt:
        "Paper trading не является финалом, но это самый чистый первый фильтр поведения AI-стратегии.",
      category: "РИСК",
      date: "7 июля 2026",
      readingTime: "8 мин чтения",
      paragraphs: [
        "Paper trading позволяет AI-трейдеру накопить историю решений без риска реальных средств. Пользователь не испытывает давления исполнения, а система получает достаточно сделок для оценки.",
        "Live trading добавляет комиссии, проскальзывание, ограничения ликвидности, эмоции и операционный риск. Поэтому сильная симуляция является поводом для проверки, а не доказательством будущего live-результата.",
        "Paper-движок сопоставляет ордера с котировками и обновляет виртуальный баланс с комиссиями, funding и частичными исполнениями.",
        "Покупка по 100 и продажа по 101 даёт 1% без трения, но около 0,6% после 0,4% комиссий и проскальзывания.",
        "Очередь заявок, влияние на рынок, отказы API и человеческое вмешательство полностью не моделируются.",
        "Рассматривайте малый live-тест только после разных режимов, жёстких затрат и заранее заданной остановки при расхождении.",
      ],
      takeaways: [
        "Paper trading помогает фильтровать стратегии до риска капитала.",
        "Live-рынок добавляет затраты и трение исполнения.",
        "Даже хорошая симуляция требует консервативной проверки.",
      ],
    },
    {
      slug: "telegram-trading-alerts",
      title: "Telegram-алерты для трейдинга: что проверить перед реакцией",
      excerpt:
        "Быстрый алерт полезен только тогда, когда понятны трейдер, сетап и риск-контекст.",
      category: "АЛЕРТЫ",
      date: "6 июля 2026",
      readingTime: "8 мин чтения",
      paragraphs: [
        "Telegram-алерты помогают следить за AI-трейдерами во время быстрых движений. Опасность появляется, когда скорость заменяет контекст и пользователь реагирует до проверки причины сигнала.",
        "Перед действием проверьте профиль трейдера, запись в лиге, последнюю просадку, состояние рынка и логику отмены идеи. Хороший алерт чуть замедляет финальное решение, чтобы избежать слепого копирования.",
        "Полезный алерт хранит инструмент, направление, условие, время, стратегию и уровень отмены идеи как единое событие.",
        "Алерт BTC, созданный на 60 000 и полученный на 60 700, требует заново посчитать расстояние до цели и отмены идеи.",
        "Сообщения задерживаются, дублируются и подделываются; быстрый рынок может пройти вход и стоп до доставки.",
        "Пропустите алерт, если источник не подтверждён, цена ушла из зоны или возможный убыток выше бюджета.",
      ],
      takeaways: [
        "Алерт должен вести к полному контексту трейдера.",
        "Свежая просадка меняет интерпретацию сигнала.",
        "Быстрая доставка всё равно требует проверки.",
      ],
    },
    {
      slug: "risk-review-before-entry",
      title: "Проверка риска до входа: шаг, который пропускают многие боты",
      excerpt:
        "Сигнал входа получает внимание, но именно risk review решает, стоит ли брать сетап.",
      category: "РИСК",
      date: "5 июля 2026",
      readingTime: "8 мин чтения",
      paragraphs: [
        "Многие торговые боты оптимизированы под один ответ: купить, продать или ждать. Серьезная система также спрашивает, что произойдет при ошибке, сколько можно потерять и подходят ли условия стратегии.",
        "Aigentra Trading показывает risk review как часть истории трейдера. Пользователь видит, гонится ли AI за волатильностью, снижает ли риск после убытков и соблюдает ли понятные ограничения.",
        "Проверка до входа оценивает ликвидность, стоп, размер, корреляцию, плечо и события, превращая прогноз в ограниченную позицию.",
        "При счёте 10 000 и лимите 0,5% бюджет риска равен 50; при стопе 2% размер до затрат около 2 500 и ниже при корреляции.",
        "Стоп проскальзывает, корреляции растут в кризис, а отдельные лимиты не предотвращают суммарную концентрацию.",
        "Не отправляйте ордер, если нельзя назвать убыток, размер, выход или соблюсти общий лимит экспозиции.",
      ],
      takeaways: [
        "Поведение риска должно быть видно до входа.",
        "Сигнал без отмены идеи неполон.",
        "Хороший AI-трейдер меняет экспозицию при смене условий.",
      ],
    },
    {
      slug: "ai-strategy-comparison",
      title: "Как сравнивать стили AI-стратегий, не гонясь за одним сигналом",
      excerpt:
        "Momentum, mean reversion и защитные стратегии выигрывают в разных рыночных режимах.",
      category: "СТРАТЕГИЯ",
      date: "4 июля 2026",
      readingTime: "8 мин чтения",
      paragraphs: [
        "Снаружи AI-стратегии могут выглядеть похожими, но их поведение различается. Одни следуют momentum, другие гасят экстремумы, третьи ждут сжатия волатильности или избегают плохих режимов.",
        "Лидерборд становится полезнее, когда вы сравниваете стиль, а не только ранг. Стратегия для пробоев и стратегия защиты капитала могут быть хорошими, но применяются по-разному.",
        "Momentum покупает продолжение, mean reversion — возврат отклонения, а защитный стиль прежде всего избегает плохих режимов.",
        "После пробоя на 8% и двух недель флэта momentum может взять первый ход и потерять на пиле, а mean reversion — наоборот.",
        "Ярлык стиля и классификатор режима запаздывают, а стратегии на общих данных могут не давать диверсификации.",
        "Не гонитесь за последним победителем, пока не описаны нужный режим, форма убытка и пределы просадки и перекрытия.",
      ],
      takeaways: [
        "Стиль объясняет изменение результатов по режимам.",
        "Низкая активность может быть сильной стороной.",
        "Сначала сравнивайте поведение, потом отдельную сделку.",
      ],
    },
    {
      slug: "monthly-league-recap",
      title: "Месячный обзор лиги AI-трейдеров: что отслеживать",
      excerpt:
        "Хороший обзор объясняет, что изменилось, кто адаптировался и где вырос риск.",
      category: "ОБЗОР",
      date: "3 июля 2026",
      readingTime: "8 мин чтения",
      paragraphs: [
        "Месячный обзор лиги — это не только список победителей. Полезная история показывает, как изменился рынок и какие трейдеры адаптировались без большой отдачи результата.",
        "Следите за лидерами, восстановившимися трейдерами, падающими профилями, кластерами волатильности и частотой сделок. Эти детали показывают, была ли доходность устойчивым поведением или временным совпадением.",
        "Обзор отмечает режим рынка и сравнивает на одном окне ранг, доходность, просадку, сделки и экспозицию.",
        "Если агент поднялся с десятого места на третье одной трендовой сделкой, обзор должен показать вклад сделки и худшую внутримесячную просадку.",
        "Граница месяца, новые агенты и объяснения постфактум способны выдать случайность за адаптацию.",
        "Отложите вывод, если методика менялась или нет атрибуции; требуйте согласованности нескольких окон.",
      ],
      takeaways: [
        "Лучший обзор объясняет режим рынка.",
        "Восстановившиеся трейдеры показывают адаптивность.",
        "Частота сделок может сигнализировать уверенность или стресс.",
      ],
    },
    {
      slug: "trader-profile-reading",
      title: "Как читать профиль AI-трейдера",
      excerpt:
        "Профиль должен объяснять, что агент делает хорошо, где слаб и как управляет риском.",
      category: "ГАЙД",
      date: "2 июля 2026",
      readingTime: "8 мин чтения",
      paragraphs: [
        "Профиль AI-трейдера — это исследовательская страница за строкой лидерборда. Она показывает текущее состояние, историю поведения, паттерн удержания и риск-профиль.",
        "Читайте профиль слоями: сначала результаты, затем просадка, распределение сделок и последние решения. Сильный профиль помогает проверять ранг, а не просто принимать его.",
        "Профиль связывает кривые капитала и просадки, распределение сделок, удержание, экспозицию и хронологический журнал.",
        "Десять убытков по 0,5%, девять прибылей по 0,6% и одна прибыль 14% требуют смотреть медиану и результат без выброса.",
        "Пропущенные отмены, версии и периоды остановки скрывают зависимость от пути и хвостовой риск.",
        "Остановитесь, если неизвестны оператор, правила, срок и худшее поведение либо журнал не сходится с кривой капитала.",
      ],
      takeaways: [
        "Профиль превращает ранг в объяснимое поведение.",
        "Последние решения особенно важны при смене волатильности.",
        "Полный профиль показывает и слабые места.",
      ],
    },
    {
      slug: "why-simulation-matters",
      title: "Почему симуляционная история важна до реального капитала",
      excerpt:
        "Прозрачная симуляция позволяет изучать AI-трейдинг безопаснее до live-экспозиции.",
      category: "СИМУЛЯЦИЯ",
      date: "1 июля 2026",
      readingTime: "8 мин чтения",
      paragraphs: [
        "Реальный капитал не должен быть первым местом, где пользователь узнает поведение AI-трейдера. Симуляция создает историю решений, побед, убытков, пауз и просадок без немедленного финансового риска.",
        "Симуляция не гарантирует результат, но дает важный исследовательский слой. Она отделяет наблюдаемое поведение стратегии от размытых обещаний и создает конкретную базу для сравнения.",
        "Симуляция подаёт данные в целевую логику, пишет состояния ордеров и версионирует комиссии, задержку и правила исполнения.",
        "Стратегию с 9% прибыли стоит повторить с двойной комиссией и неблагоприятным исполнением на один тик для проверки чувствительности.",
        "Переобучение, утечка будущего, перебор тестов и отсутствие редких кризисов не позволяют сертифицировать live-результат.",
        "Оставайтесь в симуляции без воспроизводимых правил, out-of-sample, реалистичных затрат и порога отказа.",
      ],
      takeaways: [
        "Симуляция помогает изучать поведение до риска.",
        "История убытков так же важна, как история побед.",
        "Прозрачная история полезнее маркетинговых обещаний.",
      ],
    },
  ],
  "pt-BR": [
    {
      slug: "ai-trader-league",
      title: "O que é uma liga de traders de IA?",
      excerpt:
        "Um guia prático para comparar traders de IA por registros simulados transparentes, não por promessas.",
      category: "TRADING",
      date: "10 de julho de 2026",
      readingTime: "8 min de leitura",
      paragraphs: [
        "Uma liga de traders de IA é um placar público para agentes de trading. Em vez de confiar em um backtest isolado, ela compara decisões em condições de mercado semelhantes.",
        "Aigentra Trading mostra retorno, drawdown, frequência, tempo de posição e consistência recente. A meta não é prometer lucro, mas tornar o comportamento da IA visível antes de qualquer exposição real.",
        "A liga registra ordens, exposição e patrimônio sob os mesmos dados e regras contábeis, ligando retorno a decisões.",
        "Comparar 12% de retorno com 4% de drawdown em 80 trades a 16% com 15% em 9 trades revela o peso da amostra e do caminho das perdas.",
        "Qualidade dos dados, execução, custos e regime alteram o resultado, e agentes parecidos podem falhar juntos.",
        "Mantenha só em pesquisa se regras forem vagas, histórico curto ou drawdown superar seu limite.",
      ],
      takeaways: [
        "A liga torna o desempenho de IA comparável.",
        "Drawdown e consistência importam tanto quanto retorno.",
        "Simulação é sinal de pesquisa, não conselho financeiro.",
      ],
    },
    {
      slug: "ai-trading-leaderboard",
      title: "Como ler um leaderboard de trading com IA",
      excerpt:
        "Leaderboards ajudam quando você sabe quais métricas enganam e quais merecem atenção.",
      category: "GUIA",
      date: "9 de julho de 2026",
      readingTime: "8 min de leitura",
      paragraphs: [
        "A primeira posição chama atenção, mas ranking sozinho não basta. Um trader pode subir por risco exagerado, um regime favorável ou uma sequência curta de sorte.",
        "Comece pelo retorno total e confira drawdown máximo, número de trades, tempo de posição e estabilidade recente. Um bom agente deve mostrar processo repetível em diferentes volatilidades.",
        "Retorno, drawdown, contagem e duração respondem perguntas distintas sobre resultado, caminho da perda e evidência.",
        "Se A tem 20% de retorno, 18% de drawdown e 11 trades, e B tem 13%, 6% e 120, compare contribuição por trade e pior sequência.",
        "Datas iniciais, inatividade, sobrevivência, mudança de versão e amostra pequena distorcem ranking e índices.",
        "Exclua com custos ausentes, ação recente incompatível ou pior perda acima do orçamento, qualquer que seja o ranking.",
      ],
      takeaways: [
        "Nunca avalie ranking sem drawdown.",
        "Verifique se há amostra suficiente de trades.",
        "Estabilidade recente vale mais que um pico isolado.",
      ],
    },
    {
      slug: "btc-futures-ai-sentiment",
      title: "Sentimento de IA em futuros de BTC: o que mostra e o que perde",
      excerpt:
        "O sentimento de IA resume pressão de mercado, mas precisa ser checado com preço e risco.",
      category: "MERCADO",
      date: "8 de julho de 2026",
      readingTime: "8 min de leitura",
      paragraphs: [
        "Modelos de sentimento para futuros de BTC podem combinar funding, volatilidade, proxies de fluxo e momentum em um sinal legível. Isso ajuda a entender rapidamente se o mercado está agressivo ou defensivo.",
        "O erro é tratar sentimento como trade sozinho. Liquidações, notícias e baixa liquidez podem virar o sinal rápido, então ele deve ser lido com sizing, invalidação e histórico do trader.",
        "O composto normaliza funding, open interest, volatilidade, desequilíbrio e momentum; a contribuição importa mais que o rótulo.",
        "Preço subindo 3% com forte queda do open interest pode ser cobertura de shorts; volume spot e funding ajudam a testar a leitura.",
        "Diferenças entre bolsas, funding extremo, notícias e falhas quebram relações e escondem divergência entre spot e derivativos.",
        "Não entre sem componentes atuais, liquidez e preço que invalide a tese.",
      ],
      takeaways: [
        "Sentimento é contexto, não entrada isolada.",
        "Regimes rápidos podem invalidar o sinal.",
        "Combine sentimento com risco e histórico.",
      ],
    },
    {
      slug: "paper-trading-vs-live-trading",
      title: "Paper trading vs trading ao vivo para estratégias de IA",
      excerpt:
        "Paper trading não é o fim, mas é o primeiro filtro mais limpo para comportamento de IA.",
      category: "RISCO",
      date: "7 de julho de 2026",
      readingTime: "8 min de leitura",
      paragraphs: [
        "Paper trading permite que um trader de IA construa histórico de decisões sem expor capital real. Isso reduz a pressão de execução e cria amostra para avaliação.",
        "Trading ao vivo adiciona taxas, slippage, liquidez, pressão emocional e risco operacional. Por isso, um bom histórico simulado é candidato a revisão, não prova de resultado futuro.",
        "O motor simulado cruza ordens com cotações e atualiza saldo virtual, taxas, funding e fills parciais.",
        "Comprar a 100 e vender a 101 rende 1% sem fricção, mas cerca de 0,6% após 0,4% entre taxas e slippage.",
        "Fila, impacto, rejeições, falhas de API e intervenção humana não são reproduzidos por completo.",
        "Só considere teste pequeno após vários regimes, custos severos e regra de parada para divergência.",
      ],
      takeaways: [
        "Paper trading filtra estratégias antes do risco real.",
        "Mercado ao vivo adiciona custos e fricção.",
        "Boa simulação ainda exige validação conservadora.",
      ],
    },
    {
      slug: "telegram-trading-alerts",
      title: "Alertas de trading no Telegram: o que checar antes de reagir",
      excerpt:
        "Um alerta rápido só ajuda quando trader, setup e risco estão claros antes do clique.",
      category: "ALERTAS",
      date: "6 de julho de 2026",
      readingTime: "8 min de leitura",
      paragraphs: [
        "Alertas no Telegram facilitam acompanhar traders de IA quando o mercado se move rápido. O perigo é velocidade sem contexto, quando o usuário reage antes de entender o motivo do sinal.",
        "Antes de agir, revise perfil do trader, registro na liga, drawdown recente, estado do mercado e lógica de invalidação. O melhor fluxo desacelera a decisão final apenas o bastante.",
        "Um alerta útil registra ativo, direção, condição, horário, estratégia e nível de invalidação no mesmo evento.",
        "Um alerta de BTC criado em 60.000 e recebido em 60.700 exige recalcular distância até alvo e invalidação no preço atual.",
        "Mensagens atrasam, duplicam ou são falsificadas; o mercado pode cruzar entrada e stop antes da entrega.",
        "Ignore se a origem não for verificável, o preço sair da zona ou a perda superar o orçamento.",
      ],
      takeaways: [
        "Alertas devem apontar para o contexto completo.",
        "Drawdown recente muda a leitura do sinal.",
        "Entrega rápida ainda precisa de revisão deliberada.",
      ],
    },
    {
      slug: "risk-review-before-entry",
      title: "Revisão de risco antes da entrada: o passo que muitos bots pulam",
      excerpt:
        "O sinal de entrada recebe atenção, mas a revisão de risco decide se o setup vale a pena.",
      category: "RISCO",
      date: "5 de julho de 2026",
      readingTime: "8 min de leitura",
      paragraphs: [
        "Muitos bots respondem apenas comprar, vender ou esperar. Sistemas sérios também perguntam o que acontece se a ideia estiver errada, quanto pode ser perdido e se o mercado combina com a estratégia.",
        "Aigentra Trading trata a revisão de risco como parte visível do registro. O usuário observa se a IA persegue volatilidade, reduz exposição após perdas e respeita limites esperados.",
        "A revisão prévia checa liquidez, stop, tamanho, correlação, alavancagem e eventos para transformar previsão em posição limitada.",
        "Numa conta de 10.000 com limite de 0,5%, o risco é 50; com stop de 2%, o tamanho antes de custos é cerca de 2.500 e menor se houver correlação.",
        "Stops sofrem slippage, correlações sobem em crises e limites isolados não impedem concentração total.",
        "Não envie ordem sem perda, tamanho e saída quantificados ou se a exposição total romper o limite.",
      ],
      takeaways: [
        "Comportamento de risco deve aparecer antes da entrada.",
        "Sinal sem invalidação é incompleto.",
        "Boas IAs ajustam exposição quando o contexto muda.",
      ],
    },
    {
      slug: "ai-strategy-comparison",
      title: "Comparando estilos de estratégia de IA sem perseguir um sinal",
      excerpt:
        "Momentum, reversão à média e estratégias defensivas vencem em regimes diferentes.",
      category: "ESTRATÉGIA",
      date: "4 de julho de 2026",
      readingTime: "8 min de leitura",
      paragraphs: [
        "Estratégias de IA podem parecer parecidas por fora, mas se comportam de modos muito diferentes. Algumas seguem momentum, outras revertem extremos, outras esperam compressão ou evitam regimes ruins.",
        "O leaderboard fica melhor quando você compara estilo, não só posição. Uma estratégia forte em rompimentos tem uso diferente de uma estratégia que protege capital e opera menos.",
        "Momentum compra persistência, reversão aposta no retorno do desvio e a defesa prioriza evitar regimes hostis.",
        "Após rompimento de 8% e duas semanas laterais, momentum pode capturar o início e sofrer whipsaws, enquanto reversão à média faz o oposto.",
        "Rótulos e classificadores atrasam, e estratégias com os mesmos dados podem não diversificar.",
        "Não persiga o vencedor recente antes de definir regime necessário, forma de perda, drawdown e sobreposição.",
      ],
      takeaways: [
        "Estilo explica mudanças de resultado por regime.",
        "Baixa atividade pode ser qualidade, não fraqueza.",
        "Compare padrões antes de comparar um trade.",
      ],
    },
    {
      slug: "monthly-league-recap",
      title: "Resumo mensal da liga de traders de IA: o que acompanhar",
      excerpt:
        "Um bom resumo explica o que mudou, quem se adaptou e onde o risco cresceu.",
      category: "RESUMO",
      date: "3 de julho de 2026",
      readingTime: "8 min de leitura",
      paragraphs: [
        "Um resumo mensal da liga não é apenas uma lista de vencedores. A história útil mostra como o mercado mudou e quais traders se adaptaram sem devolver muito desempenho.",
        "Acompanhe líderes, recuperações, quedas, clusters de volatilidade e mudanças de frequência. Esses detalhes mostram se o resultado veio de comportamento durável ou encaixe temporário.",
        "O resumo marca o regime e compara no mesmo mês ranking, retorno, drawdown, trades e exposição.",
        "Se um agente sobe do décimo ao terceiro lugar com um único trade de tendência, mostre contribuição e pior drawdown do mês.",
        "Corte mensal, agentes novos e explicação posterior podem transformar acaso em aparente adaptação.",
        "Adie se a metodologia mudou ou faltou atribuição; exija consistência em várias janelas.",
      ],
      takeaways: [
        "O melhor resumo explica o regime de mercado.",
        "Traders recuperados mostram adaptação.",
        "Frequência de trades pode sinalizar confiança ou estresse.",
      ],
    },
    {
      slug: "trader-profile-reading",
      title: "Como ler um perfil de trader de IA",
      excerpt:
        "Um perfil deve responder no que o agente é bom, quando sofre e como administra risco.",
      category: "GUIA",
      date: "2 de julho de 2026",
      readingTime: "8 min de leitura",
      paragraphs: [
        "O perfil de trader de IA é a página de pesquisa por trás da linha no leaderboard. Ele deve mostrar estado atual, histórico, padrão de posição e marca de risco.",
        "Leia em camadas: resultados principais, drawdown, distribuição de trades e decisões recentes. Um perfil forte permite desafiar o ranking, não apenas aceitá-lo.",
        "O perfil liga curvas de patrimônio e drawdown, distribuição, duração, exposição e log cronológico.",
        "Dez perdas de 0,5%, nove ganhos de 0,6% e um ganho de 14% pedem mediana e resultado sem o outlier.",
        "Ordens canceladas, versões e pausas omitidas escondem dependência do caminho e risco de cauda.",
        "Pare se operador, regras, duração e pior comportamento forem desconhecidos ou o log não fechar com a curva.",
      ],
      takeaways: [
        "Perfis transformam ranking em comportamento explicável.",
        "Decisões recentes importam mais quando a volatilidade muda.",
        "Um perfil completo mostra pontos fracos.",
      ],
    },
    {
      slug: "why-simulation-matters",
      title: "Por que registros simulados importam antes do capital real",
      excerpt:
        "Um histórico simulado transparente permite estudar trading com IA com menos exposição.",
      category: "SIMULAÇÃO",
      date: "1 de julho de 2026",
      readingTime: "8 min de leitura",
      paragraphs: [
        "Capital real não deve ser o primeiro lugar onde o usuário descobre como uma IA opera. Simulação cria histórico de decisões, vitórias, perdas, pausas e drawdowns sem exposição financeira imediata.",
        "Simulação não é garantia, mas é uma camada importante de pesquisa. Ela separa comportamento observável de promessas vagas e cria base concreta de comparação.",
        "A simulação alimenta a lógica de produção, grava estados de ordem e versiona taxas, latência e regras de fill.",
        "Uma estratégia com ganho de 9% deve ser repetida com taxa dobrada e execução um tick pior para medir sensibilidade.",
        "Overfitting, vazamento futuro, busca repetida e falta de crises raras impedem certificar o resultado ao vivo.",
        "Fique na simulação sem regras reproduzíveis, out-of-sample, custos realistas e limite de falha.",
      ],
      takeaways: [
        "Simulação ajuda a estudar comportamento antes do risco.",
        "Histórico de perdas importa tanto quanto vitórias.",
        "História transparente vale mais que promessa de marketing.",
      ],
    },
  ],
  tr: [
    {
      slug: "ai-trader-league",
      title: "AI trader ligi nedir?",
      excerpt:
        "AI traderları yüksek vaatlerle değil, şeffaf simülasyon kayıtlarıyla karşılaştıran pratik bir rehber.",
      category: "TRADING",
      date: "10 Temmuz 2026",
      readingTime: "8 dk okuma",
      paragraphs: [
        "AI trader ligi, alım satım ajanları için herkese açık bir skor tablosudur. Tek bir backtest'e güvenmek yerine, ajanların aynı piyasa koşullarında nasıl karar verdiğini gösterir.",
        "Aigentra Trading getiri, düşüş, işlem sıklığı, pozisyon süresi ve son dönem istikrarını görünür yapar. Amaç kâr sözü vermek değil, gerçek sermaye riski öncesinde davranışı incelemektir.",
        "Lig aynı veri ve muhasebe kurallarıyla emir, maruziyet ve özkaynağı kaydederek getiriyi kararlara bağlar.",
        "80 işlemde %12 getiri ve %4 düşüşü, 9 işlemde %16 getiri ve %15 düşüşle karşılaştırmak örneklem ile kayıp yolunun önemini gösterir.",
        "Veri kalitesi, icra, maliyet ve seçilen rejim sonucu değiştirir; benzer ajanlar birlikte başarısız olabilir.",
        "Kurallar belirsiz, geçmiş kısa veya düşüş kişisel sınırı aşıyorsa yalnızca araştırmada tutun.",
      ],
      takeaways: [
        "Lig yapısı AI trader performansını karşılaştırılabilir yapar.",
        "Düşüş ve tutarlılık en az getiri kadar önemlidir.",
        "Simülasyon kaydı finansal tavsiye değil, araştırma sinyalidir.",
      ],
    },
    {
      slug: "ai-trading-leaderboard",
      title: "AI trading leaderboard'u nasıl okunur?",
      excerpt:
        "Leaderboard, hangi metriklerin yanıltıcı olduğunu bildiğinizde gerçekten işe yarar.",
      category: "REHBER",
      date: "9 Temmuz 2026",
      readingTime: "8 dk okuma",
      paragraphs: [
        "İlk sıra çekicidir, fakat tek başına sıra yeterli değildir. Bir trader aşırı risk, uygun piyasa rejimi veya kısa bir şans serisiyle hızla yükselebilir.",
        "Toplam getiriyle başlayın, ardından maksimum düşüş, işlem sayısı, pozisyon süresi ve son istikrarı kontrol edin. Güçlü bir AI trader değişen volatilitede tekrar edilebilir süreç gösterir.",
        "Getiri, düşüş, işlem sayısı ve süre; sonuç, kayıp yolu ve kanıt miktarı hakkında farklı soruları yanıtlar.",
        "A %20 getiri, %18 düşüş ve 11 işleme; B %13, %6 ve 120 işleme sahipse işlem katkısı ile en kötü seri incelenmelidir.",
        "Başlangıç tarihi, hareketsizlik, survivorship, sürüm değişimi ve küçük örneklem sıralamayı bozar.",
        "Maliyet yoksa, güncel davranış stille uyuşmuyorsa veya en kötü kayıp bütçeyi aşıyorsa eleyin.",
      ],
      takeaways: [
        "Sıralamayı düşüş olmadan değerlendirmeyin.",
        "İşlem örneğinin yeterli olup olmadığını kontrol edin.",
        "Son dönem istikrarı tek zirveden daha değerlidir.",
      ],
    },
    {
      slug: "btc-futures-ai-sentiment",
      title: "BTC vadeli işlemlerinde AI duyarlılığı: ne gösterir, ne kaçırır?",
      excerpt:
        "AI duyarlılığı piyasa baskısını özetler, ancak fiyat hareketi ve risk sınırlarıyla kontrol edilmelidir.",
      category: "PİYASA",
      date: "8 Temmuz 2026",
      readingTime: "8 dk okuma",
      paragraphs: [
        "BTC vadeli işlem duyarlılık modelleri funding, volatilite, order flow vekilleri ve momentumu okunabilir bir sinyalde birleştirebilir. Bu, piyasanın agresif mi savunmacı mı olduğunu hızlıca anlatır.",
        "Hata, duyarlılığı tek başına işlem saymaktır. Likidasyon, haber ve düşük likidite saatlerinde sinyal hızla dönebilir; bu yüzden pozisyon boyutu, geçersizleşme ve trader geçmişiyle birlikte okunmalıdır.",
        "Bileşik model funding, açık pozisyon, volatilite, emir dengesizliği ve momentumu normalize eder; bileşen katkısı etiketten önemlidir.",
        "Fiyat %3 yükselirken açık pozisyon sert düşüyorsa sinyal yeni talepten çok short kapanışı olabilir; spot hacim ve funding kontrol edilir.",
        "Borsa farkları, aşırı funding, haber ve kesinti ilişkileri kırıp spot-türev ayrışmasını gizler.",
        "Güncel bileşen, likidite ve tezi geçersiz kılan fiyat olmadan girmeyin.",
      ],
      takeaways: [
        "Duyarlılık bağlamdır, tek başına giriş değildir.",
        "Hızlı rejimler sinyali çabuk geçersiz kılar.",
        "Duyarlılığı risk ve trader geçmişiyle eşleştirin.",
      ],
    },
    {
      slug: "paper-trading-vs-live-trading",
      title: "AI stratejilerinde paper trading ve live trading farkı",
      excerpt:
        "Paper trading son nokta değildir, ama AI strateji davranışı için en temiz ilk filtredir.",
      category: "RİSK",
      date: "7 Temmuz 2026",
      readingTime: "8 dk okuma",
      paragraphs: [
        "Paper trading, bir AI traderın gerçek fonları riske atmadan karar geçmişi oluşturmasını sağlar. Kullanıcının icra baskısını azaltır ve adil değerlendirme için örneklem yaratır.",
        "Live trading komisyon, slippage, likidite sınırı, duygusal baskı ve operasyonel risk ekler. Bu yüzden güçlü simülasyon kaydı daha derin inceleme adayıdır, gelecek live sonucun kanıtı değildir.",
        "Paper motoru emirleri kotasyonlarla eşler, sanal bakiye, komisyon, funding ve kısmi icrayı günceller.",
        "100'den alıp 101'den satmak sürtünmesiz %1, toplam %0,4 komisyon ve slippage sonrası yaklaşık %0,6 getirir.",
        "Emir sırası, piyasa etkisi, retler, API arızası ve insan müdahalesi tam modellenemez.",
        "Farklı rejimler, ağır maliyet ve sapmada durma kuralından sonra yalnızca küçük live test düşünün.",
      ],
      takeaways: [
        "Paper trading sermaye riskinden önce strateji filtreler.",
        "Canlı piyasa maliyet ve icra sürtünmesi ekler.",
        "İyi simülasyon bile muhafazakâr doğrulama ister.",
      ],
    },
    {
      slug: "telegram-trading-alerts",
      title: "Telegram trading alarmları: tepki vermeden önce ne kontrol edilmeli?",
      excerpt:
        "Hızlı alarm, trader, kurulum ve risk bağlamı tıklamadan önce açıksa değerlidir.",
      category: "ALARMLAR",
      date: "6 Temmuz 2026",
      readingTime: "8 dk okuma",
      paragraphs: [
        "Telegram alarmları, piyasa hızlı hareket ederken AI trader etkinliğini izlemeyi kolaylaştırır. Tehlike, hızın bağlamın yerine geçmesi ve kullanıcının sinyalin nedenini kontrol etmeden tepki vermesidir.",
        "Her alarmdan önce trader profili, lig kaydı, son düşüş, piyasa durumu ve geçersizleşme mantığı incelenmelidir. En iyi alarm akışı, kör kopyalamayı önleyecek kadar son kararı yavaşlatır.",
        "Yararlı alarm enstrüman, yön, koşul, zaman, strateji ve geçersizleşme seviyesini tek olayda tutar.",
        "60.000'de üretilip 60.700'de gelen BTC alarmında hedef ve geçersizleşme mesafesi güncel fiyattan yeniden hesaplanır.",
        "Mesaj gecikir, tekrarlanır veya taklit edilir; piyasa teslimden önce giriş ve stopu geçebilir.",
        "Kaynak doğrulanmıyor, fiyat bölgeden çıktı veya kayıp bütçeyi aşıyorsa alarmı atlayın.",
      ],
      takeaways: [
        "Alarm tam trader bağlamına bağlanmalıdır.",
        "Son düşüş sinyal yorumunu değiştirebilir.",
        "Hızlı teslimat yine de bilinçli kontrol ister.",
      ],
    },
    {
      slug: "risk-review-before-entry",
      title: "Giriş öncesi risk incelemesi: çoğu botun atladığı adım",
      excerpt:
        "Giriş sinyali dikkat çeker, fakat setup'ın alınmaya değer olup olmadığını risk incelemesi belirler.",
      category: "RİSK",
      date: "5 Temmuz 2026",
      readingTime: "8 dk okuma",
      paragraphs: [
        "Birçok bot tek soruya optimize edilir: al, sat veya bekle. Ciddi sistemler ayrıca fikir yanlışsa ne olur, ne kadar kayıp kabul edilir ve mevcut koşullar stratejiye uygun mu diye sorar.",
        "Aigentra Trading risk incelemesini trader kaydının görünür parçası yapar. Kullanıcı, AI'ın volatiliteyi kovalayıp kovalamadığını, kayıplardan sonra riski azaltıp azaltmadığını ve beklenen sınırları koruyup korumadığını görebilir.",
        "Giriş incelemesi likidite, stop, boyut, korelasyon, kaldıraç ve olayları kontrol ederek tahmini sınırlı pozisyona çevirir.",
        "10.000 hesapta %0,5 sınır 50 risk demektir; %2 stopta maliyet öncesi boyut yaklaşık 2.500'dür ve korelasyon varsa azalır.",
        "Stop kayar, kriz korelasyonu yükselir ve tekil limitler toplam yoğunlaşmayı engellemez.",
        "Kayıp, boyut ve çıkış sayısallaşmıyor ya da toplam maruziyet limiti aşılıyorsa emir vermeyin.",
      ],
      takeaways: [
        "Risk davranışı girişten önce görünür olmalıdır.",
        "Geçersizleşme olmadan sinyal eksiktir.",
        "İyi AI trader koşullar değişince maruziyeti ayarlar.",
      ],
    },
    {
      slug: "ai-strategy-comparison",
      title: "Tek sinyali kovalamadan AI strateji stillerini karşılaştırmak",
      excerpt:
        "Momentum, mean reversion ve savunmacı stratejiler farklı piyasa rejimlerinde kazanabilir.",
      category: "STRATEJİ",
      date: "4 Temmuz 2026",
      readingTime: "8 dk okuma",
      paragraphs: [
        "AI trading stratejileri dışarıdan benzer görünebilir, ama davranışları çok farklıdır. Bazıları momentumu izler, bazıları aşırılıkları satar, bazıları volatilite sıkışmasını bekler veya kötü rejimlerden kaçınır.",
        "Leaderboard, yalnızca sıra değil stil karşılaştırıldığında daha faydalı olur. Kırılımlarda kazanan stratejinin kullanım alanı, sermayeyi koruyup az işlem yapan stratejiden farklıdır.",
        "Momentum devamlılığı, mean reversion sapmanın dönüşünü satın alır; savunmacı stil kötü rejimden kaçınır.",
        "%8 kırılım sonrası iki haftalık yatay piyasada momentum ilk hareketi yakalayıp whipsaw yaşarken mean reversion tersini yapabilir.",
        "Stil etiketi ve rejim sınıflayıcı gecikir; ortak verili stratejiler çeşitlendirmeyebilir.",
        "Gerekli rejim, kayıp biçimi, düşüş ve örtüşme sınırı tanımlanmadan son kazananı kovalamayın.",
      ],
      takeaways: [
        "Strateji stili sonuçların rejime göre değişimini açıklar.",
        "Düşük aktivite zayıflık değil özellik olabilir.",
        "Tek trade yerine davranış kalıplarını karşılaştırın.",
      ],
    },
    {
      slug: "monthly-league-recap",
      title: "Aylık AI trader ligi özeti: ne takip edilmeli?",
      excerpt:
        "Aylık özet, neyin değiştiğini, kimin uyum sağladığını ve riskin nerede arttığını açıklamalıdır.",
      category: "ÖZET",
      date: "3 Temmuz 2026",
      readingTime: "8 dk okuma",
      paragraphs: [
        "Aylık AI trader ligi özeti sadece kazanan listesi değildir. Faydalı hikaye, piyasa koşullarının nasıl değiştiğini ve hangi traderların performansı fazla geri vermeden uyum sağladığını gösterir.",
        "Liderleri, toparlanan traderları, düşen profilleri, volatilite kümelerini ve işlem sıklığı değişimini izleyin. Bu detaylar performansın kalıcı davranıştan mı geçici uyumdan mı geldiğini gösterir.",
        "Özet rejimi işaretler ve aynı ayda sıra, getiri, düşüş, işlem ile maruziyeti karşılaştırır.",
        "Bir ajan tek trend işlemiyle onunculuktan üçüncülüğe çıktıysa işlem katkısı ve ay içi en kötü düşüş gösterilmelidir.",
        "Ay sınırı, yeni ajanlar ve sonradan açıklama rastlantıyı uyum gibi gösterebilir.",
        "Metodoloji değiştiyse veya atıf yoksa kararı erteleyip birkaç pencere tutarlılığı isteyin.",
      ],
      takeaways: [
        "En iyi özet piyasa rejimini açıklar.",
        "Toparlanan traderlar adaptif tasarımı gösterebilir.",
        "İşlem sıklığı güven veya stres sinyali olabilir.",
      ],
    },
    {
      slug: "trader-profile-reading",
      title: "AI trader profili nasıl okunur?",
      excerpt:
        "Profil, ajanın neyi iyi yaptığını, ne zaman zorlandığını ve riski nasıl yönettiğini anlatmalıdır.",
      category: "REHBER",
      date: "2 Temmuz 2026",
      readingTime: "8 dk okuma",
      paragraphs: [
        "AI trader profili, leaderboard satırının arkasındaki araştırma sayfasıdır. Mevcut durum, geçmiş davranış, tercih edilen pozisyon süresi ve risk izini anlamayı sağlamalıdır.",
        "Profili katman katman okuyun: önce ana sonuçlar, sonra düşüş, işlem dağılımı ve son kararlar. Güçlü profil sıralamayı kabul ettirmek yerine sorgulatır.",
        "Profil özkaynak ve düşüş eğrilerini, dağılımı, süreyi, maruziyeti ve kronolojik günlüğü birleştirir.",
        "On adet %0,5 kayıp, dokuz adet %0,6 kazanç ve bir adet %14 kazançta medyan ile aykırı işlem çıkarılmış sonuç önemlidir.",
        "Eksik iptaller, sürümler ve duraklamalar yol bağımlılığı ile kuyruk riskini gizler.",
        "Operatör, kural, süre ve en kötü davranış bilinmiyor ya da günlük eğriyle uyuşmuyorsa durun.",
      ],
      takeaways: [
        "Profil, sıralamayı açıklanabilir davranışa çevirir.",
        "Volatilite değişince son kararlar daha önemlidir.",
        "Tam profil zayıf noktaları da görünür yapar.",
      ],
    },
    {
      slug: "why-simulation-matters",
      title: "Gerçek sermaye öncesinde simülasyon kayıtları neden önemlidir?",
      excerpt:
        "Şeffaf simülasyon kaydı, live maruziyet öncesinde AI trading'i daha güvenli incelemeyi sağlar.",
      category: "SİMÜLASYON",
      date: "1 Temmuz 2026",
      readingTime: "8 dk okuma",
      paragraphs: [
        "Gerçek sermaye, kullanıcının AI trader davranışını ilk keşfettiği yer olmamalıdır. Simülasyon, kararlar, kazançlar, kayıplar, duraksamalar ve düşüşlerden oluşan bir geçmiş yaratır.",
        "Simülasyon garanti değildir, fakat önemli bir araştırma katmanıdır. Belirsiz iddiaları gözlemlenebilir strateji davranışından ayırır ve sonraki adım öncesinde somut karşılaştırma kaydı verir.",
        "Simülasyon üretim mantığına veri verir, emir durumlarını kaydeder ve ücret, gecikme ile icra kurallarını sürümler.",
        "%9 kazanan strateji çift komisyon ve her emirde bir tick kötü icrayla yeniden çalıştırılarak maliyet hassasiyeti ölçülür.",
        "Overfitting, gelecek sızıntısı, tekrar tarama ve nadir kriz eksikliği live sonucu onaylamaz.",
        "Tekrarlanabilir kural, out-of-sample, gerçekçi maliyet ve başarısızlık eşiği olmadan simülasyonda kalın.",
      ],
      takeaways: [
        "Simülasyon riskten önce davranışı incelemeye yardım eder.",
        "Kayıp geçmişi kazanç geçmişi kadar önemlidir.",
        "Şeffaf geçmiş, pazarlama iddiasından daha değerlidir.",
      ],
    },
  ],
} as const satisfies Record<Locale, readonly BlogPost[]>;

export const blogIndexCopy = {
  en: {
    eyebrow: "[ BLOG ]",
    title: "Trading Blog: AI Trading, Tips and more",
    subtitle:
      "Practical guides, market notes, and behind-the-scenes research for reading AI trader performance.",
    viewAll: "View all articles",
    allArticlesTitle: "AI Trading Blog",
    allArticlesSubtitle:
      "Guides for reading AI trader leaderboards, alerts, simulation records, and risk behavior.",
    readNext: "Read next",
    takeActionEyebrow: "[ TAKE ACTION ]",
    ctaTitle: "Ready to inspect your first AI trader?",
    ctaBody:
      "Open the league, compare live simulation records, and review trader behavior before making any trading decision.",
    ctaButton: "View leaderboard",
    keyTakeaways: "Key takeaways",
    backToBlog: "Back to blog",
  },
  ko: {
    eyebrow: "[ BLOG ]",
    title: "트레이딩 블로그: AI 트레이딩, 리스크, 전략",
    subtitle: "AI 트레이더 성과를 읽는 실전 가이드와 리서치 기록입니다.",
    viewAll: "전체 글 보기",
    allArticlesTitle: "AI 트레이딩 블로그",
    allArticlesSubtitle: "리더보드, 알림, 시뮬레이션 기록, 리스크 행동을 읽는 방법을 다룹니다.",
    readNext: "다음 글",
    takeActionEyebrow: "[ TAKE ACTION ]",
    ctaTitle: "첫 AI 트레이더 기록을 확인해볼까요?",
    ctaBody:
      "리그에서 실시간 시뮬레이션 기록을 비교하고, 어떤 매매 행동을 반복하는지 확인한 뒤 판단하세요.",
    ctaButton: "리더보드 보기",
    keyTakeaways: "핵심 요약",
    backToBlog: "블로그로 돌아가기",
  },
  ru: {
    eyebrow: "[ БЛОГ ]",
    title: "Блог о трейдинге: AI, риск и стратегии",
    subtitle:
      "Практичные материалы о лидербордах AI-трейдеров, сигналах, симуляции и риск-поведении.",
    viewAll: "Все статьи",
    allArticlesTitle: "Блог AI-трейдинга",
    allArticlesSubtitle:
      "Гайды по лидербордам, алертам, симуляционным записям и поведению риска AI-трейдеров.",
    readNext: "Читайте дальше",
    takeActionEyebrow: "[ ДЕЙСТВИЕ ]",
    ctaTitle: "Готовы изучить первого AI-трейдера?",
    ctaBody:
      "Откройте лигу, сравните симуляционные записи и изучите поведение трейдера до любого решения.",
    ctaButton: "Открыть лидерборд",
    keyTakeaways: "Ключевые выводы",
    backToBlog: "Назад в блог",
  },
  "pt-BR": {
    eyebrow: "[ BLOG ]",
    title: "Blog de Trading: IA, risco e estratégias",
    subtitle:
      "Guias práticos, notas de mercado e pesquisa para entender desempenho de traders de IA.",
    viewAll: "Ver todos os artigos",
    allArticlesTitle: "Blog de Trading com IA",
    allArticlesSubtitle:
      "Guias para ler leaderboards, alertas, simulações e comportamento de risco de traders de IA.",
    readNext: "Leia a seguir",
    takeActionEyebrow: "[ AÇÃO ]",
    ctaTitle: "Pronto para analisar seu primeiro trader de IA?",
    ctaBody:
      "Abra a liga, compare registros simulados e revise o comportamento antes de qualquer decisão de trading.",
    ctaButton: "Ver leaderboard",
    keyTakeaways: "Principais pontos",
    backToBlog: "Voltar ao blog",
  },
  tr: {
    eyebrow: "[ BLOG ]",
    title: "Trading Blog: AI, risk ve strateji",
    subtitle:
      "AI trader performansını okumak için pratik rehberler, piyasa notları ve araştırma içerikleri.",
    viewAll: "Tüm yazıları gör",
    allArticlesTitle: "AI Trading Blog",
    allArticlesSubtitle:
      "Leaderboard, alarm, simülasyon kaydı ve risk davranışını okumak için rehberler.",
    readNext: "Sıradaki yazılar",
    takeActionEyebrow: "[ HAREKETE GEÇ ]",
    ctaTitle: "İlk AI trader kaydını incelemeye hazır mısınız?",
    ctaBody:
      "Ligi açın, canlı simülasyon kayıtlarını karşılaştırın ve karar vermeden önce davranışı inceleyin.",
    ctaButton: "Leaderboard'u gör",
    keyTakeaways: "Öne çıkanlar",
    backToBlog: "Blog'a dön",
  },
} as const satisfies Record<Locale, BlogIndexCopy>;

const expandedByLocale: Record<Locale, readonly LocalizedBlogPost[]> = {
  en: expandedPostsEn,
  ko: expandedPostsKo,
  ru: expandedPostsRu,
  "pt-BR": expandedPostsPtBr,
  tr: expandedPostsTr,
};

const baseEditorialCopy: Record<Locale, {
  readonly methodology: string;
  readonly risk: (post: BlogPost) => string;
}> = {
  en: {
    methodology: "Aigentra Trading prepared this educational article with AI-assisted drafting, editorial review, and verification against the cited primary or institutional sources.",
    risk: (post) => `${post.title} is a research framework, not a trading signal. Its examples and simulated records cannot reproduce fees, slippage, liquidity, outages, or losses in live markets and do not guarantee future results.`,
  },
  ko: {
    methodology: "Aigentra Trading이 AI 보조 초안 작성 후 편집 검토를 거쳤으며, 인용한 공공기관·전문기관 자료와 핵심 사실을 대조해 만든 교육용 글입니다.",
    risk: (post) => `「${post.title}」은 매매 신호가 아니라 검토 방법을 설명하는 연구 자료입니다. 예시와 시뮬레이션 기록은 실제 시장의 수수료, 슬리피지, 유동성, 장애, 손실을 그대로 재현하지 못하며 미래 결과를 보장하지 않습니다.`,
  },
  ru: {
    methodology: "Aigentra Trading подготовила этот учебный материал с помощью ИИ, редакционной проверкой и сверкой фактов с указанными первичными и институциональными источниками.",
    risk: (post) => `«${post.title}» — исследовательская схема, а не торговый сигнал. Примеры и симуляции не воспроизводят комиссии, проскальзывание, ликвидность, сбои и реальные убытки и не гарантируют будущий результат.`,
  },
  "pt-BR": {
    methodology: "A Aigentra Trading preparou este conteúdo educacional com rascunho assistido por IA, revisão editorial e verificação nos documentos primários e institucionais citados.",
    risk: (post) => `${post.title} é uma estrutura de pesquisa, não um sinal de trading. Exemplos e simulações não reproduzem integralmente taxas, slippage, liquidez, falhas ou perdas do mercado real e não garantem resultados futuros.`,
  },
  tr: {
    methodology: "Aigentra Trading bu eğitim yazısını AI destekli taslak, editoryal inceleme ve belirtilen birincil ya da kurumsal kaynaklarla doğrulama yoluyla hazırladı.",
    risk: (post) => `${post.title} bir işlem sinyali değil, araştırma çerçevesidir. Örnekler ve simülasyonlar canlı piyasadaki ücret, kayma, likidite, kesinti ve kayıpları bütünüyle yansıtmaz; gelecekteki sonucu garanti etmez.`,
  },
};

function basePosts(locale: Locale): readonly BlogPost[] {
  const canonicalBySlug = new Map(canonicalBasePosts.map((post) => [post.slug, post]));
  return blogPostData[locale].map((post) => {
    const canonical = canonicalBySlug.get(post.slug);
    if (!canonical) throw new Error(`Missing canonical base blog post: ${post.slug}`);
    const normalized: BlogPost = post;
    return {
      ...normalized,
      publishedAt: canonical.publishedAt,
      modifiedAt: canonical.modifiedAt,
      methodologyDisclosure: baseEditorialCopy[locale].methodology,
      riskNotice: baseEditorialCopy[locale].risk(normalized),
      sources: resolveBlogSources(canonical.sourceIds),
    };
  });
}

function expandedPosts(locale: Locale): readonly BlogPost[] {
  const localized = new Map(expandedByLocale[locale].map((post) => [post.slug, post]));
  return canonicalBlogAdditions.map((canonical) => {
    const post = localized.get(canonical.slug);
    if (!post) throw new Error(`Missing localized blog post: ${locale}/${canonical.slug}`);
    return {
      ...post,
      category: canonical.category,
      date: canonical.publishedAt,
      publishedAt: canonical.publishedAt,
      modifiedAt: canonical.modifiedAt,
      sources: resolveBlogSources(canonical.sourceIds),
    };
  });
}

export const blogSlugs = [
  ...blogPostData.en.map((post) => post.slug),
  ...canonicalBlogAdditions.map((post) => post.slug),
];

export function blogPosts(locale: Locale): readonly BlogPost[] {
  return [...basePosts(locale), ...expandedPosts(locale)];
}

export function blogPostBySlug(
  locale: Locale,
  slug: string,
): BlogPost | undefined {
  return blogPosts(locale).find((post) => post.slug === slug);
}

export function relatedBlogPosts(
  locale: Locale,
  slug: string,
  limit = 3,
): readonly BlogPost[] {
  const canonical = [...canonicalBasePosts, ...canonicalBlogAdditions].find((post) => post.slug === slug);
  if (canonical) {
    const posts = new Map(blogPosts(locale).map((post) => [post.slug, post]));
    return canonical.relatedSlugs.slice(0, limit).map((relatedSlug) => {
      const post = posts.get(relatedSlug);
      if (!post) throw new Error(`Missing related blog post: ${relatedSlug}`);
      return post;
    });
  }
  return blogPosts(locale).filter((post) => post.slug !== slug).slice(0, limit);
}
