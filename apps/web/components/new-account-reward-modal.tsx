"use client";

import { Gift, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef } from "react";
import type { Locale } from "@/lib/i18n";

type RewardCopy = {
  readonly eyebrow: string;
  readonly title: string;
  readonly unit: string;
  readonly description: string;
  readonly balance: string;
  readonly usage: string;
  readonly cta: string;
  readonly close: string;
};

const REWARD_COPY: Record<Locale, RewardCopy> = {
  ko: {
    eyebrow: "가입 축하 보상",
    title: "무료 보기 3회가 도착했습니다",
    unit: "회",
    description: "구독 전에도 AI 트레이더의 상세 시나리오와 리뷰를 확인해 보세요.",
    balance: "남은 무료 보기",
    usage: "상세 리뷰 1건을 열람할 때 1회가 사용됩니다.",
    cta: "무료 보기 시작하기",
    close: "가입 보상 닫기"
  },
  en: {
    eyebrow: "WELCOME REWARD",
    title: "Your 3 free views are ready",
    unit: "views",
    description: "Explore detailed AI trader scenarios and reviews before subscribing.",
    balance: "Free views remaining",
    usage: "One view is used whenever you unlock a detailed review.",
    cta: "Start exploring",
    close: "Close welcome reward"
  },
  ru: {
    eyebrow: "ПОДАРОК ЗА РЕГИСТРАЦИЮ",
    title: "Вам доступны 3 бесплатных просмотра",
    unit: "раза",
    description: "Откройте подробные сценарии и обзоры ИИ-трейдеров до оформления подписки.",
    balance: "Осталось просмотров",
    usage: "Один просмотр списывается при открытии подробного обзора.",
    cta: "Начать просмотр",
    close: "Закрыть подарок"
  },
  "pt-BR": {
    eyebrow: "RECOMPENSA DE BOAS-VINDAS",
    title: "Você recebeu 3 visualizações grátis",
    unit: "vezes",
    description: "Explore cenários e análises detalhadas dos traders de IA antes de assinar.",
    balance: "Visualizações restantes",
    usage: "Uma visualização é usada ao abrir uma análise detalhada.",
    cta: "Começar a explorar",
    close: "Fechar recompensa"
  },
  tr: {
    eyebrow: "HOŞ GELDİN ÖDÜLÜ",
    title: "3 ücretsiz görüntüleme hazır",
    unit: "kez",
    description: "Abone olmadan önce AI yatırımcı senaryolarını ve incelemelerini keşfedin.",
    balance: "Kalan ücretsiz görüntüleme",
    usage: "Her ayrıntılı inceleme açıldığında bir hak kullanılır.",
    cta: "Keşfetmeye başla",
    close: "Hoş geldin ödülünü kapat"
  }
};

const REWARD_SLOTS = [0, 1, 2] as const;
const FOCUSABLE_SELECTOR = "button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])";

export function NewAccountRewardModal({
  locale,
  couponCount,
  onClose
}: {
  readonly locale: Locale;
  readonly couponCount: number;
  readonly onClose: () => void;
}) {
  const copy = REWARD_COPY[locale];
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      const nextIndex = event.shiftKey
        ? activeIndex <= 0
          ? focusable.length - 1
          : activeIndex - 1
        : activeIndex < 0 || activeIndex === focusable.length - 1
          ? 0
          : activeIndex + 1;
      event.preventDefault();
      focusable[nextIndex]?.focus();
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  return (
    <div
      className="animate-fade-in fixed inset-0 z-[70] flex flex-col items-center justify-start overflow-y-auto bg-black/75 px-4 py-6 backdrop-blur-md motion-reduce:animate-none"
    >
      <button
        type="button"
        tabIndex={-1}
        aria-label={copy.close}
        onClick={onClose}
        className="fixed inset-0 cursor-default"
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-testid="new-account-reward-modal"
        className="animate-rise relative z-10 my-auto w-full max-w-[440px] shrink-0 overflow-hidden rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-5 pb-5 pt-6 text-center text-[var(--ink)] shadow-2xl outline-none motion-reduce:animate-none sm:px-8 sm:pb-8 sm:pt-8 [@media(max-height:640px)]:!my-0"
      >
        <button
          type="button"
          onClick={onClose}
          className="focus-ring absolute right-3 top-3 grid size-10 place-items-center rounded-xl text-[var(--ink-soft)] transition hover:bg-[var(--surface-muted)] hover:text-[var(--ink)] sm:right-4 sm:top-4"
          aria-label={copy.close}
        >
          <X size={18} weight="bold" />
        </button>

        <div className="mx-auto grid size-16 place-items-center rounded-2xl border border-emerald-300/20 bg-emerald-400/10 text-[var(--accent)] sm:size-[72px]">
          <Gift size={32} weight="duotone" aria-hidden="true" />
        </div>

        <p className="mt-5 font-mono text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--accent)]">
          {copy.eyebrow}
        </p>
        <h2 id={titleId} className="mt-2 break-keep text-2xl font-bold leading-[1.3] tracking-tight text-pretty sm:text-[32px]">
          {copy.title}
        </h2>

        <div className="mt-5 flex items-end justify-center gap-2" aria-label={`${couponCount} ${copy.unit}`}>
          <span className="font-mono text-6xl font-black leading-none text-[var(--terminal-ink)] sm:text-7xl">
            {couponCount}
          </span>
          <span className="mb-1.5 text-sm font-bold text-[var(--ink-muted)]">{copy.unit}</span>
        </div>

        <p id={descriptionId} className="mx-auto mt-4 max-w-[340px] break-keep text-sm leading-6 text-[var(--ink-muted)] text-pretty">
          {copy.description}
        </p>

        <div className="mt-6 rounded-xl border border-[var(--border)] bg-[var(--surface-muted)] p-4 text-left">
          <div className="flex items-center justify-between gap-4">
            <span className="text-xs font-semibold text-[var(--ink-muted)]">{copy.balance}</span>
            <span className="font-mono text-base font-bold text-[var(--accent)]">
              {couponCount} / {couponCount}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2" role="img" aria-label={`${copy.balance} ${couponCount} / ${couponCount}`}>
            {REWARD_SLOTS.map((slot) => (
              <span key={slot} className="h-1.5 rounded-full bg-[var(--accent)]" />
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          className="focus-ring mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[var(--ink)] px-5 py-3 text-sm font-bold text-[var(--app-bg)] transition hover:opacity-90 active:scale-[0.99]"
        >
          {copy.cta}
        </button>
        <p className="mt-3 text-xs leading-5 text-[var(--ink-soft)]">{copy.usage}</p>
      </div>
    </div>
  );
}
