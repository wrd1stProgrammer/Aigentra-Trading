import type { NextConfig } from "next";

const DEFAULT_API_BASE_URL = "http://localhost:8000";
const EXTERNAL_API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL;

function externalApiRewriteDestination() {
  const baseUrl = EXTERNAL_API_BASE_URL.trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(baseUrl)) return null;
  return `${baseUrl}/:path*`;
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    const destination = externalApiRewriteDestination();
    return destination ? [{ source: "/backend-api/:path*", destination }] : [];
  }
};

export default nextConfig;
