import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "../../../../lib/db";
import { btnPrimary, card } from "../../../_lib/ui";
import LocationMap from "../LocationMap";
import PropertyForm, { type PropertyValues } from "../PropertyForm";

// 物件の画面：登録した内容の変更と、位置（地図のピン）の確認（設計書 7章、D15）
export const dynamic = "force-dynamic";

interface Row extends Omit<PropertyValues, "land_sqm" | "building_sqm" | "sales_deadline"> {
  id: number;
  land_sqm: string | null;
  building_sqm: string | null;
  sales_deadline: Date | null;
  lon: number | null;
  lat: number | null;
  geocode_source: string | null;
  geocoded_at: Date | null;
}

const formatDate = (d: Date) => new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
/** date 型は日本時間の日付として yyyy-mm-dd にする（入力欄の値） */
const toDateInput = (d: Date) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

export default async function PropertyPage({ params, searchParams }: PageProps<"/properties/[id]">) {
  const { id } = await params;
  const { created, geocode } = await searchParams;
  const propertyId = Number(id);
  if (!Number.isInteger(propertyId) || propertyId <= 0) notFound();

  const [row] = await getSql()<Row[]>`
    select id, name, property_type, price_man_yen, address, area_class, layout, land_sqm, building_sqm, parking, access, features,
           total_budget_man_yen, sales_deadline, sales_goal, geocode_source, geocoded_at,
           extensions.st_x(geom) as lon, extensions.st_y(geom) as lat
    from properties where id = ${propertyId}
  `;
  if (!row) notFound();

  const values: PropertyValues = {
    ...row,
    id: Number(row.id),
    land_sqm: row.land_sqm === null ? null : Number(row.land_sqm),
    building_sqm: row.building_sqm === null ? null : Number(row.building_sqm),
    sales_deadline: row.sales_deadline ? toDateInput(row.sales_deadline) : null,
  };

  return (
    <div className="grid gap-4">
      <div className={`${card} p-5 flex flex-wrap items-center gap-3`}>
        <div className="mr-auto">
          <div className="text-base font-extrabold text-ink">
            物件{values.id}：{values.name}
          </div>
          {created && <div className="text-xs text-[#157347] mt-1">登録しました。下の地図で位置を確かめてから、分析してください。</div>}
          {geocode === "failed" && <div className="text-xs text-[#b91c1c] mt-1">住所から位置を取れませんでした（見つからない、または住所検索につながらない）。地図をクリックして位置を指定してください。</div>}
        </div>
        <Link href={`/strategy?property=${values.id}`} className={btnPrimary}>
          この物件を分析する →
        </Link>
      </div>
      <LocationMap
        propertyId={values.id!}
        lon={row.lon === null ? null : Number(row.lon)}
        lat={row.lat === null ? null : Number(row.lat)}
        source={row.geocode_source}
        geocodedAt={row.geocoded_at ? formatDate(row.geocoded_at) : null}
      />
      <PropertyForm values={values} />
    </div>
  );
}
