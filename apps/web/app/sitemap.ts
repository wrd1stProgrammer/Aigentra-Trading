import type { MetadataRoute } from "next";
import { blogSlugs } from "@/lib/blog-posts";
import { learnSlugs } from "@/lib/learn";
import { absoluteUrl, localizedHomeRoutes, publicRoutes, sitemapTraderIds } from "@/lib/seo";

export default function sitemap(): MetadataRoute.Sitemap {
  const staticRoutes = publicRoutes.map((route) => ({
    url: absoluteUrl(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority
  }));
  const localizedLandingRoutes = localizedHomeRoutes.map((route) => ({
    url: absoluteUrl(route.path),
    changeFrequency: route.changeFrequency,
    priority: route.priority
  }));
  const traderRoutes = sitemapTraderIds.map((id) => ({
    url: absoluteUrl(`/leaderboard/${id}`),
    changeFrequency: "daily" as const,
    priority: 0.78
  }));
  const blogRoutes = blogSlugs.map((slug) => ({
    url: absoluteUrl(`/blog/${slug}`),
    changeFrequency: "weekly" as const,
    priority: 0.72
  }));
  const learnRoutes = learnSlugs.map((slug) => ({
    url: absoluteUrl(`/learn/${slug}`),
    changeFrequency: "monthly" as const,
    priority: 0.74
  }));

  return [...staticRoutes, ...localizedLandingRoutes, ...traderRoutes, ...blogRoutes, ...learnRoutes];
}
