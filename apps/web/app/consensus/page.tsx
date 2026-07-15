import type { Metadata } from "next";
import { ConsensusPageClient } from "@/components/consensus-page-client";
import { metadataForPath } from "@/lib/seo";

export const metadata: Metadata = metadataForPath("/consensus");

export default function ConsensusPage() {
  return <ConsensusPageClient />;
}
