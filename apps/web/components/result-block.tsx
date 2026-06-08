export function ResultBlock({ title, data }: { title: string; data: unknown }) {
  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-950 p-4 text-zinc-100 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-zinc-400">{title}</div>
      <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap break-words font-mono text-xs leading-relaxed">
        {JSON.stringify(data, null, 2)}
      </pre>
    </div>
  );
}
