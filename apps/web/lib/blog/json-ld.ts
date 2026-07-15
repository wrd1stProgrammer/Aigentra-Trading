import { blogArticleContent, visibleArticleBody } from "@/lib/blog-article-content";
import { blogPostBySlug } from "@/lib/blog-posts";
import type { Locale } from "@/lib/i18n";

const languageTags: Record<Locale, string> = {
  en: "en",
  ko: "ko",
  ru: "ru",
  "pt-BR": "pt-BR",
  tr: "tr",
};

export function blogPostingJsonLd(locale: Locale, slug: string) {
  const post = blogPostBySlug(locale, slug);
  if (!post) return null;
  return {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    datePublished: post.publishedAt ?? post.date,
    dateModified: post.modifiedAt ?? post.publishedAt ?? post.date,
    inLanguage: languageTags[locale],
    mainEntityOfPage: `https://aigentratrading.com/blog/${slug}`,
    author: { "@type": "Organization", name: "Aigentra Trading" },
    publisher: { "@type": "Organization", name: "Aigentra Trading" },
    articleBody: visibleArticleBody(post, blogArticleContent(locale, post)),
    citation: post.sources?.map((source) => source.url),
  };
}
