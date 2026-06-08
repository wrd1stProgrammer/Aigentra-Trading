export function safeInternalPath(value: unknown, fallback = "/account"): string {
  if (typeof value !== "string") return fallback;

  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\") || /^[a-zA-Z][\w+.-]*:/.test(path)) {
    return fallback;
  }

  return path;
}
