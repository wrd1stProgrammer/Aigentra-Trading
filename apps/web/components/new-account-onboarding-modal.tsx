"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Check, SpinnerGap } from "@phosphor-icons/react";
import { BrandMark } from "@/components/brand-mark";
import { translate, type Locale } from "@/lib/i18n";
import {
  subscriberOnboardingAnswersSchema,
  subscriberOnboardingStatusSchema,
  type SubscriberOnboardingAnswers
} from "@/lib/subscriber-onboarding";

const FOCUSABLE_SELECTOR = "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";

type StepDefinition = {
  readonly field: keyof SubscriberOnboardingAnswers;
  readonly titleKey: string;
  readonly descriptionKey: string;
  readonly options: readonly { readonly value: string; readonly labelKey: string }[];
};

const STEPS = [
  {
    field: "acquisitionSource",
    titleKey: "onboarding.discovery.title",
    descriptionKey: "onboarding.discovery.description",
    options: [
      { value: "search", labelKey: "onboarding.discovery.search" },
      { value: "tiktok", labelKey: "onboarding.discovery.tiktok" },
      { value: "instagram", labelKey: "onboarding.discovery.instagram" },
      { value: "threads", labelKey: "onboarding.discovery.threads" },
      { value: "referral", labelKey: "onboarding.discovery.referral" },
      { value: "other", labelKey: "onboarding.discovery.other" }
    ]
  },
  {
    field: "weeklyPositionFrequency",
    titleKey: "onboarding.frequency.title",
    descriptionKey: "onboarding.frequency.description",
    options: [
      { value: "none", labelKey: "onboarding.frequency.none" },
      { value: "one_two", labelKey: "onboarding.frequency.oneTwo" },
      { value: "three_five", labelKey: "onboarding.frequency.threeFive" },
      { value: "six_ten", labelKey: "onboarding.frequency.sixTen" },
      { value: "eleven_plus", labelKey: "onboarding.frequency.elevenPlus" }
    ]
  },
  {
    field: "primaryGoal",
    titleKey: "onboarding.goal.title",
    descriptionKey: "onboarding.goal.description",
    options: [
      { value: "compare_strategies", labelKey: "onboarding.goal.compare" },
      { value: "learn_trading", labelKey: "onboarding.goal.learn" },
      { value: "improve_risk", labelKey: "onboarding.goal.risk" },
      { value: "get_alerts", labelKey: "onboarding.goal.alerts" }
    ]
  },
  {
    field: "experienceLevel",
    titleKey: "onboarding.experience.title",
    descriptionKey: "onboarding.experience.description",
    options: [
      { value: "beginner", labelKey: "onboarding.experience.beginner" },
      { value: "intermediate", labelKey: "onboarding.experience.intermediate" },
      { value: "advanced", labelKey: "onboarding.experience.advanced" },
      { value: "professional", labelKey: "onboarding.experience.professional" }
    ]
  }
] as const satisfies readonly StepDefinition[];

type LoadState = "loading" | "ready" | "error";

export function NewAccountOnboardingModal({
  locale,
  onComplete
}: {
  readonly locale: Locale;
  readonly onComplete: () => void;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [stepIndex, setStepIndex] = useState(0);
  const [answers, setAnswers] = useState<Partial<SubscriberOnboardingAnswers>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const step = STEPS[stepIndex] ?? STEPS[0];
  const selectedValue = answers[step.field];

  const loadStatus = useCallback(async () => {
    setLoadState("loading");
    try {
      const response = await fetch("/api/subscriber/onboarding", { cache: "no-store" });
      if (!response.ok) {
        setLoadState("error");
        return;
      }
      const parsed = subscriberOnboardingStatusSchema.safeParse(await response.json());
      if (!parsed.success) {
        setLoadState("error");
        return;
      }
      if (parsed.data.completed) {
        onComplete();
        return;
      }
      setLoadState("ready");
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setLoadState("error");
    }
  }, [onComplete]);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeIndex < 0 || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, []);

  const submit = async () => {
    if (stepIndex < STEPS.length - 1) {
      setStepIndex((current) => current + 1);
      setSaveFailed(false);
      return;
    }
    const parsedAnswers = subscriberOnboardingAnswersSchema.safeParse(answers);
    if (!parsedAnswers.success) return;
    setIsSaving(true);
    setSaveFailed(false);
    try {
      const response = await fetch("/api/subscriber/onboarding", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsedAnswers.data)
      });
      setIsSaving(false);
      if (!response.ok) {
        setSaveFailed(true);
        return;
      }
      onComplete();
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      setIsSaving(false);
      setSaveFailed(true);
    }
  };

  const progressText = translate(locale, "onboarding.progress")
    .replace("{current}", String(stepIndex + 1))
    .replace("{total}", String(STEPS.length));

  return (
    <div className="animate-fade-in fixed inset-0 z-[75] flex items-start justify-center overflow-y-auto bg-black/80 px-3 py-4 backdrop-blur-lg motion-reduce:animate-none sm:items-center sm:px-4 sm:py-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={translate(locale, "onboarding.dialogLabel")}
        aria-labelledby={loadState === "ready" ? titleId : undefined}
        aria-describedby={loadState === "ready" ? descriptionId : undefined}
        tabIndex={-1}
        data-testid="new-account-onboarding-modal"
        className="animate-rise relative my-auto w-full max-w-[520px] overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-5 text-[var(--ink)] shadow-2xl outline-none motion-reduce:animate-none sm:px-8 sm:py-7"
      >
        {loadState === "loading" ? (
          <StatusPanel locale={locale} messageKey="onboarding.loading" spinning />
        ) : loadState === "error" ? (
          <StatusPanel locale={locale} messageKey="onboarding.loadError" action={loadStatus} />
        ) : (
          <>
            <div className="relative flex min-h-8 items-center justify-center">
              <BrandMark className="size-8" imageClassName="opacity-95" />
              <span className="absolute right-0 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--ink-soft)]">
                {progressText}
              </span>
            </div>
            <div className="mt-4 grid grid-cols-4 gap-2" role="progressbar" aria-valuemin={1} aria-valuemax={STEPS.length} aria-valuenow={stepIndex + 1} aria-label={progressText}>
              {STEPS.map((item, index) => (
                <span key={item.field} className={`h-1 rounded-full ${index <= stepIndex ? "bg-[var(--accent)]" : "bg-[var(--surface-muted)]"}`} />
              ))}
            </div>

            <div className="mx-auto mt-7 max-w-[430px] text-center sm:mt-9">
              <h2 id={titleId} className="break-keep text-2xl font-bold leading-[1.3] tracking-tight text-pretty sm:text-[30px]">
                {translate(locale, step.titleKey)}
              </h2>
              <p id={descriptionId} className="mt-3 break-keep text-sm leading-6 text-[var(--ink-muted)] text-pretty">
                {translate(locale, step.descriptionKey)}
              </p>
            </div>

            <fieldset className="mt-6 space-y-2.5" disabled={isSaving}>
              <legend className="sr-only">{translate(locale, "onboarding.selectionHint")}</legend>
              {step.options.map((option) => {
                const selected = selectedValue === option.value;
                return (
                  <label key={option.value} className={`focus-within:ring-2 focus-within:ring-[var(--focus)] focus-within:ring-offset-2 focus-within:ring-offset-[var(--surface)] flex min-h-12 cursor-pointer items-center justify-between gap-4 rounded-xl border px-4 py-3 text-sm font-semibold transition ${selected ? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--ink)]" : "border-[var(--border)] bg-[var(--surface-muted)] text-[var(--ink-muted)] hover:border-[var(--border-strong)] hover:text-[var(--ink)]"}`}>
                    <input
                      type="radio"
                      name={step.field}
                      value={option.value}
                      checked={selected}
                      onChange={() => setAnswers((current) => ({ ...current, [step.field]: option.value }))}
                      className="sr-only"
                    />
                    <span>{translate(locale, option.labelKey)}</span>
                    <span className={`grid size-5 shrink-0 place-items-center rounded-full border ${selected ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--app-bg)]" : "border-[var(--border-strong)]"}`}>
                      {selected ? <Check size={12} weight="bold" aria-hidden="true" /> : null}
                    </span>
                  </label>
                );
              })}
            </fieldset>

            {saveFailed ? <p role="alert" className="mt-4 text-center text-sm font-medium text-[var(--bad)]">{translate(locale, "onboarding.saveError")}</p> : null}

            <div className="mt-6 flex items-center gap-3">
              {stepIndex > 0 ? (
                <button type="button" onClick={() => setStepIndex((current) => Math.max(0, current - 1))} disabled={isSaving} className="focus-ring inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border)] px-4 text-sm font-bold text-[var(--ink-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--ink)] disabled:opacity-50">
                  <ArrowLeft size={16} weight="bold" aria-hidden="true" />
                  {translate(locale, "onboarding.back")}
                </button>
              ) : null}
              <button type="button" onClick={() => void submit()} disabled={!selectedValue || isSaving} className="focus-ring inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 text-sm font-bold text-[var(--app-bg)] transition hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-35">
                {isSaving ? <SpinnerGap size={17} className="animate-spin motion-reduce:animate-none" aria-hidden="true" /> : null}
                {isSaving ? translate(locale, "onboarding.saving") : translate(locale, stepIndex === STEPS.length - 1 ? "onboarding.finish" : "onboarding.continue")}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatusPanel({ locale, messageKey, spinning = false, action }: { readonly locale: Locale; readonly messageKey: string; readonly spinning?: boolean; readonly action?: () => void }) {
  return (
    <div className="grid min-h-[260px] place-items-center text-center">
      <div>
        {spinning ? <SpinnerGap size={26} className="mx-auto animate-spin text-[var(--accent)] motion-reduce:animate-none" aria-hidden="true" /> : null}
        <p role={spinning ? "status" : "alert"} className="mt-4 text-sm leading-6 text-[var(--ink-muted)]">{translate(locale, messageKey)}</p>
        {action ? <button type="button" onClick={action} className="focus-ring mt-5 min-h-12 rounded-xl bg-[var(--ink)] px-5 text-sm font-bold text-[var(--app-bg)]">{translate(locale, "onboarding.retry")}</button> : null}
      </div>
    </div>
  );
}
