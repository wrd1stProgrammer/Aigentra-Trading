import { blogArticleContent, visibleArticleBody } from "@/lib/blog-article-content";
import { blogPosts } from "@/lib/blog-posts";
import { learnEntries } from "@/lib/learn";
import { buildRssXml, type RssItem } from "@/lib/rss";
import { SITE_URL, absoluteUrl } from "@/lib/seo";

export const dynamic = "force-static";

function blogFeedItems(): readonly RssItem[] {
  return blogPosts("ko").flatMap((post) => {
    if (!post.publishedAt) return [];
    const content = blogArticleContent("ko", post);
    return [{
      title: post.title,
      link: absoluteUrl(`/blog/${post.slug}`),
      description: visibleArticleBody(post, content),
      publishedAt: post.publishedAt,
      category: "블로그",
    }];
  });
}

function learnFeedItems(): readonly RssItem[] {
  return learnEntries("ko").map((entry) => ({
    title: entry.localizedTerm,
    link: absoluteUrl(`/learn/${entry.slug}`),
    description: [
      entry.summary,
      entry.definition,
      entry.whyItMatters,
      entry.formula,
      entry.workedExample,
      ...entry.interpretation,
      entry.misconception,
      entry.riskNote,
    ].join("\n\n"),
    publishedAt: entry.updatedAt,
    category: "지식 허브",
  }));
}

export function GET(): Response {
  const items = [...blogFeedItems(), ...learnFeedItems()]
    .sort((left, right) => right.publishedAt.localeCompare(left.publishedAt));
  const updatedAt = items.reduce(
    (latest, item) => item.publishedAt > latest ? item.publishedAt : latest,
    "1970-01-01",
  );
  const xml = buildRssXml({
    title: "Aigentra Trading 블로그 및 지식 허브",
    link: SITE_URL,
    description: "AI 트레이더 리그, 모의 BTC 선물 거래, 위험관리와 트레이딩 개념을 설명하는 한국어 교육 콘텐츠입니다.",
    language: "ko-KR",
    updatedAt,
    items,
  });

  return new Response(xml, {
    headers: {
      "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
      "Content-Type": "application/rss+xml; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
