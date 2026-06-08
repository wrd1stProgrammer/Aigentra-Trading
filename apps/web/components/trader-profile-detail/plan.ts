import type { PlanRecord, PlanView } from "@/components/trader-profile-detail/types";

export function normalizePlan(plan?: PlanRecord): PlanView {
  const payload = objectValue(plan?.payload);
  const source = { ...(plan ?? {}), ...payload };
  const entries = arrayValue(source.entries).map((entry) => {
    const row = objectValue(entry);
    return {
      price: firstFiniteNumber(row.price),
      weight: firstFiniteNumber(row.weight),
      reason: stringValue(row.reason) ?? "-"
    };
  });
  const takeProfits = arrayValue(source.takeProfits).map((target) => {
    const row = objectValue(target);
    return {
      price: firstFiniteNumber(row.price),
      weight: firstFiniteNumber(row.weight),
      reason: stringValue(row.reason) ?? "-"
    };
  });
  return {
    status: stringValue(source.status),
    side: stringValue(source.side),
    createdAt: stringValue(source.createdAt, source.created_at),
    riskPercent: firstFiniteNumber(source.riskPercent, source.risk_percent),
    leverage: firstFiniteNumber(source.leverage),
    stopLoss: firstFiniteNumber(source.stopLoss, source.stop_loss),
    orderStyle: stringValue(source.orderStyle, source.order_style),
    entries,
    takeProfits,
    notes: arrayValue(source.notes).map((item) => String(item)).filter(Boolean)
  };
}

function objectValue(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}

function arrayValue(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function stringValue(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstFiniteNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return null;
}
