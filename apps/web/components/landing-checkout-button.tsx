"use client";

import { ArrowSquareOut, WarningCircle } from "@phosphor-icons/react";
import { useState, type ReactNode } from "react";
import { useAppContext } from "@/components/app-provider";

type CheckoutState = "idle" | "loading" | "failed";

type LandingCheckoutButtonProps = {
  readonly children: ReactNode;
  readonly className: string;
};

export function LandingCheckoutButton({ children, className }: LandingCheckoutButtonProps) {
  const { locale } = useAppContext();
  const [checkoutState, setCheckoutState] = useState<CheckoutState>("idle");

  async function startCheckout() {
    setCheckoutState("loading");
    try {
      const response = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locale }),
      });
      if (response.status === 401) {
        window.location.assign("/login?next=/");
        return;
      }
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
          Checkout could not be created. Please try again shortly.
        </p>
      ) : null}
    </div>
  );
}

function readPurchaseUrl(input: unknown): string {
  if (typeof input !== "object" || input === null || !("purchaseUrl" in input)) return "";
  return typeof input.purchaseUrl === "string" ? input.purchaseUrl : "";
}
