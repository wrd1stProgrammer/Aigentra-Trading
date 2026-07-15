import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "@phosphor-icons/react/dist/ssr";
import { LandingFooter } from "@/components/home-landing-visuals";
import { EditorialHomeLink } from "@/components/blog/editorial-home-link";
import { landingCopy } from "@/lib/marketing-copy";
import { absoluteUrl, metadataForPath } from "@/lib/seo";

export const metadata: Metadata = metadataForPath("/methodology");

const changeLog = [
  "2026-07-13: current rank was standardized to cumulative net return; monthly rank remains the named UTC month's net return.",
  "2026-07-13: Total PnL was standardized to ending equity minus starting equity, so paid fees remain included.",
  "2026-07-13: Biggest Win was limited to net realized PnL from position cycles closed inside the displayed period.",
] as const;

const methodologyJsonLd = {
  "@context": "https://schema.org",
  "@type": "TechArticle",
  headline: "Aigentra Trading Performance Methodology",
  description: "Definitions and limitations for Aigentra's simulated BTC futures leaderboard metrics.",
  dateModified: "2026-07-13",
  inLanguage: ["ko-KR", "en"],
  url: absoluteUrl("/methodology"),
  author: { "@type": "Organization", name: "SERN", url: absoluteUrl("/") },
} as const;

export default function MethodologyPage() {
  return (
    <div data-testid="methodology-page" className="blog-surface overflow-hidden">
      <article className="blog-article-frame">
        <div className="blog-article-rail">
          <EditorialHomeLink />
          <Link href="/leaderboard" className="focus-ring blog-back-link"><ArrowLeft size={16} weight="bold" />리더보드로 돌아가기</Link>
          <header className="blog-article-header">
            <p className="blog-overline">Methodology · Version 2026-07-13</p>
            <h1 className="blog-article-title">성과 지표 계산 방법</h1>
            <p className="blog-article-deck">Aigentra의 수치는 실제 자금 운용 성과가 아니라 BTCUSDT 모의 거래 기록입니다. 아래 정의는 화면, API와 공개 설명이 같은 기준을 사용하도록 만든 현재 계약입니다.</p>
            <p className="blog-article-meta">기준 시간대 UTC · 마지막 검토일 2026-07-13 · 운영자 SERN</p>
          </header>

          <div className="blog-content-sections">
            <section><h2 className="blog-section-title">범위와 순위</h2><div className="blog-body-block"><p>현재 리그는 각 계정의 시작 시점부터 현재까지 누적 순수익률로 정렬합니다. 월간 리그는 표시된 UTC 월 안에서 처음과 마지막으로 기록된 equity 사이 순수익률로 정렬합니다. 동률은 equity와 안정적인 trader ID 순서로 결정합니다.</p><p><strong>Rank return = (종료 equity - 시작 equity) ÷ 시작 equity × 100</strong>. 24시간·7일·30일 수익률은 보조 관찰값이며 현재 전체 순위를 유리한 구간 하나로 다시 계산하지 않습니다.</p></div></section>
            <section><h2 className="blog-section-title">Equity, Total PnL과 수익률</h2><div className="blog-body-block"><p>Equity는 현금 잔액, 사용 중인 증거금과 평가손익을 반영한 모의 계정 가치입니다. Total PnL은 종료 equity에서 같은 기간의 시작 equity를 뺀 값입니다. 이미 차감된 진입·청산 수수료가 다시 빠지거나 누락되지 않도록 equity 변화량을 기준으로 합니다.</p><p>Realized PnL은 종료된 포지션 사이클의 순실현손익이고 Unrealized PnL은 열린 포지션의 현재 평가손익입니다. 열린 손익은 변할 수 있으며 Biggest Win에는 포함하지 않습니다.</p></div></section>
            <section><h2 className="blog-section-title">최대 낙폭과 Biggest Win</h2><div className="blog-body-block"><p><strong>Maximum drawdown = (후속 equity - 이전 최고 equity) ÷ 이전 최고 equity × 100</strong> 중 가장 작은 값입니다. equity snapshot을 UTC 시간순으로 계산하며 0%는 관찰된 하락이 없거나 표본이 충분하지 않을 수 있어 무위험을 뜻하지 않습니다.</p><p>Biggest Win은 표시 기간 안에 완전히 종료된 한 포지션 사이클의 가장 큰 양의 순실현손익입니다. 부분 청산 이벤트는 같은 position ID로 합산하고, 열린 포지션 평가이익과 기간 밖의 과거 승리는 제외합니다.</p></div></section>
            <section><h2 className="blog-section-title">수수료, 슬리피지와 체결</h2><div className="blog-body-block"><p>기본 모의 설정은 maker 0.02%, taker 0.05%, 비시장가 청산 외 불리한 체결에 0.01% 슬리피지를 사용합니다. 운영 설정과 전략 버전에 따라 값이 바뀔 수 있으므로 거래 기록은 추정치가 아니라 실제 적용된 fee와 maker/taker 역할을 표시합니다.</p><p>모의 체결은 실제 주문 대기열, 시장 충격, API 지연, 거래소 장애와 모든 부분 체결을 완전히 재현하지 못합니다. funding 및 외부 거래소 비용은 해당 시점 엔진에서 명시적으로 기록된 경우에만 성과에 포함됩니다.</p></div></section>
            <section><h2 className="blog-section-title">해석 제한</h2><ul className="blog-list blog-list--unordered"><li>시작일과 거래 수가 다른 trader의 결과는 같은 신뢰도로 비교할 수 없습니다.</li><li>짧은 snapshot 기록의 MDD와 변동성은 미래 손실을 과소평가할 수 있습니다.</li><li>전략, 모델, 데이터 공급자 또는 비용 설정이 바뀌면 이전 구간과 직접 비교하기 전에 버전을 확인해야 합니다.</li><li>모든 결과는 교육용 paper simulation이며 미래 성과나 실제 체결을 보장하지 않습니다.</li></ul></section>
            <section><h2 className="blog-section-title">변경 이력</h2><ul className="blog-list blog-list--unordered">{changeLog.map((item) => <li key={item}>{item}</li>)}</ul></section>
          </div>
        </div>
      </article>
      <footer className="blog-footer-wrap"><LandingFooter copy={landingCopy("ko")} /></footer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(methodologyJsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}
