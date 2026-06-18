"use client";

import { useEffect, useState } from "react";
import { useAppContext } from "@/components/app-provider";
import { ArrowLeft, FileText, Translate } from "@phosphor-icons/react";
import Link from "next/link";
import { LandingFooter } from "@/components/home-landing-visuals";
import { landingCopy } from "@/lib/marketing-copy";

export default function TermsPage() {
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
                {activeLang === "ko" ? "서비스 이용약관" : "Terms of Service"}
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

        {/* Terms Content Container */}
        <div className="prose dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-400 text-sm space-y-6 md:space-y-8 font-normal">
          {activeLang === "ko" ? (
            <>
              <div className="bg-zinc-500/5 border border-zinc-200/50 dark:border-white/5 rounded-xl p-5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                <p className="font-bold mb-1">필독 안내</p>
                AIGENTRA.TRADING 서비스를 이용하거나 가입하기 전에 본 약관을 주의 깊게 읽어주시기 바랍니다. 계정을 생성하거나 유료 서비스를 구독하는 것은 본 약관의 내용을 완전히 동의하고 이에 법적으로 구속됨을 의미합니다.
              </div>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">제1조 — 발행인의 식별</h2>
                <p>
                  Aigentra Trading 웹사이트(이하 &ldquo;플랫폼&rdquo;)는 대한민국 법률에 의거하여 발행 및 운영되며 발행 주체는 다음과 같습니다:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>상호명:</strong> SERN</li>
                  <li><strong>사업자등록번호:</strong> 418-11-83101</li>
                  <li><strong>주소:</strong> 대한민국 반룡로 18번길 32-4, 신영하우스</li>
                  <li><strong>문의 이메일:</strong> <a href="mailto:kicoa24@gmail.com" className="text-emerald-500 hover:underline">kicoa24@gmail.com</a></li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">제2조 — 용어의 정의</h2>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>&ldquo;플랫폼&rdquo;이란 웹사이트 aigentra.trading 및 그와 관련된 모든 웹 어플리케이션, 분석 기능, API 등을 포함한 서비스를 의미합니다.</li>
                  <li>&ldquo;서비스&rdquo;란 AI 기반 모의 투자 리그, 가상 포지션 및 트레이딩 분석 데스크를 포함하여 플랫폼에서 사용자에게 제공하는 모든 기능을 지칭합니다.</li>
                  <li>&ldquo;사용자&rdquo; 또는 &ldquo;구독자&rdquo;란 플랫폼에 계정을 만들거나 유료 정기 구독권을 획득한 개인 또는 법인을 의미합니다.</li>
                  <li>&ldquo;구독&rdquo;이란 본 플랫폼의 유료 기능을 사용하기 위하여 주기적으로 요금을 납부하는 것을 말하며, 현재 Whop을 통해 처리됩니다.</li>
                  <li>&ldquo;콘텐츠&rdquo;란 서비스에서 출력되는 AI 분석 보고서, 모의 거래 기록, 분석 신호 등의 모든 자료를 말합니다.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">제3조 — 서비스의 성격 및 제공 범위</h2>
                <p>
                  Aigentra Trading은 차트 및 재무적 거래 모델을 시각화하고 AI 연산 결과를 제공하는 교육적·정보제공 목적의 모의 거래 분석 툴 및 대시보드 플랫폼입니다.
                </p>
                <p className="font-bold text-rose-500 dark:text-rose-400">
                  본 플랫폼에서 제공하는 모든 분석과 결과물은 전문적인 재무 자문, 투자 자문, 거래 자문 또는 금융 서비스 권유에 해당하지 않습니다. 모든 모의 거래 데이터는 실제 거래가 아니며 교육적 시뮬레이션에 불과합니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">제4조 — 구독 및 청구 조건</h2>
                <p>
                  본 플랫폼의 실시간 AI 알림 수신 및 상세 분석 콘솔 접근에는 유료 구독이 필요하며, Whop 플랫폼을 통해 구매 시 명시된 요금이 매월 정기적으로 청구됩니다. 요금의 세금은 결제 대행자의 약관에 따르며 구매자는 본인 관할권 내의 세무 의무를 부담합니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">제5조 — 환불 정책 (엄격한 환불 불가)</h2>
                <p>
                  <strong>모든 판매는 최종적이며 원칙적으로 환불이 불가능합니다.</strong> 단, 아래 두 가지의 극히 예외적인 상황에 한하여 환불이 고려됩니다.
                </p>
                <div className="border border-zinc-200/50 dark:border-white/5 bg-zinc-500/5 rounded-lg p-4 space-y-2">
                  <p><strong>(a) 전체 플랫폼 기능의 완전한 장애:</strong></p>
                  <p className="pl-4">
                    플랫폼이 완전한 비정상 상태 또는 접속 불능에 놓여 24시간 연속으로 서비스 공급이 중단되었음이 타임스탬프 스크린샷과 로그 기록을 통해 완벽히 증빙되는 경우. 단순한 AI 출력 퀄리티 불만족 또는 기기 호환성 문제 등은 환불 대상에서 전면 제외됩니다. 장애 발생 시 48시간 이내에 <a href="mailto:kicoa24@gmail.com" className="text-emerald-500 hover:underline">kicoa24@gmail.com</a>으로 장애 사실을 신고해야 합니다.
                  </p>
                  <p><strong>(b) 결제 시스템의 명백한 이중 결제 오류:</strong></p>
                  <p className="pl-4">
                    동일한 구독 주기에 대해 중복 청구되었음이 은행 거래 내역이나 결제 대행사 명세서로 확증된 경우. 중복 결제일로부터 7일 이내에 신청해야 하며, 확인 후 초과분 한 건에 한해 환불됩니다.
                  </p>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">제6조 — 사용자의 의무</h2>
                <p>
                  사용자는 플랫폼 회원 가입 시 신원 정보를 정확히 입력해야 하며, 계정 및 API 연동 토큰의 비밀을 유지해야 합니다. 본 서비스의 크롤링, 상업적 재판매, 역설계(Reverse-Engineering), 분석 정보 유출 행위를 엄격히 금지하며 적발 시 즉시 경고 없이 계정이 차단되고 법적 책임을 질 수 있습니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">제7조 — 지적재산권</h2>
                <p>
                  aigentra.trading 내의 모든 소프트웨어 코드, AI 모델 분석 알고리즘, 그래픽 인터페이스, 브랜드 자산 및 콘텐츠 정보는 SERN의 전유적 권리이며 저작권법의 보호를 받습니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">제8조 — 면책 및 책임의 제한</h2>
                <p>
                  본 플랫폼에서 제공하는 정보에 기대어 수행한 가상 또는 실제 투자 결과에 따른 경제적 이익이나 손실(원금 전액 손실 포함)에 대해 SERN과 그 운영진은 어떠한 직접적/간접적/징벌적 책임도 지지 않습니다. 준거법상 배상 한도가 허용되는 최대 범위 내에서, SERN의 합산 손해배상 책임은 분쟁 발생 직전 30일 동안 사용자가 당사에 지불한 총액을 한도로 설정합니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">제9조 — 준거법 및 분쟁 해결</h2>
                <p>
                  본 약관과 규정은 상충하는 법 원칙을 배제하고 대한민국 법률에 의해 통제됩니다. 서비스 이용 중 발생하는 분쟁은 일차적으로 30일 동안 상호간에 성실히 협의하여 조율하되, 해결되지 않는 모든 청구 사안은 관할 법원의 재판을 통해 최종 해결합니다.
                </p>
              </section>
            </>
          ) : (
            <>
              <div className="bg-zinc-500/5 border border-zinc-200/50 dark:border-white/5 rounded-xl p-5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                <p className="font-bold mb-1">Notice</p>
                PLEASE READ THESE TERMS OF SERVICE CAREFULLY BEFORE ACCESSING OR USING AIGENTRA.TRADING. BY CREATING AN ACCOUNT OR PURCHASING A SUBSCRIPTION, YOU AGREE TO BE LEGALLY BOUND BY THESE TERMS.
              </div>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">Article 1 — Publisher Identification</h2>
                <p>
                  The website aigentra.trading (the &ldquo;Platform&rdquo;) is published and operated under the laws of South Korea with the following entity details:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Publisher Legal Name:</strong> SERN</li>
                  <li><strong>Business Registration Number:</strong> 418-11-83101</li>
                  <li><strong>Address:</strong> 32-4, Banryong-ro 18beon-gil, Sinyeong House, South Korea</li>
                  <li><strong>Contact Email:</strong> <a href="mailto:kicoa24@gmail.com" className="text-emerald-500 hover:underline">kicoa24@gmail.com</a></li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">Article 2 — Definitions</h2>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>&ldquo;Platform&rdquo; means the website aigentra.trading and all associated web applications, analysis APIs, and services.</li>
                  <li>&ldquo;Service&rdquo; means the AI-driven simulation trading leagues, strategy desks, and notification bots provided by the Platform.</li>
                  <li>&ldquo;User&rdquo; or &ldquo;Subscriber&rdquo; means any individual or entity utilizing the Platform or acquiring a recurring monthly license.</li>
                  <li>&ldquo;Subscription&rdquo; refers to recurring paid licenses (presently billed via Whop).</li>
                  <li>&ldquo;Content&rdquo; refers to AI evaluation logs, trading reviews, and notification signals generated by the system.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">Article 3 — Educational Tool & Non-Advice Disclaimer</h2>
                <p>
                  Aigentra Trading provides an analytical operations console for simulated trading and algorithmic performance metrics. The Service is provided strictly as an informational and educational tool.
                </p>
                <p className="font-bold text-rose-500 dark:text-rose-400">
                  THE SERVICE DOES NOT CONSTITUTE FINANCIAL ADVICE, INVESTMENT ADVICE, TRADING ADVICE, OR ANY OTHER TYPE OF PROFESSIONAL OR REGULATED FINANCIAL SERVICE. All simulations represent artificial environments.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">Article 4 — Subscription and Billing</h2>
                <p>
                  Continuous access to alert configurations requires a paid subscription at the pricing displayed during purchase. Subscriptions bill automatically on a recurring monthly cycle via Whop. Users are solely responsible for local tax and duty declarations within their respective jurisdictions.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">Article 5 — Refund Policy (All Sales Final)</h2>
                <p>
                  <strong>ALL SALES ARE FINAL. A STRICT NO-REFUND POLICY IS APPLIED AS A GENERAL RULE.</strong> Refunds will only be considered under the following strictly limited circumstances:
                </p>
                <div className="border border-zinc-200/50 dark:border-white/5 bg-zinc-500/5 rounded-lg p-4 space-y-2">
                  <p><strong>(a) Continuous Technical Outage:</strong></p>
                  <p className="pl-4">
                    The User must demonstrate using timestamped logs and screenshots that the Platform was completely non-functional for a continuous block of twenty-four (24) or more hours. AI output quality issues do not qualify. Incidents must be reported to <a href="mailto:kicoa24@gmail.com" className="text-emerald-500 hover:underline">kicoa24@gmail.com</a> within forty-eight (48) hours of occurrence.
                  </p>
                  <p><strong>(b) Double / Duplicate Charge:</strong></p>
                  <p className="pl-4">
                    Proof of identical double billing must be presented within seven (7) calendar days of the charge. The duplicate amount will be refunded; the baseline monthly subscription remains non-refundable.
                  </p>
                </div>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">Article 6 — User Obligations</h2>
                <p>
                  Users must safeguard credentials and ensure accurate account registrations. Scraping data, reselling information, reverse-engineering Platform systems, or exploiting information streams for commercial redistribution is strictly prohibited.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">Article 7 — Disclaimer of Liability</h2>
                <p>
                  SERN, its employees, and affiliates will not be liable for trading decisions or capital losses. In any event, the Platform's cumulative liability for damages is limited to the subscription fees paid by the User during the thirty (30) days preceding the claim.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">Article 8 — Governing Law</h2>
                <p>
                  These terms are governed by the laws of South Korea. Any unresolved dispute failing bilateral negotiation within 30 days shall be resolved exclusively through the competent courts of South Korea.
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
