import { z } from "zod";

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const PASSWORD_AUTH_TIMEOUT_MS = 8_000;

const passwordAccountSchema = z.object({
  userId: z.string().min(1),
  email: z.string().email(),
  name: z.string().min(1)
});

export type PasswordAccount = z.infer<typeof passwordAccountSchema>;

export class PasswordAuthApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 502) {
    super(message);
    this.name = "PasswordAuthApiError";
    this.status = status;
  }
}

export async function createPasswordAccount(input: {
  readonly name: string;
  readonly email: string;
  readonly password: string;
}): Promise<PasswordAccount> {
  return passwordAuthRequest("/signup", input);
}

export async function verifyPasswordAccount(input: {
  readonly email: string;
  readonly password: string;
}): Promise<PasswordAccount> {
  return passwordAuthRequest("/login", input);
}

async function passwordAuthRequest(path: "/signup" | "/login", body: object): Promise<PasswordAccount> {
  const apiUrl = passwordAuthApiUrl(path);
  if (!apiUrl) throw new PasswordAuthApiError("password_auth_unavailable", 503);

  const timeout = passwordAuthTimeoutSignal();
  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...subscriberApiHeaders() },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: timeout.signal
    });
    const responseBody: unknown = await safeJson(response);
    if (!response.ok) {
      throw new PasswordAuthApiError(readError(responseBody), response.status);
    }
    const parsed = passwordAccountSchema.safeParse(responseBody);
    if (!parsed.success) throw new PasswordAuthApiError("invalid_password_auth_response", 502);
    return parsed.data;
  } catch (error) {
    if (isAbortError(error)) throw new PasswordAuthApiError("password_auth_timeout", 504);
    throw error;
  } finally {
    timeout.clear();
  }
}

function passwordAuthApiUrl(path: "/signup" | "/login"): string | null {
  const baseUrl = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).trim();
  if (!baseUrl) return null;
  return new URL(`/api/auth/password${path}`, baseUrl).toString();
}

function subscriberApiHeaders(): Record<string, string> {
  const token = process.env.SUBSCRIBER_API_TOKEN?.trim();
  return token ? { "X-Subscriber-Api-Token": token } : {};
}

function passwordAuthTimeoutSignal(timeoutMs = PASSWORD_AUTH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort("password_auth_timeout"), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer)
  };
}

async function safeJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

function readError(input: unknown): string {
  if (typeof input !== "object" || input === null) return "password_auth_request_failed";
  if ("detail" in input && typeof input.detail === "string") return input.detail;
  if ("error" in input && typeof input.error === "string") return input.error;
  return "password_auth_request_failed";
}

function isAbortError(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /abort|timeout/i.test(message);
}
