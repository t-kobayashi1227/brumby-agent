import Link from "next/link";
import { getSql } from "../../../lib/db";
import { formatNumber } from "../../../lib/facts/format";
import { daysOnMarket } from "../../../lib/records";
import { card, emptyState, tableHead } from "../../_lib/ui";

// 販売の記録の一覧（docs/設計まとめ.md「販売の記録」）。登録した物件ごとに、販売の状況と媒体の実績の合計を出す
// 行を押すと、その物件の記録の画面（/records/[id]）を開く

export const dynamic = "force-dynamic";

const COLS = "grid-cols-[1.1fr_2.2fr_0.8fr_0.9fr_0.8fr_0.8fr_0.8fr_0.8fr]";

const STATUS_CLASS: Record<string, string> = {
  販売中: "text-primary font-bold",
  成約: "text-[#157347] font-bold",
  販売中止: "text-muted font-bold",
};

export default async function RecordListPage() {
  const rows = await getSql()<
    {
      id: string;
      code: string;
      address: string;
      status: string | null;
      listed_on: string | null;
      contracted_on: string | null;
      media_count: number;
      cost: string | null;
      inquiries: number | null;
    }[]
  >`
    select p.id, p.code, p.address, s.status, s.listed_on::text, s.contracted_on::text,
      count(m.id)::int as media_count, sum(m.cost_man_yen) as cost, sum(m.inquiries)::int as inquiries
    from properties p
    left join sales_records s on s.property_id = p.id
    left join media_results m on m.property_id = p.id
    group by p.id, s.property_id
    order by p.id
  `;

  return (
    <div className="grid gap-4">
      <p className="text-[13px] text-body">
        実際に販売した結果を物件ごとに記録します。いまは記録するだけで、AIには渡していません。件数が貯まったら、媒体ごとの費用の目安などを集計して販売戦略の根拠に使います。
      </p>
      {rows.length === 0 ? (
        <div className={emptyState}>物件がありません。「物件一覧」から物件を登録してください。</div>
      ) : (
        <div className={`${card} p-5`}>
          <div className={`${tableHead} ${COLS} text-[12px] text-muted`}>
            <div>物件ID</div>
            <div>住所</div>
            <div>販売の状況</div>
            <div>販売開始日</div>
            <div>成約まで</div>
            <div>媒体の行数</div>
            <div>費用の合計</div>
            <div>問い合わせ</div>
          </div>
          {rows.map((r) => {
            const days = daysOnMarket(r.listed_on, r.contracted_on);
            return (
              <Link key={r.id} href={`/records/${r.id}`} className={`grid ${COLS} gap-2 px-1 py-3 border-b border-canvas text-[13px] text-ink hover:bg-subtle`}>
                <div className="font-bold">{r.code}</div>
                <div>{r.address}</div>
                <div className={r.status ? (STATUS_CLASS[r.status] ?? "") : "text-muted"}>{r.status ?? "未記録"}</div>
                <div className="tabular-nums">{r.listed_on ?? "―"}</div>
                <div className="tabular-nums">{days !== null ? `${formatNumber(days)}日` : "―"}</div>
                <div className="tabular-nums">{r.media_count}件</div>
                <div className="tabular-nums">{r.cost !== null ? `${formatNumber(Number(r.cost), 1)}万円` : "―"}</div>
                <div className="tabular-nums">{r.inquiries !== null ? `${r.inquiries}件` : "―"}</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
