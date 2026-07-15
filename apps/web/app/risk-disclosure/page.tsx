"use client";

import { useEffect, useState } from "react";
import { useAppContext } from "@/components/app-provider";
import { ArrowLeft, FileText, Translate, WarningCircle } from "@phosphor-icons/react";
import Link from "next/link";
import { LandingFooter } from "@/components/home-landing-visuals";
import { landingCopy } from "@/lib/marketing-copy";

export default function RiskDisclosurePage() {
  const { locale } = useAppContext();
  const [activeLang, setActiveLang] = useState<"ko" | "en">("en");

  useEffect(() => {
    setActiveLang(locale === "ko" ? "ko" : "en");
  }, [locale]);

  const landingCopyData = landingCopy(activeLang);

  return (
    <div className="w-full space-y-16 animate-fade-in-up">
      {/* Navigation & Content Card */}
      <div className="mx-auto max-w-4xl px-4 text-zinc-300 antialiased leading-relaxed">
        {/* Navigation & Header */}
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between border-b border-zinc-200/80 dark:border-white/[0.08] pb-6 mb-8">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-zinc-800 dark:hover:text-white transition duration-200 mb-3 focus-ring rounded"
            >
              <ArrowLeft size={12} />
              <span>{activeLang === "ko" ? "홈으로 돌아가기" : "Back to Home"}</span>
            </Link>
            <div className="flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-lg border border-emerald-400/35 bg-emerald-400/10 text-emerald-400">
                <FileText size={18} weight="bold" />
              </span>
              <h1 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-white md:text-3xl">
                {activeLang === "ko" ? "위험 고지 및 면책성명" : "Risk Disclosure"}
              </h1>
            </div>
            <p className="text-zinc-500 dark:text-zinc-400 mt-2 text-xs font-mono uppercase tracking-wider">
              Aigentra Trading · {activeLang === "ko" ? "개정일: 2026년 6월 15일" : "Effective: June 15, 2026"}
            </p>
          </div>

          {/* Language Switcher Tabs */}
          <div className="flex items-center gap-1 rounded-full border border-zinc-200/80 dark:border-white/10 bg-zinc-50/50 dark:bg-white/[0.04] p-1 backdrop-blur-md self-start md:self-center">
            <button
              type="button"
              onClick={() => setActiveLang("ko")}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition duration-200 ${
                activeLang === "ko"
                  ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <Translate size={12} />
              <span>한국어</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveLang("en")}
              className={`focus-ring inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition duration-200 ${
                activeLang === "en"
                  ? "bg-white text-zinc-950 shadow-sm dark:bg-zinc-800 dark:text-white"
                  : "text-zinc-400 hover:text-zinc-900 dark:hover:text-white"
              }`}
            >
              <Translate size={12} />
              <span>English</span>
            </button>
          </div>
        </div>

        {/* Content Container */}
        <div className="prose dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-400 text-sm space-y-6 md:space-y-8 font-normal">
          {activeLang === "ko" ? (
            <>
              <div className="grid gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-5 text-rose-600 dark:text-rose-400 sm:grid-cols-[32px_minmax(0,1fr)] sm:p-6">
                <span className="grid size-8 place-items-center rounded-lg border border-rose-500/20 bg-rose-500/10">
                  <WarningCircle size={17} weight="bold" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold leading-5">투자 위험 주의 알림</p>
                  <p className="mt-2 text-xs font-semibold leading-relaxed">
                    금융시장에서의 거래 및 투자는 원금의 상당 부분 또는 전액 손실이라는 중대한 위험을 내포하고 있습니다. 본인이 완전히 감당할 수 있는 한도를 초과하는 자금으로 투자하지 마십시오.
                  </p>
                </div>
              </div>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">1. 일반적 위험 경고</h2>
                <p>
                  Aigentra Trading은 공개 BTC 선물 시장 데이터를 바탕으로 가상 AI 트레이더의 판단과 관리 기록을 보여주는 시뮬레이션 기반 분석 도구입니다. Aigentra Trading을 사용하는 것은 암호화폐 선물 및 무기한 계약 시장에 수반되는 본질적인 위험을 줄이거나 제거하지 못합니다.
                </p>
                <p>Aigentra Trading을 이용함으로써 귀하는 다음 사항을 인정하고 수락합니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>금융 시장은 본질적으로 변동성이 크며 예측이 불가능합니다.</li>
                  <li>어떠한 분석, 도구, 사람도 수익을 보장할 수 없습니다.</li>
                  <li>모든 거래 및 투자 결정은 자본의 상당한 손실 또는 전액 손실 가능성을 수반합니다.</li>
                  <li>과거의 성과(과거 데이터, 백테스트 또는 가상 결과)는 미래의 결과를 보장하지 않습니다.</li>
                  <li>Aigentra Trading은 직접 주문을 실행하거나 자금을 운용하지 않으며, 개인화된 투자 자문을 제공하지 않습니다.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">2. 암호화폐 특유의 위험</h2>
                <p>암호화폐 시장은 전통적 자산 군을 넘어서는 극단적인 변동성과 고유한 위험을 지니고 있습니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>극단적인 변동성:</strong> 암호화폐 자산은 몇 시간 또는 몇 분 만에 20–80%의 가격 변동을 겪을 수 있습니다. Aigentra Trading은 이러한 급격한 움직임을 예측할 수 없습니다.</li>
                  <li><strong>규제 위험:</strong> 각국의 규제 변화, 금지 조치 또는 정책 변화는 즉각적이고 심각한 가격 하락이나 자산 가치의 상실을 초래할 수 있습니다.</li>
                  <li><strong>기술적 위험:</strong> 스마트 계약의 결함, 거래소 해킹, 지갑 보안 취약점, 네트워크 정지 등은 영구적인 자금 손실로 이어질 수 있습니다.</li>
                  <li><strong>시장 조작 위험:</strong> 암호화폐 시장은 규제 시장에서 나타나지 않는 시세 조종 행위(펌프 앤 덤프, 가장 거래 등)에 취약할 수 있습니다.</li>
                  <li><strong>유동성 위험:</strong> 다수의 암호화폐는 거래량이 적어, 원하는 가격에 포지션을 종료하기 어려울 수 있습니다.</li>
                  <li><strong>거래상대방 위험:</strong> 거래소, 수탁기관, 대출 플랫폼의 파산 등으로 인해 예치한 자산을 손실할 위험이 있습니다.</li>
                  <li><strong>내재가치 부재:</strong> 다수의 암호화폐는 내재적 현금 흐름이나 담보가 없는 투기적 자산입니다. 그 가치는 전적으로 시장의 수요에 의해 결정됩니다.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">3. 암호화폐 선물 및 무기한 계약 위험</h2>
                <p>Aigentra Trading의 리그와 리뷰는 BTCUSDT 선물/무기한 계약 시장 데이터를 기반으로 한 가상 기록입니다. 실제 선물 또는 무기한 계약 거래에는 다음 위험이 존재합니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>레버리지 및 강제청산 위험:</strong> 레버리지는 작은 가격 변동도 큰 손익 변동으로 확대하며, 마진 부족 시 포지션이 강제로 청산될 수 있습니다.</li>
                  <li><strong>마크 가격 및 지수 가격 위험:</strong> 손익, 청산, 손절 판단은 거래소별 마크 가격 또는 지수 가격과 실제 체결 가격 사이의 차이에 영향을 받을 수 있습니다.</li>
                  <li><strong>펀딩비 및 베이시스 위험:</strong> 무기한 계약은 펀딩비, 선물-현물 가격 차이, 시장 쏠림에 따라 예상과 다른 비용 또는 손익 변동이 발생할 수 있습니다.</li>
                  <li><strong>슬리피지 및 유동성 위험:</strong> 급격한 변동성이나 얇은 호가에서는 목표가, 손절가, 시뮬레이션 가격과 실제 체결 가능 가격이 크게 달라질 수 있습니다.</li>
                  <li><strong>데이터 지연 및 거래소 장애 위험:</strong> 공개 데이터 피드, 네트워크, 거래소 장애 또는 API 지연은 시뮬레이션 기록과 실제 시장 상태 사이의 차이를 만들 수 있습니다.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">4. AI 분석 도구 특유의 위험</h2>
                <p>Aigentra Trading은 인공지능을 활용하여 차트 패턴을 분석합니다. AI 분석에는 다음과 같은 근본적인 한계가 존재합니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>패턴 인식의 한계:</strong> AI 모델은 역사적 패턴을 학습하여 인식하지만, 새로운 시장 상태, 구조적 변화 또는 유례없는 돌발 상황을 반영하지 못합니다.</li>
                  <li><strong>학습 데이터 편향:</strong> Aigentra Trading은 과거 데이터를 기반으로 훈련되었으며, 이는 현재 또는 미래의 시장 상태를 완벽히 대변하지 못할 수 있습니다.</li>
                  <li><strong>모델 오류 및 환각 현상:</strong> AI 모델은 그럴듯하게 들리지만 실제로는 정확하지 않거나 오도할 수 있는 분석 결과를 도출할 수 있습니다. 항상 분석 결과를 독립적으로 확인하십시오.</li>
                  <li><strong>시장 정보의 한계:</strong> Aigentra Trading은 주로 기술적 차트와 일부 제한된 시장 정보만을 분석합니다. 거래소 내부 자금 흐름, 기관의 포지셔닝, 실시간 뉴스 센티먼트 등의 포괄적인 정보에는 접근하지 못합니다.</li>
                  <li><strong>비실시간성:</strong> Aigentra Trading이 제공하는 분석은 요청이 접수된 특정 시점의 데이터에 국한됩니다. 시장의 조건과 센티먼트는 분석 직후 즉시 변할 수 있습니다.</li>
                  <li><strong>과도한 의존 위험:</strong> Aigentra Trading의 분석 결과를 거래 결정의 유일하거나 일차적인 근거로 활용할 경우, 손실 위험을 대폭 증가시킵니다.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">5. 이익 및 수익 비보장</h2>
                <p><strong>수익을 보장하지 않으며, 손실에 대한 어떠한 보호 장치도 제공하지 않습니다.</strong></p>
                <p>Aigentra Trading은 다음을 수행하지 않습니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>특정 수준의 이익 또는 수익률을 보장하지 않습니다.</li>
                  <li>높은 승률이나 성공률을 약속하지 않습니다.</li>
                  <li>자본의 부분적 또는 전체적 손실로부터 사용자를 보호하지 않습니다.</li>
                  <li>시장 폭락이나 원치 않는 대외 사건에 대해 어떠한 보험이나 보전을 제공하지 않습니다.</li>
                  <li>사용자의 거래 결정으로 발생한 손실을 보상하거나 변제하지 않습니다.</li>
                </ul>
                <p>잠재적 결과, 목표가 또는 "기회의 영역(Zones of Opportunity)" 등에 관한 진술은 모두:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>역사적 패턴에 기초한 가상 시나리오에 불과합니다.</li>
                  <li>미래의 가격 변동에 대한 확정적인 예측이나 보장이 아닙니다.</li>
                  <li>실제 거래 결정의 단독 근거로 적합하지 않습니다.</li>
                  <li>현실적인 시장 상황과 상당한 오차가 발생할 수 있습니다.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">6. 규제 고려사항 및 면책성명</h2>
                <p>SERN (Aigentra Trading)은 금융 기관, 투자 자문사 또는 브로커로 등록되거나 관련 금융 라이선스를 보유한 사업자가 아닙니다.</p>
                <p>Aigentra Trading은 다음을 수행하지 않습니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>고객의 투자 자금이나 자산을 보관하거나 수탁하지 않습니다. (Aigentra Trading에 자금을 예치하지 마십시오.)</li>
                  <li>사용자를 대신하여 거래를 체결하거나 대리 운용하지 않습니다.</li>
                  <li>어떠한 관할권에서도 규제 대상인 금융 자문을 제공하지 않습니다.</li>
                  <li>금융 투자 상품, 계좌 또는 실제 거래 플랫폼을 제공하지 않습니다. (Aigentra Trading은 정보 분석용 소프트웨어입니다.)</li>
                  <li>사용자의 현지 규제 요건 준수 여부를 확인하거나 보장하지 않습니다.</li>
                </ul>
                <p><strong>준법 책임:</strong> 귀하는 다음 사항에 대하여 전적인 책임을 집니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>귀하의 Aigentra Trading 이용이 거주 국가 또는 관할 법령에 부합하는지 여부를 확인할 책임.</li>
                  <li>분석 중인 자산군에 투자하거나 거래하는 것이 적법한지 여부를 검토할 책임.</li>
                  <li>모든 거래 활동 및 손익 내역을 해당 관할 세무 당국에 성실히 신고할 책임.</li>
                  <li>전문적인 법률 및 규제 가이드라인에 관해서는 공인된 재무 분석가 또는 법률 전문가와 상담하십시오.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">7. 위험 사항의 인지 및 수락</h2>
                <p>Aigentra Trading을 이용함으로써 귀하는 다음 사항을 확인하고 동의합니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>투자와 거래에 수반되는 중대한 금융 위험을 완전히 이해하고 있습니다.</li>
                  <li>본 위험 고지와 서비스 이용약관의 모든 내용을 충분히 읽고 수락했습니다.</li>
                  <li>귀하의 거래 및 투자 결정에 따른 모든 결과에 대하여 전적으로 책임을 집니다.</li>
                  <li>Aigentra Trading, SERN 또는 관련 운영진에게 발생한 투자 손실에 대한 법적 책임을 묻지 않을 것임에 동의합니다.</li>
                  <li>과거의 성과가 미래의 수익을 보장하지 않는다는 사실을 숙지하고 있습니다.</li>
                  <li>투자 결정을 내리기 전에 독립적으로 충분한 리서치(DYOR)를 수행할 것입니다.</li>
                  <li>완전히 상실되어도 가계나 경영에 타격이 없는 여유 자금으로만 거래 및 투자할 것입니다.</li>
                  <li>중요한 의사 결정을 내리기 전에 자격을 갖춘 금융 전문가의 상담을 받을 수 있습니다.</li>
                </ul>
                <p>귀하는 본인 책임 하에 Aigentra Trading을 이용해야 하며, 발생한 모든 이익과 손실은 전적으로 사용자 본인에게 귀속됩니다.</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">8. 문의 및 고객 지원</h2>
                <p>위험 고지에 대한 문의나 건의사항이 있으신 경우 아래로 연락 바랍니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>이메일:</strong> <a href="mailto:support@aigentratrading.com" className="text-emerald-500 hover:underline">support@aigentratrading.com</a></li>
                  <li><strong>상호명:</strong> SERN</li>
                </ul>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-4 font-mono">
                  마지막 개정일: 2026년 6월 15일 — SERN, All rights reserved.
                </p>
              </section>
            </>
          ) : (
            <>
              <div className="grid gap-3 rounded-xl border border-rose-500/20 bg-rose-500/5 p-5 text-rose-600 dark:text-rose-400 sm:grid-cols-[32px_minmax(0,1fr)] sm:p-6">
                <span className="grid size-8 place-items-center rounded-lg border border-rose-500/20 bg-rose-500/10">
                  <WarningCircle size={17} weight="bold" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold leading-5">Financial Risk Warning</p>
                  <p className="mt-2 text-xs font-semibold leading-relaxed">
                    TRADING AND INVESTING IN FINANCIAL MARKETS INVOLVES SUBSTANTIAL RISK OF LOSS. DO NOT INVEST MORE THAN YOU CAN AFFORD TO LOSE.
                  </p>
                </div>
              </div>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">1. General Risk Warning</h2>
                <p>
                  Aigentra Trading is a simulation-based analytics tool that displays virtual AI trader decisions and management records from public BTC futures market data. The use of Aigentra Trading does not reduce or eliminate the inherent risks associated with crypto futures and perpetual contract markets.
                </p>
                <p>By using Aigentra Trading, you acknowledge and accept that:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Financial markets are inherently volatile and unpredictable.</li>
                  <li>No analysis, tool, or person can guarantee profitable outcomes.</li>
                  <li>All trading and investment decisions carry the potential for significant or total loss of capital.</li>
                  <li>Past performance (historical data, backtests, or hypothetical results) does not guarantee future results.</li>
                  <li>Aigentra Trading does not execute trades, manage money, or provide personalized investment advice.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">2. Cryptocurrency-Specific Risks</h2>
                <p>Cryptocurrency markets present extreme volatility and unique risks beyond traditional asset classes:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Extreme Volatility:</strong> Crypto assets can experience 20–80% price swings within hours or minutes. Aigentra Trading cannot predict these sudden movements.</li>
                  <li><strong>Regulatory Risk:</strong> Regulatory changes, bans, or policy shifts can cause immediate and severe price declines or asset devaluation.</li>
                  <li><strong>Technology Risk:</strong> Smart contract failures, exchange hacks, wallet vulnerabilities, or network outages can result in permanent loss of funds.</li>
                  <li><strong>Market Manipulation:</strong> Crypto markets are susceptible to pump-and-dump schemes, wash trading, and other manipulative practices not present in regulated markets.</li>
                  <li><strong>Liquidity Risk:</strong> Many cryptocurrencies have low trading volumes, making it difficult to exit positions at desired prices.</li>
                  <li><strong>Counterparty Risk:</strong> Exchanges, custodians, and lending platforms may fail, resulting in loss of deposited assets.</li>
                  <li><strong>No Intrinsic Value:</strong> Many cryptocurrencies are speculative assets with no underlying cash flows, earnings, or collateral. Their value is entirely dependent on market demand.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">3. Crypto Futures & Perpetual Contract Risks</h2>
                <p>Aigentra Trading's league and reviews are hypothetical records based on BTCUSDT futures and perpetual market data. Live futures or perpetual contract trading may involve the following risks:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Leverage & Liquidation Risk:</strong> Leverage magnifies small price moves into large profit or loss swings, and positions may be liquidated when margin is insufficient.</li>
                  <li><strong>Mark Price & Index Price Risk:</strong> PnL, liquidation, and stop logic may be affected by differences between exchange mark prices, index prices, and executable prices.</li>
                  <li><strong>Funding & Basis Risk:</strong> Perpetual contracts can create unexpected costs or PnL changes through funding rates, futures basis, and crowded positioning.</li>
                  <li><strong>Slippage & Liquidity Risk:</strong> During volatility or thin order books, targets, stops, simulation prices, and executable prices may differ materially.</li>
                  <li><strong>Data Delay & Exchange Outage Risk:</strong> Public feeds, networks, exchange outages, or API delays can create gaps between simulation records and live market state.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">4. AI Tool-Specific Risks</h2>
                <p>Aigentra Trading uses artificial intelligence to analyze chart patterns. AI analysis has inherent limitations:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Pattern Recognition Limitations:</strong> AI models recognize historical patterns but cannot account for novel market conditions, structural changes, or unprecedented events.</li>
                  <li><strong>Training Data Bias:</strong> Aigentra Trading is trained on historical data, which may not be representative of current or future market conditions.</li>
                  <li><strong>Model Error & Hallucination:</strong> AI models can produce plausible-sounding but inaccurate or misleading analysis. Always verify outputs independently.</li>
                  <li><strong>Incomplete Market Context:</strong> Aigentra Trading analyzes charts and limited market data. It does not have access to all relevant information (insider flows, institutional positioning, news sentiment at the moment of analysis).</li>
                  <li><strong>No Real-Time Market Reaction:</strong> Analysis provided by Aigentra Trading reflects data as of the moment of request. Market conditions and sentiment can change immediately.</li>
                  <li><strong>Overreliance Risk:</strong> Using Aigentra Trading as the primary or sole basis for trading decisions significantly increases risk of loss.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">5. No Guaranteed Returns or Profits</h2>
                <p><strong>THERE IS NO GUARANTEE OF PROFIT. THERE IS NO PROTECTION AGAINST LOSSES.</strong></p>
                <p>Aigentra Trading does not:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Guarantee any level of returns or profitability.</li>
                  <li>Promise winning trade percentages or success rates.</li>
                  <li>Protect against partial or total loss of capital.</li>
                  <li>Provide insurance against market downturns or adverse events.</li>
                  <li>Compensate users for losses resulting from trading decisions.</li>
                </ul>
                <p>Any statements about potential results, profit targets, or "zones of opportunity" are:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Hypothetical scenarios based on historical patterns.</li>
                  <li>Not predictions or guarantees of future price movement.</li>
                  <li>Not suitable as the sole basis for trading decisions.</li>
                  <li>Subject to substantial error and deviation from reality.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">6. Regulatory Considerations & Disclaimers</h2>
                <p>SERN (Aigentra Trading) is not a financial institution, investment advisor, broker, or registered entity with any financial regulator.</p>
                <p>Aigentra Trading does not:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Hold or control customer funds or assets (never deposit funds with Aigentra Trading).</li>
                  <li>Execute trades or manage accounts on your behalf.</li>
                  <li>Provide regulated financial advice under any jurisdiction.</li>
                  <li>Offer investment products, accounts, or trading platforms (Aigentra Trading is analysis software only).</li>
                  <li>Guarantee compliance with any user's local regulatory requirements.</li>
                </ul>
                <p><strong>Responsibility for Compliance:</strong> It is your responsibility to:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Ensure that your use of Aigentra Trading complies with all applicable laws and regulations in your jurisdiction.</li>
                  <li>Verify that trading or investing in the asset classes you're analyzing is legal where you reside.</li>
                  <li>Report all trading activity and gains/losses to the appropriate tax authorities.</li>
                  <li>Consult a licensed financial advisor for regulatory guidance.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">7. Acknowledgment & Acceptance of Risks</h2>
                <p>By using Aigentra Trading, you acknowledge and agree that you:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Understand that trading and investing involve substantial financial risk.</li>
                  <li>Have read, understood, and accept all terms of this Risk Disclosure and the full Terms of Service.</li>
                  <li>Accept full responsibility for your trading and investment decisions.</li>
                  <li>Will not hold Aigentra Trading, SERN, or any related parties responsible for losses.</li>
                  <li>Are aware that past performance does not indicate future results.</li>
                  <li>Will conduct your own independent research before making any trading or investment decision.</li>
                  <li>Will only trade or invest with capital you can afford to lose entirely.</li>
                  <li>May seek advice from a qualified financial professional before making significant decisions.</li>
                </ul>
                <p>You use Aigentra Trading entirely at your own risk. You are solely responsible for all outcomes, profits, and losses.</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">8. Contact & Support</h2>
                <p>For questions about this Risk Disclosure or to report concerns, please contact us at:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Email:</strong> <a href="mailto:support@aigentratrading.com" className="text-emerald-500 hover:underline">support@aigentratrading.com</a></li>
                  <li><strong>Publisher Legal Name:</strong> SERN</li>
                </ul>
                <p className="text-xs text-zinc-500 dark:text-zinc-500 mt-4 font-mono">
                  Last updated: June 15, 2026 — SERN, all rights reserved.
                </p>
              </section>
            </>
          )}
        </div>
      </div>

      {/* Landing Footer integration */}
      <footer data-testid="landing-footer" className="relative overflow-hidden bg-white py-16 text-zinc-950 border border-zinc-200 rounded-2xl">
        <div className="relative mx-auto max-w-[1240px] px-6 sm:px-10 lg:px-16">
          <LandingFooter copy={landingCopyData} />
        </div>
      </footer>
    </div>
  );
}
