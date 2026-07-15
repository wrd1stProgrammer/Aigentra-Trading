import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BlogArticleClient } from "@/components/blog/blog-article-client";
import { blogPostBySlug, blogSlugs } from "@/lib/blog-posts";
import { metadataForBlogPost } from "@/lib/seo";

type BlogArticlePageProps = {
  readonly params: Promise<{ readonly slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return blogSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: BlogArticlePageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!blogPostBySlug("en", slug)) notFound();
  return metadataForBlogPost(slug);
}

export default async function BlogArticlePage({ params }: BlogArticlePageProps) {
  const { slug } = await params;
  const post = blogPostBySlug("en", slug);

  if (!post) {
    notFound();
  }

  return <BlogArticleClient slug={slug} />;
}
