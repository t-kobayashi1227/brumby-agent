import type { Metadata } from "next";
import { Noto_Sans_JP } from "next/font/google";
import PrototypeNav from "./_components/PrototypeNav";
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
    "データ×AI×人の力で、不動産の「売れる」を実現する BRUMBY AI物件販売戦略のモックアップ",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" suppressHydrationWarning className={`${notoSansJP.variable} h-full antialiased`}>
      <body className="min-h-screen flex flex-col bg-canvas text-ink font-sans">
        <PrototypeNav />
        {children}
      </body>
    </html>
  );
}
