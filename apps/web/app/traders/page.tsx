import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createNoindexMetadata } from "@/lib/seo";

export const metadata: Metadata = createNoindexMetadata("Trader Redirect", "/traders");

export default function TradersPage() {
  redirect("/leaderboard");
}
