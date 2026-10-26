import Link from "next/link";
import { getSql } from "../../../lib/db";
import { PlusIcon } from "../../_components/icons";
import { btnAction, card, emptyState, tableHead } from "../../_lib/ui";

// 物件一覧。物件ごとに販売戦略の状態（未実行／実行中／完了／失敗）と第1ターゲットを出し、行を押すと物件の画面（/properties/[id]）を開く
// 販売戦略を一度でも作った物件は、「販売戦略」の欄からレポート（/strategy/[id]）を開ける
// 新しい物件は右上の「新規登録」から入力する（/properties/new）
// 2026-10-26 までの「販売戦略」の一覧（/strategy）をここに移した

export const dynamic = "force-dynamic";

const COLS = "grid-cols-[1.1fr_2.4fr_0.6fr_0.9fr_0.8fr_0.8fr_1.3fr]";

const STATUS: Record<string, { label: string; className: string }> = {
  queued: { label: "実行中", className: "text-primary font-bold" },
  running: { label: "実行中", className: "text-primary font-bold" },
  succeeded: { label: "完了", className: "text-[#157347] font-bold" },
  failed: { label: "失敗", className: "text-[#b91c1c] font-bold" },
};

export default async function PropertyListPage() {
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
      (select done.result -> 'メイン' -> 'targets' -> 0 ->> 'name' from strategy_runs done
        where done.property_id = p.id and done.status = 'succeeded' order by done.finished_at desc limit 1) as first_target
    from properties p
    left join lateral (select status from strategy_runs where property_id = p.id order by created_at desc limit 1) r on true
    order by p.id
  `;

  return (
    <div className="grid gap-4">
      <div className="flex items-center">
        <div className="text-[13px] text-body mr-auto">登録した物件 {rows.length}件</div>
        <Link href="/properties/new" className={btnAction}>
          <PlusIcon className="size-4" />
          新規登録
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className={emptyState}>物件がありません。「新規登録」から物件情報を入力してください。</div>
      ) : (
        <div className={`${card} p-5`}>
          <div className={`${tableHead} ${COLS} text-[12px] text-muted`}>
            <div>物件ID</div>
            <div>住所</div>
            <div>区分</div>
            <div>価格</div>
            <div>間取り</div>
            <div>販売戦略</div>
            <div>第1ターゲット</div>
          </div>
          {rows.map((p) => (
            // 行全体を物件の画面へのリンクにし、販売戦略の欄だけ上に重ねてレポートへのリンクにする（リンクの入れ子を避ける）
            <div key={p.id} className={`relative grid ${COLS} gap-2 px-1 py-3 border-b border-canvas text-[13px] text-ink hover:bg-subtle`}>
              <Link href={`/properties/${p.id}`} className="absolute inset-0" aria-label={`物件 ${p.code} を開く`} />
              <div className="font-bold">{p.code}</div>
              <div>{p.address}</div>
              <div>{p.property_class}</div>
              <div>{p.price_man_yen.toLocaleString("ja-JP")}万円</div>
              <div>{p.layout}</div>
              <div className={p.status ? STATUS[p.status]?.className : "text-muted"}>
                {p.status ? (
                  <Link href={`/strategy/${p.id}`} className="relative z-10 underline underline-offset-2 hover:opacity-80">
                    {STATUS[p.status]?.label ?? p.status}
                  </Link>
                ) : (
                  "未実行"
                )}
              </div>
              <div className="text-body">{p.first_target ?? "―"}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
