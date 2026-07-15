import type { BlogPost } from "@/lib/blog-posts";
import type { Locale } from "@/lib/i18n";

// allow: SIZE_OK - localized long-form editorial table; locale parity is easier to audit in one module.

export type BlogArticleSection = {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly bullets?: readonly string[];
  readonly ordered?: boolean;
};

export type BlogFaqItem = {
  readonly question: string;
  readonly answer: string;
};

export type BlogArticleContent = {
  readonly sections: readonly BlogArticleSection[];
  readonly faqTitle: string;
  readonly faq: readonly BlogFaqItem[];
  readonly shareTitle: string;
  readonly copyLink: string;
  readonly copied: string;
  readonly manualCopyHint: string;
  readonly riskTitle: string;
  readonly riskBody: string;
};

export function visibleArticleBody(
  post: BlogPost,
  content: BlogArticleContent,
): string {
  const sections = content.sections.flatMap((section) => [
    section.heading,
    ...section.paragraphs,
    ...(section.bullets ?? []),
  ]);
  const faq = content.faq.flatMap((item) => [item.question, item.answer]);
  return [
    post.excerpt,
    ...post.takeaways,
    ...sections,
    content.faqTitle,
    ...faq,
    ...(post.methodologyDisclosure ? [post.methodologyDisclosure] : []),
    post.riskNotice ?? content.riskBody,
  ].join("\n\n");
}

type ArticleFramework = {
  readonly contextHeading: (post: BlogPost) => string;
  readonly evidenceHeading: string;
  readonly evidenceParagraphs: (post: BlogPost) => readonly string[];
  readonly workflowHeading: string;
  readonly workflowParagraphs: (post: BlogPost) => readonly string[];
  readonly workflowSteps: (post: BlogPost) => readonly string[];
  readonly limitsHeading: string;
  readonly limitsParagraphs: (post: BlogPost) => readonly string[];
  readonly faqTitle: string;
  readonly faq: (post: BlogPost) => readonly BlogFaqItem[];
  readonly shareTitle: string;
  readonly copyLink: string;
  readonly copied: string;
  readonly manualCopyHint: string;
  readonly riskTitle: string;
  readonly riskBody: string;
};

const frameworks: Record<Locale, ArticleFramework> = {
  en: {
    contextHeading: (post) => `${post.title}: the decision context`,
    evidenceHeading: "What evidence deserves attention",
    evidenceParagraphs: (post) => [
      `${post.excerpt} That claim becomes useful only when it can be checked against a consistent observation window. Record the market, timeframe, number of decisions, transaction-cost assumptions, and the exact moment each signal became available. Without that context, a clean chart or a high rank can hide selection bias, oversized risk, or a result that depends on one favorable regime.`,
      `Use the article's key points as an audit list rather than as conclusions to accept automatically. Compare the latest result with earlier periods, look for changes in drawdown and trade frequency, and ask whether the same behavior appears across calm, trending, and volatile conditions. Evidence is stronger when another reader can reproduce the comparison from the same public record.`,
    ],
    workflowHeading: "A repeatable review workflow",
    workflowParagraphs: (post) => [
      `A practical review of ${post.title} should end in a written decision, not a vague impression. Start with one question, choose the metrics that could answer it, and set the evaluation window before looking at the outcome. This prevents the best-looking number from becoming the explanation after the fact.`,
      `Keep a short journal with screenshots or exported values, the reason for every inclusion or exclusion, and the condition that would change your view. Revisit the same record after enough new observations have accumulated. The goal is not to remove uncertainty; it is to make the uncertainty visible and comparable over time.`,
    ],
    workflowSteps: (post) => [
      `Define what you want to learn from ${post.title}.`,
      `Check the source, time window, sample size, drawdown, and cost assumptions.`,
      `Use these three checkpoints: ${post.takeaways.join(" ")}`,
      "Write down the result and the condition that would invalidate it.",
      "Repeat the same review after a new market regime or a meaningful new sample.",
    ],
    limitsHeading: "Limits, failure modes, and risk",
    limitsParagraphs: (post) => [
      `${post.title} cannot prove future profitability. Simulation removes some operational noise, while live markets add slippage, fees, liquidity constraints, outages, model drift, and human intervention. A short sample can also reward a strategy that simply matched one market regime. Treat every metric as a description of observed behavior, not a guarantee.`,
      `The safest use of this material is research and comparison. Do not size a position, copy a trade, or change a risk limit because of one article, one alert, or one place on a leaderboard. Independent verification, conservative exposure, and a predefined loss limit remain necessary even when the underlying AI record looks consistent.`,
    ],
    faqTitle: "Frequently asked questions",
    faq: (post) => [
      {
        question: `Is ${post.title.toLowerCase()} a trading signal?`,
        answer: "No. It is a framework for reading public simulation data and AI behavior. It does not tell you to buy, sell, or hold any asset.",
      },
      {
        question: "How often should I review the data?",
        answer: "Review it after a meaningful number of new decisions or a clear market-regime change. Checking every small price move encourages noise-driven conclusions.",
      },
      {
        question: "Which metric should come first?",
        answer: "Start with drawdown and sample size, then interpret return, win rate, holding time, and consistency together. No single metric is sufficient.",
      },
    ],
    shareTitle: "Share this article",
    copyLink: "Copy link",
    copied: "Link copied",
    manualCopyHint: "Clipboard access is blocked. Select the URL below and copy it manually.",
    riskTitle: "Research note",
    riskBody: "Aigentra Trading publishes simulated performance and educational analysis. Nothing in this article is financial advice, an investment recommendation, or a promise of future results. Past and simulated performance may differ materially from live trading.",
  },
  ko: {
    contextHeading: (post) => `「${post.title}」의 판단 맥락`,
    evidenceHeading: "어떤 근거를 확인해야 하나",
    evidenceParagraphs: (post) => [
      `${post.excerpt} 이 설명이 실제로 유용하려면 같은 관찰 구간에서 다시 확인할 수 있어야 합니다. 시장, 타임프레임, 의사결정 횟수, 거래비용 가정, 신호가 처음 공개된 시점을 함께 기록하세요. 이런 맥락이 빠지면 높은 순위나 깔끔한 수익 곡선 뒤에 선택 편향, 과도한 위험, 특정 장세에만 맞은 결과가 숨어 있을 수 있습니다.`,
      `이 글의 핵심 포인트는 정답이 아니라 점검표로 사용해야 합니다. 최근 결과를 이전 구간과 비교하고, 낙폭과 거래 빈도가 어떻게 변했는지, 횡보장·추세장·고변동 구간에서도 같은 행동이 반복되는지 확인하세요. 다른 사용자가 같은 공개 기록으로 비교를 재현할 수 있을 때 근거의 신뢰도가 높아집니다.`,
    ],
    workflowHeading: "반복 가능한 검토 절차",
    workflowParagraphs: () => [
      "이 주제를 검토한 뒤에는 막연한 인상이 아니라 짧은 판단 기록이 남아야 합니다. 먼저 확인하려는 질문 하나를 정하고, 그 질문에 답할 지표와 관찰 기간을 결과를 보기 전에 선택하세요. 그래야 가장 좋아 보이는 숫자를 사후적으로 이유로 삼는 오류를 줄일 수 있습니다.",
      `포함하거나 제외한 데이터의 이유, 당시 화면이나 수치, 판단을 바꿀 조건을 간단히 기록하세요. 새로운 관찰이 충분히 쌓이면 같은 방식으로 다시 평가합니다. 불확실성을 없애는 것이 목적이 아니라, 불확실성을 눈에 보이게 만들고 시간에 따라 비교 가능하게 만드는 것이 목적입니다.`,
    ],
    workflowSteps: () => [
      "이 글에서 확인하려는 질문을 한 문장으로 정합니다.",
      "출처, 기간, 표본 수, 최대 낙폭, 비용 가정을 함께 확인합니다.",
      "핵심 요약을 정답이 아닌 검증 항목으로 다시 확인합니다.",
      "현재 판단과 그 판단이 틀렸다고 볼 조건을 기록합니다.",
      "장세가 바뀌거나 의미 있는 새 표본이 쌓이면 같은 절차를 반복합니다.",
    ],
    limitsHeading: "한계, 실패 조건, 그리고 위험",
    limitsParagraphs: () => [
      "이 글의 주제만으로는 미래 수익을 증명할 수 없습니다. 시뮬레이션은 일부 실행 변수를 제거하지만 실제 시장에는 슬리피지, 수수료, 유동성 제약, 장애, 모델 변화, 사람의 개입이 추가됩니다. 짧은 표본은 우연히 한 장세와 맞은 전략을 과대평가할 수도 있습니다. 모든 지표는 관찰된 행동의 설명일 뿐 보장이 아닙니다.",
      `이 자료는 연구와 비교 목적으로 사용하는 것이 가장 안전합니다. 글 하나, 알림 하나, 리더보드 순위 하나만 보고 포지션 크기나 손실 한도를 바꾸거나 거래를 그대로 따라 하지 마세요. AI 기록이 일관돼 보여도 독립적인 검증, 보수적인 노출, 사전에 정한 손실 제한이 필요합니다.`,
    ],
    faqTitle: "자주 묻는 질문",
    faq: () => [
      {
        question: "이 글은 매매 신호를 제공하나요?",
        answer: "아닙니다. 공개 시뮬레이션 데이터와 AI 행동을 읽는 방법을 설명하는 연구 자료이며, 특정 자산의 매수·매도·보유를 권하지 않습니다.",
      },
      {
        question: "데이터는 얼마나 자주 다시 봐야 하나요?",
        answer: "의미 있는 수의 새 의사결정이 쌓였거나 시장 국면이 분명히 바뀌었을 때 다시 검토하세요. 작은 가격 움직임마다 확인하면 잡음에 끌려가기 쉽습니다.",
      },
      {
        question: "가장 먼저 볼 지표는 무엇인가요?",
        answer: "최대 낙폭과 표본 수부터 확인한 뒤 수익률, 승률, 보유 시간, 일관성을 함께 해석하세요. 하나의 지표만으로는 충분하지 않습니다.",
      },
    ],
    shareTitle: "이 글 공유하기",
    copyLink: "링크 복사",
    copied: "링크가 복사되었습니다",
    manualCopyHint: "브라우저의 복사 권한이 차단되었습니다. 아래 주소를 선택해 직접 복사하세요.",
    riskTitle: "리서치 안내",
    riskBody: "Aigentra Trading은 시뮬레이션 성과와 교육용 분석을 제공합니다. 이 글은 금융 자문, 투자 권유, 미래 성과 보장이 아닙니다. 과거 및 시뮬레이션 성과는 실제 거래 결과와 크게 다를 수 있습니다.",
  },
  ru: {
    contextHeading: (post) => `${post.title}: контекст решения`,
    evidenceHeading: "Какие данные действительно важны",
    evidenceParagraphs: (post) => [
      `${post.excerpt} Это утверждение полезно только тогда, когда его можно проверить на одном и том же интервале наблюдения. Зафиксируйте рынок, таймфрейм, число решений, допущения по комиссиям и момент появления каждого сигнала. Без этого высокий рейтинг может скрывать избыточный риск, выборочную статистику или зависимость от одного удачного режима рынка.`,
      `Используйте ключевые выводы статьи как список вопросов, а не как готовый ответ. Сравните свежий период с предыдущими, проверьте просадку и частоту сделок, посмотрите, повторяется ли поведение в спокойном, трендовом и волатильном рынке. Данные сильнее, если другой читатель может воспроизвести сравнение по той же публичной истории.`,
    ],
    workflowHeading: "Повторяемый процесс проверки",
    workflowParagraphs: (post) => [
      `Проверка темы «${post.title}» должна завершаться записанным решением, а не общим впечатлением. Сначала сформулируйте один вопрос, затем заранее выберите метрики и период. Так самый красивый показатель не станет объяснением уже после того, как результат известен.`,
      `Сохраняйте короткий журнал: исходные значения, причины исключения данных и условие, которое изменит вашу оценку. Возвращайтесь к записи после накопления новых наблюдений. Цель не в устранении неопределенности, а в том, чтобы сделать ее видимой и сравнимой во времени.`,
    ],
    workflowSteps: (post) => [
      `Определите, что именно вы хотите узнать из темы «${post.title}».`,
      "Проверьте источник, период, размер выборки, просадку и комиссии.",
      `Используйте три ориентира: ${post.takeaways.join(" ")}`,
      "Запишите вывод и условие, при котором он станет неверным.",
      "Повторите проверку после смены режима рынка или появления новой выборки.",
    ],
    limitsHeading: "Ограничения, ошибки и риск",
    limitsParagraphs: (post) => [
      `${post.title} не доказывает будущую доходность. В реальной торговле появляются проскальзывание, комиссии, ограничения ликвидности, сбои, дрейф модели и вмешательство человека. Короткая выборка может наградить стратегию, совпавшую с одним режимом рынка. Метрика описывает наблюдавшееся поведение, но ничего не гарантирует.`,
      "Безопаснее использовать материал для исследования и сравнения. Не копируйте сделку и не меняйте лимит риска из-за одной статьи, одного уведомления или одной позиции в рейтинге. Даже стабильная история ИИ требует независимой проверки, ограниченного риска и заранее заданного максимального убытка.",
    ],
    faqTitle: "Частые вопросы",
    faq: (post) => [
      { question: `Является ли «${post.title}» торговым сигналом?`, answer: "Нет. Это учебная схема чтения публичных симуляций и поведения ИИ, а не рекомендация покупать или продавать актив." },
      { question: "Как часто проверять данные?", answer: "После накопления значимой новой выборки или явной смены режима рынка. Частая реакция на небольшие движения усиливает шум." },
      { question: "С какой метрики начать?", answer: "С просадки и размера выборки, затем совместно оцените доходность, долю прибыльных сделок, время удержания и стабильность." },
    ],
    shareTitle: "Поделиться статьей",
    copyLink: "Копировать ссылку",
    copied: "Ссылка скопирована",
    manualCopyHint: "Браузер заблокировал буфер обмена. Выделите адрес ниже и скопируйте его вручную.",
    riskTitle: "Примечание об исследовании",
    riskBody: "Aigentra Trading публикует результаты симуляций и образовательный анализ. Материал не является финансовой консультацией, инвестиционной рекомендацией или обещанием будущих результатов.",
  },
  "pt-BR": {
    contextHeading: (post) => `${post.title}: contexto da decisão`,
    evidenceHeading: "Quais evidências merecem atenção",
    evidenceParagraphs: (post) => [
      `${post.excerpt} Essa afirmação só é útil quando pode ser conferida em uma janela de observação consistente. Registre o mercado, o período gráfico, o número de decisões, as premissas de custos e o momento em que cada sinal ficou disponível. Sem esse contexto, um ranking alto pode esconder risco excessivo, seleção de dados ou dependência de um único regime favorável.`,
      "Use os pontos principais do artigo como uma lista de auditoria, não como respostas prontas. Compare o período recente com períodos anteriores, observe mudanças no drawdown e na frequência de operações e verifique se o comportamento se repete em mercados laterais, direcionais e voláteis. A evidência é mais forte quando outra pessoa consegue reproduzir a comparação.",
    ],
    workflowHeading: "Um processo de revisão repetível",
    workflowParagraphs: (post) => [
      `Uma análise de ${post.title} deve terminar em uma decisão registrada, não em uma impressão vaga. Comece com uma pergunta, escolha antes as métricas capazes de respondê-la e defina a janela de avaliação. Isso impede que o número mais atraente vire uma explicação posterior.`,
      "Mantenha um diário curto com valores, capturas, critérios de inclusão e a condição que mudaria sua opinião. Volte ao mesmo registro quando houver novas observações suficientes. O objetivo não é eliminar a incerteza, mas torná-la visível e comparável ao longo do tempo.",
    ],
    workflowSteps: (post) => [
      `Defina o que você quer aprender com ${post.title}.`,
      "Confira fonte, período, tamanho da amostra, drawdown e premissas de custo.",
      `Use estes três pontos de controle: ${post.takeaways.join(" ")}`,
      "Registre a conclusão e a condição que a invalidaria.",
      "Repita a revisão após uma mudança de regime ou uma nova amostra relevante.",
    ],
    limitsHeading: "Limites, falhas e risco",
    limitsParagraphs: (post) => [
      `${post.title} não prova rentabilidade futura. A negociação real acrescenta slippage, taxas, limites de liquidez, falhas operacionais, mudança do modelo e intervenção humana. Uma amostra curta também pode favorecer uma estratégia que apenas combinou com um regime específico. Métricas descrevem comportamento observado; não oferecem garantia.`,
      "O uso mais seguro deste material é pesquisa e comparação. Não copie uma operação nem altere seu limite de risco por causa de um artigo, alerta ou posição no ranking. Mesmo um histórico consistente de IA exige verificação independente, exposição conservadora e limite de perda definido antes da operação.",
    ],
    faqTitle: "Perguntas frequentes",
    faq: (post) => [
      { question: `${post.title} é um sinal de negociação?`, answer: "Não. É uma estrutura educacional para interpretar simulações públicas e comportamento de IA, sem recomendar compra ou venda de ativos." },
      { question: "Com que frequência devo revisar os dados?", answer: "Depois de uma amostra nova relevante ou de uma mudança clara no regime de mercado. Reagir a cada pequeno movimento aumenta o ruído." },
      { question: "Qual métrica vem primeiro?", answer: "Comece por drawdown e tamanho da amostra; depois avalie retorno, taxa de acerto, tempo de posição e consistência em conjunto." },
    ],
    shareTitle: "Compartilhar este artigo",
    copyLink: "Copiar link",
    copied: "Link copiado",
    manualCopyHint: "O navegador bloqueou a área de transferência. Selecione o endereço abaixo e copie manualmente.",
    riskTitle: "Nota de pesquisa",
    riskBody: "A Aigentra Trading publica desempenho simulado e análise educacional. Este conteúdo não é aconselhamento financeiro, recomendação de investimento nem promessa de resultados futuros.",
  },
  tr: {
    contextHeading: (post) => `${post.title}: karar bağlamı`,
    evidenceHeading: "Hangi kanıtlar dikkate alınmalı",
    evidenceParagraphs: (post) => [
      `${post.excerpt} Bu ifade ancak tutarlı bir gözlem aralığında yeniden kontrol edilebildiğinde işe yarar. Piyasayı, zaman dilimini, karar sayısını, maliyet varsayımlarını ve her sinyalin ilk görüldüğü anı kaydedin. Bu bağlam olmadan yüksek bir sıra; seçilmiş veriyi, aşırı riski veya tek bir uygun piyasa rejimine bağımlılığı gizleyebilir.`,
      "Makalenin ana noktalarını hazır sonuçlar olarak değil, denetim soruları olarak kullanın. Son dönemi önceki dönemlerle karşılaştırın; düşüş ve işlem sıklığındaki değişimleri izleyin; aynı davranışın sakin, trend ve yüksek oynaklık koşullarında tekrar edip etmediğini kontrol edin. Başka biri aynı kayıttan karşılaştırmayı üretebiliyorsa kanıt daha güçlüdür.",
    ],
    workflowHeading: "Tekrarlanabilir inceleme akışı",
    workflowParagraphs: (post) => [
      `${post.title} incelemesi belirsiz bir izlenimle değil, yazılı bir kararla bitmelidir. Önce tek bir soru belirleyin, bu soruyu yanıtlayacak metrikleri seçin ve sonucu görmeden önce değerlendirme aralığını sabitleyin. Böylece en iyi görünen sayı sonradan açıklamaya dönüşmez.`,
      "Değerleri, ekran görüntülerini, veri dahil etme nedenlerini ve fikrinizi değiştirecek koşulu kısa bir günlükte tutun. Yeterli yeni gözlem biriktiğinde aynı kayda dönün. Amaç belirsizliği yok etmek değil, onu görünür ve zaman içinde karşılaştırılabilir hale getirmektir.",
    ],
    workflowSteps: (post) => [
      `${post.title} üzerinden ne öğrenmek istediğinizi tanımlayın.`,
      "Kaynağı, dönemi, örnek büyüklüğünü, düşüşü ve maliyet varsayımlarını kontrol edin.",
      `Şu üç kontrol noktasını kullanın: ${post.takeaways.join(" ")}`,
      "Sonucu ve onu geçersiz kılacak koşulu yazın.",
      "Piyasa rejimi değiştiğinde veya anlamlı yeni örnek oluştuğunda tekrarlayın.",
    ],
    limitsHeading: "Sınırlar, hata biçimleri ve risk",
    limitsParagraphs: (post) => [
      `${post.title} gelecekteki kârlılığı kanıtlamaz. Canlı piyasa; kayma, ücretler, likidite sınırları, kesintiler, model kayması ve insan müdahalesi ekler. Kısa örneklem yalnızca tek bir rejime uyan stratejiyi ödüllendirebilir. Her metrik gözlenen davranışı açıklar; garanti vermez.`,
      "Bu içeriğin en güvenli kullanımı araştırma ve karşılaştırmadır. Tek bir makale, uyarı veya liderlik sırası nedeniyle işlem kopyalamayın ya da risk limitinizi değiştirmeyin. Tutarlı görünen bir AI kaydı bile bağımsız doğrulama, düşük maruziyet ve önceden belirlenmiş zarar limiti gerektirir.",
    ],
    faqTitle: "Sık sorulan sorular",
    faq: (post) => [
      { question: `${post.title} bir işlem sinyali mi?`, answer: "Hayır. Kamusal simülasyonları ve AI davranışını okumaya yönelik eğitim çerçevesidir; alım veya satım önermez." },
      { question: "Verileri ne sıklıkla incelemeliyim?", answer: "Anlamlı yeni karar örneği biriktiğinde veya piyasa rejimi belirgin biçimde değiştiğinde. Her küçük harekete tepki vermek gürültüyü artırır." },
      { question: "Önce hangi metriğe bakmalıyım?", answer: "Önce düşüş ve örnek büyüklüğüne, ardından getiri, kazanma oranı, elde tutma süresi ve tutarlılığa birlikte bakın." },
    ],
    shareTitle: "Bu makaleyi paylaş",
    copyLink: "Bağlantıyı kopyala",
    copied: "Bağlantı kopyalandı",
    manualCopyHint: "Tarayıcı pano erişimini engelledi. Aşağıdaki adresi seçip elle kopyalayın.",
    riskTitle: "Araştırma notu",
    riskBody: "Aigentra Trading simüle edilmiş performans ve eğitim amaçlı analiz yayınlar. Bu içerik finansal tavsiye, yatırım önerisi veya gelecekteki sonuçların garantisi değildir.",
  },
};

type KnowledgeFramework = Pick<
  ArticleFramework,
  "evidenceParagraphs" | "workflowParagraphs" | "workflowSteps" | "limitsParagraphs" | "faq"
>;

const knowledgeFrameworks: Record<Locale, KnowledgeFramework> = {
  en: {
    evidenceParagraphs: (post) => [
      `${post.excerpt} Verify that explanation against the cited protocol, standards, regulator, or vendor documentation before relying on a summary. Separate rules enforced by a network or contract from defaults chosen by a wallet, exchange, interface, or data provider; the two can look identical on screen while carrying different guarantees.`,
      "Check the publication date, software or specification version, network, and any assumptions behind the example. A useful explanation should let another reader trace the same transaction, setting, calculation, or security control from the primary source without depending on a promotional claim.",
    ],
    workflowParagraphs: (post) => [
      `Turn ${post.title} into a concrete verification exercise. Write down the exact concept you are checking, open the primary references, and trace one ordinary example from input to outcome. Then test an edge case or failure condition so the explanation is not limited to the happy path.`,
      "Keep identifiers, screenshots, versions, and timestamps with the result, while removing private keys, seed phrases, credentials, and personal data. Re-check the conclusion after a software update, policy change, or new standard because operational details can change even when the underlying concept does not.",
    ],
    workflowSteps: (post) => [
      `Define the exact question raised by ${post.title}.`,
      "Read the cited primary documentation and note its date, version, and scope.",
      `Trace a concrete example using these checkpoints: ${post.takeaways.join(" ")}`,
      "Test one failure case and record what the interface does not prove.",
      "Save a redacted record so the result can be reproduced safely.",
    ],
    limitsParagraphs: (post) => [
      `${post.title} may describe a stable concept while implementations, interfaces, fees, policies, and threat models continue to change. A block explorer, wallet, or service can simplify what it displays, so an interface label is not a substitute for the underlying protocol or standard.`,
      "Operational mistakes in crypto can be irreversible. Never expose a seed phrase or private key, verify addresses and networks independently, use small test amounts where appropriate, and treat educational examples as a starting point for verification rather than permission to move funds or assume risk.",
    ],
    faq: (post) => [
      { question: `What should I verify first about ${post.title}?`, answer: "Start with the cited primary specification or institutional source, then confirm the network, software version, date, and assumptions used in the example." },
      { question: "Can a wallet or exchange screen prove the underlying rule?", answer: "Not by itself. Interfaces summarize data and may apply provider-specific policies, so compare the display with the protocol, standard, or transaction record it represents." },
      { question: "How can I test the concept safely?", answer: "Use public or redacted records, a test environment, and small test amounts where relevant. Never paste private keys, seed phrases, credentials, or personal data into a checker." },
    ],
  },
  ko: {
    evidenceParagraphs: (post) => [
      `${post.excerpt} 이 설명은 글에 연결된 프로토콜 문서, 표준, 감독기관 또는 공식 서비스 문서와 대조해야 합니다. 네트워크나 스마트컨트랙트가 강제하는 규칙과 지갑·거래소·인터페이스가 선택한 기본 정책을 구분하세요. 화면에서는 비슷해 보여도 보장 범위는 다를 수 있습니다.`,
      "문서의 게시 시점, 소프트웨어나 규격 버전, 대상 네트워크, 예시에 사용한 가정을 함께 확인하세요. 좋은 설명이라면 홍보 문구에 기대지 않고 다른 독자도 같은 거래, 설정, 계산 또는 보안 통제를 1차 자료에서 다시 추적할 수 있어야 합니다.",
    ],
    workflowParagraphs: (post) => [
      `「${post.title}」을 구체적인 검증 과제로 바꿔 보세요. 확인할 개념을 한 문장으로 적고 1차 자료를 연 뒤, 일반적인 사례 하나를 입력부터 결과까지 따라갑니다. 그다음 실패 조건이나 경계 사례를 확인해야 정상 동작만 보고 결론 내리는 오류를 줄일 수 있습니다.`,
      "식별자, 화면, 버전, 시각은 남기되 개인키, 시드 문구, 인증 정보, 개인정보는 제거하세요. 소프트웨어 업데이트나 정책·표준 변경 뒤에는 같은 결론을 다시 확인해야 합니다. 기본 개념이 같아도 실제 처리 방식은 달라질 수 있습니다.",
    ],
    workflowSteps: (post) => [
      `「${post.title}」에서 확인할 질문을 정확히 정합니다.`,
      "인용된 1차 문서에서 날짜, 버전, 적용 범위를 확인합니다.",
      `다음 점검 항목으로 실제 사례를 추적합니다. ${post.takeaways.join(" ")}`,
      "실패 사례 하나를 확인하고 화면만으로 증명할 수 없는 부분을 적습니다.",
      "민감정보를 제거한 기록을 남겨 같은 과정을 재현할 수 있게 합니다.",
    ],
    limitsParagraphs: (post) => [
      `「${post.title}」이 다루는 기본 개념은 안정적일 수 있지만 구현, 화면, 수수료, 서비스 정책, 위협 모델은 계속 바뀝니다. 탐색기나 지갑이 보여주는 간단한 라벨은 이해를 돕는 요약일 뿐 프로토콜이나 표준 그 자체가 아닙니다.`,
      "암호화폐의 운영 실수는 되돌리기 어려울 수 있습니다. 시드 문구와 개인키를 공개하지 말고, 주소와 네트워크를 별도로 확인하며, 필요한 경우 적은 금액으로 먼저 시험하세요. 교육용 예시는 검증의 출발점이지 자금 이동이나 위험 감수를 허가하는 신호가 아닙니다.",
    ],
    faq: (post) => [
      { question: `「${post.title}」에서 가장 먼저 확인할 것은 무엇인가요?`, answer: "인용된 공식 규격이나 공공기관 자료부터 확인한 뒤 네트워크, 소프트웨어 버전, 문서 날짜, 예시의 가정을 대조하세요." },
      { question: "지갑이나 거래소 화면만으로 규칙을 확인할 수 있나요?", answer: "그것만으로는 부족합니다. 화면은 데이터를 요약하고 사업자별 정책을 적용할 수 있으므로, 해당 프로토콜·표준·실제 거래 기록과 함께 확인해야 합니다." },
      { question: "안전하게 검증하려면 어떻게 해야 하나요?", answer: "공개되거나 민감정보가 제거된 기록, 테스트 환경, 필요한 경우 소액 전송을 사용하세요. 개인키, 시드 문구, 인증 정보, 개인정보를 검사 도구에 입력하면 안 됩니다." },
    ],
  },
  ru: {
    evidenceParagraphs: (post) => [`${post.excerpt} Сверяйте объяснение с указанным протоколом, стандартом, документом регулятора или официальной документацией сервиса. Отделяйте правила сети и контракта от настроек кошелька, биржи или интерфейса.`, "Проверьте дату, версию, сеть и допущения примера. Другой читатель должен суметь повторить проверку транзакции, настройки, расчета или меры безопасности по первичному источнику."],
    workflowParagraphs: (post) => [`Превратите тему «${post.title}» в проверяемый вопрос: прочитайте первичные источники, проследите обычный пример от входных данных до результата, затем разберите один сбой или граничный случай.`, "Сохраняйте версии, время и обезличенные идентификаторы, но никогда не раскрывайте приватные ключи, seed-фразы, учетные данные или персональную информацию. После обновлений и изменений политики проверяйте вывод заново."],
    workflowSteps: (post) => [`Сформулируйте точный вопрос о теме «${post.title}».`, "Зафиксируйте дату, версию и область действия первичного источника.", `Проследите пример по ориентирам: ${post.takeaways.join(" ")}`, "Проверьте один сценарий отказа и пределы интерфейса.", "Сохраните обезличенный воспроизводимый результат."],
    limitsParagraphs: (post) => [`Основная идея «${post.title}» может быть стабильной, но реализации, интерфейсы, комиссии, политики и модели угроз меняются. Подпись в интерфейсе не заменяет протокол или стандарт.`, "Ошибки с криптоактивами могут быть необратимыми. Не раскрывайте seed-фразы и ключи, отдельно проверяйте адрес и сеть и при необходимости начинайте с небольшой тестовой суммы."],
    faq: (post) => [{ question: `Что сначала проверить в теме «${post.title}»?`, answer: "Начните с первичного источника и уточните сеть, версию, дату и допущения примера." }, { question: "Достаточно ли экрана кошелька или биржи?", answer: "Нет. Интерфейс сокращает данные и может применять собственную политику; сверяйте его с протоколом, стандартом или записью транзакции." }, { question: "Как провести безопасную проверку?", answer: "Используйте публичные или обезличенные записи и тестовую среду. Никогда не вводите приватные ключи, seed-фразы, учетные данные или персональную информацию." }],
  },
  "pt-BR": {
    evidenceParagraphs: (post) => [`${post.excerpt} Confira a explicação no protocolo, padrão, regulador ou documento oficial citado. Separe regras da rede ou contrato das escolhas de carteira, exchange, interface ou provedor.`, "Verifique data, versão, rede e premissas do exemplo. Outra pessoa deve conseguir repetir a análise da transação, configuração, cálculo ou controle de segurança usando a fonte primária."],
    workflowParagraphs: (post) => [`Transforme ${post.title} em uma verificação concreta: consulte as referências primárias, acompanhe um caso comum da entrada ao resultado e depois teste uma falha ou condição de limite.`, "Registre versões, horários e identificadores sem dados sensíveis. Nunca exponha chaves privadas, seed phrases, credenciais ou informações pessoais e refaça a verificação após mudanças de software ou política."],
    workflowSteps: (post) => [`Defina a pergunta exata sobre ${post.title}.`, "Anote data, versão e escopo da fonte primária.", `Acompanhe um exemplo com estes pontos: ${post.takeaways.join(" ")}`, "Teste uma falha e registre o que a interface não comprova.", "Salve um resultado reproduzível sem dados sensíveis."],
    limitsParagraphs: (post) => [`O conceito de ${post.title} pode ser estável, mas implementações, interfaces, taxas, políticas e ameaças mudam. Um rótulo na tela não substitui o protocolo ou padrão.`, "Erros com cripto podem ser irreversíveis. Não revele seed phrases ou chaves, confira endereço e rede separadamente e, quando adequado, use primeiro um valor pequeno de teste."],
    faq: (post) => [{ question: `O que verificar primeiro em ${post.title}?`, answer: "Comece pela fonte primária e confirme rede, versão, data e premissas do exemplo." }, { question: "A tela da carteira ou exchange é suficiente?", answer: "Não. A interface resume dados e pode aplicar regras próprias; compare-a com o protocolo, padrão ou registro da transação." }, { question: "Como testar com segurança?", answer: "Use registros públicos ou sem dados sensíveis e um ambiente de teste. Nunca informe chaves privadas, seed phrases, credenciais ou dados pessoais." }],
  },
  tr: {
    evidenceParagraphs: (post) => [`${post.excerpt} Açıklamayı alıntılanan protokol, standart, düzenleyici ya da resmi hizmet belgesiyle karşılaştırın. Ağ veya sözleşme kurallarını cüzdan, borsa, arayüz ve sağlayıcı tercihlerinden ayırın.`, "Örneğin tarihini, sürümünü, ağını ve varsayımlarını kontrol edin. Başka bir okuyucu aynı işlem, ayar, hesaplama veya güvenlik denetimini birincil kaynaktan tekrar izleyebilmelidir."],
    workflowParagraphs: (post) => [`${post.title} konusunu somut bir doğrulama çalışmasına çevirin: birincil belgeleri okuyun, sıradan bir örneği girdiden sonuca izleyin ve ardından bir hata ya da sınır koşulunu deneyin.`, "Sürüm, zaman ve hassas olmayan kimlikleri kaydedin; özel anahtar, seed phrase, kimlik bilgisi veya kişisel veri paylaşmayın. Yazılım ve politika değişiminden sonra sonucu yeniden kontrol edin."],
    workflowSteps: (post) => [`${post.title} için kesin soruyu tanımlayın.`, "Birincil kaynağın tarihini, sürümünü ve kapsamını not edin.", `Şu noktalarla bir örneği izleyin: ${post.takeaways.join(" ")}`, "Bir hata durumunu ve arayüzün kanıtlayamadığı noktayı kaydedin.", "Hassas verileri çıkarılmış, tekrarlanabilir bir sonuç saklayın."],
    limitsParagraphs: (post) => [`${post.title} temel olarak sabit kalabilir; ancak uygulamalar, arayüzler, ücretler, politikalar ve tehditler değişir. Ekrandaki bir etiket protokolün veya standardın yerini tutmaz.`, "Kripto işlemlerindeki hatalar geri alınamayabilir. Seed phrase ve özel anahtarları açıklamayın, adres ile ağı ayrı doğrulayın ve uygun olduğunda önce küçük bir test tutarı kullanın."],
    faq: (post) => [{ question: `${post.title} için önce ne doğrulanmalı?`, answer: "Birincil kaynakla başlayın; ağ, sürüm, tarih ve örnek varsayımlarını doğrulayın." }, { question: "Cüzdan veya borsa ekranı yeterli mi?", answer: "Hayır. Arayüz veriyi özetler ve sağlayıcı politikası uygulayabilir; protokol, standart veya işlem kaydıyla karşılaştırın." }, { question: "Nasıl güvenli test yapılır?", answer: "Kamusal ya da hassas verileri çıkarılmış kayıtlar ve test ortamı kullanın. Özel anahtar, seed phrase, kimlik bilgisi veya kişisel veri girmeyin." }],
  },
};

function isKnowledgeArticle(post: BlogPost): boolean {
  return post.category === "BITCOIN" || post.category === "SECURITY" || post.category === "OPERATIONS";
}

function topicalFaq(locale: Locale, post: BlogPost): readonly BlogFaqItem[] {
  const first = post.takeaways.at(0) ?? post.title;
  const second = post.takeaways.at(1) ?? post.excerpt;
  const third = post.takeaways.at(2) ?? post.riskNotice ?? post.excerpt;
  const risk = post.riskNotice ?? frameworks[locale].riskBody;
  switch (locale) {
    case "en":
      return [
        { question: `What is the first thing to distinguish in ${post.title}?`, answer: `Start with this article's central checkpoint: ${first} Then verify the definition and scope against the cited sources.` },
        { question: `How can I check ${post.title} in practice?`, answer: `Use the worked procedure in the article and keep these two checks together: ${second} ${third}` },
        { question: "What is the most important limitation?", answer: risk },
      ];
    case "ko":
      return [
        { question: `「${post.title}」에서 가장 먼저 구분할 것은 무엇인가요?`, answer: `먼저 이 글의 핵심 점검 항목인 ‘${first}’을 확인하고, 용어의 정의와 적용 범위를 인용된 자료와 대조하세요.` },
        { question: `「${post.title}」을 실제로 어떻게 확인할 수 있나요?`, answer: `본문의 재현 절차를 따라가면서 ‘${second}’과 ‘${third}’을 함께 확인하면 한 지표나 화면만 보고 판단하는 오류를 줄일 수 있습니다.` },
        { question: "가장 중요한 한계나 위험은 무엇인가요?", answer: risk },
      ];
    case "ru":
      return [
        { question: `Что сначала различить в теме «${post.title}»?`, answer: `Начните с ключевой проверки: ${first} Затем сверьте определение и область применения с указанными источниками.` },
        { question: `Как проверить «${post.title}» на практике?`, answer: `Повторите описанный в статье пример и совместно проверьте два пункта: ${second} ${third}` },
        { question: "Каково главное ограничение или риск?", answer: risk },
      ];
    case "pt-BR":
      return [
        { question: `O que distinguir primeiro em ${post.title}?`, answer: `Comece pelo ponto central: ${first} Depois, confira a definição e o escopo nas fontes citadas.` },
        { question: `Como verificar ${post.title} na prática?`, answer: `Repita o procedimento apresentado no artigo e mantenha estes dois controles juntos: ${second} ${third}` },
        { question: "Qual é a principal limitação ou risco?", answer: risk },
      ];
    case "tr":
      return [
        { question: `${post.title} konusunda önce ne ayrılmalı?`, answer: `Şu temel kontrolle başlayın: ${first} Ardından tanımı ve kapsamı alıntılanan kaynaklarla doğrulayın.` },
        { question: `${post.title} pratikte nasıl kontrol edilir?`, answer: `Makalede verilen süreci tekrarlayın ve şu iki denetimi birlikte uygulayın: ${second} ${third}` },
        { question: "En önemli sınır veya risk nedir?", answer: risk },
      ];
  }
}

type CoreGuideEnhancement = {
  readonly heading: string;
  readonly paragraphs: readonly string[];
  readonly faq: readonly [BlogFaqItem, BlogFaqItem];
};

const coreGuideEnhancements: Readonly<Record<"en" | "ko", Readonly<Record<string, CoreGuideEnhancement>>>> = {
  en: {
    "ai-trader-league": {
      heading: "How Aigentra's league is ranked today",
      paragraphs: [
        "Aigentra's current public league ranks paper accounts by cumulative net return from each account's starting equity. The monthly archive uses net return inside the named UTC month. The 24-hour, 7-day, and 30-day figures remain diagnostic windows; the system does not promote an agent merely because one of those shorter windows is its most favorable result. Total PnL is the change in equity, so fees already charged to the simulated account remain in the result. The public methodology page records the exact formulas and dated changes.",
        "A fair reading still needs a common observation boundary. Two agents can share the same accounting rules while having different launch dates, sample sizes, or exposure states. Before comparing them, record the as-of time, closed-trade count, open exposure, maximum drawdown, and whether a strategy or model version changed. If one agent has only a few decisions, its higher return is weaker evidence than a longer record; the league makes that uncertainty visible but cannot eliminate it.",
      ],
      faq: [
        { question: "What exactly determines the current Aigentra rank?", answer: "Current rank is cumulative net return from starting equity. Monthly archive rank is net return within the named UTC month; shorter rolling windows do not replace the ranking return." },
        { question: "Does first place mean the safest or best live strategy?", answer: "No. Rank summarizes one paper-performance outcome. Drawdown, sample size, open exposure, execution assumptions, and strategy version must be reviewed separately, and simulated results do not prove live execution." },
      ],
    },
    "ai-trading-leaderboard": {
      heading: "A five-field leaderboard audit",
      paragraphs: [
        "Read each row in this order: period, net return, maximum drawdown, closed sample, then open exposure. Period prevents an all-time number from being mistaken for a monthly result. Net return shows the equity outcome after recorded fees. Maximum drawdown shows the worst observed peak-to-trough path in that same period. Closed sample indicates how much realized evidence exists, while open exposure reveals how much of the current equity can still change. Biggest Win is limited to the largest net realized position cycle closed inside the displayed period.",
        "For a concrete comparison, imagine Agent A at +12% with -11% drawdown, 14 closed cycles, and one large open winner, while Agent B is +8% with -3% drawdown and 96 closed cycles. The table does not prove B will outperform, but A's higher result is more concentrated and less mature. Open both profiles, inspect whether one realized cycle explains most of the gain, check the start date and cost settings, and defer the comparison if the period or strategy versions do not match.",
      ],
      faq: [
        { question: "Which five fields should I read before an AI trader's rank?", answer: "Confirm the period, net return, maximum drawdown, closed-trade sample, and open exposure. Together they show the result, path, evidence size, and what can still change." },
        { question: "Why can a high return be weak evidence?", answer: "A short record, one exceptional trade, a favorable launch date, or unresolved open profit can dominate the number. Compare realized cycles and the full equity path before treating it as repeatable." },
      ],
    },
    "paper-trading-vs-live-trading": {
      heading: "What Aigentra's paper engine models",
      paragraphs: [
        "Aigentra's default paper configuration starts accounts at 10,000 USDT, records maker fees at 0.02%, taker fees at 0.05%, and applies a 0.01% adverse slippage assumption to configured market-like exits. These are engine defaults, not promises about any exchange. Each event should display the fee and maker or taker role actually stored for that simulated fill. Equity-based return includes fees already deducted, while funding is included only when the engine explicitly records it.",
        "The missing live variables are just as important as the modeled ones. A paper engine cannot know an account's real queue position, market impact, exchange throttling, liquidation engine behavior, or whether a user would interrupt the strategy during stress. A useful promotion test therefore compares small live fills with paper events by timestamp, requested price, executed price, fee, rejected quantity, and delay. Stop the test when divergence exceeds a written limit rather than rationalizing each miss after it occurs.",
      ],
      faq: [
        { question: "Which costs are included in Aigentra paper results?", answer: "Recorded maker or taker fees and configured simulated slippage are included in the equity path. Funding or another charge is included only when an event explicitly records it." },
        { question: "What is the first live validation after paper trading?", answer: "Use a deliberately small execution sample and compare requested versus filled price, fee, quantity, latency, rejection, and equity impact against the paper record under a prewritten stop condition." },
      ],
    },
    "why-simulation-matters": {
      heading: "A reproducible simulation record",
      paragraphs: [
        "A result is reproducible only when another reviewer can identify the data window, UTC cutoff, instrument, starting equity, fee and slippage settings, signal availability time, strategy or model version, and code or configuration used for the run. Preserve the equity series and trade events rather than only a final percentage. Aigentra's methodology page defines the public metric layer; a full research reproduction may still require data-provider versions and internal strategy artifacts that are not public.",
        "Use a frozen test before interpreting the outcome. Choose the market window and rules in advance, run the strategy without editing it after seeing losses, and keep one locked segment for evaluation. Then rerun with higher costs, delayed fills, missing bars, and an adverse volatility regime. A strategy that fails under a small, plausible assumption change has revealed fragility even if its original chart remains attractive.",
      ],
      faq: [
        { question: "What must be saved to reproduce an AI trading simulation?", answer: "Save the data/version, UTC window, instrument, starting equity, fees, slippage, signal timing, strategy/model version, configuration, equity series, and event-level trade record." },
        { question: "Does reproducibility make a backtest predictive?", answer: "No. It makes the historical claim inspectable. Regime change, liquidity, implementation errors, and selection bias can still make a reproducible result fail later." },
      ],
    },
    "telegram-trading-alerts": {
      heading: "Delivery status is not trade confirmation",
      paragraphs: [
        "A successful Telegram Bot API sendMessage response means Telegram created a server-side message object for the request. It does not prove that a specific device displayed a notification, that the user read it, or that delivery happened exactly once. Aigentra alerts should therefore be treated as monitoring messages linked to a durable platform record, not as execution instructions or acknowledgements. The profile timestamp and event state remain the source to inspect when a message arrives late or appears duplicated.",
        "Build an alert audit with message ID, chat ID, originating event ID, server timestamp, send result, retry history, and the linked trader state. On receipt, confirm sender identity, instrument, event type, original trigger, current price, invalidation, and whether the underlying position is still open. Ignore the alert when its context cannot be recovered or the market has moved outside the planned zone; speed is not evidence that the original risk-reward remains valid.",
      ],
      faq: [
        { question: "What does a successful Telegram Bot API response prove?", answer: "It proves server-side message creation for that request. It does not prove device notification, user reading, exactly-once delivery, or that the linked trading state is still current." },
        { question: "How should a delayed or duplicated alert be handled?", answer: "Open the linked platform event, compare timestamps and current position state, and ignore any message whose entry zone, invalidation, or event status is no longer valid." },
      ],
    },
  },
  ko: {
    "ai-trader-league": {
      heading: "현재 Aigentra 리그의 순위 기준",
      paragraphs: ["현재 공개 리그는 각 모의 계정의 시작 equity부터 현재까지 누적 순수익률로 정렬합니다. 월간 기록은 표시된 UTC 월 안의 순수익률을 사용합니다. 24시간·7일·30일 값은 상태를 보는 보조 구간이며, 그중 가장 유리한 하나가 전체 순위를 대신하지 않습니다. Total PnL은 equity 변화량이므로 이미 차감된 수수료도 결과에 남습니다. 정확한 공식과 변경일은 공개 Methodology 문서에서 확인할 수 있습니다. 따라서 오늘의 1위와 특정 월의 1위는 서로 다른 질문에 답할 수 있습니다. 비교 화면을 저장하거나 인용할 때는 반드시 기준 시각과 선택한 기간을 함께 적어야 숫자가 나중에도 같은 의미를 유지합니다.", "같은 회계 규칙을 적용해도 시작일, 거래 수, 열린 포지션과 전략 버전이 다르면 증거의 강도는 같지 않습니다. 비교 시각, 종료 거래 수, 열린 노출, 최대 낙폭과 버전 변경 여부를 함께 기록하세요. 거래가 몇 건뿐인 높은 수익은 긴 표본보다 불확실성이 크며, 리그는 이 차이를 보여 줄 수는 있어도 제거하지는 못합니다. 실제 검토에서는 수익률만 정렬한 뒤 결론을 내리지 말고 프로필의 equity 경로와 종료 거래를 열어 보세요. 한 번의 큰 거래가 결과 대부분을 만들었는지, 손실이 특정 구간에 몰렸는지, 현재 열린 손익이 결과를 얼마나 바꿀 수 있는지 확인하면 같은 순위표에서도 훨씬 더 신중한 판단을 할 수 있습니다."],
      faq: [{ question: "현재 Aigentra 순위는 정확히 무엇으로 정하나요?", answer: "현재 리그는 시작 equity 대비 누적 순수익률, 월간 기록은 해당 UTC 월의 순수익률로 정렬합니다. 단기 구간 중 가장 좋은 값으로 순위를 바꾸지 않습니다." }, { question: "1위가 가장 안전하거나 실전에서 가장 좋은 전략인가요?", answer: "아닙니다. 낙폭, 표본 수, 열린 노출, 체결 가정과 전략 버전을 별도로 확인해야 하며 모의 성과는 실제 체결을 증명하지 않습니다." }],
    },
    "ai-trading-leaderboard": {
      heading: "다섯 항목으로 리더보드 검증하기",
      paragraphs: ["각 행은 기간, 순수익률, 최대 낙폭, 종료 표본, 열린 노출 순서로 읽습니다. 기간은 누적과 월간의 혼동을 막고, 순수익률은 기록된 비용 이후 equity 결과를 보여 줍니다. 최대 낙폭은 같은 기간의 최악 경로, 종료 표본은 실현된 증거의 양, 열린 노출은 아직 변할 수 있는 범위를 나타냅니다. Biggest Win은 표시 기간 안에 종료된 포지션 사이클의 최대 순실현손익입니다. 이 값은 열린 포지션의 평가이익이나 다른 기간의 거래를 섞지 않으므로, 표시된 기간 안에서 수익 집중도를 점검하는 보조 지표로만 사용해야 합니다.", "예를 들어 A가 +12%, MDD -11%, 종료 14건과 큰 열린 이익을 보이고 B가 +8%, MDD -3%, 종료 96건이라면 A의 수익은 더 높지만 집중도와 불확실성도 큽니다. 프로필에서 한 거래가 수익 대부분을 만들었는지, 시작일과 비용 설정이 같은지 확인하세요. 기간이나 전략 버전이 다르면 한 줄 순위로 우열을 확정하지 않는 것이 맞습니다. 비교 메모에는 조회 시각, 기간, 두 에이전트의 종료 거래 수, MDD, 열린 포지션을 적어 두세요. 이후 순위가 바뀌었을 때 시장 변화 때문인지, 열린 거래 종료 때문인지, 단순히 관찰 구간이 달라졌기 때문인지 구분하는 데 도움이 됩니다.", "마지막으로 숫자의 정의를 Methodology와 대조하세요. 누적 순위와 월간 순위의 계산 범위가 다르고, Biggest Win은 해당 기간에 종료된 거래만 포함하며, 열린 이익은 종료 거래 최대값에 들어가지 않습니다. 같은 이름의 지표라도 다른 서비스는 총수익과 순수익, 거래 단위와 포지션 사이클을 다르게 정의할 수 있습니다. Aigentra 외부 자료와 비교할 때는 이름이 아니라 공식, 비용 반영 시점, UTC 경계를 맞춘 뒤 판단해야 합니다."],
      faq: [{ question: "AI 트레이더 순위보다 먼저 볼 다섯 항목은 무엇인가요?", answer: "기간, 순수익률, 최대 낙폭, 종료 거래 표본, 열린 노출을 먼저 확인하세요. 결과와 경로, 증거의 양, 아직 바뀔 부분을 함께 보여 줍니다." }, { question: "높은 수익률이 약한 증거일 수 있는 이유는 무엇인가요?", answer: "짧은 기록, 한 번의 큰 승리, 유리한 시작일 또는 미실현 이익이 수치를 지배할 수 있기 때문입니다." }],
    },
    "paper-trading-vs-live-trading": {
      heading: "Aigentra 모의 엔진이 반영하는 비용",
      paragraphs: ["Aigentra의 기본 모의 설정은 시작 equity 10,000 USDT, maker 0.02%, taker 0.05%, 설정된 시장가형 청산의 불리한 슬리피지 0.01%입니다. 이는 특정 거래소의 보장이 아니라 엔진 기본값입니다. 거래 이벤트에는 추정값이 아니라 실제 저장된 fee와 maker/taker 역할을 표시하고, equity 수익률에는 이미 차감된 비용이 포함됩니다. 펀딩은 엔진이 명시적으로 기록한 경우에만 포함됩니다. 비용 가정은 결과 해석의 일부이므로 거래소 요율처럼 읽어서는 안 됩니다. 전략 회전율이 높을수록 작은 수수료와 슬리피지 차이도 누적되어 순수익률을 크게 바꿀 수 있습니다.", "실전에서는 주문 대기열, 시장 충격, 거래소 제한, API 지연, 청산 엔진과 사용자의 개입을 모의 엔진이 완전히 알 수 없습니다. 작은 실전 표본으로 요청가와 체결가, 수수료, 수량, 지연, 거절과 equity 영향을 모의 기록과 대조하세요. 차이가 사전에 정한 한도를 넘으면 매번 예외로 합리화하지 말고 검증을 중단해야 합니다. 비교표에는 각 주문의 요청 시각, 요청 가격, 실제 체결 시각, 평균 체결가, 수수료, 부분 체결과 거절 여부를 남기는 것이 좋습니다. 표본이 작더라도 반복되는 방향성 오차가 보이면 규모를 늘리기 전에 엔진 가정이나 실행 방식을 다시 검토해야 합니다.", "검증은 수익률 차이만 비교해서는 부족합니다. 시장가 주문이 변동성 확대 구간에서 얼마나 늦어졌는지, 지정가 주문이 모의 환경에서는 체결됐지만 실전에서는 대기열 뒤에 남았는지, 부분 체결 뒤 남은 수량이 위험 노출을 바꿨는지 확인해야 합니다. 작은 규모에서 체결 오차와 운영 장애를 먼저 측정하고, 손실 한도와 중단 조건을 문서로 정한 다음에만 다음 단계로 넘어가야 합니다. 모의 결과가 좋아도 이 검증을 생략하면 실전 전환의 핵심 위험은 그대로 남습니다."],
      faq: [{ question: "Aigentra 모의 성과에는 어떤 비용이 들어가나요?", answer: "기록된 maker/taker 수수료와 설정된 모의 슬리피지가 equity 경로에 포함됩니다. 펀딩과 기타 비용은 이벤트에 명시적으로 기록된 경우만 포함됩니다." }, { question: "paper 이후 첫 실전 검증은 어떻게 해야 하나요?", answer: "의도적으로 작은 표본으로 요청가·체결가·수수료·수량·지연·거절을 비교하고, 사전에 정한 중단 기준을 적용하세요." }],
    },
    "why-simulation-matters": {
      heading: "재현 가능한 시뮬레이션 기록",
      paragraphs: ["다른 검토자가 데이터 구간, UTC 기준, 종목, 시작 equity, 수수료와 슬리피지, 신호 이용 가능 시각, 전략·모델 버전과 설정을 식별할 수 있어야 재현 가능한 결과입니다. 최종 수익률만 남기지 말고 equity 시계열과 거래 이벤트를 보존하세요. 공개 Methodology는 지표 정의를 제공하지만 전체 연구 재현에는 데이터 공급자 버전과 비공개 전략 자료가 추가로 필요할 수 있습니다. 결과 파일에는 생성 시각과 버전 식별자를 붙이고, 이후 수정된 실행과 섞이지 않도록 원본을 읽기 전용으로 보관하는 편이 좋습니다.", "시장 구간과 규칙을 먼저 고정하고 손실을 본 뒤 규칙을 고치지 않은 상태로 잠금 구간을 평가하세요. 이후 비용 증가, 체결 지연, 결측 봉과 불리한 변동성 구간을 넣어 다시 실행합니다. 작은 현실적 가정 변화에 결과가 무너지면 원래 차트가 좋아 보여도 전략의 취약성이 드러난 것입니다. 재현은 좋은 성과를 보장하는 절차가 아니라 같은 주장을 다시 계산할 수 있게 만드는 절차입니다. 따라서 실패한 실행과 불리한 민감도 결과도 삭제하지 말고 함께 남겨야 선택 편향을 줄일 수 있습니다. 독립적인 사람이 같은 입력으로 같은 거래 이벤트와 equity 경로를 얻는지가 핵심 검증 질문입니다.", "좋은 실험 기록에는 성공한 설정만 아니라 비교 대상도 포함됩니다. 단순 보유, 거래하지 않음, 비용을 높인 경우와 신호를 한 봉 늦춘 경우를 같은 기간에 계산하면 전략의 이점이 어떤 가정에서 사라지는지 볼 수 있습니다. 평가 구간을 본 뒤 매개변수를 다시 고쳤다면 그 결과는 새 탐색 결과로 표시하고, 처음 잠근 평가와 분리하세요. 이런 경계가 없으면 여러 번 시도한 뒤 가장 좋은 차트만 남기는 선택 편향을 피하기 어렵습니다."],
      faq: [{ question: "AI 거래 시뮬레이션 재현에 무엇을 저장해야 하나요?", answer: "데이터와 버전, UTC 구간, 종목, 시작 equity, 비용, 신호 시각, 전략·모델 버전, 설정, equity 시계열과 이벤트 기록을 저장해야 합니다." }, { question: "재현 가능하면 미래 예측력이 생기나요?", answer: "아닙니다. 과거 주장을 검증 가능하게 만들 뿐이며 시장 구조 변화와 유동성, 선택 편향은 여전히 남습니다." }],
    },
    "telegram-trading-alerts": {
      heading: "전송 성공은 거래 확인이 아니다",
      paragraphs: ["Telegram Bot API의 sendMessage 성공 응답은 서버가 요청에 대한 메시지 객체를 만들었다는 뜻입니다. 특정 기기에 알림이 표시됐거나 사용자가 읽었고 정확히 한 번 전달됐다는 보장은 아닙니다. 따라서 Aigentra 알림은 실행 지시가 아니라 지속되는 플랫폼 기록으로 연결되는 모니터링 메시지로 봐야 합니다. 늦거나 중복된 메시지는 프로필 이벤트 시각과 현재 상태를 다시 확인하세요. 네트워크 재시도나 기기 설정 때문에 메시지 도착 순서와 실제 거래 이벤트 순서도 달라질 수 있으므로 채팅 목록만으로 상태를 재구성해서는 안 됩니다.", "감사 기록에는 message ID, chat ID, 원본 event ID, 서버 시각, 전송 결과, 재시도 이력과 연결된 trader 상태를 남깁니다. 수신 후 발신자, 종목, 이벤트 유형, 원래 트리거, 현재 가격, 무효화와 포지션 상태를 확인하세요. 진입 구간이 지났거나 문맥을 복구할 수 없다면 빠른 메시지라도 무시하는 것이 올바른 위험 관리입니다. 알림 링크를 통해 원본 이벤트가 열리지 않거나 현재 포지션 상태와 메시지가 충돌하면 실행 근거로 사용하지 마세요. 사용자는 Telegram 알림을 보조적인 관찰 채널로 두고, 실제 판단 전에는 플랫폼에 기록된 최신 시각과 위험 조건을 다시 확인해야 합니다.", "운영 측면에서는 같은 원본 이벤트에 안정적인 식별자를 부여하고 재시도 횟수와 최종 응답을 함께 기록해야 합니다. 그래야 두 메시지가 서로 다른 거래 변화인지, 같은 메시지의 재전송인지 구분할 수 있습니다. 사용자는 알림이 오지 않았다는 사실을 포지션이 없다는 뜻으로 해석해서는 안 되며, 알림이 왔다는 사실도 주문 체결이나 전략의 최신 판단으로 해석해서는 안 됩니다. 플랫폼의 현재 기록을 원본으로 두고 Telegram은 그 기록으로 이동하는 보조 통로로 사용하는 것이 안전합니다."],
      faq: [{ question: "Telegram Bot API 성공 응답은 무엇을 증명하나요?", answer: "해당 요청의 서버 메시지 생성만 증명합니다. 기기 알림, 읽음, 정확히 한 번 전달, 현재 거래 상태까지 보장하지 않습니다." }, { question: "늦거나 중복된 알림은 어떻게 처리하나요?", answer: "연결된 플랫폼 이벤트와 시각, 현재 포지션을 확인하고 진입 구간이나 무효화 조건이 더 이상 유효하지 않으면 무시하세요." }],
    },
  },
};

export function blogArticleContent(locale: Locale, post: BlogPost): BlogArticleContent {
  const framework = frameworks[locale];
  const guidance = isKnowledgeArticle(post) ? knowledgeFrameworks[locale] : framework;
  const contextParagraph = post.paragraphs.at(0) ?? post.excerpt;
  const evidenceParagraph = post.paragraphs.at(1) ?? guidance.evidenceParagraphs(post)[0] ?? post.excerpt;
  const evidenceDetail = post.paragraphs.at(2) ?? guidance.evidenceParagraphs(post)[0] ?? post.excerpt;
  const workflowParagraph = post.paragraphs.at(4) ?? guidance.workflowParagraphs(post)[0] ?? post.excerpt;
  const limitsParagraph = post.paragraphs.at(3) ?? guidance.limitsParagraphs(post)[0] ?? post.riskNotice ?? post.excerpt;
  const limitsDetail = post.paragraphs.at(5) ?? post.riskNotice ?? guidance.limitsParagraphs(post)[0] ?? post.excerpt;
  const enhancement = locale === "en" || locale === "ko" ? coreGuideEnhancements[locale][post.slug] : undefined;

  return {
    sections: [
      {
        heading: framework.contextHeading(post),
        paragraphs: [contextParagraph, evidenceParagraph],
      },
      {
        heading: framework.evidenceHeading,
        paragraphs: [evidenceDetail],
      },
      {
        heading: framework.workflowHeading,
        paragraphs: [workflowParagraph],
      },
      {
        heading: framework.limitsHeading,
        paragraphs: [limitsParagraph, limitsDetail],
      },
      ...(enhancement ? [{ heading: enhancement.heading, paragraphs: enhancement.paragraphs }] : []),
    ],
    faqTitle: framework.faqTitle,
    faq: [...(enhancement?.faq ?? []), ...topicalFaq(locale, post)],
    shareTitle: framework.shareTitle,
    copyLink: framework.copyLink,
    copied: framework.copied,
    manualCopyHint: framework.manualCopyHint,
    riskTitle: framework.riskTitle,
    riskBody: framework.riskBody,
  };
}
