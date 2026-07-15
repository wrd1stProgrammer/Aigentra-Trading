"use client";

import { ArrowLeft, ArrowRight } from "@phosphor-icons/react";
import Link from "next/link";
import { EditorialActionPanel } from "@/components/blog/editorial-action-panel";
import { EditorialHomeLink } from "@/components/blog/editorial-home-link";
import { LandingFooter } from "@/components/home-landing-visuals";
import { useAppContext } from "@/components/app-provider";
import { blogPostBySlug } from "@/lib/blog-posts";
import { learnEntryBySlug } from "@/lib/learn";
import { learnUiCopy } from "@/lib/learn-locales";
import { landingCopy } from "@/lib/marketing-copy";
import { absoluteUrl } from "@/lib/seo";

type LearnEntryClientProps = { readonly slug: string };

export function LearnEntryClient({ slug }: LearnEntryClientProps) {
  const { locale } = useAppContext();
  const entry = learnEntryBySlug(slug, locale);
  if (!entry) return null;

  const copy = learnUiCopy[locale];
  const relatedConcepts = entry.relatedSlugs.map((relatedSlug) => learnEntryBySlug(relatedSlug, locale)).filter((candidate) => candidate !== undefined);
  const relatedBlogs = entry.relatedBlogSlugs.map((blogSlug) => blogPostBySlug(locale, blogSlug)).filter((post) => post !== undefined);
  const jsonLd = [
    { "@context": "https://schema.org", "@type": "DefinedTerm", name: entry.localizedTerm, alternateName: entry.term, description: entry.definition, url: absoluteUrl(`/learn/${entry.slug}`), inDefinedTermSet: absoluteUrl("/learn") },
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "Aigentra Trading", item: absoluteUrl("/") },
      { "@type": "ListItem", position: 2, name: copy.indexTitle, item: absoluteUrl("/learn") },
      { "@type": "ListItem", position: 3, name: entry.localizedTerm, item: absoluteUrl(`/learn/${entry.slug}`) },
    ] },
  ];

  return (
    <div data-testid="learn-article" className="blog-surface overflow-hidden">
      <article className="blog-article-frame">
        <div className="blog-article-rail">
          <EditorialHomeLink />
          <Link href="/learn" className="focus-ring blog-back-link"><ArrowLeft size={16} weight="bold" aria-hidden="true" />{copy.back}</Link>
          <header className="blog-article-header">
            <p className="blog-overline">{copy.category[entry.category]} · {copy.conceptNote}</p>
            <h1 className="blog-article-title">{entry.localizedTerm} {entry.localizedTerm !== entry.term ? <span className="learn-title-english">({entry.term})</span> : null}</h1>
            <p className="blog-article-deck">{entry.summary}</p>
            <p className="blog-article-meta">{copy.reviewed} {entry.updatedAt} · {copy.educational}</p>
          </header>
          <div className="blog-content-sections learn-content-sections">
            <section><h2 className="blog-section-title">{copy.definition}</h2><div className="blog-body-block"><p>{entry.definition}</p></div></section>
            <section><h2 className="blog-section-title">{copy.whyItMatters}</h2><div className="blog-body-block"><p>{entry.whyItMatters}</p></div></section>
            <section><h2 className="blog-section-title">{copy.calculation}</h2><div className="blog-body-block"><p className="learn-formula">{entry.formula}</p><p>{entry.workedExample}</p></div></section>
            <section><h2 className="blog-section-title">{copy.interpretation}</h2><ul className="blog-list blog-list--unordered">{entry.interpretation.map((item) => <li key={item}>{item}</li>)}</ul></section>
            <section><h2 className="blog-section-title">{copy.misconception}</h2><div className="blog-body-block"><p>{entry.misconception}</p></div></section>
            <aside className="blog-risk-note"><h2 className="blog-risk-title">{copy.risk}</h2><p className="blog-risk-body">{entry.riskNote}</p></aside>
            <section><h2 className="blog-section-title">{copy.source}</h2><p className="blog-body-block"><a className="learn-source-link" href={entry.source.url} rel="noreferrer" target="_blank">{entry.source.label}</a></p></section>
          </div>
        </div>
      </article>
      <EditorialActionPanel eyebrow={copy.takeActionEyebrow} title={copy.ctaTitle} body={copy.ctaBody} button={copy.ctaButton} />
      <section className="blog-read-next">
        <h2 className="blog-read-next-title">{copy.readNext}</h2>
        <div className="learn-related-grid">
          {relatedConcepts.map((item) => <Link key={item.slug} href={`/learn/${item.slug}`} className="focus-ring learn-related-link"><span>{item.localizedTerm}</span><ArrowRight size={16} aria-hidden="true" /></Link>)}
          {relatedBlogs.map((post) => <Link key={post.slug} href={`/blog/${post.slug}`} className="focus-ring learn-related-link"><span>{post.title}</span><ArrowRight size={16} aria-hidden="true" /></Link>)}
        </div>
      </section>
      <footer className="blog-footer-wrap"><LandingFooter copy={landingCopy(locale)} /></footer>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
    </div>
  );
}
