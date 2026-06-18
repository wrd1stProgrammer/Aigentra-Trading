"use client";

import { Check } from "@phosphor-icons/react";
import { telegramReviewSections, type TelegramReviewSection } from "@/lib/subscriber-preferences";

type TelegramReviewSectionSettingsProps = {
  readonly enabled: boolean;
  readonly selectedSections: readonly TelegramReviewSection[];
  readonly title: string;
  readonly labels: Readonly<Record<TelegramReviewSection, string>>;
  readonly descriptions: Readonly<Record<TelegramReviewSection, string>>;
  readonly onToggle: (section: TelegramReviewSection) => void;
};

export function TelegramReviewSectionSettings({
  enabled,
  selectedSections,
  title,
  labels,
  descriptions,
  onToggle
}: TelegramReviewSectionSettingsProps) {
  return (
    <div className="space-y-2.5">
      <span className="block text-xs font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {title}
      </span>
      <div className="grid gap-2 sm:grid-cols-2">
        {telegramReviewSections.map((section) => {
          const isChecked = selectedSections.includes(section);
          return (
            <button
              key={section}
              type="button"
              disabled={!enabled}
              aria-pressed={isChecked}
              onClick={() => onToggle(section)}
              className={`focus-ring flex min-h-[84px] flex-col items-start justify-between rounded-lg border p-3.5 text-left transition duration-200 ${
                isChecked
                  ? "border-sky-500/30 bg-sky-500/[0.04] text-zinc-900 dark:text-zinc-100"
                  : "border-zinc-200 bg-white text-zinc-700 opacity-70 dark:border-white/[0.04] dark:bg-[#070908] dark:text-zinc-300"
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`inline-flex size-4 items-center justify-center rounded border ${
                    isChecked ? "border-sky-500 bg-sky-500 text-white" : "border-zinc-300 dark:border-white/10"
                  }`}
                >
                  {isChecked && <Check size={10} weight="bold" />}
                </span>
                <span className="text-xs font-bold">{labels[section]}</span>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-zinc-400 break-keep dark:text-zinc-500">
                {descriptions[section]}
              </p>
            </button>
          );
        })}
      </div>
    </div>
  );
}
