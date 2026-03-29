import type { NextConfig } from "next";

const backendUrl = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

const nextConfig: any = {
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true },
  async rewrites() {
    return [
      {
        source: "/static/:path*",
        destination: `${backendUrl}/static/:path*`,
      },
      {
        source: "/api/:path*", // Optional, we can proxy API too later if we want, but let's stick to static for now.
        destination: `${backendUrl}/:path*`,
      }
    ];
  },
};

export default nextConfig;
