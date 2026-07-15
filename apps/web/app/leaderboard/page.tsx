import type { Metadata } from "next";
import { LeaderboardPageClient } from "@/components/leaderboard-page-client";
import { metadataForPath } from "@/lib/seo";

export const metadata: Metadata = metadataForPath("/leaderboard");

export default function LeaderboardPage() {
  return <LeaderboardPageClient />;
}
