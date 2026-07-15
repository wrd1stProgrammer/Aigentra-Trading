"use client";

import { EditorialHomeLink } from "@/components/blog/editorial-home-link";
import { LandingFooter } from "@/components/home-landing-visuals";
import { LearnCard } from "@/components/learn/learn-card";
import { useAppContext } from "@/components/app-provider";
import { learnEntries } from "@/lib/learn";
import { learnUiCopy } from "@/lib/learn-locales";
import { landingCopy } from "@/lib/marketing-copy";

export function LearnIndexClient() {
  const { locale } = useAppContext();
  const copy = learnUiCopy[locale];

  return (
    <div data-testid="learn-index" className="blog-surface overflow-hidden">
      <section className="blog-index-section">
        <EditorialHomeLink />
        <div className="blog-hero-rail">
          <p className="blog-overline">{copy.eyebrow}</p>
          <h1 className="blog-display-title">{copy.indexTitle}</h1>
          <p className="blog-deck">{copy.indexSubtitle}</p>
        </div>
        <div className="blog-card-grid blog-card-grid--index">
          {learnEntries(locale).map((entry, index) => (
            <LearnCard key={entry.slug} entry={entry} sequence={index + 1} locale={locale} />
          ))}
        </div>
      </section>
      <footer className="blog-footer-wrap"><LandingFooter copy={landingCopy(locale)} /></footer>
    </div>
  );
}
