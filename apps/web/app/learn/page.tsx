import type { Metadata } from "next";
import { LearnIndexClient } from "@/components/learn/learn-index-client";
import { metadataForPath } from "@/lib/seo";

export const metadata: Metadata = metadataForPath("/learn");

export default function LearnPage() {
  return <LearnIndexClient />;
}
