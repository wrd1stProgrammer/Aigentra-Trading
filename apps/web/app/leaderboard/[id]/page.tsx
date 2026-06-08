import { TraderProfilePageClient } from "@/components/trader-profile-page-client";

export default async function LeaderboardDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TraderProfilePageClient traderId={id} />;
}
