import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@electric-sql/pglite", "pg", "exceljs"],
  // Self-contained server bundle, used by the Windows desktop app.
  output: process.env.SHOPDESK_STANDALONE === "1" ? "standalone" : undefined,
  images: { unoptimized: true },
  experimental: { serverActions: { bodySizeLimit: "200mb" } },
};

export default nextConfig;
