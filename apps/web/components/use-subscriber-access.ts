"use client";

import { useQuery } from "@tanstack/react-query";
import { useSession } from "next-auth/react";
import { z } from "zod";

export const FREE_LEADERBOARD_LIMIT = 5;
const SUBSCRIBER_ACCESS_STALE_TIME_MS = 5 * 60_000;

const subscriberAccessSchema = z.object({
  userId: z.string().nullable(),
  email: z.string().nullable(),
  subscriptionStatus: z.enum(["none", "pending", "active", "inactive"]),
  isSubscribed: z.boolean(),
  couponLimit: z.number().int().nonnegative(),
  couponsUsed: z.number().int().nonnegative(),
  couponsRemaining: z.number().int().nonnegative(),
  unlockedSourceKeys: z.array(z.string())
});

const unlockResponseSchema = z.object({
  sourceKey: z.string(),
  sourceType: z.string(),
  unlocked: z.boolean(),
  charged: z.boolean(),
  access: subscriberAccessSchema
});

export type SubscriberAccessState = z.infer<typeof subscriberAccessSchema>;
export type SubscriberUnlockResponse = z.infer<typeof unlockResponseSchema>;

export const subscriberAccessQueryKeyPrefix = ["subscriber", "access"] as const;

export function subscriberAccessQueryKey(userId?: string | null, email?: string | null) {
  return [
    ...subscriberAccessQueryKeyPrefix,
    String(userId ?? "").trim(),
    String(email ?? "").trim().toLowerCase()
  ] as const;
}

export const guestSubscriberAccess: SubscriberAccessState = {
  userId: null,
  email: null,
  subscriptionStatus: "none",
  isSubscribed: false,
  couponLimit: 3,
  couponsUsed: 3,
  couponsRemaining: 0,
  unlockedSourceKeys: []
};

export function useSubscriberAccess() {
  const session = useSession();
  const userId = session.data?.user?.id ?? session.data?.user?.email ?? null;
  const email = session.data?.user?.email ?? null;
  const isAuthenticated = Boolean(email);
  return useQuery({
    queryKey: subscriberAccessQueryKey(userId, email),
    queryFn: () => (isAuthenticated ? readClientSubscriberAccess() : guestSubscriberAccess),
    enabled: session.status !== "loading",
    staleTime: SUBSCRIBER_ACCESS_STALE_TIME_MS,
    gcTime: 5 * 60_000,
    retry: false,
    placeholderData: isAuthenticated ? undefined : guestSubscriberAccess
  });
}

export function isProtectedSourceUnlocked(access: SubscriberAccessState, sourceKey: string | null | undefined) {
  if (access.isSubscribed) return true;
  if (!sourceKey) return false;
  return access.unlockedSourceKeys.includes(sourceKey);
}

export function protectedScenarioSourceKey(traderId: string, symbol: string, scenarioId: string) {
  return `scenario:${traderId}:${symbol}:${scenarioId}`;
}

export async function unlockProtectedSource(input: {
  readonly sourceKey: string;
  readonly sourceType: "scenario" | "review" | "trader_detail";
  readonly traderId?: string;
  readonly symbol?: string;
}): Promise<SubscriberUnlockResponse> {
  const response = await fetch("/api/subscriber/access/unlock", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input)
  });
  const body: unknown = await safeJson(response);
  if (!response.ok) {
    throw new SubscriberAccessClientError(readError(body), response.status);
  }
  const parsed = unlockResponseSchema.safeParse(body);
  if (!parsed.success) throw new SubscriberAccessClientError("invalid_unlock_response", 502);
  return parsed.data;
}

async function readClientSubscriberAccess(): Promise<SubscriberAccessState> {
  const response = await fetch("/api/subscriber/access", { cache: "no-store" });
  const body: unknown = await safeJson(response);
  if (response.status === 401) return guestSubscriberAccess;
  if (!response.ok) throw new SubscriberAccessClientError(readError(body), response.status);
  const parsed = subscriberAccessSchema.safeParse(body);
  if (!parsed.success) throw new SubscriberAccessClientError("invalid_subscriber_access_response", 502);
  return parsed.data;
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readError(input: unknown): string {
  if (typeof input !== "object" || input === null || !("error" in input)) return "subscriber_access_failed";
  return typeof input.error === "string" ? input.error : "subscriber_access_failed";
}

export class SubscriberAccessClientError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "SubscriberAccessClientError";
    this.status = status;
  }
}
