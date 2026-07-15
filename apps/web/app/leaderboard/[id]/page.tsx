import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { TraderProfilePageClient } from "@/components/trader-profile-page-client";
import { metadataForTrader, sitemapTraderIds } from "@/lib/seo";
import { isTraderId } from "@/lib/traders";

type LeaderboardDetailPageProps = {
  readonly params: Promise<{ readonly id: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
  return sitemapTraderIds.map((id) => ({ id }));
}

export async function generateMetadata({ params }: LeaderboardDetailPageProps): Promise<Metadata> {
  const { id } = await params;
  if (!isTraderId(id)) notFound();
  return metadataForTrader(id);
}

export default async function LeaderboardDetailPage({ params }: LeaderboardDetailPageProps) {
  const { id } = await params;
  if (!isTraderId(id)) notFound();
  return <TraderProfilePageClient traderId={id} />;
}
