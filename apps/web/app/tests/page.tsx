import type { Metadata } from "next";
import { TestsPageClient } from "@/components/tests-page-client";
import { createNoindexMetadata } from "@/lib/seo";

export const metadata: Metadata = createNoindexMetadata("Diagnostics", "/tests");

export default function TestsPage() {
  return <TestsPageClient />;
}
