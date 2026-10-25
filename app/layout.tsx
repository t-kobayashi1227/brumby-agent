import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import "./globals.css";

const notoSansJP = Noto_Sans_JP({
  variable: "--font-noto-sans-jp",
  weight: ["400", "500", "700", "900"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "BRUMBY AI物件販売戦略",
  description:
    "新潟市の戸建て1物件の情報から販売戦略レポートを作る BRUMBY AI物件販売戦略（PoC）",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" suppressHydrationWarning className={`${notoSansJP.variable} h-full antialiased`}>
      <body className="min-h-screen flex flex-col bg-canvas text-ink font-sans">
        {children}
      </body>
    </html>
  );
}
