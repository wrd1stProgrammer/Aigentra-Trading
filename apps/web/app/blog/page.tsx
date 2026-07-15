import type { Metadata } from "next";
import { BlogIndexClient } from "@/components/blog/blog-index-client";
import { metadataForPath } from "@/lib/seo";

export const metadata: Metadata = metadataForPath("/blog");

export default function BlogPage() {
  return <BlogIndexClient />;
}
