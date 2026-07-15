import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LearnEntryClient } from "@/components/learn/learn-entry-client";
import { learnEntryBySlug, learnSlugs } from "@/lib/learn";
import { metadataForLearnEntry } from "@/lib/seo";

type LearnEntryPageProps = { readonly params: Promise<{ readonly slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return learnSlugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: LearnEntryPageProps): Promise<Metadata> {
  const { slug } = await params;
  if (!learnEntryBySlug(slug)) notFound();
  return metadataForLearnEntry(slug);
}

export default async function LearnEntryPage({ params }: LearnEntryPageProps) {
  const { slug } = await params;
  if (!learnEntryBySlug(slug)) notFound();
  return <LearnEntryClient slug={slug} />;
}
