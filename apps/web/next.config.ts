import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/traders", destination: "/leaderboard", permanent: true },
      { source: "/traders/:id", destination: "/leaderboard/:id", permanent: true },
    ];
  },
};

export default nextConfig;
