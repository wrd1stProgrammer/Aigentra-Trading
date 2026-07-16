"use client";

import { CaretDown, CheckCircle, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { intlLocale } from "@/lib/format";
import type { Locale } from "@/lib/i18n";

type BillingStatus = {
  readonly status: "none" | "pending" | "active" | "inactive";
  readonly cancelAtPeriodEnd: boolean;
  readonly currentPeriodEnd: string | null;
};

const copy = {
  ko: {
    badge: "활성 구독",
    title: "구독 결제 관리",
    description: "취소해도 결제 기간까지 Pro 이용은 유지되고, 다음 결제부터 청구되지 않습니다.",
    cancel: "자동 갱신 취소",
    confirm: "다음 결제 취소 확정",
    back: "돌아가기",
    scheduled: "자동 갱신 취소 예약됨",
    retained: "현재 결제 기간까지 Pro 이용이 유지됩니다.",
    ends: "이용 종료 예정",
    loadError: "구독 정보를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.",
    cancelError: "취소 요청을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.",
    confirmHint: "확정하면 다음 달부터 결제되지 않으며, Pro 권한은 남은 기간까지 유지됩니다."
  },
  en: {
    badge: "Active subscription", title: "Manage subscription", description: "Canceling stops the next charge while Pro remains active through the period you already paid for.", cancel: "Cancel auto-renewal", confirm: "Confirm cancellation", back: "Go back", scheduled: "Auto-renewal canceled", retained: "Pro remains active through your current billing period.", ends: "Access ends", loadError: "We couldn't load your subscription. Try again shortly.", cancelError: "We couldn't complete the cancellation. Try again shortly.", confirmHint: "You won't be charged again. Your current Pro access remains available until the paid period ends."
  },
  ru: {
    badge: "Подписка активна", title: "Управление подпиской", description: "После отмены Pro останется доступен до конца оплаченного периода, а следующее списание не произойдёт.", cancel: "Отключить автопродление", confirm: "Подтвердить отмену", back: "Назад", scheduled: "Автопродление отключено", retained: "Pro доступен до конца текущего оплаченного периода.", ends: "Доступ до", loadError: "Не удалось загрузить данные подписки. Повторите попытку позже.", cancelError: "Не удалось отменить продление. Повторите попытку позже.", confirmHint: "Новых списаний не будет. Доступ Pro сохранится до конца оплаченного периода."
  },
  "pt-BR": {
    badge: "Assinatura ativa", title: "Gerenciar assinatura", description: "Ao cancelar, o Pro continua ativo até o fim do período pago e não haverá nova cobrança.", cancel: "Cancelar renovação automática", confirm: "Confirmar cancelamento", back: "Voltar", scheduled: "Renovação automática cancelada", retained: "O Pro permanece ativo até o fim do período já pago.", ends: "Acesso até", loadError: "Não foi possível carregar sua assinatura. Tente novamente em instantes.", cancelError: "Não foi possível concluir o cancelamento. Tente novamente em instantes.", confirmHint: "Não haverá nova cobrança. Seu acesso Pro continua até o fim do período pago."
  },
  tr: {
    badge: "Abonelik aktif", title: "Aboneliği yönet", description: "İptal sonrası Pro, ödenmiş dönem bitene kadar devam eder ve sonraki ödeme alınmaz.", cancel: "Otomatik yenilemeyi iptal et", confirm: "İptali onayla", back: "Geri dön", scheduled: "Otomatik yenileme iptal edildi", retained: "Pro erişimi mevcut ödeme dönemi bitene kadar devam eder.", ends: "Erişim bitişi", loadError: "Abonelik bilgileri yüklenemedi. Kısa süre sonra tekrar deneyin.", cancelError: "İptal işlemi tamamlanamadı. Kısa süre sonra tekrar deneyin.", confirmHint: "Tekrar ücret alınmaz. Pro erişiminiz ödenmiş dönem bitene kadar devam eder."
  }
} as const;

export function SubscriptionManagementDisclosure({
  locale,
  initialStatus = null
}: {
  readonly locale: Locale;
  readonly initialStatus?: BillingStatus | null;
}) {
  const text = copy[locale];
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<BillingStatus | null>(initialStatus);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const successRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);
  const [panelPosition, setPanelPosition] = useState({ left: 16, top: 0, width: 448 });

  const positionPanel = useCallback(() => {
    const button = buttonRef.current;
    if (!button) return;
    const rect = button.getBoundingClientRect();
    const width = Math.min(448, window.innerWidth - 32);
    const left = Math.max(16, Math.min(rect.right - width, window.innerWidth - width - 16));
    setPanelPosition({ left, top: rect.bottom + 12, width });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    positionPanel();
    if (status?.cancelAtPeriodEnd) successRef.current?.focus();
    else panelRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setConfirming(false);
      setOpen(false);
      buttonRef.current?.focus();
    };
    window.addEventListener("keydown", closeOnEscape);
    window.addEventListener("resize", positionPanel);
    window.addEventListener("scroll", positionPanel, true);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
      window.removeEventListener("resize", positionPanel);
      window.removeEventListener("scroll", positionPanel, true);
    };
  }, [open, positionPanel, status?.cancelAtPeriodEnd]);

  useEffect(() => {
    if (status?.cancelAtPeriodEnd) successRef.current?.focus();
  }, [status?.cancelAtPeriodEnd]);

  useEffect(() => {
    if (confirming) confirmButtonRef.current?.focus();
  }, [confirming]);

  useEffect(() => {
    if (!open || status || loading) return;
    setLoading(true);
    void fetch("/api/billing/status", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("status_failed");
        return response.json() as Promise<BillingStatus>;
      })
      .then(setStatus)
      .catch(() => setError(text.loadError))
      .finally(() => setLoading(false));
  }, [loading, open, status, text.loadError]);

  const cancel = async () => {
    setCanceling(true);
    setError("");
    try {
      const response = await fetch("/api/billing/cancel", { method: "POST" });
      if (!response.ok) throw new Error("cancel_failed");
      const result = await response.json() as BillingStatus;
      setStatus((current) => ({
        status: "active",
        cancelAtPeriodEnd: true,
        currentPeriodEnd: result.currentPeriodEnd ?? current?.currentPeriodEnd ?? null
      }));
      setConfirming(false);
    } catch {
      setError(text.cancelError);
    } finally {
      setCanceling(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="subscription-management-panel"
        onClick={() => setOpen((current) => {
          if (current) setConfirming(false);
          return !current;
        })}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-3 text-[10px] font-bold text-emerald-600 transition-colors hover:bg-emerald-500/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60 dark:text-emerald-400"
      >
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
        {text.badge}
        <CaretDown size={12} weight="bold" className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open ? createPortal(
        <section
          ref={panelRef}
          id="subscription-management-panel"
          tabIndex={-1}
          style={panelPosition}
          className="fixed z-50 rounded-2xl border border-zinc-200/80 bg-white p-4 shadow-xl shadow-black/5 outline-none dark:border-white/[0.1] dark:bg-[#0c0f0d] dark:shadow-black/30 sm:p-5"
        >
          <h2 className="text-sm font-bold text-zinc-900 dark:text-white">{text.title}</h2>
          {loading ? (
            <div className="mt-4 flex items-center gap-2 text-xs text-zinc-500"><SpinnerGap size={16} className="animate-spin" />{text.title}</div>
          ) : status?.cancelAtPeriodEnd ? (
            <div ref={successRef} role="status" aria-live="polite" tabIndex={-1} className="mt-3 rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 outline-none">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700 dark:text-emerald-400"><CheckCircle size={18} weight="fill" />{text.scheduled}</div>
              <p className="mt-2 break-keep text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{text.retained}</p>
              {status.currentPeriodEnd ? <p className="mt-2 font-mono text-[11px] text-zinc-600 dark:text-zinc-400">{text.ends} · {formatPeriodEnd(status.currentPeriodEnd, locale)}</p> : null}
            </div>
          ) : confirming ? (
            <div className="mt-3 rounded-xl border border-rose-500/20 bg-rose-500/[0.05] p-3">
              <p className="break-keep text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">{text.confirmHint}</p>
              <div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button type="button" onClick={() => setConfirming(false)} className="min-h-10 rounded-lg px-4 text-xs font-semibold text-zinc-600 hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 dark:text-zinc-300 dark:hover:bg-white/[0.06]">{text.back}</button>
                <button ref={confirmButtonRef} type="button" disabled={canceling} onClick={() => void cancel()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-rose-600 px-4 text-xs font-bold text-white hover:bg-rose-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400 disabled:cursor-wait disabled:opacity-60">{canceling ? <SpinnerGap size={15} className="animate-spin" /> : null}{text.confirm}</button>
              </div>
            </div>
          ) : (
            <div className="mt-3">
              <p className="break-keep text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">{text.description}</p>
              <button type="button" disabled={!status || status.status !== "active"} onClick={() => setConfirming(true)} className="mt-4 min-h-10 rounded-lg border border-zinc-300 px-4 text-xs font-semibold text-zinc-700 transition-colors hover:bg-zinc-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400/60 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/[0.06]">{text.cancel}</button>
            </div>
          )}
          {error ? <p role="alert" className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-rose-600 dark:text-rose-400"><WarningCircle size={15} className="mt-0.5 shrink-0" />{error}</p> : null}
        </section>,
        document.body
      ) : null}
    </div>
  );
}

function formatPeriodEnd(value: string, locale: Locale) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(intlLocale(locale), { year: "numeric", month: "long", day: "numeric" }).format(date);
}
