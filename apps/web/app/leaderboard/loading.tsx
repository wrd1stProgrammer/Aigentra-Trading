export default function LeaderboardLoading() {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-[#080b0a]/90 px-4 text-white backdrop-blur-[3px]" role="status" aria-live="polite">
      <div className="flex min-w-[220px] max-w-sm flex-col items-center rounded-2xl border border-white/[0.12] bg-[#080b0a]/95 px-6 py-5 text-center shadow-2xl shadow-black/30">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-emerald-300/25 border-t-emerald-300" />
        <p className="mt-3 text-sm font-bold tracking-tight">Loading league data</p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">Syncing live market state.</p>
      </div>
    </div>
  );
}
