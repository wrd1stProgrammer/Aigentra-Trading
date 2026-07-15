"use client";

import Link from "next/link";
import { ArrowRight } from "@phosphor-icons/react";
import { BlogCard } from "@/components/blog/blog-card";
import { useAppContext } from "@/components/app-provider";
import { blogIndexCopy, blogPosts } from "@/lib/blog-posts";

export function BlogPreviewSection() {
  const { locale } = useAppContext();
  const copy = blogIndexCopy[locale];
  const previewPosts = blogPosts(locale).slice(0, 3);

  return (
    <section
      id="blog"
      data-testid="landing-blog"
      className="blog-surface blog-home-section overflow-hidden"
    >
      <div
        aria-hidden="true"
        className="blog-top-rule"
      />
      <div className="blog-content-rail">
        <div className="blog-hero-rail">
          <p className="blog-overline">{copy.eyebrow}</p>
          <h2 className="blog-display-title">{copy.title}</h2>
          <p className="blog-deck">{copy.subtitle}</p>
        </div>

        <div className="blog-card-grid blog-card-grid--preview">
          {previewPosts.map((post, index) => (
            <BlogCard key={post.slug} post={post} sequence={index + 1} />
          ))}
        </div>

        <div className="blog-preview-actions">
          <Link
            href="/blog"
            className="focus-ring blog-primary-action blog-primary-action--pill shadow-neon-emerald"
          >
            {copy.viewAll}
            <ArrowRight size={18} weight="bold" />
          </Link>
        </div>
      </div>
    </section>
  );
}
