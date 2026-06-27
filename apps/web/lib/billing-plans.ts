import { z } from "zod";

export const BILLING_PLAN_KEYS = {
  monthly: "aigentra_pro_monthly",
  annual: "aigentra_pro_annual"
} as const;

export const billingPlanKeySchema = z.enum([BILLING_PLAN_KEYS.monthly, BILLING_PLAN_KEYS.annual]);

export type BillingPlanKey = z.infer<typeof billingPlanKeySchema>;

export function readBillingPlanKey(input: unknown): BillingPlanKey {
  const parsed = billingPlanKeySchema.safeParse(input);
  return parsed.success ? parsed.data : BILLING_PLAN_KEYS.monthly;
}
