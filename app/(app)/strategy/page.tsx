import Link from "next/link";
import { getSql } from "../../../lib/db";
import { btnPrimary, card, emptyState, tableHead } from "../../_lib/ui";

// 販売戦略の一覧。物件ごとに戦略の状態（未実行／実行中／完了／失敗）と第1ターゲットを出し、行を押すと /strategy/[id] のレポートを開く
// 見た目は前の設計の一覧（legacy/app/(app)/strategy/PropertyList.tsx）に合わせている

export const dynamic = "force-dynamic";

const COLS = "grid-cols-[1.1fr_2.4fr_0.6fr_0.9fr_0.8fr_0.8fr_1.3fr]";

const STATUS: Record<string, { label: string; className: string }> = {
  queued: { label: "実行中", className: "text-primary font-bold" },
  running: { label: "実行中", className: "text-primary font-bold" },
  succeeded: { label: "完了", className: "text-[#157347] font-bold" },
  failed: { label: "失敗", className: "text-[#b91c1c] font-bold" },
};

export default async function StrategyListPage() {
  const rows = await getSql()<
    {
      id: string;
      code: string;
      property_class: string;
      address: string;
      price_man_yen: number;
      layout: string;
      created_at: Date;
      status: string | null;
      first_target: string | null;
    }[]
  >`
    select p.id, p.code, p.property_class, p.address, p.price_man_yen, p.layout, p.created_at, r.status,
      (select done.result -> '戦略' -> 'targets' -> 0 ->> 'name' from strategy_runs done
        where done.property_id = p.id and done.status = 'succeeded' and done.form = '3回' order by done.finished_at desc limit 1) as first_target
    from properties p
    left join lateral (select status from strategy_runs where property_id = p.id order by created_at desc limit 1) r on true
    order by p.id
  `;

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
            <div>戦略</div>
            <div>第1ターゲット</div>
          </div>
          {rows.map((p) => (
            <Link key={p.id} href={`/strategy/${p.id}`} className={`grid ${COLS} gap-2 px-1 py-3 border-b border-canvas text-[13px] text-ink hover:bg-subtle`}>
              <div className="font-bold">{p.code}</div>
              <div>{p.address}</div>
              <div>{p.property_class}</div>
              <div>{p.price_man_yen.toLocaleString("ja-JP")}万円</div>
              <div>{p.layout}</div>
              <div className={p.status ? STATUS[p.status]?.className : "text-muted"}>{p.status ? (STATUS[p.status]?.label ?? p.status) : "未実行"}</div>
              <div className="text-body">{p.first_target ?? "―"}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
