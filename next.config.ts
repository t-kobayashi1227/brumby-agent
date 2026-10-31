import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Hide the on-screen dev indicator so it doesn't show up during client demos.
  devIndicators: false,
  // 画像の最適化（/_next/image）はサーバーの中から画像を取りに行くため、Basic認証（proxy.ts）で止まってしまう
  // PoC では最適化せず、ブラウザが認証つきで public/ の画像を直接読む
  images: { unoptimized: true },
  // エージェントの指示文（prompts/）は実行時にファイルから読むので、戦略を作る API の関数に一緒に載せる（lib/agents/prompts.ts）
  outputFileTracingIncludes: { "/api/properties/*/strategy": ["./prompts/**"] },
  // トップの画面は持たず、物件一覧へ送る。アクセス制限は Basic認証（proxy.ts）
  async redirects() {
    return [{ source: "/", destination: "/properties", permanent: false }];
  },
};

export default nextConfig;
