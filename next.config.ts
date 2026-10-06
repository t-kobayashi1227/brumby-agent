import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen dev indicator so it doesn't show up during client demos.
  devIndicators: false,
  // 画像の最適化（/_next/image）はサーバーの中から画像を取りに行くため、Basic認証（proxy.ts）で止まってしまう
  // PoC では最適化せず、ブラウザが認証つきで public/ の画像を直接読む
  images: { unoptimized: true },
  // トップ（見本のログイン画面）は使わない。アクセス制限は Basic認証（proxy.ts、設計書 D5・D27）
  async redirects() {
    return [{ source: "/", destination: "/dashboard", permanent: false }];
  },
};

export default nextConfig;
