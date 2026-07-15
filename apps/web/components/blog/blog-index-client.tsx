"use client";

import { BlogCard } from "@/components/blog/blog-card";
import { EditorialHomeLink } from "@/components/blog/editorial-home-link";
import { LandingFooter } from "@/components/home-landing-visuals";
import { useAppContext } from "@/components/app-provider";
import { blogIndexCopy, blogPosts } from "@/lib/blog-posts";
import { landingCopy } from "@/lib/marketing-copy";

export function BlogIndexClient() {
  const { locale } = useAppContext();
  const copy = blogIndexCopy[locale];
  const posts = blogPosts(locale);

  return (
    <div data-testid="blog-index" className="blog-surface overflow-hidden">
      <section className="blog-index-section">
        <EditorialHomeLink />
        <div className="blog-hero-rail">
          <p className="blog-overline">{copy.eyebrow}</p>
          <h1 className="blog-display-title">{copy.allArticlesTitle}</h1>
          <p className="blog-deck">{copy.allArticlesSubtitle}</p>
        </div>

        <div className="blog-card-grid blog-card-grid--index">
          {posts.map((post, index) => (
            <BlogCard key={post.slug} post={post} sequence={index + 1} />
          ))}
        </div>
      </section>

      <footer className="blog-footer-wrap">
        <LandingFooter copy={landingCopy(locale)} />
      </footer>
    </div>
  );
}
