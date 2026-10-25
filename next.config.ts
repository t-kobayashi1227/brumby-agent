import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen dev indicator so it doesn't show up during client demos.
  devIndicators: false,
  // 画像の最適化（/_next/image）はサーバーの中から画像を取りに行くため、Basic認証（proxy.ts）で止まってしまう
  // PoC では最適化せず、ブラウザが認証つきで public/ の画像を直接読む
  images: { unoptimized: true },
  // 物件の写真をフォーム（Server Action）で送る。ブラウザで縮めてから送るが、標準の上限 1MB を超えることがあるので広げる
  // （写真は 2.5MB まで受け付ける：lib/photos.ts。Vercel の関数のリクエストの上限 4.5MB より小さくする）
  experimental: { serverActions: { bodySizeLimit: "3mb" } },
  // トップの画面は持たない（見本のログイン画面は legacy/ に移した）。アクセス制限は Basic認証（proxy.ts、設計書 D5・D27）
  async redirects() {
    return [{ source: "/", destination: "/strategy", permanent: false }];
  },
};

export default nextConfig;
