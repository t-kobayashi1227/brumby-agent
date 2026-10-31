import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql, inOrder } from "../../../../lib/db";
import { formatNumber } from "../../../../lib/facts/format";
import { parsePropertyId } from "../../../../lib/property";
import { emptyState } from "../../../_lib/ui";
import { MediaResults, SalesRecordForm, type MediaResultRow, type SalesRecordValues } from "./RecordForms";

// 物件ごとの販売の記録（docs/設計まとめ.md「販売の記録」）
// 上：販売の結果（1物件1件、何度でも書き直せる）。下：媒体ごとの実績（期間ごとに何行でも。行ごとに修正・削除ができる）

export const dynamic = "force-dynamic";

export default async function RecordPage({ params }: PageProps<"/records/[id]">) {
  const { id } = await params;
  const propertyId = parsePropertyId(id);
  if (propertyId === null) notFound();

  const sql = getSql();
  const [p] = await sql<{ code: string; address: string; property_class: string; price_man_yen: number }[]>`
    select code, address, property_class, price_man_yen from properties where id = ${propertyId}
  `;
  if (!p) return <div className={emptyState}>物件 {propertyId} が見つかりません。</div>;

  const [records, results, media, targets] = await inOrder(
    () => sql<SalesRecordValues[]>`
      select status, listed_on::text, list_price_man_yen, price_cut_count, final_price_man_yen,
        contracted_on::text, contract_price_man_yen, buyer_age_band, buyer_household, buyer_first_media_id, buyer_first_media_other, note
      from sales_records where property_id = ${propertyId}
    `,
    () => sql<(Omit<MediaResultRow, "cost_man_yen"> & { cost_man_yen: string | null })[]>`
      select r.id::int, coalesce(m.name, r.other_name) as name, r.media_id, r.started_on::text, r.ended_on::text, r.cost_man_yen,
        r.reach_count, r.views, r.inquiries, r.viewings, r.note
      from media_results r left join media m on m.id = r.media_id
      where r.property_id = ${propertyId} order by r.started_on, r.id
    `,
    () => sql<{ id: string; name: string }[]>`select id, name from media order by sort`,
    () => sql<{ name: string }[]>`select name from target_candidates order by id`,
  );

  const record: SalesRecordValues = records[0] ?? {
    status: "販売中",
    listed_on: null,
    list_price_man_yen: p.price_man_yen,
    price_cut_count: 0,
    final_price_man_yen: null,
    contracted_on: null,
    contract_price_man_yen: null,
    buyer_age_band: null,
    buyer_household: null,
    buyer_first_media_id: null,
    buyer_first_media_other: null,
    note: null,
  };
  const rows: MediaResultRow[] = results.map((r) => ({ ...r, cost_man_yen: r.cost_man_yen === null ? null : Number(r.cost_man_yen) }));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
        <Link href="/records" className="text-primary underline underline-offset-2">
          販売の記録の一覧
        </Link>
        <span className="text-muted">／</span>
        <span className="font-bold text-ink">{p.code}</span>
        <span className="text-body">
          {p.address}・{p.property_class}・{formatNumber(p.price_man_yen)}万円
        </span>
        <Link href={`/properties/${propertyId}`} className="ml-auto text-primary underline underline-offset-2">
          物件情報を開く
        </Link>
      </div>
      <SalesRecordForm
        propertyId={propertyId}
        initial={record}
        saved={records.length > 0}
        media={media}
        households={targets.map((t) => t.name)}
      />
      <MediaResults propertyId={propertyId} rows={rows} media={media} />
    </div>
  );
}
