"use client";

import { ArrowRight, Brain, ChartLineUp, CheckCircle, ClipboardText, SlidersHorizontal } from "@phosphor-icons/react";
import { useAppContext } from "@/components/app-provider";

const steps = [
  { key: "flow.market", icon: ChartLineUp },
  { key: "flow.strategy", icon: SlidersHorizontal },
  { key: "flow.candidate", icon: ClipboardText },
  { key: "flow.review", icon: Brain },
  { key: "flow.plan", icon: CheckCircle }
];

export function FlowSteps() {
  const { t } = useAppContext();
  return (
    <div className="grid gap-3 md:grid-cols-[1fr_auto_1fr_auto_1fr_auto_1fr_auto_1fr]">
      {steps.map((step, index) => {
        const Icon = step.icon;
        return (
          <div key={step.key} className="contents">
            <div className="panel flex min-h-24 items-center gap-3 p-4">
              <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
                <Icon size={21} />
              </span>
              <span className="text-sm font-semibold">{t(step.key)}</span>
            </div>
            {index < steps.length - 1 ? (
              <div className="hidden items-center justify-center text-zinc-400 md:flex">
                <ArrowRight size={18} />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
