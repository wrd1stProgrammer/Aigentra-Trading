import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { SITE_URL } from "@/lib/seo";

const CANONICAL_REDIRECT_HOSTS = new Set(["www.aigentratrading.com", "aigentra-trading.vercel.app"]);

export function middleware(request: NextRequest) {
  const usesLegacyBlogPrefix = request.nextUrl.pathname === "/BLOG" || request.nextUrl.pathname.startsWith("/BLOG/");
  const usesRedirectHost = CANONICAL_REDIRECT_HOSTS.has(request.nextUrl.hostname);
  if (!usesLegacyBlogPrefix && !usesRedirectHost) return NextResponse.next();

  const destination = usesRedirectHost ? new URL(`${request.nextUrl.pathname}${request.nextUrl.search}`, SITE_URL) : request.nextUrl.clone();
  if (usesLegacyBlogPrefix) destination.pathname = `/blog${request.nextUrl.pathname.slice(5)}`;
  return NextResponse.redirect(destination, 308);
}

export const config = {
  matcher: "/:path*",
};
