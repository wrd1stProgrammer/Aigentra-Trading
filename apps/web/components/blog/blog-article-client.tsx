"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  LinkSimple,
  LinkedinLogo,
  XLogo,
} from "@phosphor-icons/react";
import { BlogCard } from "@/components/blog/blog-card";
import { EditorialActionPanel } from "@/components/blog/editorial-action-panel";
import { EditorialHomeLink } from "@/components/blog/editorial-home-link";
import { BlogArticleMetadata } from "@/components/blog/blog-article-metadata";
import { LandingFooter } from "@/components/home-landing-visuals";
import { useAppContext } from "@/components/app-provider";
import { blogArticleContent } from "@/lib/blog-article-content";
import { blogEditorialLabels, copyTextWithSelection } from "@/lib/blog/article-ui";
import { blogIndexCopy, blogPostBySlug, relatedBlogPosts } from "@/lib/blog-posts";
import { landingCopy } from "@/lib/marketing-copy";

type BlogArticleClientProps = {
  readonly slug: string;
};

type CopyStatus = "idle" | "copied" | "manual";

const PRODUCT_METHODOLOGY_SLUGS: readonly string[] = [
  "ai-trader-league",
  "ai-trading-leaderboard",
  "paper-trading-vs-live-trading",
  "why-simulation-matters",
] as const;

export function BlogArticleClient({ slug }: BlogArticleClientProps) {
  const { locale } = useAppContext();
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const copy = blogIndexCopy[locale];
  const post = blogPostBySlug(locale, slug);
  const relatedPosts = relatedBlogPosts(locale, slug, 3);

  if (!post) return null;

  const content = blogArticleContent(locale, post);
  const canonicalUrl = `https://aigentratrading.com/blog/${slug}`;
  const shareText = encodeURIComponent(post.title);
  const shareUrl = encodeURIComponent(canonicalUrl);
  const copied = copyStatus === "copied";
  const editorialLabels = blogEditorialLabels[locale];

  function finishFallbackCopy() {
    setCopyStatus(copyTextWithSelection(canonicalUrl) ? "copied" : "manual");
  }

  function copyArticleLink() {
    const clipboardWrite = navigator.clipboard?.writeText(canonicalUrl);
    if (!clipboardWrite) {
      finishFallbackCopy();
      return;
    }

    void clipboardWrite.then(
      () => setCopyStatus("copied"),
      finishFallbackCopy,
    );
  }

  return (
    <div data-testid="blog-article" className="blog-surface overflow-hidden">
      <BlogArticleMetadata locale={locale} post={post} slug={slug} />
      <article className="blog-article-frame">
        <div className="blog-article-rail">
          <EditorialHomeLink />
          <Link
            href="/blog"
            className="focus-ring blog-back-link"
          >
            <ArrowLeft size={16} weight="bold" aria-hidden="true" />
            {copy.backToBlog}
          </Link>

          <header className="blog-article-header">
            <div className="blog-article-meta">
              <span className="blog-overline blog-overline--compact">{post.category}</span>
              <span>{post.date}</span>
              <span aria-hidden="true">·</span>
              <span>{post.readingTime}</span>
              <span aria-hidden="true">·</span>
              <span>Aigentra Trading</span>
            </div>
            <h1 className="blog-article-title">{post.title}</h1>
            <p className="blog-article-deck">{post.excerpt}</p>
          </header>

          <section className="blog-key-takeaways" aria-labelledby="key-takeaways-title">
            <h2 id="key-takeaways-title" className="blog-section-title">
              {copy.keyTakeaways}
            </h2>
            <ul className="blog-list blog-list--unordered">
              {post.takeaways.map((takeaway) => (
                <li key={takeaway}>{takeaway}</li>
              ))}
            </ul>
          </section>

          <hr className="blog-divider" />

          <div className="blog-content-sections">
            {content.sections.map((section) => (
              <section key={section.heading}>
                <h2 className="blog-section-title">{section.heading}</h2>
                <div className="blog-body-block">
                  {section.paragraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
                {section.bullets ? (
                  section.ordered ? (
                    <ol className="blog-list blog-list--ordered">
                      {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                    </ol>
                  ) : (
                    <ul className="blog-list blog-list--unordered">
                      {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                    </ul>
                  )
                ) : null}
              </section>
            ))}
          </div>

          <section className="blog-faq-section" aria-labelledby="article-faq-title">
            <h2 id="article-faq-title" className="blog-section-title">
              {content.faqTitle}
            </h2>
            <div className="blog-faq-list">
              {content.faq.map((item) => (
                <div key={item.question} className="blog-faq-item">
                  <h3 className="blog-faq-question">{item.question}</h3>
                  <p className="blog-faq-answer">{item.answer}</p>
                </div>
              ))}
            </div>
          </section>

          {post.methodologyDisclosure ? (
            <section className="blog-methodology-note">
              <h2 className="blog-section-title">{editorialLabels.methodology}</h2>
              <p className="blog-risk-body">{post.methodologyDisclosure}</p>
              {PRODUCT_METHODOLOGY_SLUGS.includes(slug) ? (
                <Link href="/methodology" className="focus-ring blog-source-link">
                  {locale === "ko" ? "Aigentra 성과 지표 계산 방법 보기" : "Read Aigentra's performance methodology"}
                </Link>
              ) : null}
            </section>
          ) : null}

          {post.sources?.length ? (
            <section className="blog-sources" aria-labelledby="article-sources-title">
              <h2 id="article-sources-title" className="blog-section-title">{editorialLabels.sources}</h2>
              <ul className="blog-list blog-list--unordered">
                {post.sources.map((source) => (
                  <li key={source.id}>
                    <a href={source.url} target="_blank" rel="noreferrer" className="focus-ring blog-source-link">
                      {source.title}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <aside className="blog-risk-note">
            <h2 className="blog-risk-title">{content.riskTitle}</h2>
            <p className="blog-risk-body">{post.riskNotice ?? content.riskBody}</p>
          </aside>

          <div className="blog-share-row">
            <div className="blog-share-layout">
              <p className="blog-share-title">{content.shareTitle}</p>
              <div className="blog-share-actions">
                <a
                  href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="X"
                  className="focus-ring blog-share-icon"
                >
                  <XLogo size={17} weight="bold" aria-hidden="true" />
                </a>
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="LinkedIn"
                  className="focus-ring blog-share-icon"
                >
                  <LinkedinLogo size={17} weight="bold" aria-hidden="true" />
                </a>
                <button
                  type="button"
                  onClick={copyArticleLink}
                  className="focus-ring blog-share-copy"
                >
                  {copied ? <Check size={16} weight="bold" aria-hidden="true" /> : <LinkSimple size={16} weight="bold" aria-hidden="true" />}
                  {copied ? content.copied : content.copyLink}
                </button>
              </div>
            </div>
            {copyStatus === "manual" ? (
              <div className="blog-manual-copy" role="status">
                <label htmlFor="manual-article-url" className="blog-manual-copy-label">
                  {content.manualCopyHint}
                </label>
                <input
                  id="manual-article-url"
                  value={canonicalUrl}
                  readOnly
                  onFocus={(event) => event.currentTarget.select()}
                  className="focus-ring blog-manual-copy-input"
                />
              </div>
            ) : null}
          </div>
        </div>
      </article>

      <EditorialActionPanel eyebrow={copy.takeActionEyebrow} title={copy.ctaTitle} body={copy.ctaBody} button={copy.ctaButton} />

      <section id="read-next" className="blog-read-next">
        <h2 className="blog-read-next-title">{copy.readNext}</h2>
        <div className="blog-card-grid blog-card-grid--related">
          {relatedPosts.map((relatedPost, index) => (
            <BlogCard
              key={relatedPost.slug}
              post={relatedPost}
              compact
              highlighted={index === 1}
              sequence={index + 1}
            />
          ))}
        </div>
      </section>

      <footer className="blog-footer-wrap">
        <LandingFooter copy={landingCopy(locale)} />
      </footer>
    </div>
  );
}
