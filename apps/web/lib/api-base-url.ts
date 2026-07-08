const LOCAL_API_BASE_URL = "http://localhost:8000";
const PRODUCTION_API_BASE_URL = "https://aigentra-trading.nostalgia-drive.com";

export function resolveExternalApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  if (configured) return stripTrailingSlash(configured);
  return stripTrailingSlash(isProductionRuntime() ? PRODUCTION_API_BASE_URL : LOCAL_API_BASE_URL);
}

function isProductionRuntime(): boolean {
  return process.env.VERCEL === "1" || process.env.VERCEL === "true" || process.env.NODE_ENV === "production";
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}
