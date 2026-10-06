import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen dev indicator so it doesn't show up during client demos.
  devIndicators: false,
  // トップ（見本のログイン画面）は使わない。アクセス制限は Basic認証（proxy.ts、設計書 D5・D27）
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
};

export default nextConfig;
