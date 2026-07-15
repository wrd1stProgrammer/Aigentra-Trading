export function formatAdminNumber(value: number): string {
  return new Intl.NumberFormat("ko-KR").format(value);
}

export function formatAdminCurrency(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0, style: "currency", currency: "USD" }).format(value);
}

export function formatAdminDateTime(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export function formatAdminShortDate(value: string | null): string {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric", timeZone: "Asia/Seoul" }).format(new Date(value));
}

export function formatAdminCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}
