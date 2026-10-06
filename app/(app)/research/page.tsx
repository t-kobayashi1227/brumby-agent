import Link from "next/link";
import { getSql } from "../../../lib/db";
import { listProperties } from "../../../lib/report";
import PropertyPicker from "../../_components/PropertyPicker";
import { btnPrimary, card, emptyState } from "../../_lib/ui";

// 競合物件リサーチ：検索条件の確認（設計書 7章）。条件は物件の登録内容から作る目安。ポータルサイトの自動収集はしない（1.3）
export const dynamic = "force-dynamic";

/** 1万円単位の価格を、100万円単位に丸めた幅にする */
const priceRange = (p: number) => `${(Math.floor((p * 0.85) / 100) * 100).toLocaleString("ja-JP")}〜${(Math.ceil((p * 1.15) / 100) * 100).toLocaleString("ja-JP")}万円`;
const areaRange = (a: number) => `${Math.round(a * 0.8)}〜${Math.round(a * 1.2)}㎡`;
/** 住所から市区町村まで（例：新潟市中央区） */
const cityOf = (address: string) => /^(.+?[市郡].*?[区町村]|.+?[市町村])/.exec(address.replace(/^新潟県/, ""))?.[1] ?? address;

const SITES = [
  { label: "SUUMOで探す", href: "https://suumo.jp/", tone: "bg-[#00a651]" },
  { label: "アットホームで探す", href: "https://www.athome.co.jp/", tone: "bg-[#e6303e]" },
];

export default async function ResearchConditionsPage({ searchParams }: PageProps<"/research">) {
  const sp = await searchParams;
  const sql = getSql();
  const properties = await listProperties(sql);
  const propertyId = Number(sp.property) > 0 ? Number(sp.property) : properties[0]?.id ?? 0;
  const picker = <PropertyPicker properties={properties} current={propertyId} href={(id) => `/research?property=${id}`} />;

  const [p] = await sql<{ property_type: string; price_man_yen: number | null; address: string; layout: string | null; land_sqm: string | null; building_sqm: string | null }[]>`
    select property_type, price_man_yen, address, layout, land_sqm, building_sqm from properties where id = ${propertyId}
  `;
  if (!p) return <>{picker}<div className={emptyState}>物件を選んでください。</div></>;

  const rows: [string, string][] = [
    ["エリア", `${cityOf(p.address)}（＋隣接エリア）`],
    ["物件種別", p.property_type],
    ["価格", p.price_man_yen !== null ? `${priceRange(p.price_man_yen)}（売出価格 ${p.price_man_yen.toLocaleString("ja-JP")}万円の前後15%）` : "物件の売出価格が未入力"],
    ["間取り", p.layout ?? "未入力"],
    ["土地面積", p.land_sqm !== null ? areaRange(Number(p.land_sqm)) : "未入力"],
    ["建物面積", p.building_sqm !== null ? areaRange(Number(p.building_sqm)) : "未入力"],
  ];

  return (
    <>
      {picker}
      <div className="grid grid-cols-[1.4fr_1fr] gap-4">
        <div className={`${card} p-4.5`}>
          <div className="text-sm font-bold text-ink mb-1">検索条件の目安（直接競合）</div>
          <div className="text-[11px] text-muted mb-3">物件の登録内容から作った目安です。ポータルサイトで、この条件に近い物件を探してください</div>
          <div className="grid gap-2 text-[13px] text-body">
            {rows.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 border-b border-divider pb-2 last:border-0">
                <span className="text-muted shrink-0">{k}</span>
                <span className="text-right">{v}</span>
              </div>
            ))}
          </div>
        </div>
        <div className={`${card} p-4.5 flex flex-col`}>
          <div className="text-sm font-bold text-ink mb-1">調査サイトへ移動</div>
          <div className="text-[11px] text-muted mb-3">新しいタブで開きます。見つけた物件は、次の画面で3件まで入力します</div>
          <div className="flex-1 flex flex-col justify-center gap-2.5">
            {SITES.map((s) => (
              <a key={s.href} href={s.href} target="_blank" rel="noreferrer" className={`w-full p-[11px] ${s.tone} rounded-md text-white font-bold text-[13px] text-center`}>
                {s.label}
              </a>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end mt-5">
        <Link href={`/research/detail?property=${propertyId}`} className={btnPrimary}>
          次へ（競合物件の入力）
        </Link>
      </div>
    </>
  );
}
