"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useId, useState } from "react";
import { useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { CircleNotch, LockKey, Ticket, WarningCircle, X } from "@phosphor-icons/react";
import { useAppContext } from "@/components/app-provider";
import { shouldRenderProtectedGateChildren } from "@/lib/access-gate-policy";
import {
  isProtectedSourceUnlocked,
  subscriberAccessQueryKey,
  subscriberAccessQueryKeyPrefix,
  unlockProtectedSource,
  useSubscriberAccess,
  type SubscriberAccessState,
  type SubscriberUnlockResponse
} from "@/components/use-subscriber-access";

type ProtectedMode = "subscription" | "coupon";

type ProtectedContentGateProps = {
  readonly mode: ProtectedMode;
  readonly lockPlacement?: "content" | "viewport";
  readonly sourceKey?: string;
  readonly sourceType?: "scenario" | "review" | "trader_detail";
  readonly traderId?: string;
  readonly symbol?: string;
  readonly title?: string;
  readonly description?: string;
  readonly className?: string;
  readonly children: ReactNode;
  readonly onUnlocked?: (result: SubscriberUnlockResponse) => void;
  readonly iconOnly?: boolean;
  readonly deferLockedChildren?: boolean;
  readonly lockedPreview?: ReactNode;
};

export type SubscriberAccessQueryResult = UseQueryResult<SubscriberAccessState, Error>;

export function ProtectedContentGate({
  ...props
}: ProtectedContentGateProps) {
  const accessQuery = useSubscriberAccess();
  return <ProtectedContentGateContent {...props} accessQuery={accessQuery} />;
}

export function ProtectedContentGateWithAccess({
  accessQuery,
  ...props
}: ProtectedContentGateProps & { readonly accessQuery: SubscriberAccessQueryResult }) {
  return <ProtectedContentGateContent {...props} accessQuery={accessQuery} />;
}

function ProtectedContentGateContent({
  mode,
  lockPlacement = "content",
  sourceKey,
  sourceType = "scenario",
  traderId,
  symbol,
  title,
  description,
  className = "",
  children,
  onUnlocked,
  iconOnly = false,
  deferLockedChildren = false,
  lockedPreview = null,
  accessQuery
}: ProtectedContentGateProps & { readonly accessQuery: SubscriberAccessQueryResult }) {
  const { t } = useAppContext();
  const queryClient = useQueryClient();
  const access = accessQuery.data;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingChildren = shouldRenderProtectedGateChildren({ phase: "pending", deferLockedChildren }) ? children : lockedPreview;
  const lockedChildren = shouldRenderProtectedGateChildren({ phase: "locked", deferLockedChildren }) ? children : lockedPreview;

  if (!access) {
    return (
      <SubscriberAccessPending
        className={className}
        label={accessQuery.isError ? t("common.liveDataUnavailable") : t("common.loading")}
      >
        {pendingChildren}
      </SubscriberAccessPending>
    );
  }

  const unlocked =
    mode === "subscription"
      ? access.isSubscribed
      : isProtectedSourceUnlocked(access, sourceKey);
  if (unlocked) {
    return <div className={className}>{children}</div>;
  }

  const isCouponMode = mode === "coupon";
  const lockTitle = title ?? (isCouponMode ? t("access.reviewLockedTitle") : t("access.subscriptionLockedTitle"));
  const lockDescription = description ?? (isCouponMode ? t("access.reviewLockedDescription") : t("access.subscriptionLockedDescription"));

  const unlock = async () => {
    if (!sourceKey || mode !== "coupon") return;
    setUnlocking(true);
    setError(null);
    try {
      const result = await unlockProtectedSource({ sourceKey, sourceType, traderId, symbol });
      queryClient.setQueryData<SubscriberAccessState>(
        subscriberAccessQueryKey(result.access.userId, result.access.email),
        result.access
      );
      void queryClient.invalidateQueries({ queryKey: subscriberAccessQueryKeyPrefix });
      setDialogOpen(false);
      onUnlocked?.(result);
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "subscriber_access_failed";
      setError(message);
    } finally {
      setUnlocking(false);
    }
  };

  const lockContentClass =
    lockPlacement === "viewport"
      ? "transform fixed left-1/2 top-1/2 z-20 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2"
      : "transform absolute left-1/2 top-1/2 w-[min(28rem,calc(100%-2rem))] -translate-x-1/2 -translate-y-1/2";

  return (
    <div className={`relative rounded-2xl ${className}`}>
      <div className="pointer-events-none select-none overflow-hidden rounded-2xl">
        <div className="blur-[3px]">{lockedChildren}</div>
      </div>
      <button
        type="button"
        className={`focus-ring absolute inset-0 z-10 block rounded-2xl text-center text-white ${
          isCouponMode ? "bg-zinc-950/[0.56]" : "bg-zinc-950/[0.76]"
        }`}
        onClick={() => setDialogOpen(true)}
      >
        {isCouponMode ? (
          iconOnly ? (
            <span className="transform absolute left-1/2 top-1/2 inline-flex -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-emerald-400/25 bg-black/45 p-2 text-emerald-100 shadow-lg shadow-black/25">
              <Ticket size={15} weight="bold" />
            </span>
          ) : (
            <span className="transform absolute left-1/2 top-1/2 inline-flex max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 items-center gap-2 rounded-full border border-emerald-400/25 bg-black/45 px-3.5 py-2 text-xs font-bold text-emerald-100 shadow-lg shadow-black/25">
              <Ticket size={15} weight="bold" className="shrink-0" />
              <span className="truncate">{t("access.reviewInlineLocked")}</span>
            </span>
          )
        ) : (
          <span className={`${lockContentClass} flex flex-col items-center justify-center gap-2 px-5 py-4`}>
            <span className="grid size-10 place-items-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
              <LockKey size={19} weight="bold" />
            </span>
            <span className="text-sm font-bold text-pretty">{lockTitle}</span>
            <span className="max-w-[34ch] text-xs leading-5 text-zinc-300 text-pretty">{lockDescription}</span>
          </span>
        )}
      </button>
      {dialogOpen ? (
        <AccessDialog
          access={access}
          mode={mode}
          title={lockTitle}
          description={lockDescription}
          error={error}
          unlocking={unlocking}
          canUnlock={Boolean(sourceKey)}
          onClose={() => setDialogOpen(false)}
          onUnlock={() => void unlock()}
        />
      ) : null}
    </div>
  );
}

function SubscriberAccessPending({
  className,
  label,
  children
}: {
  readonly className: string;
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div data-testid="subscriber-access-pending" className={`relative rounded-2xl ${className}`}>
      <div className="pointer-events-none select-none overflow-hidden rounded-2xl opacity-80">
        {children}
      </div>
      <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-zinc-950/[0.42] text-zinc-300">
        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-black/55 px-3 py-2 text-xs font-semibold shadow-lg shadow-black/25">
          <CircleNotch size={14} weight="bold" className="animate-spin text-emerald-300" />
          <span>{label}</span>
        </span>
      </div>
    </div>
  );
}

function AccessDialog({
  access,
  mode,
  title,
  description,
  error,
  unlocking,
  canUnlock,
  onClose,
  onUnlock
}: {
  readonly access: SubscriberAccessState;
  readonly mode: ProtectedMode;
  readonly title: string;
  readonly description: string;
  readonly error: string | null;
  readonly unlocking: boolean;
  readonly canUnlock: boolean;
  readonly onClose: () => void;
  readonly onUnlock: () => void;
}) {
  const { t } = useAppContext();
  const titleId = useId();
  const descriptionId = useId();
  const isGuest = !access.email;
  const noCoupons = mode === "coupon" && access.couponsRemaining <= 0;
  const primaryLabel = isGuest
    ? t("access.signIn")
    : mode === "subscription" || noCoupons
      ? t("access.subscribeCta")
      : unlocking
        ? t("common.loading")
        : t("access.useCoupon");
  const primaryHref = isGuest ? "/login?next=/leaderboard" : "/";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4 py-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0c0f0d] p-5 text-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase text-emerald-300">{t("access.lockedLabel")}</p>
            <h2 id={titleId} className="mt-2 text-xl font-bold tracking-tight text-pretty">
              {title}
            </h2>
          </div>
          <button
            type="button"
            className="focus-ring grid size-9 shrink-0 place-items-center rounded-lg text-zinc-400 hover:bg-white/5 hover:text-white"
            onClick={onClose}
            aria-label={t("access.closeDialog")}
          >
            <X size={17} />
          </button>
        </div>

        <p id={descriptionId} className="mt-3 text-sm leading-6 text-zinc-300 text-pretty">
          {dialogDescription({ access, mode, description, t })}
        </p>

        {mode === "coupon" && !isGuest ? (
          <div className="mt-4 rounded-xl border border-emerald-400/20 bg-emerald-400/[0.08] p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold text-emerald-100">{t("access.remainingCoupons")}</span>
              <span className="font-mono text-lg font-bold text-emerald-200">
                {access.couponsRemaining}/{access.couponLimit}
              </span>
            </div>
            <p className="mt-1 text-xs leading-5 text-emerald-100/70">{t("access.couponCostHint")}</p>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 flex items-start gap-2 rounded-xl border border-rose-400/25 bg-rose-500/10 p-3 text-xs leading-5 text-rose-200">
            <WarningCircle size={15} className="mt-0.5 shrink-0" />
            {error === "review_coupon_limit_reached" ? t("access.noCouponsDescription") : t("access.unlockFailed")}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            className="focus-ring rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5 hover:text-white"
            onClick={onClose}
          >
            {t("access.cancel")}
          </button>
          {isGuest || mode === "subscription" || noCoupons ? (
            <Link
              href={primaryHref}
              className="focus-ring rounded-xl bg-white px-4 py-3 text-center text-sm font-bold text-zinc-950 hover:bg-zinc-100"
              onClick={onClose}
            >
              {primaryLabel}
            </Link>
          ) : (
            <button
              type="button"
              disabled={unlocking || !canUnlock}
              className="focus-ring rounded-xl bg-white px-4 py-3 text-sm font-bold text-zinc-950 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60"
              onClick={onUnlock}
            >
              {primaryLabel}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function dialogDescription({
  access,
  mode,
  description,
  t
}: {
  readonly access: SubscriberAccessState;
  readonly mode: ProtectedMode;
  readonly description: string;
  readonly t: (key: string) => string;
}) {
  if (!access.email) return t("access.signInDescription");
  if (mode === "subscription") return description;
  if (access.couponsRemaining <= 0) return t("access.noCouponsDescription");
  return t("access.useCouponDescription");
}
