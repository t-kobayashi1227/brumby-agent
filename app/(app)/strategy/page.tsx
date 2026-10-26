import { redirect } from "next/navigation";

// 販売戦略の一覧は 2026-10-26 に物件一覧（/properties）へまとめた。古いリンクやブックマークのために移す
// 物件ごとのレポート（/strategy/[id]）はそのまま使う

export default function StrategyIndexPage() {
  redirect("/properties");
}
