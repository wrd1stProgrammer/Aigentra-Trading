"use client";

import Link from "next/link";
import { useAppContext } from "@/components/app-provider";

export default function NotFound() {
  const { t } = useAppContext();

  return (
    <div className="panel p-8">
      <h1 className="text-2xl font-semibold tracking-tight">404</h1>
      <p className="mt-2 text-zinc-500">Trader not found.</p>
      <Link href="/traders" className="ghost-button mt-5">
        {t("nav.traders")}
      </Link>
    </div>
  );
}
