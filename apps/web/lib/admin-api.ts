import { z } from "zod";

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const ADMIN_API_TIMEOUT_MS = 6_000;

const adminDatabaseSchema = z.object({
  status: z.string(),
  dialect: z.string(),
  databaseUrl: z.string(),
  appEnv: z.string(),
  remoteDatabaseBlockedInLocal: z.boolean(),
  tableCount: z.number().int().nonnegative()
});

const adminTotalsSchema = z.object({
  subscribers: z.number().int().nonnegative(),
  activeSubscriptions: z.number().int().nonnegative(),
  telegramLinked: z.number().int().nonnegative(),
  reviewUnlocks: z.number().int().nonnegative(),
  tradeEvents24h: z.number().int().nonnegative(),
  apiErrors24h: z.number().int().nonnegative()
});

const adminPaperSchema = z.object({
  openOrders: z.number().int().nonnegative(),
  openPositions: z.number().int().nonnegative(),
  closedPositions: z.number().int().nonnegative(),
  openOrderNotional: z.number(),
  openPositionNotional: z.number(),
  openNotional: z.number(),
  openMargin: z.number(),
  unrealizedPnl: z.number()
});

const adminEventSchema = z.object({
  id: z.number().int(),
  createdAt: z.string().nullable(),
  traderId: z.string().nullable(),
  symbol: z.string().nullable(),
  status: z.string(),
  eventType: z.string(),
  price: z.number().nullable(),
  quantity: z.number().nullable(),
  realizedPnl: z.number().nullable()
});

const adminSubscriberSchema = z.object({
  id: z.number().int(),
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
  userId: z.string(),
  email: z.string(),
  subscriptionStatus: z.string(),
  telegramEnabled: z.boolean(),
  locale: z.string()
});

const adminApiCallSchema = z.object({
  id: z.number().int(),
  createdAt: z.string().nullable(),
  endpoint: z.string().nullable(),
  method: z.string().nullable(),
  status: z.string(),
  latencyMs: z.number().int().nullable(),
  errorMessage: z.string().nullable()
});

export const adminOverviewSchema = z.object({
  generatedAt: z.string(),
  database: adminDatabaseSchema,
  totals: adminTotalsSchema,
  paper: adminPaperSchema,
  recentEvents: z.array(adminEventSchema),
  recentSubscribers: z.array(adminSubscriberSchema),
  slowApiCalls: z.array(adminApiCallSchema),
  tables: z.array(z.string())
});

const adminCellSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const adminTableSchema = z.object({
  table: z.string(),
  columns: z.array(z.string()),
  total: z.number().int().nonnegative(),
  limit: z.number().int().positive(),
  offset: z.number().int().nonnegative(),
  rows: z.array(z.record(z.string(), adminCellSchema))
});

export type AdminOverview = z.infer<typeof adminOverviewSchema>;
export type AdminTableResult = z.infer<typeof adminTableSchema>;

export class AdminApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "AdminApiError";
    this.status = status;
  }
}

export async function loadAdminOverview(): Promise<AdminOverview> {
  const responseBody = await adminApiRequest("/api/admin/overview");
  const parsed = adminOverviewSchema.safeParse(responseBody);
  if (!parsed.success) throw new AdminApiError("invalid_admin_overview_response", 502);
  return parsed.data;
}

export async function loadAdminTable(table: string, offset = 0, limit = 25): Promise<AdminTableResult> {
  const url = new URL("/api/admin/table", adminApiBaseUrl());
  url.searchParams.set("table", table);
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));
  const responseBody = await adminApiRequest(url);
  const parsed = adminTableSchema.safeParse(responseBody);
  if (!parsed.success) throw new AdminApiError("invalid_admin_table_response", 502);
  return parsed.data;
}

async function adminApiRequest(pathOrUrl: string | URL): Promise<unknown> {
  const url = typeof pathOrUrl === "string" ? new URL(pathOrUrl, adminApiBaseUrl()) : pathOrUrl;
  const timeout = adminApiTimeoutSignal();
  try {
    const response = await fetch(url, {
      cache: "no-store",
      headers: adminApiHeaders(),
      signal: timeout.signal
    });
    const responseBody: unknown = await safeJson(response);
    if (!response.ok) throw new AdminApiError(readError(responseBody), response.status);
    return responseBody;
  } catch (error) {
    if (isAbortError(error)) throw new AdminApiError("admin_api_timeout", 504);
    throw error;
  } finally {
    timeout.clear();
  }
}

function adminApiBaseUrl(): string {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).trim();
  if (!baseUrl) throw new AdminApiError("admin_api_unavailable", 503);
  return baseUrl;
}

function adminApiHeaders(): Record<string, string> {
  const token = process.env.ADMIN_API_TOKEN?.trim();
  return token ? { "X-Admin-Api-Token": token } : {};
}

function adminApiTimeoutSignal(timeoutMs = ADMIN_API_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("admin_api_timeout"), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch (error) {
    if (error instanceof SyntaxError) return null;
    throw error;
  }
}

function readError(input: unknown): string {
  if (typeof input !== "object" || input === null || !("detail" in input)) return "admin_request_failed";
  return typeof input.detail === "string" ? input.detail : "admin_request_failed";
}

function isAbortError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /abort|timeout/i.test(message);
}
