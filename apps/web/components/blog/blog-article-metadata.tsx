"use client";

import { useEffect } from "react";
import { blogPostingJsonLd } from "@/lib/blog/json-ld";
import type { BlogPost } from "@/lib/blog-posts";
import type { Locale } from "@/lib/i18n";

type BlogArticleMetadataProps = {
  readonly locale: Locale;
  readonly post: BlogPost;
  readonly slug: string;
};

export function BlogArticleMetadata({ locale, post, slug }: BlogArticleMetadataProps) {
  const structuredData = blogPostingJsonLd(locale, slug);

  useEffect(() => {
    const title = `${post.title} | Aigentra Trading`;
    const syncDocumentMetadata = () => {
      document.documentElement.lang = locale;
      if (document.title !== title) document.title = title;
      const description = document.querySelector<HTMLMetaElement>('meta[name="description"]');
      if (description?.content !== post.excerpt) description?.setAttribute("content", post.excerpt);
    };
    syncDocumentMetadata();
    const observer = new MutationObserver(syncDocumentMetadata);
    observer.observe(document.head, { attributes: true, childList: true, subtree: true });
    return () => observer.disconnect();
  }, [locale, post.excerpt, post.title]);

  if (!structuredData) return null;
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replaceAll("<", "\\u003c") }}
    />
  );
}
