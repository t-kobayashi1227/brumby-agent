import Link from "next/link";
import { emptyState } from "../../../_lib/ui";

// ⑤販売戦略レポート（docs/設計まとめ.md「⑤画面の表示」）。「エリア分析・販売戦略・根拠データ」の3タブは段階5で作る

export default async function StrategyDetailPage({ params }: PageProps<"/strategy/[id]">) {
  const { id } = await params;
  return (
    <>
      <Link href="/strategy" className="inline-block mb-3 text-xs text-brand underline">
        ← 販売戦略の一覧に戻る
      </Link>
      <div className={emptyState}>物件 {id} の販売戦略レポートは、段階5で作ります。</div>
    </>
  );
}
