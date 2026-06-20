"use client";

import { CheckCircle, Clock, CreditCard, ShieldCheck, WarningCircle } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import { z } from "zod";
import { useAppContext } from "@/components/app-provider";
import type { Locale } from "@/lib/i18n";

type BillingPanelState =
  | { readonly kind: "loading" }
  | { readonly kind: "ready"; readonly status: WhopSubscriptionStatus }
  | { readonly kind: "failed" };

const whopStatusSchema = z.object({
  status: z.enum(["none", "pending", "active", "inactive"]),
  checkoutStatus: z.string(),
  planKey: z.string().nullable(),
  planId: z.string().nullable(),
  checkoutId: z.string().nullable(),
  paymentId: z.string().nullable(),
  membershipId: z.string().nullable(),
  currency: z.string().nullable(),
  amount: z.number().nullable(),
  sandbox: z.boolean()
});

type WhopSubscriptionStatus = z.infer<typeof whopStatusSchema>;

const BILLING_COPY: Record<Locale, {
  readonly title: string;
  readonly subtitle: string;
  readonly loading: string;
  readonly failed: string;
  readonly secure: string;
  readonly statusLabel: string;
  readonly checkoutStatus: string;
  readonly lastAmount: string;
  readonly environment: string;
  readonly emptyAmount: string;
  readonly states: Record<WhopSubscriptionStatus["status"], {
    readonly label: string;
    readonly detail: string;
  }>;
}> = {
  ko: {
    title: "구독 상태",
    subtitle: "결제 시작은 홈의 PRICING 영역에서만 진행됩니다. 여기서는 현재 계정의 Whop 구독 상태만 확인합니다.",
    loading: "구독 상태 확인 중",
    failed: "구독 상태를 불러오지 못했습니다. 잠시 후 다시 확인해주세요.",
    secure: "카드 정보와 결제 처리는 Whop checkout에서 관리됩니다.",
    statusLabel: "현재 상태",
    checkoutStatus: "Whop 상태",
    lastAmount: "최근 결제",
    environment: "환경",
    emptyAmount: "기록 없음",
    states: {
      none: { label: "구독 없음", detail: "아직 이 계정으로 완료된 Whop 결제 기록이 없습니다." },
      pending: { label: "결제 확인 대기", detail: "checkout은 생성됐고 Whop 결제 완료 이벤트를 기다리는 중입니다." },
      active: { label: "구독 활성", detail: "Whop 결제 또는 멤버십 활성화 이벤트가 확인됐습니다." },
      inactive: { label: "구독 비활성", detail: "최근 결제가 실패했거나 멤버십이 종료된 상태입니다." }
    }
  },
  en: {
    title: "Subscription status",
    subtitle: "Checkout starts only from the PRICING section on the home page. This panel only reads the current Whop status for this account.",
    loading: "Checking subscription status",
    failed: "Could not load subscription status. Try again shortly.",
    secure: "Card details and payment processing are handled by Whop checkout.",
    statusLabel: "Current status",
    checkoutStatus: "Whop status",
    lastAmount: "Latest payment",
    environment: "Environment",
    emptyAmount: "No record",
    states: {
      none: { label: "No subscription", detail: "No completed Whop payment has been recorded for this account yet." },
      pending: { label: "Waiting for payment", detail: "A checkout exists and the Whop completion event has not arrived yet." },
      active: { label: "Subscription active", detail: "A Whop payment or membership activation event has been confirmed." },
      inactive: { label: "Subscription inactive", detail: "The latest billing state is failed, refunded, disputed, or deactivated." }
    }
  },
  ru: {
    title: "Статус подписки",
    subtitle: "Оплата запускается только из блока PRICING на главной странице. Здесь отображается текущий статус Whop для аккаунта.",
    loading: "Проверяем статус подписки",
    failed: "Не удалось загрузить статус подписки. Повторите попытку позже.",
    secure: "Данные карты и обработка платежа выполняются через checkout Whop.",
    statusLabel: "Текущий статус",
    checkoutStatus: "Статус Whop",
    lastAmount: "Последний платеж",
    environment: "Среда",
    emptyAmount: "Нет записи",
    states: {
      none: { label: "Нет подписки", detail: "Для этого аккаунта пока нет завершенного платежа Whop." },
      pending: { label: "Ожидает оплаты", detail: "Checkout создан, ожидаем событие завершения платежа от Whop." },
      active: { label: "Подписка активна", detail: "Платеж Whop или активация membership подтверждены." },
      inactive: { label: "Подписка неактивна", detail: "Последнее состояние: сбой, возврат, спор или деактивация." }
    }
  },
  "pt-BR": {
    title: "Status da assinatura",
    subtitle: "O checkout começa apenas na seção PRICING da página inicial. Este painel só lê o status Whop da conta atual.",
    loading: "Verificando assinatura",
    failed: "Não foi possível carregar o status da assinatura. Tente novamente em instantes.",
    secure: "Os dados do cartão e o processamento do pagamento ficam no checkout da Whop.",
    statusLabel: "Status atual",
    checkoutStatus: "Status Whop",
    lastAmount: "Último pagamento",
    environment: "Ambiente",
    emptyAmount: "Sem registro",
    states: {
      none: { label: "Sem assinatura", detail: "Ainda não há pagamento Whop concluído para esta conta." },
      pending: { label: "Aguardando pagamento", detail: "O checkout foi criado e ainda aguardamos o evento da Whop." },
      active: { label: "Assinatura ativa", detail: "Um pagamento Whop ou evento de ativação foi confirmado." },
      inactive: { label: "Assinatura inativa", detail: "O estado mais recente é falha, reembolso, disputa ou desativação." }
    }
  },
  tr: {
    title: "Abonelik durumu",
    subtitle: "Checkout yalnızca ana sayfadaki PRICING alanından başlar. Bu panel sadece hesabın Whop durumunu okur.",
    loading: "Abonelik durumu kontrol ediliyor",
    failed: "Abonelik durumu yüklenemedi. Biraz sonra tekrar deneyin.",
    secure: "Kart bilgileri ve ödeme işlemi Whop checkout tarafından yönetilir.",
    statusLabel: "Güncel durum",
    checkoutStatus: "Whop durumu",
    lastAmount: "Son ödeme",
    environment: "Ortam",
    emptyAmount: "Kayıt yok",
    states: {
      none: { label: "Abonelik yok", detail: "Bu hesap için tamamlanmış Whop ödemesi henüz yok." },
      pending: { label: "Ödeme bekleniyor", detail: "Checkout oluşturuldu ve Whop tamamlama olayı bekleniyor." },
      active: { label: "Abonelik aktif", detail: "Whop ödeme veya üyelik aktivasyon olayı doğrulandı." },
      inactive: { label: "Abonelik pasif", detail: "Son ödeme durumu başarısız, iade, itiraz veya devre dışı." }
    }
  },
};

export function WhopBillingPanel() {
  const { locale } = useAppContext();
  const copy = BILLING_COPY[locale];
  const [panelState, setPanelState] = useState<BillingPanelState>({ kind: "loading" });

  useEffect(() => {
    let mounted = true;

    async function loadStatus() {
      try {
        const response = await fetch("/api/billing/status", { cache: "no-store" });
        const status = response.ok ? readStatus(await response.json()) : null;
        if (!mounted) return;
        setPanelState(status ? { kind: "ready", status } : { kind: "failed" });
      } catch (error) {
        if (error instanceof Error) {
          if (mounted) setPanelState({ kind: "failed" });
          return;
        }
        throw error;
      }
    }

    void loadStatus();
    return () => {
      mounted = false;
    };
  }, []);

  const currentStatus = panelState.kind === "ready" ? panelState.status.status : "pending";
  const stateCopy = panelState.kind === "ready" ? copy.states[panelState.status.status] : null;

  return (
    <div data-testid="whop-billing-panel" className="panel border-zinc-200/80 p-4 dark:border-white/[0.08] dark:bg-[#0c0f0d] sm:p-6">
      <div className="flex items-start gap-3">
        <span className={`inline-flex size-10 shrink-0 items-center justify-center rounded-xl border ${statusTone(currentStatus)}`}>
          {statusIcon(currentStatus)}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold tracking-tight text-zinc-900 dark:text-white">{copy.title}</h2>
          <p className="mt-1 break-keep text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{copy.subtitle}</p>
        </div>
      </div>

      <div data-testid="whop-subscription-status" className="mt-4 rounded-xl border border-zinc-200/80 bg-zinc-50/60 p-4 dark:border-white/[0.06] dark:bg-[#070908]">
        {panelState.kind === "loading" ? (
          <StatusSkeleton label={copy.loading} />
        ) : panelState.kind === "failed" ? (
          <p className="flex items-start gap-2 break-keep text-xs leading-relaxed text-rose-600 dark:text-rose-300">
            <WarningCircle size={15} className="mt-0.5 shrink-0" />
            {copy.failed}
          </p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{copy.statusLabel}</p>
              <p className="mt-1 text-base font-bold text-zinc-950 dark:text-white">{stateCopy?.label}</p>
              <p className="mt-1 break-keep text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">{stateCopy?.detail}</p>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <StatusMetric label={copy.checkoutStatus} value={panelState.status.checkoutStatus} />
              <StatusMetric label={copy.lastAmount} value={formatAmount(panelState.status, copy.emptyAmount)} />
              <StatusMetric label={copy.environment} value={panelState.status.sandbox ? "sandbox" : "production"} />
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-zinc-200/80 bg-white p-3 text-[11px] leading-relaxed text-zinc-600 dark:border-white/[0.06] dark:bg-[#070908] dark:text-zinc-400">
        <ShieldCheck size={15} className="mt-0.5 shrink-0 text-emerald-500" />
        <span>{copy.secure}</span>
      </div>
    </div>
  );
}

function readStatus(input: unknown): WhopSubscriptionStatus | null {
  const parsed = whopStatusSchema.safeParse(input);
  return parsed.success ? parsed.data : null;
}

function statusTone(status: WhopSubscriptionStatus["status"]): string {
  switch (status) {
    case "active":
      return "border-emerald-500/20 bg-emerald-500/[0.06] text-emerald-500";
    case "pending":
      return "border-amber-500/20 bg-amber-500/[0.06] text-amber-500";
    case "inactive":
      return "border-rose-500/20 bg-rose-500/[0.06] text-rose-500";
    case "none":
      return "border-zinc-300/70 bg-zinc-100 text-zinc-500 dark:border-white/[0.08] dark:bg-white/[0.04]";
    default:
      return assertNever(status);
  }
}

function statusIcon(status: WhopSubscriptionStatus["status"]) {
  switch (status) {
    case "active":
      return <CheckCircle size={18} weight="bold" />;
    case "pending":
      return <Clock size={18} weight="bold" />;
    case "inactive":
      return <WarningCircle size={18} weight="bold" />;
    case "none":
      return <CreditCard size={18} weight="bold" />;
    default:
      return assertNever(status);
  }
}

function assertNever(status: never): never {
  throw new Error(`Unexpected billing status: ${status}`);
}

function formatAmount(status: WhopSubscriptionStatus, emptyAmount: string): string {
  if (status.amount === null || !status.currency) return emptyAmount;
  return `${status.currency.toUpperCase()} ${status.amount.toFixed(2)}`;
}

function StatusMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-lg border border-zinc-200/80 bg-white px-3 py-2 dark:border-white/[0.06] dark:bg-white/[0.03]">
      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-400">{label}</p>
      <p className="mt-1 truncate font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">{value}</p>
    </div>
  );
}

function StatusSkeleton({ label }: { readonly label: string }) {
  return (
    <div className="space-y-3">
      <p className="font-mono text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <div className="h-3 w-2/3 animate-pulse rounded-full bg-zinc-200 dark:bg-white/10" />
      <div className="h-3 w-1/2 animate-pulse rounded-full bg-zinc-200 dark:bg-white/10" />
    </div>
  );
}
