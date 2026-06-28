const DEFAULT_API_BASE_URL = "http://localhost:8000";
const EXTERNAL_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

type BackendApiContext = {
  params: Promise<{ path?: string[] }>;
};

export const dynamic = "force-dynamic";

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
  try {
    const response = await fetch(url, {
      method: request.method,
      headers: upstreamHeaders(request.headers),
      body: requestHasBody(request) ? await request.arrayBuffer() : undefined,
      cache: "no-store",
      redirect: "manual",
      signal: request.signal,
    });
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: downstreamHeaders(response.headers),
    });
  } catch (error) {
    if (isNavigationAbort(error)) {
      return Response.json({ error: "request_aborted" }, { status: 499 });
    }
    return Response.json({ error: "backend_proxy_failed" }, { status: 502 });
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

function isNavigationAbort(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return true;
  const code = typeof error === "object" && error !== null ? String((error as { code?: unknown }).code ?? "") : "";
  const message = error instanceof Error ? error.message : String(error ?? "");
  return code === "ECONNRESET" || /aborted|abort|socket hang up|ECONNRESET/i.test(message);
}
