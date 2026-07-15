import {
  holdingHorizonLabelKey,
  strategyFamilyLabelKey,
  type TradeClassification
} from "@/components/trade-classification";

export function TradeClassificationBadges({
  classification,
  t,
  compact = false,
  showHorizon = true
}: {
  readonly classification: TradeClassification | null;
  readonly t: (key: string) => string;
  readonly compact?: boolean;
  readonly showHorizon?: boolean;
}) {
  if (!classification) return null;
  const holdingLabel = t(holdingHorizonLabelKey(classification.holdingHorizon));
  const strategyLabel = t(strategyFamilyLabelKey(classification.strategyFamily));
  const visibleLabel = showHorizon ? `${holdingLabel} · ${strategyLabel}` : strategyLabel;
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded bg-[var(--surface-muted)] font-semibold leading-none text-[var(--ink-muted)] ring-1 ring-[var(--border)] ${
        compact ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-[11px]"
      }`}
      title={visibleLabel}
    >
      {visibleLabel}
    </span>
  );
}
