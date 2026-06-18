"use client";

import { useEffect, useState } from "react";
import { useAppContext } from "@/components/app-provider";
import { ArrowLeft, FileText, Translate } from "@phosphor-icons/react";
import Link from "next/link";
import { LandingFooter } from "@/components/home-landing-visuals";
import { landingCopy } from "@/lib/marketing-copy";

export default function DisclaimerPage() {
  const { locale } = useAppContext();
  const [activeLang, setActiveLang] = useState<"ko" | "en">("ko");

  useEffect(() => {
    if (locale === "en" || locale === "ko") {
      setActiveLang(locale);
    }
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
                {activeLang === "ko" ? "면책조항 및 투자고지" : "Disclaimer — NFA / DYOR"}
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

        {/* Disclaimer Content Container */}
        <div className="prose dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-400 text-sm space-y-6 md:space-y-8 font-normal">
          {activeLang === "ko" ? (
            <>
              <div className="bg-zinc-500/5 border border-zinc-200/50 dark:border-white/5 rounded-xl p-5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                <p className="font-bold mb-1">중요 안내</p>
                AIGENTRA.TRADING 웹사이트 및 연관된 모든 콘텐츠를 이용하기 전에 본 면책 조항을 주의 깊게 확인하시기 바랍니다.
              </div>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">1. 금융 투자 조항 면책 (NFA)</h2>
                <p>
                  aigentra.trading 플랫폼, SNS 채널, 이메일 소식지 및 메신저 등 모든 매체에 게시되는 정보는 정보 제공 및 교육적 시뮬레이션 목적에 국한되며, 전문적인 금융 자문(Financial Advice)을 구성하지 않습니다.
                </p>
                <p>
                  발행인 <strong>SERN</strong>(사업자등록번호: 418-11-83101, 주소: 대한민국 반룡로 18번길 32-4, 신영하우스)은 어떠한 관할 지역에서도 등록된 투자 자문업자, 금융 브로커, 또는 공인 금융 설계사가 아닙니다. 당사는 금융 투자 조항을 설계하거나 특정 금융 투자 상품의 매수, 매도, 보유에 관한 권고를 행할 법적 라이선스를 보유하고 있지 않습니다.
                </p>
                <p>
                  본 플랫폼의 AI 분석 툴 및 모의 거래 리그 데이터는 머신러닝 알고리즘에 기초하여 자동 산출된 기계 분석 지표 및 기록물이며, 라이선스가 있는 전문가의 조언을 대신할 수 없습니다. 분석 결과를 신뢰하여 발생한 모든 실제 금융 거래의 최종 귀책 사유는 사용자 본인에게 있습니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">2. 본인 책임하의 연구 및 분석 의무 (DYOR)</h2>
                <p>
                  암호화폐, 마진 거래, 외환 거래 등 모든 형태의 금융 투자 시장은 높은 위험성과 높은 변동성을 특징으로 합니다. 과거의 모의 성과나 AI 트레이더 시뮬레이션 성적이 미래의 성공적인 재정적 결과를 담보하거나 보장하지 않습니다.
                </p>
                <p>
                  의사 결정을 내리기 전에 반드시 본인의 자산 현황과 리스크 노출 감당 수준을 냉정히 분석하고, 공인 금융 전문가의 독립적인 검토 및 자문을 직접 구하시기를 권고합니다. 당사 및 발행인 <strong>SERN</strong>은 사용자의 서비스 내 정보 참조로 발생한 실제 재산상의 손실이나 리스크 손실에 대해 일절 책임지지 않습니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">3. 제휴 수익 구조의 투명한 고지 (Affiliate Disclosure)</h2>
                <p>
                  Aigentra Trading은 사용자가 Whop 및 파트너 시스템을 통해 유료 구독을 이용하는 과정에서 발생하는 수수료 또는 제휴 수수료를 수취할 수 있습니다. 당사의 정기 구독 판매 및 제휴 플랫폼 링크에는 상업적 이익 모델이 연동되어 있음을 고지합니다.
                </p>
                <p>
                  이와 같은 수익 구조는 본 플랫폼 AI 연산 처리 과정의 기술적 독립성이나 객관성에는 영향을 주지 않으나, 상업적인 이해관계가 얽혀 있을 수 있음을 이용자는 사전적으로 충분히 이해하고 인지해야 합니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">4. 인공지능(AI) 툴의 한계점</h2>
                <p>
                  본 플랫폼이 제공하는 분석 결과물은 실험적인 머신러닝 추론 결과입니다. 데이터 지연, 모델 가중치 오류, 급격한 거시 경제 이벤트나 예측 불가능한 시장 호재/악재 뉴스 등으로 인해 부정확하고 사실과 다른 왜곡된 예측 결과가 노출될 수 있습니다.
                </p>
                <p>
                  이용자는 플랫폼의 AI 기술적 시뮬레이션이 지닌 본질적 불확실성을 수용하며, 본 툴을 완전한 자기책임 하에 사용해야 함을 약속합니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">5. 광고 및 마케팅 지표의 한계</h2>
                <p>
                  다양한 매체에서 수행되는 광고 캠페인상에 묘사되는 모의 시뮬레이션 수익률은 특정 거래 세션의 분석 목적 시각 자료에 불과하며, 보장된 정기적 수익률을 대변하지 않습니다. 실제 투자 결과는 시장의 유동성 변화, 이용자의 투자 실무 숙련도, 운용 자금 비율, 리스크 규칙 준수 여부 등에 따라 판이하게 달라질 수 있습니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">6. 책임의 면제 및 총액 상한선</h2>
                <p>
                  대한민국 준거법이 허용하는 최대 범위 내에서, SERN 및 그 관계 부서 임직원들은 플랫폼 정보 사용 및 지연, 기계 장애로 인한 간접적·특별 손실, 영업 이익 소멸, 자본 유실에 대하여 그 어떠한 배상 책임도 지지 않습니다. 준거법상 당사가 법적인 책임을 져야 하는 최소 한도의 강제 사유가 있더라도, 당사의 합산 책임 범위는 배상 청구가 개시된 날짜로부터 직전 30일 동안 사용자가 플랫폼에 실제 지불한 결제 총액으로 엄격히 한정됩니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">7. 문의처</h2>
                <p>
                  본 면책 조항 및 투자 공지 문서와 관련된 자세한 문의 사항은 다음 연락망을 통해 당사에 송신해 주시기 바랍니다:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>상호명:</strong> SERN</li>
                  <li><strong>주소:</strong> 대한민국 반룡로 18번길 32-4, 신영하우스</li>
                  <li><strong>이메일:</strong> <a href="mailto:kicoa24@gmail.com" className="text-emerald-500 hover:underline">kicoa24@gmail.com</a></li>
                </ul>
              </section>
            </>
          ) : (
            <>
              <div className="bg-zinc-500/5 border border-zinc-200/50 dark:border-white/5 rounded-xl p-5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                <p className="font-bold mb-1">Important Notice</p>
                PLEASE READ THIS DISCLAIMER CAREFULLY BEFORE ACCESSING OR USING AIGENTRA.TRADING OR ANY ASSOCIATED CONTENT.
              </div>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">1. Not Financial Advice (NFA)</h2>
                <p>
                  All content published on the aigentra.trading platform, its social media channels, newsletters, or communications is for informational and educational simulation purposes only and does not constitute financial or investment advice.
                </p>
                <p>
                  The publisher, <strong>SERN</strong> (Business Registration Number: 418-11-83101, Address: 32-4, Banryong-ro 18beon-gil, Sinyeong House, South Korea), is not a registered investment advisor, licensed broker-dealer, or certified financial planner in any jurisdiction.
                </p>
                <p>
                  The AI-generated chart analyses are automated technical indicators produced by machine learning models. They do not represent professional opinions and must not be used as the primary basis for financial decisions.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">2. Do Your Own Research (DYOR)</h2>
                <p>
                  Financial markets involve high volatility. Past performance of any simulation or AI profile does not guarantee future investment returns. Always consult a qualified, licensed advisor and evaluate your own financial objectives. SERN assumes no responsibility for capital losses incurred due to Platform content.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">3. Affiliate and Commerce Disclosure</h2>
                <p>
                  Aigentra Trading may receive commissions, processing fees, or affiliate compensation via Whop subscription payments. These commercial relationships do not affect the algorithmic calculation inputs but highlight that financial interest is integrated.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">4. Technical Limitations of AI</h2>
                <p>
                  AI chart models are experimental. Calculations may display errors, fail to account for sentiment changes, or experience data delays. Use of the technical tools is entirely at your own discretion and risk.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">5. Advertising Claims</h2>
                <p>
                  Promotional materials showing strategy parameters or backtested performance are purely illustrative. Actual outcomes depend on individual configurations, risk tolerances, and leverage limits.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">6. Limitation of Liability</h2>
                <p>
                  To the maximum extent permitted under applicable South Korean laws, SERN's liability is limited to the subscription fees paid by the User during the thirty (30) days preceding the claim. Indirect or consequential damages are waived.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">7. Contact</h2>
                <p>
                  For any questions regarding this Disclaimer, please write to:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Publisher:</strong> SERN</li>
                  <li><strong>Address:</strong> 32-4, Banryong-ro 18beon-gil, Sinyeong House, South Korea</li>
                  <li><strong>Email:</strong> <a href="mailto:kicoa24@gmail.com" className="text-emerald-500 hover:underline">kicoa24@gmail.com</a></li>
                </ul>
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
