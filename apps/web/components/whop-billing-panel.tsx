"use client";

import { ArrowSquareOut, CreditCard, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useState } from "react";
import { useAppContext } from "@/components/app-provider";
import type { Locale } from "@/lib/i18n";

type CheckoutState = "idle" | "loading" | "failed";

const BILLING_COPY: Record<Locale, {
  readonly title: string;
  readonly subtitle: string;
  readonly secure: string;
  readonly action: string;
  readonly loading: string;
  readonly failed: string;
}> = {
  ko: {
    title: "Whop 구독 결제",
    subtitle: "구독 권한 분리는 다음 단계에서 붙이고, 지금은 안전한 Whop 결제 연결과 결제 기록만 활성화합니다.",
    secure: "카드 정보는 Whop checkout에서 처리됩니다.",
    action: "Whop에서 결제하기",
    loading: "결제 세션 생성 중",
    failed: "결제 세션을 만들지 못했습니다. 잠시 후 다시 시도하거나 운영자에게 알려주세요.",
  },
  en: {
    title: "Whop subscription checkout",
    subtitle: "Plan-based feature gating comes later. This step only enables secure Whop checkout and payment logging.",
    secure: "Card details are handled by Whop checkout.",
    action: "Pay with Whop",
    loading: "Creating checkout",
    failed: "Could not create a checkout session. Try again shortly or contact support.",
  },
  ru: {
    title: "Оплата подписки через Whop",
    subtitle: "Разделение функций по тарифам будет позже. Сейчас включаем безопасную оплату и журнал платежей.",
    secure: "Данные карты обрабатываются в checkout Whop.",
    action: "Оплатить через Whop",
    loading: "Создаем checkout",
    failed: "Не удалось создать checkout. Повторите попытку позже или обратитесь в поддержку.",
  },
  "pt-BR": {
    title: "Checkout da assinatura Whop",
    subtitle: "A divisão de recursos por plano vem depois. Agora ativamos o checkout seguro e o registro de pagamentos.",
    secure: "Os dados do cartão são processados pelo checkout da Whop.",
    action: "Pagar com Whop",
    loading: "Criando checkout",
    failed: "Não foi possível criar o checkout. Tente novamente em instantes ou fale com o suporte.",
  },
  tr: {
    title: "Whop abonelik ödemesi",
    subtitle: "Paket bazlı özellik ayrımı sonraki adımda gelecek. Şimdilik güvenli checkout ve ödeme kaydı aktif.",
    secure: "Kart bilgileri Whop checkout tarafından işlenir.",
    action: "Whop ile öde",
    loading: "Checkout oluşturuluyor",
    failed: "Checkout oluşturulamadı. Biraz sonra tekrar deneyin veya destekle iletişime geçin.",
  },
};

export function WhopBillingPanel() {
  const { locale } = useAppContext();
  const copy = BILLING_COPY[locale];
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");

  async function startCheckout() {
    setCheckoutState("loading");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (!response.ok) {
        setCheckoutState("failed");
        return;
      }
      const purchaseUrl = readPurchaseUrl(await response.json());
      if (!purchaseUrl) {
        setCheckoutState("failed");
        return;
      }
      window.location.assign(purchaseUrl);
    } catch {
      setCheckoutState("failed");
    }
  }

  return (
    <div data-testid="whop-billing-panel" className="panel border-zinc-200/80 p-4 dark:border-white/[0.08] dark:bg-[#0c0f0d] sm:p-6">
      <div className="flex items-start gap-3">
        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-500">
          <CreditCard size={18} weight="bold" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">{copy.title}</h2>
          <p className="mt-1 break-keep text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{copy.subtitle}</p>
        </div>
      </div>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-3 text-[11px] leading-relaxed text-zinc-600 dark:border-white/[0.06] dark:bg-[#070908] dark:text-zinc-400">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />
        <span>{copy.secure}</span>
      </div>
      <button
        type="button"
        onClick={startCheckout}
        disabled={checkoutState === "loading"}
        className="focus-ring mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--ink)] px-4 py-2.5 text-xs font-bold text-[var(--surface)] transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {checkoutState === "loading" ? copy.loading : copy.action}
        <ArrowSquareOut size={15} />
      </button>
      {checkoutState === "failed" ? (
        <p className="mt-3 flex items-start gap-1.5 break-keep text-[11px] leading-relaxed text-rose-600 dark:text-rose-300">
          <WarningCircle size={13} className="mt-0.5 shrink-0" />
          {copy.failed}
        </p>
      ) : null}
    </div>
  );
}

function readPurchaseUrl(input: unknown): string {
  if (typeof input !== "object" || input === null || !("purchaseUrl" in input)) return "";
  return typeof input.purchaseUrl === "string" ? input.purchaseUrl : "";
}
