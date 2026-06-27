"use client";

import { ArrowSquareOut, WarningCircle } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { useAppContext } from "@/components/app-provider";
import type { BillingPlanKey } from "@/lib/billing-plans";

type CheckoutState = "idle" | "loading" | "failed";
const DEFAULT_CHECKOUT_ERROR = "Checkout could not be created. Please try again shortly.";

type LandingCheckoutButtonProps = {
  readonly children: ReactNode;
  readonly className: string;
  readonly planKey: BillingPlanKey;
};

export function LandingCheckoutButton({ children, className, planKey }: LandingCheckoutButtonProps) {
  const { locale } = useAppContext();
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");
  const [checkoutError, setCheckoutError] = useState(DEFAULT_CHECKOUT_ERROR);

  async function startCheckout() {
    setCheckoutState("loading");
    setCheckoutError(DEFAULT_CHECKOUT_ERROR);
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale, planKey }),
      });
      if (response.status === 401) {
        window.location.assign("/login?next=/");
        return;
      }
      if (!response.ok) {
        setCheckoutError(readCheckoutError(await response.json()));
        setCheckoutState("failed");
        return;
      }
      const purchaseUrl = readPurchaseUrl(await response.json());
      if (!purchaseUrl) {
        setCheckoutError("Checkout response did not include a purchase URL.");
        setCheckoutState("failed");
        return;
      }
      window.location.assign(purchaseUrl);
    } catch (error) {
      if (error instanceof Error) {
        setCheckoutState("failed");
        return;
      }
      throw error;
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={startCheckout}
        disabled={checkoutState === "loading"}
        className={`${className} disabled:cursor-not-allowed disabled:opacity-55`}
      >
        {checkoutState === "loading" ? "Checkout" : children}
        <ArrowSquareOut size={15} />
      </button>
      {checkoutState === "failed" ? (
          <p className="mt-3 flex items-start gap-1.5 break-keep text-[11px] leading-relaxed text-rose-300">
          <WarningCircle size={13} className="mt-0.5 shrink-0" />
          {checkoutError}
        </p>
      ) : null}
    </div>
  );
}

function readPurchaseUrl(input: unknown): string {
  if (typeof input !== "object" || input === null || !("purchaseUrl" in input)) return "";
  return typeof input.purchaseUrl === "string" ? input.purchaseUrl : "";
}

function readCheckoutError(input: unknown): string {
  if (typeof input !== "object" || input === null || !("error" in input)) return DEFAULT_CHECKOUT_ERROR;
  return typeof input.error === "string" && input.error.trim() ? input.error : DEFAULT_CHECKOUT_ERROR;
}
