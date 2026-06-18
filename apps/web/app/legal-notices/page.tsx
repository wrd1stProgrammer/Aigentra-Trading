"use client";

import { useEffect, useState } from "react";
import { useAppContext } from "@/components/app-provider";
import { ArrowLeft, FileText, Translate } from "@phosphor-icons/react";
import Link from "next/link";
import { LandingFooter } from "@/components/home-landing-visuals";
import { landingCopy } from "@/lib/marketing-copy";

export default function LegalNoticesPage() {
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
                {activeLang === "ko" ? "법적 고지 및 공시" : "Legal Notices & Platform Info"}
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

        {/* Legal Notices Content Container */}
        <div className="prose dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-400 text-sm space-y-6 md:space-y-8 font-normal">
          {activeLang === "ko" ? (
            <>
              <div className="bg-zinc-500/5 border border-zinc-200/50 dark:border-white/5 rounded-xl p-5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                <p className="font-bold mb-1">고지 요약</p>
                본 법적 고지 문서는 aigentra.trading 플랫폼의 소유권, 책임의 한계 및 지적 재산권 보호 조치를 명확히 공시하기 위한 것입니다.
              </div>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">1. 발행인 정보 (Publisher Information)</h2>
                <p>
                  Aigentra Trading(aigentra.trading, 이하 &ldquo;플랫폼&rdquo;)은 대한민국 법률에 따라 등록된 법인에 의해 소유 및 발행됩니다. 상세 정보는 다음과 같습니다:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>운영 상호:</strong> SERN</li>
                  <li><strong>사업자등록번호:</strong> 418-11-83101</li>
                  <li><strong>대표 주소:</strong> 대한민국 반룡로 18번길 32-4, 신영하우스</li>
                  <li><strong>고객 문의망:</strong> <a href="mailto:kicoa24@gmail.com" className="text-emerald-500 hover:underline">kicoa24@gmail.com</a></li>
                  <li><strong>공식 주소:</strong> <Link href="/" className="text-emerald-500 hover:underline">https://aigentra.trading</Link></li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">2. 법인 관리 총괄자 (Director of Publication)</h2>
                <p>
                  본 플랫폼의 법률 고지, 대외 소통 및 발행 관리 총괄책임은 <strong>SERN의 총괄 대표자</strong>에게 있습니다. 연락 및 공식 법무 질의는 상기의 고객 문의 이메일을 통해 송신하실 수 있습니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">3. 비즈니스의 성격</h2>
                <p>
                  SERN은 플랫폼 Aigentra Trading을 통하여 다음의 정보 기술 도구를 운영 및 제공합니다:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>AI 알고리즘 분석에 기반한 가상 모의 투자 기술 대시보드(SaaS)</li>
                  <li>금융 거래 차트 패턴 분석 및 머신러닝 시뮬레이션 지표 제공</li>
                  <li>Whop 플랫폼을 연동한 정기 정밀 시뮬레이션 라이선스 판매 업무</li>
                </ul>
                <p>
                  당사는 대한민국 금융위원회를 포함한 어떠한 국가 금융 감독 기구에도 정식 등록되지 않은 비인가 머신러닝 연산 시스템에 해당하며, 자산 관리 및 자산 수탁 행위를 절대로 수행하지 않습니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">4. 지적 재산권 및 무단 도용 금지</h2>
                <p>
                  aigentra.trading 플랫폼에 기재된 소스 코드 구조, 프론트엔드 콘솔 인터페이스 레이아웃, 인공지능 분석 가중치 보고서, 로고 엠블럼, 텍스트 글귀 등 모든 저작물 및 지적 재산권은 <strong>SERN</strong>의 독점 소유물입니다.
                </p>
                <p>
                  당사의 사전 서면 승인 없이 본 플랫폼의 핵심 디자인, AI 분석 로그 정보 등을 무단 복제, 상업적 크롤링, 재배포 또는 무단 가공하는 행위는 지적재산권 침해에 해당하며 강력한 민형사상 법적 제재 조치가 수반될 수 있습니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">5. 책임 한계 및 보장 유예 (Limitation of Liability)</h2>
                <p>
                  본 웹사이트의 모든 데이터는 시스템 성능 시험 및 인공지능 교육을 위해 "있는 그대로(AS IS)" 제공됩니다. SERN은 산출 지표 결과의 절대적인 신뢰성, 최신성, 실전 투자 적합성에 관한 묵시적·명시적 보증을 하지 않습니다. 플랫폼 사용에 연계된 가상 및 현실 자산 운용 결정에 따른 어떠한 손해(직접적, 간접적, 우발적 손해 포함)에 대해서도 면책됨을 확인합니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">6. 타사 링크 및 제휴사</h2>
                <p>
                  당사는 분석 및 결제 편의를 제공하기 위해 타사의 서비스 링크(예: Whop 결제 시스템 등)를 탑재할 수 있습니다. 당사는 이러한 외부 시스템의 독자적인 데이터 보안 규정 및 정책에 대해서는 개입하거나 보증하지 않으므로 사용 시 개별 타사 약관을 준수하시기 바랍니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">7. 호스팅 정보 (Hosting)</h2>
                <p>
                  본 플랫폼의 프론트엔드 및 데이터베이스 시스템은 검증된 타사 퍼블릭 클라우드 인프라를 통해 호스팅 및 유지보수됩니다. 상세한 인프라 관리 문의는 <a href="mailto:kicoa24@gmail.com" className="text-emerald-500 hover:underline">kicoa24@gmail.com</a>을 통하여 전달받고 있습니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">8. 관할 준거법</h2>
                <p>
                  본 법적 고지 문서는 대한민국 법률을 따르고 이에 기초하여 해석됩니다. 플랫폼 이용에서 야기되는 모든 사법 분쟁은 대한민국 내 관할 법원의 단심 재판권으로 독점 종결합니다.
                </p>
              </section>
            </>
          ) : (
            <>
              <div className="bg-zinc-500/5 border border-zinc-200/50 dark:border-white/5 rounded-xl p-5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                <p className="font-bold mb-1">Notice</p>
                This Legal Notice governs the structural information, publication authorities, and intellectual property rights associated with the aigentra.trading platform.
              </div>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">1. Publisher Information</h2>
                <p>
                  The website aigentra.trading (the &ldquo;Platform&rdquo;) is operated by the following corporate publisher:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Operator:</strong> SERN</li>
                  <li><strong>Business Registration Number:</strong> 418-11-83101</li>
                  <li><strong>Registered Address:</strong> 32-4, Banryong-ro 18beon-gil, Sinyeong House, South Korea</li>
                  <li><strong>Legal Contact:</strong> <a href="mailto:kicoa24@gmail.com" className="text-emerald-500 hover:underline">kicoa24@gmail.com</a></li>
                  <li><strong>Official URL:</strong> <Link href="/" className="text-emerald-500 hover:underline">https://aigentra.trading</Link></li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">2. Director of Publication</h2>
                <p>
                  General publication oversight, compliance audits, and publisher affairs are administered under the authority of the **Representative of SERN**. Inquiries can be forwarded to the official email listed above.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">3. Business Operations</h2>
                <p>
                  SERN operates the Aigentra Trading platform to distribute:
                </p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>AI performance evaluations and chart technical analysis simulations (SaaS);</li>
                  <li>Algorithmic training league logs and educational model outputs;</li>
                  <li>Technical console access rights via Whop integrations.</li>
                </ul>
                <p>
                  SERN is not registered with any financial regulatory body. We do not manage capital or store user investment assets.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">4. Intellectual Property</h2>
                <p>
                  All content published on the Platform — including layouts, code, AI model log summaries, charts, and brand assets — is the exclusive property of SERN. Unauthorized scraping, commercial distribution, or modifications of these materials is prohibited and subject to legal actions.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">5. Disclaimer of Warranty</h2>
                <p>
                  Information is provided "AS IS" without warranty of any kind. SERN is not liable for data delays or system downtime. All trading decisions based on simulation profiles are made at the User's sole discretion.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">6. External Services</h2>
                <p>
                  We coordinate transaction structures via third-party systems such as Whop. Users must refer to their corresponding terms of service for transaction security.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">7. Hosting</h2>
                <p>
                  Server environments are maintained in compliance with public cloud hosting infrastructure standards.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">8. Governing Law</h2>
                <p>
                  These notices are governed by the laws of South Korea. Any dispute is subject to the exclusive jurisdiction of the competent courts of South Korea.
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
