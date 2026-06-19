"use client";

import { CircleNotch } from "@phosphor-icons/react";

export function PageLoadingOverlay({
  active,
  label,
  detail
}: {
  readonly active: boolean;
  readonly label: string;
  readonly detail?: string;
}) {
  if (!active) return null;

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/35 px-4 backdrop-blur-[3px]" role="status" aria-live="polite">
      <div className="flex min-w-[220px] max-w-sm flex-col items-center rounded-2xl border border-white/[0.12] bg-[#080b0a]/90 px-6 py-5 text-center text-white shadow-2xl shadow-black/30">
        <CircleNotch className="animate-spin text-emerald-300" size={30} weight="bold" />
        <p className="mt-3 text-sm font-bold tracking-tight">{label}</p>
        {detail ? <p className="mt-1 text-xs leading-5 text-zinc-400">{detail}</p> : null}
      </div>
    </div>
  );
}
