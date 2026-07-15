"use client";

import { useEffect, useState } from "react";
import { useAppContext } from "@/components/app-provider";
import { ArrowLeft, FileText, Translate } from "@phosphor-icons/react";
import Link from "next/link";
import { LandingFooter } from "@/components/home-landing-visuals";
import { landingCopy } from "@/lib/marketing-copy";

export default function PrivacyPolicyPage() {
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
                {activeLang === "ko" ? "개인정보 처리방침" : "Privacy Policy"}
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

        {/* Privacy Policy Content Container */}
        <div className="prose dark:prose-invert max-w-none text-zinc-600 dark:text-zinc-400 text-sm space-y-6 md:space-y-8 font-normal">
          {activeLang === "ko" ? (
            <>
              <div className="bg-zinc-500/5 border border-zinc-200/50 dark:border-white/5 rounded-xl p-5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                <p className="font-bold mb-1">방침 요약</p>
                SERN(이하 &ldquo;당사&rdquo;)은 aigentratrading.com 플랫폼의 모든 사용자의 개인정보를 보호하기 위해 최선을 다하고 있습니다. 본 개인정보 처리방침은 당사가 수집하는 개인정보의 종류, 사용 목적, 공유 대상 및 개인정보 보호 권리에 대해 기술합니다. 본 방침에 동의하지 않으실 경우, 플랫폼 이용을 즉시 중단해 주시기 바랍니다.
              </div>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">1. 소개</h2>
                <p>
                  SERN(이하 &ldquo;당사&rdquo;, &ldquo;회사&rdquo;)은 aigentratrading.com 플랫폼(이하 &ldquo;플랫폼&rdquo;)의 모든 사용자의 개인정보를 보호하기 위해 최선을 다하고 있습니다. 본 개인정보 처리방침은 당사가 수집하는 개인정보의 종류, 사용 목적, 공유 대상 및 개인정보 보호 권리에 대해 기술합니다.
                </p>
                <p>
                  플랫폼에 접속하거나 이용함으로써 귀하는 본 방침에 기술된 개인정보 처리 관행에 동의하게 됩니다. 동의하지 않으실 경우, 플랫폼 이용을 즉시 중단해 주시기 바랍니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">2. 개인정보 처리 담당자 (데이터 컨트롤러)</h2>
                <p>개인정보 처리 및 관리 권한을 지닌 데이터 컨트롤러는 다음과 같습니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>상호명:</strong> SERN</li>
                  <li><strong>사업자등록번호:</strong> 418-11-83101</li>
                  <li><strong>사업자 형태:</strong> 개인사업자</li>
                  <li><strong>문의 메일:</strong> <a href="mailto:support@aigentratrading.com" className="text-emerald-500 hover:underline">support@aigentratrading.com</a></li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">3. 수집하는 개인정보 항목</h2>
                <p><strong>3.1 직접 제공하는 정보</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>회원가입 정보: 성명, 이메일 주소, 사용자 ID</li>
                  <li>Google 로그인으로 제공되는 기본 프로필 정보: 이메일 주소, 이름, 프로필 이미지, Google OAuth 식별자</li>
                  <li>Telegram 알림 연결 정보: Telegram Chat ID, 사용자명, 연결 상태, 알림 수신 설정</li>
                  <li>Whop.com을 통해 처리되는 결제 내역 (당사는 직접 신용카드 번호 등 결제 정보를 저장하지 않습니다)</li>
                  <li>고객 지원 문의 메일, 지원 티켓 내용 또는 당사로 전송된 메시지</li>
                </ul>
                <p><strong>3.2 자동으로 수집되는 정보</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>기술적 접속 데이터: IP 주소, 브라우저 종류, 운영체제(OS), 디바이스 식별값</li>
                  <li>플랫폼 사용 이력: 조회한 페이지, 체류 시간, 클릭 기록, 사용된 기능 목록</li>
                  <li>로그인 세션 및 언어·화면 설정을 위한 필수 쿠키와 로컬 저장값 (제6조 참고)</li>
                  <li>로그 데이터: 접속 로그, 오류 로그, 타임스탬프</li>
                </ul>
                <p><strong>3.3 제3자로부터 수집하는 정보</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Google OAuth로부터 제공받는 로그인 확인 데이터 및 기본 계정 프로필</li>
                  <li>Whop.com으로부터 제공받는 결제 데이터 (거래 확인 번호, 구독 활성화 상태 등)</li>
                  <li>Telegram Bot API로부터 제공받는 Chat ID, 봇 대화 시작 여부, 사용자명 등 연결 확인 데이터</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">4. 개인정보의 사용 목적</h2>
                <p>수집된 개인정보는 다음 목적을 위해 사용됩니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>서비스 제공, 계정 유지 및 관리</li>
                  <li>Google 로그인을 통한 본인 인증 및 계정 식별</li>
                  <li>Whop을 통한 정기 구독권 관리 및 결제 내역 처리</li>
                  <li>Telegram 알림 연결, Chat ID 확인, 사용자가 선택한 트레이더 및 이벤트 알림 발송</li>
                  <li>거래성 안내(영수증, 계정 상태 변경 알림 등) 발송</li>
                  <li>마케팅 및 홍보성 안내 발송 (사용자의 수신 동의가 있는 경우)</li>
                  <li>이용 분석을 통한 서비스 고도화 및 품질 개선</li>
                  <li>법적 의무 준수 및 서비스 이용약관의 집행</li>
                  <li>부정 사용, 해킹, 남용의 방지 및 보안 감지</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">5. 개인정보의 처리 근거</h2>
                <p>당사는 다음 법적 근거에 기반하여 개인정보를 처리합니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>계약의 이행: 사용자와 체결한 정기 구독 및 서비스 계약 약정을 실행하기 위함</li>
                  <li>정당한 이익: 통계 분석, 부정 이용 방지, 서비스 안정성 유지 및 품질 향상</li>
                  <li>동의: 이메일 마케팅 등 선택 기능에 대한 동의 (해당 기능을 사용하는 경우)</li>
                  <li>법적 의무 준수: 관련 세법 및 관련 법령에 따른 준수</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">6. 쿠키 및 로컬 저장</h2>
                <p>
                  당사는 로그인 세션을 유지하고 언어·화면 설정을 기억하기 위해 필수 쿠키와 브라우저 저장 기능을 사용합니다. 현재 공개 사이트에는 광고 픽셀이나 제3자 행동 분석 스크립트를 배포하지 않습니다.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>세션 관리 및 로그인 본인 인증</li>
                  <li>사용자가 선택한 언어와 화면 설정 유지</li>
                </ul>
                <p>귀하는 브라우저 설정을 통해 쿠키를 차단할 수 있으나, 차단 시 플랫폼 일부 기능의 사용이 제한될 수 있습니다.</p>
                <p>향후 광고 또는 행동 분석 도구를 도입하는 경우 실제 배포 전에 본 방침, 처리 목적, 보유 기간과 필요한 동의 절차를 갱신합니다.</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">7. 개인정보의 공유 및 제3자 제공</h2>
                <p>당사는 사용자의 개인정보를 판매하지 않습니다. 당사는 서비스의 원활한 운영을 위해 다음 신뢰할 수 있는 수탁자에게 개인정보 처리를 위탁하고 있습니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Google LLC:</strong> Google 로그인 및 기본 프로필 인증</li>
                  <li><strong>Whop.com:</strong> 결제 처리 및 구독권 관리 서비스</li>
                  <li><strong>Telegram Messenger Inc. 및 Telegram Bot API:</strong> 사용자가 연결한 채팅으로 알림 전송 및 Chat ID 확인</li>
                  <li><strong>호스팅 및 인프라 공급업체:</strong> 안전한 데이터 저장 및 클라우드 호스팅 서비스 제공</li>
                  <li><strong>사법 당국:</strong> 관련 법률, 법원의 명령 또는 수사 기관의 적법한 요구가 있을 경우</li>
                  <li><strong>승계인:</strong> 인수합병, 영업 양도 등의 경영상 변화가 발생할 경우</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">8. 국외 데이터 이전</h2>
                <p>
                  수집된 개인정보는 대한민국, 미국 또는 기타 플랫폼 서비스 인프라가 위치한 국가에서 처리 및 보관될 수 있습니다. 당사는 데이터가 처리되는 국가의 법률과 무관하게 본 방침에 따라 안전하게 처리되도록 필요한 보호 조치를 취합니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">9. 개인정보의 보유 및 파기</h2>
                <p>
                  당사는 목적이 달성된 개인정보를 지체 없이 파기합니다. 회원 정보는 서비스 구독 기간 동안 보유되며, Telegram Chat ID 및 알림 설정은 사용자가 연결을 해제하거나 계정을 삭제할 때까지 보관됩니다. 서비스 탈퇴 후 세무 기록 보관, 분쟁 해결 및 법적 요구 사항의 준수를 위해 회원 가입 및 결제 이력 정보는 탈퇴일로부터 최대 3년간 별도 보관될 수 있습니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">10. 정보주체의 권리</h2>
                <p>귀하의 관할권 법령에 따라 다음과 같은 권리를 가질 수 있습니다:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>열람:</strong> 당사가 보유한 본인의 개인정보 사본 요청</li>
                  <li><strong>정정:</strong> 부정확하거나 불완전한 개인정보의 수정 요청</li>
                  <li><strong>삭제:</strong> 개인정보의 삭제 요청</li>
                  <li><strong>이전:</strong> 처리된 본인 정보를 포터블한 포맷으로 수령할 권리</li>
                  <li><strong>이의 제기:</strong> 정당한 이익에 기반한 개인정보 처리에 대한 이의 제기</li>
                  <li><strong>CCPA 권리 (캘리포니아 거주민 대상):</strong> 정보공개청구권, 삭제권, 개인정보 판매/공유 거부권</li>
                </ul>
                <p>귀하의 권리를 행사하고자 하는 경우 <a href="mailto:support@aigentratrading.com" className="text-emerald-500 hover:underline">support@aigentratrading.com</a>으로 문의하시기 바랍니다.</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">11. 개인정보의 보호 대책 (데이터 보안)</h2>
                <p>
                  당사는 해킹, 분실, 무단 변경 또는 유출을 방지하기 위하여 적절한 기술적 및 관리적 보안 조치를 적용하고 있습니다. 단, 인터넷상의 모든 전송 행위가 완전히 안전할 수는 없으므로 절대적 보안을 보장하지는 못합니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">12. 아동의 개인정보 보호</h2>
                <p>
                  본 플랫폼은 만 18세 미만의 아동을 대상으로 하지 않습니다. 당사는 아동의 정보를 고의로 수집하지 않으며, 만약 아동의 정보가 수집되었음을 확인하는 경우 지체 없이 해당 정보를 파기합니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">13. 본 방침의 개정 및 고지</h2>
                <p>
                  본 개인정보 처리방침은 수시로 개정될 수 있습니다. 방침의 중대한 변경이 있을 경우, 이메일 또는 플랫폼 내 안내를 통해 통지할 것입니다. 개정된 방침은 게시일로부터 효력이 발생합니다.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">14. 문의처</h2>
                <p>개인정보 관련 문의사항은 아래로 연락해 주시기 바랍니다:</p>
                <ul className="list-disc pl-5 space-y-1">
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
              <div className="bg-zinc-500/5 border border-zinc-200/50 dark:border-white/5 rounded-xl p-5 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
                <p className="font-bold mb-1">Notice Summary</p>
                SERN ("we", "us", "our") is committed to protecting the privacy of all users of the aigentratrading.com platform (the "Platform"). This Privacy Policy describes what personal data we collect, how we use it, with whom we share it, and your rights regarding your data. If you do not agree, please discontinue use of the Platform immediately.
              </div>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">1. Introduction</h2>
                <p>
                  SERN, operating as Aigentra Trading ("we", "us", "our"), is committed to protecting the privacy of all users of aigentratrading.com (the "Platform"). This Privacy Policy describes what personal data we collect, how we use it, with whom we share it, and your rights regarding your data.
                </p>
                <p>
                  By accessing or using the Platform, you consent to the practices described in this Policy. If you do not agree, please discontinue use of the Platform immediately.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">2. Data Controller</h2>
                <p>The data controller is:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Publisher Legal Name:</strong> SERN</li>
                  <li><strong>Business Registration Number:</strong> 418-11-83101</li>
                  <li><strong>Legal Form:</strong> Sole proprietor</li>
                  <li><strong>Contact Email:</strong> <a href="mailto:support@aigentratrading.com" className="text-emerald-500 hover:underline">support@aigentratrading.com</a></li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">3. Data We Collect</h2>
                <p><strong>3.1 Data You Provide Directly</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Account registration data: name, email address, username;</li>
                  <li>Basic profile data provided through Google sign-in: email address, name, profile image, and Google OAuth identifier;</li>
                  <li>Telegram alert connection data: Telegram Chat ID, username, connection state, and notification preferences;</li>
                  <li>Payment information processed by Whop.com (we do not store payment card details);</li>
                  <li>Communications: emails, support tickets, or messages sent to us.</li>
                </ul>
                <p><strong>3.2 Data Collected Automatically</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Technical data: IP address, browser type, operating system, device identifiers;</li>
                  <li>Usage data: pages visited, time spent, clicks, features used;</li>
                  <li>Essential session cookies and local language or display preferences (see Section 6);</li>
                  <li>Log data: access logs, error logs, timestamps.</li>
                </ul>
                <p><strong>3.3 Data from Third Parties</strong></p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Google OAuth login confirmation and basic account profile data;</li>
                  <li>Payment data from Whop.com (transaction confirmation, subscription status);</li>
                  <li>Telegram Bot API connection data, including Chat ID, bot conversation state, and username where available;</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">4. How We Use Your Data</h2>
                <p>We use personal data to:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Provide and maintain the Service and your account;</li>
                  <li>Authenticate and identify your account through Google sign-in;</li>
                  <li>Process payments and manage subscriptions;</li>
                  <li>Connect Telegram alerts, verify Chat ID ownership, and send the trader or event alerts you select;</li>
                  <li>Send transactional communications (receipts, account notifications);</li>
                  <li>Send marketing communications (where you have provided consent);</li>
                  <li>Analyze Platform usage to improve our services;</li>
                  <li>Comply with legal obligations and enforce our Terms of Service;</li>
                  <li>Detect and prevent fraud or abuse.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">5. Legal Basis for Processing</h2>
                <p>We process your data on the following legal bases:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Contract performance: to fulfill our subscription agreement with you;</li>
                  <li>Legitimate interests: analytics, fraud prevention, service improvement;</li>
                  <li>Consent: marketing emails, cookies (where required);</li>
                  <li>Legal obligation: compliance with applicable laws.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">6. Cookies & Local Storage</h2>
                <p>We use essential cookies and browser storage for:</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Session management and authentication;</li>
                  <li>Remembering language and display preferences.</li>
                </ul>
                <p>You may control cookie settings through your browser. Disabling certain cookies may affect Platform functionality.</p>
                <p>No advertising pixel or third-party behavioral analytics script is currently deployed on the public site. Before introducing one, we will update this policy, its purpose and retention terms, and any required consent flow.</p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">7. Data Sharing</h2>
                <p>We do not sell your personal data. We may share data with:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>Google LLC: Google sign-in and basic profile authentication;</li>
                  <li>Whop.com: our payment and subscription management platform;</li>
                  <li>Telegram Messenger Inc. and Telegram Bot API: delivery of alerts to the chat you connect and Chat ID verification;</li>
                  <li>Hosting & infrastructure providers: for Platform operation;</li>
                  <li>Legal authorities: where required by law or court order;</li>
                  <li>Successors: in the event of a merger, acquisition, or asset sale.</li>
                </ul>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">8. International Data Transfers</h2>
                <p>
                  Your data may be processed in South Korea, the United States, and other countries. We take appropriate safeguards to ensure your data is protected in accordance with this Policy regardless of where it is processed.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">9. Data Retention</h2>
                <p>
                  We retain personal data for as long as necessary to provide the Service and comply with legal obligations. Telegram Chat ID and alert preferences are retained until you disconnect Telegram or delete your account. Account data is retained for the duration of your subscription plus a maximum of three (3) years thereafter for legal and compliance purposes.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">10. Your Rights</h2>
                <p>Depending on your jurisdiction, you may have the following rights:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li><strong>Access:</strong> request a copy of your personal data;</li>
                  <li><strong>Rectification:</strong> correct inaccurate or incomplete data;</li>
                  <li><strong>Erasure:</strong> request deletion of your data;</li>
                  <li><strong>Portability:</strong> receive your data in a portable format;</li>
                  <li><strong>Objection:</strong> object to processing based on legitimate interests;</li>
                  <li><strong>CCPA Rights (California residents):</strong> right to know, delete, and opt-out of sale of information.</li>
                </ul>
                <p>To exercise your rights, contact us at: <a href="mailto:support@aigentratrading.com" className="text-emerald-500 hover:underline">support@aigentratrading.com</a></p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">11. Data Security</h2>
                <p>
                  We implement appropriate technical and organizational measures to protect your personal data against unauthorized access, loss, or alteration. However, no transmission over the internet is completely secure, and we cannot guarantee absolute security.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">12. Children's Privacy</h2>
                <p>
                  The Platform is not intended for individuals under the age of 18. We do not knowingly collect personal data from minors. If we become aware of such collection, we will delete the data immediately.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">13. Changes to This Policy</h2>
                <p>
                  We may update this Privacy Policy periodically. We will notify users of material changes via email or a notice on the Platform. The updated Policy will be effective upon posting.
                </p>
              </section>

              <section className="space-y-3">
                <h2 className="text-base font-bold text-zinc-900 dark:text-white font-mono uppercase tracking-wide">14. Contact</h2>
                <p>For privacy-related inquiries, please contact us at:</p>
                <ul className="list-disc pl-5 space-y-1">
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
