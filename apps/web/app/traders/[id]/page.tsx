import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { createNoindexMetadata } from "@/lib/seo";
import { isTraderId } from "@/lib/traders";

export const metadata: Metadata = createNoindexMetadata("Trader Redirect", "/traders");

export default async function TraderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isTraderId(id)) notFound();
  redirect(`/leaderboard/${id}`);
}
