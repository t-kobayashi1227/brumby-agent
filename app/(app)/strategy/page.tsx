import Link from "next/link";
import { getSql } from "../../../lib/db";
import { btnPrimary, card, emptyState, tableHead } from "../../_lib/ui";

// 販売戦略の一覧。今は登録した物件の一覧だけ（段階5で、第1ターゲットや実行の状態などを足し、物件を選ぶと /strategy/[id] の詳細を開く）
// 見た目は前の設計の一覧（legacy/app/(app)/strategy/PropertyList.tsx）に合わせている

export const dynamic = "force-dynamic";

const COLS = "grid-cols-[1.1fr_2.6fr_0.7fr_0.9fr_0.8fr_1fr]";

export default async function StrategyListPage() {
  const rows = await getSql()<
    { id: string; code: string; property_class: string; address: string; price_man_yen: number; layout: string; location_source: string | null; created_at: Date }[]
  >`select id, code, property_class, address, price_man_yen, layout, location_source, created_at from properties order by id`;

  return (
    <div className="grid gap-4">
      <div className="flex items-center">
        <div className="text-[13px] text-body mr-auto">登録した物件 {rows.length}件</div>
        <Link href="/properties/new" className={btnPrimary}>
          物件情報を入力する
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className={emptyState}>物件がありません。「物件情報を入力する」から登録してください。</div>
      ) : (
        <div className={`${card} p-5`}>
          <div className={`${tableHead} ${COLS} text-[12px] text-muted`}>
            <div>物件ID</div>
            <div>住所</div>
            <div>区分</div>
            <div>価格</div>
            <div>間取り</div>
            <div>位置</div>
          </div>
          {rows.map((p) => (
            <Link key={p.id} href={`/properties/${p.id}`} className={`grid ${COLS} gap-2 px-1 py-3 border-b border-canvas text-[13px] text-ink hover:bg-subtle`}>
              <div className="font-bold">{p.code}</div>
              <div>{p.address}</div>
              <div>{p.property_class}</div>
              <div>{p.price_man_yen.toLocaleString("ja-JP")}万円</div>
              <div>{p.layout}</div>
              <div className={p.location_source ? "text-body" : "text-[#b91c1c]"}>{p.location_source ?? "位置なし"}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
