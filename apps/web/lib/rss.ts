export type RssItem = {
  readonly title: string;
  readonly link: string;
  readonly description: string;
  readonly publishedAt: string;
  readonly category: string;
};

export type RssFeed = {
  readonly title: string;
  readonly link: string;
  readonly description: string;
  readonly language: string;
  readonly updatedAt: string;
  readonly items: readonly RssItem[];
};

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function rssDate(date: string): string {
  return new Date(`${date}T00:00:00+09:00`).toUTCString();
}

export function buildRssXml(feed: RssFeed): string {
  const items = feed.items.map((item) => [
    "    <item>",
    `      <title>${escapeXml(item.title)}</title>`,
    `      <link>${escapeXml(item.link)}</link>`,
    `      <guid isPermaLink="true">${escapeXml(item.link)}</guid>`,
    `      <description>${escapeXml(item.description)}</description>`,
    `      <pubDate>${rssDate(item.publishedAt)}</pubDate>`,
    `      <category>${escapeXml(item.category)}</category>`,
    "    </item>",
  ].join("\n")).join("\n");

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0">',
    "  <channel>",
    `    <title>${escapeXml(feed.title)}</title>`,
    `    <link>${escapeXml(feed.link)}</link>`,
    `    <description>${escapeXml(feed.description)}</description>`,
    `    <language>${escapeXml(feed.language)}</language>`,
    `    <lastBuildDate>${rssDate(feed.updatedAt)}</lastBuildDate>`,
    `    <generator>Aigentra Trading</generator>`,
    items,
    "  </channel>",
    "</rss>",
    "",
  ].join("\n");
}
