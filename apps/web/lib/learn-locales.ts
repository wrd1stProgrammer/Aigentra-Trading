import type { Locale } from "@/lib/i18n";

export type LearnSlug =
  | "funding-rate"
  | "open-interest"
  | "liquidation"
  | "position-sizing"
  | "maximum-drawdown"
  | "backtest-overfitting";

export type LearnLocalizedContent = {
  readonly localizedTerm: string;
  readonly summary: string;
  readonly definition: string;
  readonly whyItMatters: string;
  readonly formula: string;
  readonly workedExample: string;
  readonly interpretation: readonly string[];
  readonly misconception: string;
  readonly riskNote: string;
};

export type LearnLocaleDictionary = Record<Locale, Record<LearnSlug, LearnLocalizedContent>>;

export const learnContentByLocale = {
  en: {
    "funding-rate": {
      localizedTerm: "Funding Rate",
      summary: "A periodic payment between long and short positions that helps keep perpetual futures prices close to spot prices.",
      definition: "Funding is not a standard fee collected by the exchange. It is a payment exchanged between position holders at set times. A positive rate generally means longs pay shorts, while a negative rate means shorts pay longs. Always check the rate interval because the formula and payment schedule vary by exchange.",
      whyItMatters: "Funding may look small on a short trade, but it can accumulate across several payments when a leveraged position stays open. A high positive rate can indicate crowded longs and a deeply negative rate crowded shorts, but neither guarantees a reversal.",
      formula: "Estimated funding payment = position notional × funding rate",
      workedExample: "For a 10,000 USDT long with a +0.01% rate at settlement, the estimated payment is 1 USDT. If that rate applies three times in one day and the position remains open, the simple total is about 3 USDT. The actual amount depends on the position value and exchange formula at each settlement.",
      interpretation: ["Assess the magnitude and persistence of the rate, not only its sign.", "Check whether price and open interest are rising together.", "Include funding, fees, and slippage in the total holding cost before entry."],
      misconception: "A positive funding rate is not automatically a bearish signal. In a strong trend, elevated funding can persist much longer than expected.",
      riskNote: "The displayed rate can change before settlement, and calculation rules differ by exchange. Review the contract specification before placing an order.",
    },
    "open-interest": {
      localizedTerm: "Open Interest",
      summary: "The total amount of derivative contracts that remain open and have not been closed or offset.",
      definition: "Open interest (OI) is the number or notional value of futures and options contracts currently open. It rises when new counterparties create contracts and falls when existing positions are closed. Unlike volume, which counts trades over a period, OI measures contracts outstanding at a point in time.",
      whyItMatters: "OI helps show how much new positioning and leverage accompanies a price move. It does not reveal which side is in control, so it should be read with price, volume, funding, and liquidation data.",
      formula: "Open-interest change (%) = (current OI − previous OI) ÷ previous OI × 100",
      workedExample: "If BTC rises 2% from $60,000 to $61,200 while OI increases 10% from $1.0 billion to $1.1 billion, new leveraged positions may be entering. New shorts are part of those contracts too, so this alone cannot confirm that the rally will continue.",
      interpretation: ["Rising price and OI can indicate fresh positioning.", "A sharp price move with falling OI can point to liquidations or broad position closure.", "Use the same venue coverage and currency unit when comparing data."],
      misconception: "Rising OI does not mean buying pressure increased. Every derivative contract has both a long and a short side.",
      riskNote: "Aggregated OI can vary with venue coverage and conversion methods. It does not directly reveal direction or the intent of position holders.",
    },
    liquidation: {
      localizedTerm: "Liquidation",
      summary: "The forced closure of a leveraged position after margin falls below the exchange's maintenance requirement.",
      definition: "Liquidation occurs when losses leave an account unable to meet maintenance margin. The exchange forcibly reduces some or all of the position to protect the contract and insurance fund. A displayed liquidation price is only an estimate and can change with fees, margin tiers, other positions, and cross-margin balances.",
      whyItMatters: "Higher leverage leaves less room between entry and liquidation. Stop orders can also fill worse than expected during fast moves or thin liquidity, so the loss limit should sit well before liquidation.",
      formula: "Simplified price buffer ≈ 1 ÷ leverage. The actual liquidation price includes maintenance margin and fees.",
      workedExample: "A 10× long loses most of its initial margin after roughly a 10% adverse move. Maintenance margin can trigger liquidation sooner. Opening a 10,000 USDT position with 1,000 USDT of margin therefore does not guarantee that it can withstand a full 10% decline.",
      interpretation: ["Set the maximum account loss before looking at the liquidation price.", "Distinguish the loss scope of isolated and cross margin.", "Confirm whether mark price or last traded price triggers liquidation."],
      misconception: "A stop-loss does not make liquidation impossible. Gaps, slippage, or system delays can prevent a timely fill.",
      riskNote: "Liquidation formulas vary by exchange and contract. Treat calculators as estimates and preserve a buffer with lower leverage and smaller positions.",
    },
    "position-sizing": {
      localizedTerm: "Position Sizing",
      summary: "A risk-management method that sets position size from the loss allowed on one trade and the stop distance.",
      definition: "Position sizing starts by deciding how much of the account may be lost, before considering conviction or expected return. Dividing that risk budget by the distance between entry and stop gives a base quantity, assuming the stop fills as planned.",
      whyItMatters: "Even a sound strategy can damage an account when positions are too large during a losing streak. A consistent risk unit makes trades across prices and volatility easier to compare and helps control drawdown.",
      formula: "Position quantity = allowed loss ÷ |entry price − stop price|",
      workedExample: "With a 10,000 USDT account and a 0.5% risk limit, the allowed loss is 50 USDT. If BTC entry is $60,000 and the stop is $59,000, the $1,000 price risk gives a base size of 0.05 BTC. Fees and expected slippage should reduce the final size.",
      interpretation: ["Place the stop from market structure first, then calculate quantity.", "Reserve an extra buffer for costs and gaps.", "Treat highly correlated positions as one risk group."],
      misconception: "Lower leverage alone does not reduce risk. Notional exposure, stop distance, and execution together determine the final loss.",
      riskNote: "The formula assumes the stop fills at the planned price. In a fast market, actual loss can exceed the risk budget.",
    },
    "maximum-drawdown": {
      localizedTerm: "Maximum Drawdown",
      summary: "The largest percentage decline from an equity peak to a subsequent trough during the measurement period.",
      definition: "Maximum drawdown (MDD) shows the greatest retreat from a previous equity high. Unlike a single-period loss, it treats the decline until that high is recovered as one episode. It is a path-dependent measure used to compare backtest and live risk.",
      whyItMatters: "A high-return strategy can still have an intolerable drawdown. Because the gain needed to recover rises disproportionately as losses deepen, judging a strategy by return alone understates risk.",
      formula: "Drawdown = (current equity − prior peak equity) ÷ prior peak equity × 100",
      workedExample: "If equity rises from 10,000 to 12,000 USDT and then falls to 9,000, drawdown is (9,000−12,000)÷12,000 = −25%. Recovering from 9,000 to 12,000 then requires about a 33.3% gain.",
      interpretation: ["Review depth, duration, and recovery time together.", "Compare strategies over the same period and cost assumptions.", "Investigate regime change when live drawdown exceeds the backtest range."],
      misconception: "Historical maximum drawdown is not a ceiling on future losses. Unseen market conditions can produce a larger decline.",
      riskNote: "A short or favorable backtest can understate drawdown. Test stressed costs and adverse market scenarios as well.",
    },
    "backtest-overfitting": {
      localizedTerm: "Backtest Overfitting",
      summary: "A condition in which a strategy fits accidental noise in historical data more than a repeatable market principle.",
      definition: "Backtest overfitting occurs when repeated tests of many rules and parameters select a strategy that excels on historical data but fails on new data. The more combinations explored relative to the number of observations, the easier it is to find a lucky result.",
      whyItMatters: "Selecting only the best Sharpe ratio or return hides the many failed experiments. Trading costs, poor data, and look-ahead leakage can widen the gap between backtest and live performance.",
      formula: "There is no single formula: assess experiment count, degrees of freedom, out-of-sample decay, and parameter stability together.",
      workedExample: "Testing two moving-average periods from 1 to 200 creates about 40,000 combinations. Reporting only the most profitable pair makes it likely that random sample fit is mistaken for an economic edge.",
      interpretation: ["Keep final evaluation data separate from model selection.", "Check whether nearby parameter values produce similar results.", "Use walk-forward validation with realistic fees and slippage."],
      misconception: "Passing one out-of-sample test does not remove overfitting. If the strategy is revised after seeing that result, the sample has become development data.",
      riskNote: "A backtest tests a hypothesis; it does not guarantee future profit. Always account for undisclosed experiment counts and selection bias.",
    },
  },
  ko: {
    "funding-rate": {
      localizedTerm: "펀딩비",
      summary: "무기한 선물 가격을 현물 가격에 가깝게 유지하기 위해 롱과 숏 사이에서 주기적으로 교환되는 비용입니다.",
      definition: "펀딩비는 거래소가 가져가는 일반 수수료가 아니라, 정해진 시점에 포지션 보유자 사이에서 지급되는 금액입니다. 보통 펀딩비가 양수면 롱이 숏에게, 음수면 숏이 롱에게 지급합니다. 거래소마다 산식과 지급 주기가 다르므로 표시된 비율의 기준 시간을 함께 확인해야 합니다.",
      whyItMatters: "짧은 거래에서는 작아 보이지만 레버리지 포지션을 오래 유지하면 여러 차례 누적됩니다. 높은 양의 펀딩비는 롱 쏠림을, 큰 음의 펀딩비는 숏 쏠림을 시사할 수 있지만 그 자체가 반전을 보장하지는 않습니다.",
      formula: "예상 펀딩 지급액 = 포지션 명목가치 × 펀딩 비율",
      workedExample: "명목가치가 10,000 USDT인 롱 포지션의 지급 시점 펀딩비가 +0.01%라면 예상 지급액은 1 USDT입니다. 하루 세 번 같은 비율이 적용되면 단순 합계는 약 3 USDT지만, 실제 금액은 각 지급 시점의 포지션 가치와 거래소 산식에 따라 달라집니다.",
      interpretation: ["비율의 부호뿐 아니라 절댓값과 지속 시간을 함께 봅니다.", "가격 상승과 미결제약정 증가가 동시에 나타나는지 확인합니다.", "수수료와 슬리피지를 포함한 총 보유 비용을 계산합니다."],
      misconception: "양의 펀딩비가 곧 하락 신호라는 해석은 잘못입니다. 강한 추세에서는 높은 펀딩비가 예상보다 오래 유지될 수 있습니다.",
      riskNote: "펀딩 시각 직전의 비율은 변할 수 있고 거래소별 계산 규칙도 다릅니다. 주문 전 해당 계약 명세를 확인하세요.",
    },
    "open-interest": {
      localizedTerm: "미결제약정",
      summary: "아직 청산되거나 상계되지 않은 파생상품 계약의 총규모를 나타내는 시장 참여 지표입니다.",
      definition: "미결제약정(OI)은 현재 열려 있는 선물·옵션 계약의 수 또는 명목가치를 뜻합니다. 신규 계약이 만들어지면 증가하고 기존 포지션이 닫히면 감소합니다. 일정 기간의 거래를 세는 거래량과 달리 OI는 특정 시점에 남아 있는 계약을 측정합니다.",
      whyItMatters: "가격 변화에 신규 포지션과 레버리지가 얼마나 동반되는지 볼 수 있습니다. 다만 어느 쪽이 우세한지는 알 수 없으므로 가격, 거래량, 펀딩비, 청산 데이터와 함께 해석해야 합니다.",
      formula: "미결제약정 변화율 = (현재 OI − 이전 OI) ÷ 이전 OI × 100",
      workedExample: "BTC가 60,000달러에서 61,200달러로 2% 오르고 OI가 10억달러에서 11억달러로 10% 늘었다면 신규 레버리지 유입 가능성이 있습니다. 신규 숏도 같은 계약에 포함되므로 이것만으로 상승 지속을 확정할 수는 없습니다.",
      interpretation: ["가격과 OI의 동반 상승은 신규 포지션 유입 가능성을 보여줍니다.", "가격 급변과 OI 급감은 청산이나 대규모 포지션 종료를 시사할 수 있습니다.", "동일한 거래소 범위와 표시 단위로 비교합니다."],
      misconception: "OI 증가를 매수세 증가와 동일시하면 안 됩니다. 모든 파생 계약에는 롱과 숏 양측이 존재합니다.",
      riskNote: "거래소 합산 OI는 집계와 환산 방식에 따라 달라질 수 있으며 방향성이나 보유자의 의도를 직접 보여주지 않습니다.",
    },
    liquidation: {
      localizedTerm: "청산",
      summary: "증거금이 유지 기준 아래로 내려갔을 때 거래소가 레버리지 포지션을 강제로 종료하는 절차입니다.",
      definition: "청산은 포지션 손실로 계정이 유지증거금 요건을 충족하지 못할 때 발생합니다. 거래소는 계약과 보험기금을 보호하기 위해 포지션 일부 또는 전부를 강제로 줄입니다. 표시 청산가는 참고치이며 수수료, 유지증거금 구간, 다른 포지션과 교차증거금 상태에 따라 달라질 수 있습니다.",
      whyItMatters: "레버리지가 커질수록 진입가와 청산가 사이의 여유가 줄어듭니다. 손절도 급격한 가격 이동이나 유동성 부족에서는 예상 가격에 체결되지 않을 수 있으므로 청산가보다 충분히 앞선 위험 한도가 필요합니다.",
      formula: "단순화한 가격 여유 ≈ 1 ÷ 레버리지. 실제 청산가는 유지증거금과 수수료를 반영합니다.",
      workedExample: "10배 레버리지 롱은 가격이 약 10% 역행하면 초기증거금 대부분을 잃는 구조입니다. 실제 청산은 유지증거금 때문에 더 일찍 발생할 수 있으므로 1,000 USDT 증거금으로 10,000 USDT 포지션이 정확히 10% 하락을 버틴다고 볼 수 없습니다.",
      interpretation: ["청산가보다 계정에서 감당할 최대 손실을 먼저 정합니다.", "격리증거금과 교차증거금의 손실 범위를 구분합니다.", "마크 가격과 최종 거래 가격 중 청산 기준을 확인합니다."],
      misconception: "손절 주문을 설정해도 청산 가능성은 남습니다. 가격 갭, 슬리피지, 시스템 지연으로 체결이 늦어질 수 있습니다.",
      riskNote: "청산 공식은 거래소와 계약마다 다릅니다. 계산기를 보장값으로 보지 말고 낮은 레버리지와 작은 포지션으로 여유를 확보하세요.",
    },
    "position-sizing": {
      localizedTerm: "포지션 사이징",
      summary: "한 번의 거래에서 허용할 손실과 손절 거리로 적절한 포지션 규모를 결정하는 위험관리 방법입니다.",
      definition: "포지션 사이징은 확신이나 기대수익보다 먼저 계정에서 잃을 수 있는 금액을 정하는 과정입니다. 위험 예산을 진입가와 손절가의 차이로 나누면 손절이 정상 체결된다는 가정 아래 기본 수량을 구할 수 있습니다.",
      whyItMatters: "같은 전략도 포지션이 지나치게 크면 짧은 연속 손실로 계정이 크게 훼손됩니다. 일관된 위험 단위를 쓰면 가격과 변동성이 다른 거래를 비교하고 최대 낙폭을 관리하기 쉬워집니다.",
      formula: "포지션 수량 = 허용 손실액 ÷ |진입가 − 손절가|",
      workedExample: "10,000 USDT 계정에서 거래당 0.5%인 50 USDT만 위험에 노출한다고 가정합니다. BTC 진입가가 60,000달러, 손절가가 59,000달러라면 가격 위험은 1,000달러이므로 기본 수량은 0.05 BTC입니다. 수수료와 예상 슬리피지를 반영하면 실제 수량은 더 줄여야 합니다.",
      interpretation: ["손절 위치를 시장 구조에 따라 먼저 정한 뒤 수량을 역산합니다.", "거래 비용과 가격 갭을 안전 여유로 반영합니다.", "상관관계가 높은 여러 포지션은 하나의 위험 묶음으로 봅니다."],
      misconception: "레버리지를 낮추는 것만으로 위험이 작아지지는 않습니다. 명목가치, 손절 거리, 실제 체결 결과가 최종 손실을 함께 결정합니다.",
      riskNote: "공식은 계획한 가격에 손절이 체결된다고 가정합니다. 급변 시장에서는 실제 손실이 위험 예산을 초과할 수 있습니다.",
    },
    "maximum-drawdown": {
      localizedTerm: "최대 낙폭",
      summary: "측정 기간 중 자산곡선의 고점에서 이후 저점까지 발생한 가장 큰 하락률입니다.",
      definition: "최대 낙폭(MDD)은 투자 성과가 이전 최고점에서 얼마나 크게 후퇴했는지 보여줍니다. 단순 기간 손실과 달리 이전 고점을 회복하기 전까지의 하락을 하나의 구간으로 봅니다. 백테스트와 실거래 위험을 비교할 때 쓰는 경로 의존 지표입니다.",
      whyItMatters: "수익률이 높은 전략도 감내하기 어려운 낙폭을 가질 수 있습니다. 손실이 커질수록 원금 회복에 필요한 수익률은 비대칭적으로 증가하므로 수익률만 보면 위험을 과소평가하게 됩니다.",
      formula: "낙폭 = (현재 자산가치 − 이전 최고 자산가치) ÷ 이전 최고 자산가치 × 100",
      workedExample: "자산이 10,000에서 12,000 USDT까지 오른 뒤 9,000까지 하락했다면 낙폭은 (9,000−12,000)÷12,000 = −25%입니다. 다시 12,000에 도달하려면 9,000에서 약 33.3% 수익이 필요합니다.",
      interpretation: ["낙폭의 크기와 지속 기간, 회복 기간을 함께 봅니다.", "동일 기간과 비용 가정으로 전략을 비교합니다.", "실거래 낙폭이 백테스트 범위를 벗어나면 시장 국면 변화를 점검합니다."],
      misconception: "과거 최대 낙폭이 미래 손실의 상한이라는 생각은 잘못입니다. 표본 밖 시장에서는 더 큰 낙폭이 발생할 수 있습니다.",
      riskNote: "짧거나 유리한 백테스트 기간은 낙폭을 작게 보이게 할 수 있습니다. 스트레스 상황과 비용 상승도 함께 시험하세요.",
    },
    "backtest-overfitting": {
      localizedTerm: "백테스트 과적합",
      summary: "전략이 반복 가능한 시장 원리보다 과거 표본의 우연한 잡음에 지나치게 맞춰진 상태입니다.",
      definition: "백테스트 과적합은 많은 규칙과 파라미터를 반복 시험한 끝에 과거 데이터에서는 뛰어나지만 새 데이터에서는 재현되지 않는 전략을 선택할 때 발생합니다. 관측값에 비해 탐색 조합이 많을수록 우연히 좋은 결과를 찾기 쉽습니다.",
      whyItMatters: "최고 샤프 비율이나 수익률만 고르면 실패한 수많은 실험이 숨겨집니다. 거래 비용, 데이터 품질 문제, 미래 정보 누수가 더해지면 백테스트와 실전의 차이는 더 커집니다.",
      formula: "단일 공식보다 실험 횟수, 자유도, 표본 외 성과 저하, 파라미터 안정성을 함께 진단합니다.",
      workedExample: "이동평균 기간 두 개를 각각 1부터 200까지 시험하면 약 40,000개 조합이 생깁니다. 그중 수익률이 가장 높은 한 조합만 보고하면 경제적 근거 없이 우연히 표본에 맞은 결과를 고를 가능성이 큽니다.",
      interpretation: ["최종 평가 데이터는 모델 선택 과정과 분리합니다.", "인접한 파라미터에서도 성과가 유지되는지 확인합니다.", "워크포워드 검증과 현실적인 수수료·슬리피지를 적용합니다."],
      misconception: "표본 외 테스트 한 번을 통과했다고 과적합이 사라지지는 않습니다. 결과를 본 뒤 전략을 수정하면 그 표본도 개발 데이터가 됩니다.",
      riskNote: "백테스트는 가설 검토 도구이지 미래 수익 보장이 아닙니다. 공개되지 않은 실험 횟수와 선택 편향을 항상 고려해야 합니다.",
    },
  },
  ru: {
    "funding-rate": {
      localizedTerm: "Ставка финансирования",
      summary: "Периодический платёж между длинными и короткими позициями, удерживающий цену бессрочного фьючерса рядом со спотовой.",
      definition: "Финансирование — не обычная комиссия биржи, а расчёт между держателями позиций в заданное время. При положительной ставке обычно платят лонги, при отрицательной — шорты. Формула и интервал различаются, поэтому всегда проверяйте период ставки.",
      whyItMatters: "Небольшой платёж накапливается, если позиция с плечом открыта несколько расчётных периодов. Высокая положительная ставка может указывать на перегруженные лонги, отрицательная — на шорты, но сама по себе не обещает разворот.",
      formula: "Ожидаемый платёж = номинал позиции × ставка финансирования",
      workedExample: "Для лонга номиналом 10 000 USDT при ставке +0,01% платёж составит около 1 USDT. При трёх одинаковых расчётах за день — около 3 USDT, хотя фактическая сумма зависит от стоимости позиции и правил биржи в каждый момент расчёта.",
      interpretation: ["Оценивайте величину и длительность ставки, а не только знак.", "Проверяйте, растут ли цена и открытый интерес одновременно.", "Добавляйте финансирование, комиссии и проскальзывание к стоимости удержания."],
      misconception: "Положительная ставка не является автоматическим сигналом падения. В сильном тренде она может долго оставаться высокой.",
      riskNote: "Ставка может измениться до расчёта, а правила бирж отличаются. Перед сделкой изучите спецификацию контракта.",
    },
    "open-interest": {
      localizedTerm: "Открытый интерес",
      summary: "Общий объём деривативных контрактов, которые остаются открытыми и не были закрыты или погашены.",
      definition: "Открытый интерес (OI) — число или номинальная стоимость действующих фьючерсных и опционных контрактов. Он растёт при создании новых контрактов и падает при закрытии позиций. В отличие от объёма торгов за период, OI измеряется в конкретный момент.",
      whyItMatters: "OI показывает, сколько новых позиций и плеча сопровождает движение цены. Он не определяет доминирующую сторону, поэтому его сравнивают с ценой, объёмом, финансированием и ликвидациями.",
      formula: "Изменение OI (%) = (текущий OI − предыдущий OI) ÷ предыдущий OI × 100",
      workedExample: "Если BTC дорожает на 2%, с $60 000 до $61 200, а OI растёт на 10%, с $1,0 до $1,1 млрд, вероятен приток новых позиций с плечом. Но в контрактах есть и новые шорты, поэтому продолжение роста не гарантировано.",
      interpretation: ["Рост цены и OI может означать приток новых позиций.", "Резкое движение цены при падении OI может указывать на ликвидации или массовое закрытие.", "Сравнивайте одинаковый набор бирж и единицы измерения."],
      misconception: "Рост OI не равен усилению покупок: у каждого контракта есть длинная и короткая сторона.",
      riskNote: "Сводный OI зависит от охвата площадок и метода пересчёта и не раскрывает направление или намерения участников.",
    },
    liquidation: {
      localizedTerm: "Ликвидация",
      summary: "Принудительное закрытие позиции с плечом, когда маржа опускается ниже требования биржи.",
      definition: "Ликвидация происходит, когда из-за убытка счёт перестаёт соответствовать поддерживающей марже. Биржа принудительно сокращает позицию полностью или частично. Показанная цена ликвидации приблизительна и меняется из-за комиссий, уровней маржи, других позиций и кросс-маржи.",
      whyItMatters: "Чем выше плечо, тем меньше запас между входом и ликвидацией. Стоп может исполниться хуже ожидаемого при резком движении или низкой ликвидности, поэтому лимит риска нужен задолго до ликвидации.",
      formula: "Упрощённый запас цены ≈ 1 ÷ плечо. Точный расчёт учитывает поддерживающую маржу и комиссии.",
      workedExample: "Лонг с плечом 10× теряет почти всю начальную маржу при движении против позиции примерно на 10%. Поддерживающая маржа может вызвать ликвидацию раньше, поэтому позиция на 10 000 USDT с маржой 1 000 USDT не гарантированно выдержит полное падение на 10%.",
      interpretation: ["Сначала задайте максимальный убыток счёта, а не цену ликвидации.", "Различайте область потерь изолированной и кросс-маржи.", "Уточните, какая цена запускает ликвидацию: маркировочная или последняя."],
      misconception: "Стоп-приказ не исключает ликвидацию: разрыв цены, проскальзывание или задержка системы могут помешать исполнению.",
      riskNote: "Формулы различаются по биржам и контрактам. Считайте калькулятор оценкой и оставляйте запас меньшим плечом и размером позиции.",
    },
    "position-sizing": {
      localizedTerm: "Размер позиции",
      summary: "Метод управления риском, определяющий размер позиции по допустимому убытку и расстоянию до стопа.",
      definition: "Сначала определяют сумму, которую счёт может потерять, и только потом учитывают уверенность и ожидаемую доходность. Риск-бюджет, делённый на расстояние между входом и стопом, даёт базовый объём при условии нормального исполнения стопа.",
      whyItMatters: "Слишком крупные позиции могут разрушить даже хорошую стратегию за короткую серию убытков. Единая мера риска упрощает сравнение сделок и контроль просадки.",
      formula: "Размер позиции = допустимый убыток ÷ |цена входа − цена стопа|",
      workedExample: "Для счёта 10 000 USDT и риска 0,5% допустимый убыток равен 50 USDT. При входе BTC по $60 000 и стопе $59 000 базовый объём составляет 0,05 BTC. Комиссии и ожидаемое проскальзывание требуют уменьшить его.",
      interpretation: ["Сначала ставьте стоп по структуре рынка, затем считайте объём.", "Оставляйте запас на издержки и ценовые разрывы.", "Сильно коррелирующие позиции считайте одной группой риска."],
      misconception: "Низкое плечо само по себе не уменьшает риск. Итоговый убыток зависит от номинала, стопа и исполнения.",
      riskNote: "Формула предполагает исполнение стопа по плановой цене. На быстром рынке фактический убыток может превысить бюджет.",
    },
    "maximum-drawdown": {
      localizedTerm: "Максимальная просадка",
      summary: "Наибольшее процентное снижение кривой капитала от пика до последующего минимума за период.",
      definition: "Максимальная просадка (MDD) показывает самое большое отступление от предыдущего максимума капитала. Падение до восстановления пика считается одним эпизодом. Это зависимая от пути мера для сравнения риска бэктеста и реальной торговли.",
      whyItMatters: "Даже высокодоходная стратегия может иметь неприемлемую просадку. Чем глубже потеря, тем непропорционально выше доходность, нужная для восстановления, поэтому одна доходность занижает риск.",
      formula: "Просадка = (текущий капитал − предыдущий пик) ÷ предыдущий пик × 100",
      workedExample: "Если капитал вырос с 10 000 до 12 000 USDT, затем упал до 9 000, просадка равна −25%. Чтобы вернуться с 9 000 к 12 000, потребуется около 33,3% прибыли.",
      interpretation: ["Оценивайте глубину, длительность и время восстановления вместе.", "Сравнивайте одинаковые периоды и допущения об издержках.", "Проверьте смену режима, если реальная просадка вышла за пределы бэктеста."],
      misconception: "Историческая максимальная просадка не ограничивает будущий убыток. В новых условиях падение может быть глубже.",
      riskNote: "Короткий или благоприятный бэктест занижает просадку. Проверяйте стрессовые сценарии и рост издержек.",
    },
    "backtest-overfitting": {
      localizedTerm: "Переобучение бэктеста",
      summary: "Состояние, при котором стратегия подстроена под случайный шум истории сильнее, чем под устойчивую рыночную закономерность.",
      definition: "Переобучение возникает, когда после множества тестов правил и параметров выбирают стратегию, отличную на истории, но слабую на новых данных. Чем больше комбинаций относительно числа наблюдений, тем проще найти случайно удачный результат.",
      whyItMatters: "Выбор только лучшего коэффициента Шарпа или доходности скрывает неудачные опыты. Издержки, ошибки данных и утечка будущей информации ещё сильнее расходят тест и реальность.",
      formula: "Единой формулы нет: вместе оценивают число экспериментов, степени свободы, ухудшение вне выборки и устойчивость параметров.",
      workedExample: "Проверка двух периодов скользящих средних от 1 до 200 создаёт около 40 000 сочетаний. Если показать только самое прибыльное, случайную подгонку легко принять за закономерность.",
      interpretation: ["Отделяйте финальные данные оценки от выбора модели.", "Проверяйте устойчивость на соседних значениях параметров.", "Применяйте walk-forward проверку с реалистичными комиссиями и проскальзыванием."],
      misconception: "Один успешный тест вне выборки не устраняет переобучение. После доработки стратегии по его результату эта выборка становится обучающей.",
      riskNote: "Бэктест проверяет гипотезу, а не гарантирует прибыль. Учитывайте скрытое число экспериментов и смещение отбора.",
    },
  },
  "pt-BR": {
    "funding-rate": {
      localizedTerm: "Taxa de financiamento",
      summary: "Pagamento periódico entre posições compradas e vendidas que mantém o perpétuo próximo do preço à vista.",
      definition: "O financiamento não é uma tarifa comum cobrada pela corretora, mas um pagamento entre titulares de posições em horários definidos. Taxa positiva costuma significar que comprados pagam vendidos; negativa, o inverso. Confira sempre o intervalo, pois fórmula e frequência variam.",
      whyItMatters: "Um valor pequeno pode se acumular enquanto uma posição alavancada permanece aberta. Taxa positiva alta pode indicar excesso de comprados e taxa negativa, excesso de vendidos, mas nenhuma delas garante reversão.",
      formula: "Pagamento estimado = valor nocional da posição × taxa de financiamento",
      workedExample: "Em uma posição comprada de 10.000 USDT com taxa de +0,01%, o pagamento estimado é 1 USDT. Com três cobranças iguais no dia, o total simples seria 3 USDT, mas o valor real depende da posição e da fórmula em cada liquidação.",
      interpretation: ["Avalie magnitude e persistência, não apenas o sinal da taxa.", "Confira se preço e contratos em aberto sobem juntos.", "Some financiamento, taxas e slippage ao custo de carregamento."],
      misconception: "Taxa positiva não é automaticamente um sinal de queda. Em tendências fortes, ela pode permanecer elevada por bastante tempo.",
      riskNote: "A taxa pode mudar antes do horário de pagamento e as regras variam por corretora. Consulte a especificação do contrato.",
    },
    "open-interest": {
      localizedTerm: "Contratos em aberto",
      summary: "Quantidade total de contratos derivativos que continuam abertos e ainda não foram encerrados ou compensados.",
      definition: "Contratos em aberto (OI) são a quantidade ou o valor nocional de futuros e opções ainda ativos. O indicador aumenta com novos contratos e cai quando posições são fechadas. Diferentemente do volume negociado ao longo de um período, o OI mede o estoque em um instante.",
      whyItMatters: "O OI mostra quanto posicionamento novo e alavancagem acompanham o preço. Ele não indica qual lado domina, por isso deve ser lido com preço, volume, financiamento e liquidações.",
      formula: "Variação do OI (%) = (OI atual − OI anterior) ÷ OI anterior × 100",
      workedExample: "Se o BTC sobe 2%, de US$ 60.000 para US$ 61.200, e o OI cresce 10%, de US$ 1,0 bi para US$ 1,1 bi, pode haver novas posições alavancadas. Como também há novos vendidos, isso não confirma a continuidade da alta.",
      interpretation: ["Preço e OI em alta podem indicar entrada de novas posições.", "Movimento brusco com OI em queda pode sinalizar liquidações ou fechamentos.", "Compare a mesma cobertura de corretoras e a mesma unidade."],
      misconception: "Alta do OI não equivale a mais pressão compradora: todo contrato tem um lado comprado e outro vendido.",
      riskNote: "O OI agregado varia conforme cobertura e conversão e não revela diretamente a direção ou intenção dos participantes.",
    },
    liquidation: {
      localizedTerm: "Liquidação",
      summary: "Fechamento forçado de uma posição alavancada quando a margem fica abaixo da exigência de manutenção.",
      definition: "A liquidação ocorre quando as perdas impedem a conta de cumprir a margem de manutenção. A corretora reduz parte ou toda a posição para proteger o contrato e seu fundo de seguro. O preço exibido é estimado e muda com taxas, faixas de margem, outras posições e margem cruzada.",
      whyItMatters: "Quanto maior a alavancagem, menor a distância entre entrada e liquidação. Um stop também pode executar pior em movimentos rápidos ou com pouca liquidez, então o limite de perda deve vir bem antes.",
      formula: "Folga simplificada de preço ≈ 1 ÷ alavancagem. O cálculo real inclui margem de manutenção e taxas.",
      workedExample: "Uma compra com 10× perde quase toda a margem inicial após um movimento adverso próximo de 10%. A margem de manutenção pode liquidá-la antes, portanto uma posição de 10.000 USDT com 1.000 USDT de margem não tem garantia de suportar queda integral de 10%.",
      interpretation: ["Defina primeiro a perda máxima da conta, não o preço de liquidação.", "Diferencie o alcance das perdas na margem isolada e cruzada.", "Confirme se a liquidação usa preço de marcação ou último preço."],
      misconception: "Um stop não elimina a liquidação: gap, slippage ou atraso do sistema podem impedir a execução a tempo.",
      riskNote: "As fórmulas mudam por corretora e contrato. Trate a calculadora como estimativa e mantenha folga com menos alavancagem e posição menor.",
    },
    "position-sizing": {
      localizedTerm: "Dimensionamento de posição",
      summary: "Método de gestão de risco que define o tamanho da posição pela perda permitida e pela distância até o stop.",
      definition: "Primeiro se decide quanto da conta pode ser perdido, antes da convicção ou retorno esperado. Dividir esse orçamento de risco pela distância entre entrada e stop fornece a quantidade-base, supondo execução normal do stop.",
      whyItMatters: "Posições grandes demais podem comprometer até uma boa estratégia em uma sequência curta de perdas. Uma unidade de risco consistente facilita comparar operações e controlar o drawdown.",
      formula: "Quantidade da posição = perda permitida ÷ |preço de entrada − preço do stop|",
      workedExample: "Em uma conta de 10.000 USDT com risco de 0,5%, a perda permitida é 50 USDT. Com entrada do BTC a US$ 60.000 e stop a US$ 59.000, a quantidade-base é 0,05 BTC. Taxas e slippage esperado devem reduzi-la.",
      interpretation: ["Defina o stop pela estrutura do mercado e só então calcule a quantidade.", "Reserve margem adicional para custos e gaps.", "Agrupe posições muito correlacionadas como um único risco."],
      misconception: "Reduzir apenas a alavancagem não reduz necessariamente o risco. Nocional, distância do stop e execução determinam a perda.",
      riskNote: "A fórmula supõe stop no preço planejado. Em mercados rápidos, a perda real pode superar o orçamento.",
    },
    "maximum-drawdown": {
      localizedTerm: "Drawdown máximo",
      summary: "Maior queda percentual da curva de capital entre um pico e o vale posterior no período analisado.",
      definition: "O drawdown máximo (MDD) mede o maior recuo desde um pico anterior do capital. A queda até a recuperação desse pico forma um único episódio. É uma medida dependente do caminho para comparar risco de backtest e operação real.",
      whyItMatters: "Uma estratégia rentável pode ter um drawdown intolerável. Como o retorno necessário para recuperar cresce de forma desproporcional à perda, olhar só a rentabilidade subestima o risco.",
      formula: "Drawdown = (capital atual − pico anterior) ÷ pico anterior × 100",
      workedExample: "Se o capital sobe de 10.000 para 12.000 USDT e cai para 9.000, o drawdown é −25%. Para voltar de 9.000 a 12.000, será necessário um ganho de cerca de 33,3%.",
      interpretation: ["Analise profundidade, duração e tempo de recuperação juntos.", "Compare o mesmo período e as mesmas premissas de custo.", "Investigue mudança de regime se o drawdown real superar o backtest."],
      misconception: "O drawdown máximo histórico não limita perdas futuras. Condições inéditas podem produzir uma queda maior.",
      riskNote: "Um backtest curto ou favorável pode subestimar o drawdown. Teste cenários de estresse e custos maiores.",
    },
    "backtest-overfitting": {
      localizedTerm: "Sobreajuste de backtest",
      summary: "Situação em que a estratégia se ajusta mais ao ruído acidental do histórico do que a um princípio de mercado repetível.",
      definition: "O sobreajuste ocorre quando muitos testes de regras e parâmetros selecionam uma estratégia excelente no histórico, mas fraca em dados novos. Quanto mais combinações em relação às observações, mais fácil encontrar um resultado bom por acaso.",
      whyItMatters: "Escolher apenas o melhor Sharpe ou retorno esconde experimentos fracassados. Custos, dados ruins e vazamento de informação futura ampliam a diferença entre backtest e realidade.",
      formula: "Não há fórmula única: avalie número de testes, graus de liberdade, perda fora da amostra e estabilidade dos parâmetros.",
      workedExample: "Testar dois períodos de médias móveis de 1 a 200 cria cerca de 40.000 combinações. Mostrar só a mais lucrativa aumenta a chance de confundir ajuste aleatório com vantagem econômica.",
      interpretation: ["Separe os dados finais de avaliação da seleção do modelo.", "Confira se parâmetros próximos produzem resultados semelhantes.", "Use validação walk-forward com taxas e slippage realistas."],
      misconception: "Passar em um único teste fora da amostra não elimina o sobreajuste. Se a estratégia muda após ver o resultado, essa amostra virou dado de desenvolvimento.",
      riskNote: "Backtest testa uma hipótese; não garante lucro futuro. Considere o número oculto de experimentos e o viés de seleção.",
    },
  },
  tr: {
    "funding-rate": {
      localizedTerm: "Fonlama oranı",
      summary: "Süresiz vadeli fiyatı spot fiyata yakın tutmak için uzun ve kısa pozisyonlar arasında yapılan dönemsel ödemedir.",
      definition: "Fonlama, borsanın aldığı standart bir ücret değil, belirli zamanlarda pozisyon sahipleri arasındaki ödemedir. Pozitif oranda genellikle uzunlar kısalara, negatif oranda kısalar uzunlara ödeme yapar. Formül ve ödeme aralığı borsaya göre değiştiği için oran dönemini kontrol edin.",
      whyItMatters: "Küçük görünen tutar, kaldıraçlı pozisyon birkaç ödeme dönemi açık kalınca birikir. Yüksek pozitif oran kalabalık uzunları, büyük negatif oran kalabalık kısaları gösterebilir; ancak tek başına dönüş garantilemez.",
      formula: "Tahmini fonlama ödemesi = pozisyonun nominal değeri × fonlama oranı",
      workedExample: "10.000 USDT nominal uzun pozisyonda oran +%0,01 ise tahmini ödeme 1 USDT'dir. Aynı oran günde üç kez uygulanırsa basit toplam yaklaşık 3 USDT olur; gerçek tutar her ödeme anındaki pozisyon değeri ve borsa formülüne bağlıdır.",
      interpretation: ["Yalnızca işareti değil, oran büyüklüğünü ve ne kadar sürdüğünü değerlendirin.", "Fiyat ile açık pozisyon miktarının birlikte artıp artmadığını kontrol edin.", "Fonlama, komisyon ve kaymayı toplam taşıma maliyetine ekleyin."],
      misconception: "Pozitif fonlama oranı otomatik düşüş sinyali değildir. Güçlü trendlerde yüksek oran uzun süre devam edebilir.",
      riskNote: "Oran ödeme öncesi değişebilir ve borsa kuralları farklıdır. İşlemden önce sözleşme özelliklerini inceleyin.",
    },
    "open-interest": {
      localizedTerm: "Açık pozisyon miktarı",
      summary: "Henüz kapatılmamış veya mahsuplaştırılmamış türev sözleşmelerinin toplam büyüklüğüdür.",
      definition: "Açık pozisyon miktarı (OI), açık vadeli işlem ve opsiyon sözleşmelerinin sayısı ya da nominal değeridir. Yeni sözleşmelerle artar, mevcut pozisyonlar kapanınca azalır. Belirli bir dönemdeki işlemleri sayan hacmin aksine OI, tek bir andaki açık sözleşmeleri ölçer.",
      whyItMatters: "Fiyat hareketine ne kadar yeni pozisyon ve kaldıraç eşlik ettiğini gösterir. Hangi tarafın baskın olduğunu söylemez; fiyat, hacim, fonlama ve likidasyon verileriyle birlikte okunmalıdır.",
      formula: "OI değişimi (%) = (mevcut OI − önceki OI) ÷ önceki OI × 100",
      workedExample: "BTC 60.000 dolardan 61.200 dolara %2 yükselirken OI 1,0 milyar dolardan 1,1 milyar dolara %10 çıkarsa yeni kaldıraçlı pozisyonlar giriyor olabilir. Yeni kısa pozisyonlar da buna dahildir; yükselişin süreceği kesinleşmez.",
      interpretation: ["Fiyat ve OI artışı yeni pozisyon girişine işaret edebilir.", "Sert fiyat hareketiyle OI düşüşü, likidasyon veya toplu kapanış gösterebilir.", "Aynı borsa kapsamını ve para birimini kullanın."],
      misconception: "OI artışı alım baskısının arttığı anlamına gelmez; her sözleşmenin uzun ve kısa tarafı vardır.",
      riskNote: "Toplam OI, borsa kapsamı ve dönüşüm yöntemine göre değişir; yönü veya yatırımcı niyetini doğrudan göstermez.",
    },
    liquidation: {
      localizedTerm: "Likidasyon",
      summary: "Teminat sürdürme gereksiniminin altına düştüğünde kaldıraçlı pozisyonun zorunlu kapatılmasıdır.",
      definition: "Kayıplar hesabın sürdürme teminatını karşılayamamasına yol açtığında likidasyon gerçekleşir. Borsa, sözleşmeyi ve sigorta fonunu korumak için pozisyonun bir kısmını ya da tamamını zorla azaltır. Gösterilen fiyat tahminidir; ücretler, teminat kademeleri, diğer pozisyonlar ve çapraz teminatla değişebilir.",
      whyItMatters: "Kaldıraç yükseldikçe giriş ile likidasyon arasındaki pay daralır. Stop emri hızlı hareketlerde veya düşük likiditede kötü fiyattan dolabilir; zarar sınırı likidasyondan çok önce olmalıdır.",
      formula: "Basitleştirilmiş fiyat payı ≈ 1 ÷ kaldıraç. Gerçek hesap sürdürme teminatı ve ücretleri içerir.",
      workedExample: "10× uzun pozisyon, fiyat yaklaşık %10 ters hareket edince başlangıç teminatının çoğunu kaybeder. Sürdürme teminatı daha erken likidasyon yaratabilir; 1.000 USDT teminatlı 10.000 USDT pozisyonun tam %10 düşüşe dayanacağı garanti değildir.",
      interpretation: ["Likidasyon fiyatından önce hesabın azami kaybını belirleyin.", "İzole ve çapraz teminatın zarar kapsamını ayırın.", "Likidasyonu işaret fiyatının mı son fiyatın mı tetiklediğini doğrulayın."],
      misconception: "Stop emri likidasyonu imkânsız kılmaz; fiyat boşluğu, kayma veya sistem gecikmesi zamanında dolumu engelleyebilir.",
      riskNote: "Formüller borsa ve sözleşmeye göre değişir. Hesap makinesini tahmin olarak görün; düşük kaldıraç ve küçük pozisyonla pay bırakın.",
    },
    "position-sizing": {
      localizedTerm: "Pozisyon boyutlandırma",
      summary: "Tek işlemde izin verilen zarar ve stop mesafesine göre pozisyon büyüklüğünü belirleyen risk yöntemidir.",
      definition: "Önce, güven veya beklenen getiriden bağımsız olarak hesabın ne kadar kaybedebileceği belirlenir. Risk bütçesini giriş ile stop arasındaki mesafeye bölmek, stopun planlandığı gibi dolduğu varsayımıyla temel miktarı verir.",
      whyItMatters: "Aşırı büyük pozisyonlar, iyi bir stratejiyi kısa bir kayıp serisinde bozabilir. Tutarlı risk birimi farklı fiyat ve oynaklıktaki işlemleri karşılaştırmayı ve düşüşü kontrol etmeyi kolaylaştırır.",
      formula: "Pozisyon miktarı = izin verilen zarar ÷ |giriş fiyatı − stop fiyatı|",
      workedExample: "10.000 USDT hesapta %0,5 risk 50 USDT'dir. BTC girişi 60.000 dolar, stop 59.000 dolar ise 1.000 dolarlık fiyat riski temel miktarı 0,05 BTC yapar. Komisyon ve beklenen kayma miktarı azaltmalıdır.",
      interpretation: ["Önce piyasa yapısına göre stopu, sonra miktarı belirleyin.", "Maliyetler ve fiyat boşlukları için ek pay bırakın.", "Yüksek korelasyonlu pozisyonları tek risk grubu sayın."],
      misconception: "Yalnızca kaldıracı düşürmek riski azaltmaz. Nominal değer, stop mesafesi ve gerçekleşen dolum birlikte belirleyicidir.",
      riskNote: "Formül stopun planlanan fiyatta dolduğunu varsayar. Hızlı piyasada gerçek zarar bütçeyi aşabilir.",
    },
    "maximum-drawdown": {
      localizedTerm: "Maksimum düşüş",
      summary: "Ölçüm döneminde sermaye eğrisinin zirveden sonraki dip noktaya yaşadığı en büyük yüzde kayıptır.",
      definition: "Maksimum düşüş (MDD), sermayenin önceki zirvesinden en büyük geri çekilmesini gösterir. Zirve geri alınana kadar süren düşüş tek bölüm sayılır. Backtest ile gerçek işlem riskini karşılaştıran, izlenen yola bağlı bir ölçüdür.",
      whyItMatters: "Yüksek getirili stratejinin katlanılamaz düşüşü olabilir. Kayıp büyüdükçe toparlanmak için gereken getiri orantısız arttığından yalnızca getiriye bakmak riski küçümser.",
      formula: "Düşüş = (mevcut sermaye − önceki zirve) ÷ önceki zirve × 100",
      workedExample: "Sermaye 10.000'den 12.000 USDT'ye çıkıp 9.000'e düşerse düşüş −%25'tir. 9.000'den yeniden 12.000'e ulaşmak için yaklaşık %33,3 getiri gerekir.",
      interpretation: ["Derinlik, süre ve toparlanma zamanını birlikte değerlendirin.", "Aynı dönem ve maliyet varsayımlarıyla karşılaştırın.", "Gerçek düşüş backtest aralığını aşarsa rejim değişimini inceleyin."],
      misconception: "Geçmiş maksimum düşüş gelecekteki zararın üst sınırı değildir. Görülmemiş koşullar daha büyük kayıp yaratabilir.",
      riskNote: "Kısa veya elverişli backtest düşüşü küçük gösterebilir. Stres senaryolarını ve artan maliyetleri de test edin.",
    },
    "backtest-overfitting": {
      localizedTerm: "Backtest aşırı uyumu",
      summary: "Stratejinin tekrarlanabilir piyasa ilkesinden çok geçmiş verideki tesadüfi gürültüye uymasıdır.",
      definition: "Çok sayıda kural ve parametre denemesinden sonra geçmişte mükemmel, yeni veride zayıf bir strateji seçildiğinde aşırı uyum oluşur. Gözlem sayısına göre denenen kombinasyon arttıkça şans eseri iyi sonuç bulmak kolaylaşır.",
      whyItMatters: "Yalnızca en iyi Sharpe oranını veya getiriyi seçmek başarısız denemeleri gizler. İşlem maliyetleri, kötü veri ve geleceğe bakma sızıntısı backtest ile gerçek performans farkını büyütür.",
      formula: "Tek formül yoktur: deney sayısı, serbestlik derecesi, örneklem dışı bozulma ve parametre kararlılığı birlikte değerlendirilir.",
      workedExample: "İki hareketli ortalama periyodunu 1 ile 200 arasında denemek yaklaşık 40.000 kombinasyon üretir. Yalnızca en kârlıyı göstermek, tesadüfi uyumu ekonomik avantaj sanma riskini artırır.",
      interpretation: ["Nihai değerlendirme verisini model seçiminden ayırın.", "Yakın parametre değerlerinde sonucun korunup korunmadığını kontrol edin.", "Gerçekçi komisyon ve kaymayla walk-forward doğrulama kullanın."],
      misconception: "Tek bir örneklem dışı testi geçmek aşırı uyumu yok etmez. Sonucu gördükten sonra strateji değişirse o örneklem geliştirme verisine dönüşür.",
      riskNote: "Backtest bir hipotezi sınar; gelecekte kâr garantilemez. Gizli deney sayısını ve seçim yanlılığını hesaba katın.",
    },
  },
} satisfies LearnLocaleDictionary;

type LearnUiCopy = {
  readonly eyebrow: string;
  readonly indexTitle: string;
  readonly indexSubtitle: string;
  readonly category: Record<"Derivatives" | "Risk" | "Research", string>;
  readonly conceptNote: string;
  readonly cardAction: string;
  readonly back: string;
  readonly reviewed: string;
  readonly educational: string;
  readonly definition: string;
  readonly whyItMatters: string;
  readonly calculation: string;
  readonly interpretation: string;
  readonly misconception: string;
  readonly risk: string;
  readonly source: string;
  readonly takeActionEyebrow: string;
  readonly ctaTitle: string;
  readonly ctaBody: string;
  readonly ctaButton: string;
  readonly readNext: string;
};

export const learnUiCopy = {
  en: { eyebrow: "Knowledge hub", indexTitle: "Trading knowledge hub", indexSubtitle: "Learn the essential concepts behind derivatives, risk management, and strategy validation through clear definitions and worked examples.", category: { Derivatives: "Derivatives", Risk: "Risk", Research: "Research" }, conceptNote: "Concept note", cardAction: "Definition and worked example", back: "Back to knowledge hub", reviewed: "Reviewed", educational: "Educational content", definition: "Definition", whyItMatters: "Why it matters", calculation: "Calculation and example", interpretation: "What to check when interpreting it", misconception: "Common misconception", risk: "Risks and limitations", source: "Source", takeActionEyebrow: "[ TAKE ACTION ]", ctaTitle: "See how AI traders apply these ideas", ctaBody: "Compare the concept with positions, risk records, and strategy states in the simulation league. This is educational monitoring, not a real order or investment recommendation.", ctaButton: "View the AI trader league", readNext: "Continue learning" },
  ko: { eyebrow: "지식 허브", indexTitle: "트레이딩 지식 허브", indexSubtitle: "파생상품, 위험관리, 전략 검증에 필요한 핵심 개념을 정의부터 계산 예시까지 단계적으로 설명합니다.", category: { Derivatives: "파생상품", Risk: "위험관리", Research: "전략 연구" }, conceptNote: "개념 노트", cardAction: "정의와 계산 예시", back: "지식 허브로 돌아가기", reviewed: "검토일", educational: "교육용 콘텐츠", definition: "정의", whyItMatters: "왜 중요한가", calculation: "계산 방법과 예시", interpretation: "해석할 때 확인할 것", misconception: "흔한 오해", risk: "위험 및 한계", source: "출처", takeActionEyebrow: "[ 직접 확인하기 ]", ctaTitle: "AI 트레이더의 실제 판단 흐름을 확인하세요", ctaBody: "학습한 개념이 시뮬레이션 리그의 포지션, 위험 기록, 전략 상태에서 어떻게 나타나는지 비교해 보세요. 실제 주문이나 투자 권유가 아닌 교육용 모니터링 화면입니다.", ctaButton: "AI 트레이더 리그 보기", readNext: "연결해서 읽기" },
  ru: { eyebrow: "База знаний", indexTitle: "Словарь трейдинга", indexSubtitle: "Разберите ключевые понятия деривативов, управления риском и проверки стратегий с ясными определениями и расчётами.", category: { Derivatives: "Деривативы", Risk: "Риск", Research: "Исследование" }, conceptNote: "Разбор понятия", cardAction: "Определение и пример", back: "Назад к базе знаний", reviewed: "Проверено", educational: "Учебный материал", definition: "Определение", whyItMatters: "Почему это важно", calculation: "Расчёт и пример", interpretation: "Что учитывать при интерпретации", misconception: "Распространённое заблуждение", risk: "Риски и ограничения", source: "Источник", takeActionEyebrow: "[ К ДЕЙСТВИЮ ]", ctaTitle: "Посмотрите, как эти идеи используют ИИ-трейдеры", ctaBody: "Сопоставьте понятие с позициями, журналом риска и состоянием стратегий в симуляционной лиге. Это учебный мониторинг, а не реальный ордер или инвестиционная рекомендация.", ctaButton: "Открыть лигу ИИ-трейдеров", readNext: "Читать дальше" },
  "pt-BR": { eyebrow: "Central de conhecimento", indexTitle: "Glossário de trading", indexSubtitle: "Aprenda os conceitos essenciais de derivativos, gestão de risco e validação de estratégias com definições claras e exemplos calculados.", category: { Derivatives: "Derivativos", Risk: "Risco", Research: "Pesquisa" }, conceptNote: "Nota conceitual", cardAction: "Definição e exemplo", back: "Voltar à central", reviewed: "Revisado em", educational: "Conteúdo educativo", definition: "Definição", whyItMatters: "Por que importa", calculation: "Cálculo e exemplo", interpretation: "O que observar na interpretação", misconception: "Equívoco comum", risk: "Riscos e limitações", source: "Fonte", takeActionEyebrow: "[ COLOQUE EM PRÁTICA ]", ctaTitle: "Veja como traders de IA aplicam esses conceitos", ctaBody: "Compare o conceito com posições, registros de risco e estados de estratégia na liga simulada. É monitoramento educativo, não uma ordem real nem recomendação de investimento.", ctaButton: "Ver a liga de traders de IA", readNext: "Continue aprendendo" },
  tr: { eyebrow: "Bilgi merkezi", indexTitle: "Trading sözlüğü", indexSubtitle: "Türevler, risk yönetimi ve strateji doğrulamanın temel kavramlarını açık tanım ve hesaplama örnekleriyle öğrenin.", category: { Derivatives: "Türevler", Risk: "Risk", Research: "Araştırma" }, conceptNote: "Kavram notu", cardAction: "Tanım ve örnek", back: "Bilgi merkezine dön", reviewed: "İncelendi", educational: "Eğitim içeriği", definition: "Tanım", whyItMatters: "Neden önemli", calculation: "Hesaplama ve örnek", interpretation: "Yorumlarken kontrol edilecekler", misconception: "Yaygın yanılgı", risk: "Riskler ve sınırlamalar", source: "Kaynak", takeActionEyebrow: "[ UYGULAMAYA GEÇ ]", ctaTitle: "Yapay zekâ trader'larının bu fikirleri nasıl kullandığını görün", ctaBody: "Kavramı simülasyon ligindeki pozisyonlar, risk kayıtları ve strateji durumlarıyla karşılaştırın. Bu, gerçek emir veya yatırım tavsiyesi değil, eğitim amaçlı izlemedir.", ctaButton: "Yapay zekâ trader ligini görüntüle", readNext: "Öğrenmeye devam et" },
} satisfies Record<Locale, LearnUiCopy>;
