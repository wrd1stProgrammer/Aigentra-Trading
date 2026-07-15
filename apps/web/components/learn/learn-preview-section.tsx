"use client";

import { ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import { LearnCard } from "@/components/learn/learn-card";
import { useAppContext } from "@/components/app-provider";
import { learnEntries } from "@/lib/learn";

const copy = {
  en: { eyebrow: "Knowledge hub", title: "Trading concepts, explained clearly", subtitle: "Build the foundations behind futures, risk management, and strategy research with concise definitions and worked examples.", cta: "Explore the knowledge hub" },
  ko: { eyebrow: "지식 허브", title: "복잡한 트레이딩 개념을 명확하게", subtitle: "선물, 위험관리, 전략 검증의 필수 개념을 정확한 정의와 실제 계산 예시로 이해하세요.", cta: "지식 허브 둘러보기" },
  ru: { eyebrow: "База знаний", title: "Сложные понятия трейдинга — ясно", subtitle: "Основы деривативов, управления риском и проверки стратегий с определениями и примерами расчётов.", cta: "Открыть базу знаний" },
  "pt-BR": { eyebrow: "Central de conhecimento", title: "Conceitos de trading, sem complicação", subtitle: "Aprenda os fundamentos de derivativos, gestão de risco e pesquisa de estratégias com exemplos calculados.", cta: "Explorar a central" },
  tr: { eyebrow: "Bilgi merkezi", title: "Karmaşık trading kavramları, net biçimde", subtitle: "Türevler, risk yönetimi ve strateji araştırmasının temellerini hesaplı örneklerle öğrenin.", cta: "Bilgi merkezini keşfet" },
} as const;

export function LearnPreviewSection() {
  const { locale } = useAppContext();
  const text = copy[locale];

  return (
    <section data-testid="landing-learn" className="blog-surface blog-home-section learn-home-section">
      <div aria-hidden="true" className="blog-top-rule" />
      <div className="blog-content-rail">
        <div className="blog-hero-rail">
          <p className="blog-overline">{text.eyebrow}</p>
          <h2 className="blog-display-title">{text.title}</h2>
          <p className="blog-deck">{text.subtitle}</p>
        </div>
        <div className="blog-card-grid blog-card-grid--preview">
          {learnEntries(locale).slice(0, 3).map((entry, index) => <LearnCard key={entry.slug} entry={entry} sequence={index + 1} locale={locale} />)}
        </div>
        <div className="blog-preview-actions">
          <Link href="/learn" className="focus-ring blog-primary-action blog-primary-action--pill shadow-neon-emerald">
            {text.cta}<ArrowRight size={18} weight="bold" />
          </Link>
        </div>
      </div>
    </section>
  );
}
