const DEFAULT_API_BASE_URL = "http://localhost:8000";
const EXTERNAL_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;
const BACKEND_PROXY_TIMEOUT_MS = Number(process.env.BACKEND_PROXY_TIMEOUT_MS ?? 20_000);
const BACKEND_PROXY_FAST_TIMEOUT_MS = Number(process.env.BACKEND_PROXY_FAST_TIMEOUT_MS ?? 8_000);
const BACKEND_PROXY_SLOW_TIMEOUT_MS = Number(process.env.BACKEND_PROXY_SLOW_TIMEOUT_MS ?? 55_000);

type BackendApiContext = {
  params: Promise<{ path?: string[] }>;
};

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request, context: BackendApiContext) {
  return proxyBackendRequest(request, context);
}

export async function POST(request: Request, context: BackendApiContext) {
  return proxyBackendRequest(request, context);
}

export async function PUT(request: Request, context: BackendApiContext) {
  return proxyBackendRequest(request, context);
}

export async function PATCH(request: Request, context: BackendApiContext) {
  return proxyBackendRequest(request, context);
}

export async function DELETE(request: Request, context: BackendApiContext) {
  return proxyBackendRequest(request, context);
}

async function proxyBackendRequest(request: Request, context: BackendApiContext) {
  const url = await upstreamUrl(request, context);
  const timeout = backendProxyTimeoutSignal(request.signal, backendProxyTimeoutMs(url));
  try {
    const response = await fetch(url, {
      method: request.method,
      headers: upstreamHeaders(request.headers),
      body: requestHasBody(request) ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: timeout.signal,
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: downstreamHeaders(response.headers),
    });
  } catch (error) {
    if (timeout.timedOut()) {
      return Response.json({ error: "backend_proxy_timeout" }, { status: 504 });
    }
    if (isNavigationAbort(error)) {
      return Response.json({ error: "request_aborted" }, { status: 499 });
    }
    return Response.json({ error: "backend_proxy_failed" }, { status: 502 });
  } finally {
    timeout.clear();
  }
}

async function upstreamUrl(request: Request, context: BackendApiContext) {
  const params = await Promise.resolve(context.params);
  const path = (params.path ?? []).map(encodeURIComponent).join("/");
  const source = new URL(request.url);
  const base = EXTERNAL_API_BASE_URL.trim().replace(/\/+$/, "");
  return `${base}/${path}${source.search}`;
}

function upstreamHeaders(headers: Headers) {
  const next = new Headers(headers);
  for (const key of ["host", "connection", "content-length", "accept-encoding"]) {
    next.delete(key);
  }
  return next;
}

function downstreamHeaders(headers: Headers) {
  const next = new Headers(headers);
  for (const key of ["content-encoding", "content-length", "transfer-encoding", "connection"]) {
    next.delete(key);
  }
  return next;
}

function requestHasBody(request: Request) {
  return !["GET", "HEAD"].includes(request.method.toUpperCase());
}

function backendProxyTimeoutMs(url: string) {
  if (/\/api\/league\/sentiment\/opinion\b/.test(url)) {
    return BACKEND_PROXY_SLOW_TIMEOUT_MS;
  }
  if (
    /\/api\/market\/klines\b/.test(url) ||
    /\/api\/paper\/equity-snapshots\b/.test(url) ||
    /\/api\/league\/traders\/[^/]+\/trade-history\b/.test(url) ||
    /\/api\/subscriber\/access\b/.test(url) ||
    /\/api\/subscribers\/access\b/.test(url)
  ) {
    return BACKEND_PROXY_FAST_TIMEOUT_MS;
  }
  return BACKEND_PROXY_TIMEOUT_MS;
}

function backendProxyTimeoutSignal(sourceSignal: AbortSignal, timeoutMs: number) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromSource = () => controller.abort(sourceSignal.reason);
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort("backend_proxy_timeout");
  }, Math.max(1, timeoutMs));
  if (sourceSignal.aborted) {
    abortFromSource();
  } else {
    sourceSignal.addEventListener("abort", abortFromSource, { once: true });
  }
  return {
    signal: controller.signal,
    timedOut: () => timedOut,
    clear: () => {
      clearTimeout(timer);
      sourceSignal.removeEventListener("abort", abortFromSource);
    }
  };
}

type ProxyErrorLike = {
  readonly code?: unknown;
  readonly name?: unknown;
  readonly message?: unknown;
  readonly cause?: unknown;
};

function collectProxyErrorSignals(error: unknown) {
  const signals: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;

  for (let depth = 0; depth < 6 && current !== null && current !== undefined && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current instanceof Error) {
      signals.push(current.name, current.message);
    }
    if (typeof current === "object") {
      const nested = current as ProxyErrorLike;
      if (nested.code) signals.push(String(nested.code));
      if (nested.name) signals.push(String(nested.name));
      if (nested.message) signals.push(String(nested.message));
      current = nested.cause;
      continue;
    }
    signals.push(String(current));
    break;
  }

  return signals;
}

function isNavigationAbort(error: unknown) {
  return collectProxyErrorSignals(error).some((signal) =>
    /aborted|abort|socket hang up|ECONNRESET|UND_ERR_SOCKET|terminated/i.test(signal)
  );
}
