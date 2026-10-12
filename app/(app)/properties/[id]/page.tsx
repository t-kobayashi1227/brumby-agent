import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "../../../../lib/db";
import PropertySteps from "../../../_components/PropertySteps";
import { scoringSchemaReady } from "../../../../lib/scoring/schema-check";
import { btnPrimary, btnSecondary, card } from "../../../_lib/ui";
import LocationMap from "../LocationMap";
import PropertyForm, { type PropertyValues } from "../PropertyForm";
import SurroundingsPanel, { type FetchRow } from "../SurroundingsPanel";
import { photoUrl, photoVersions } from "../../../../lib/photos";
import { OSM_SUPERMARKET } from "../../../../lib/surroundings/layers";
import DeletePropertyButton from "../DeletePropertyButton";

// 物件の画面：登録した内容の変更と、位置（地図のピン）の確認（設計書 7章、D15）
export const dynamic = "force-dynamic";
// 周辺の情報は1種類ずつ取る（1回の呼び出しは数秒）。念のための上限（秒）
export const maxDuration = 60;

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

  // 採点ルール表（D35）の列は、マイグレーションが入る前は読まない（フォームでは空欄になる）
  const scoringReady = await scoringSchemaReady(getSql());
  const [row] = await getSql()<Row[]>`
    select id, name, property_type, price_man_yen, address, area_class, layout, land_sqm, building_sqm, parking, access, features,
           total_budget_man_yen, sales_deadline, sales_goal, geocode_source, geocoded_at,
           ${scoringReady ? getSql()`age_years, rooms, is_hiraya, has_garden, ward, town, manual_metrics,` : getSql()`null as age_years, null as rooms, null as is_hiraya, null as has_garden, null as ward, null as town, null as manual_metrics,`}
           extensions.st_x(geom) as lon, extensions.st_y(geom) as lat
    from properties where id = ${propertyId}
  `;
  if (!row) notFound();

  const fetches = await getSql()<{ api_id: string; status: FetchRow["status"]; features_kept: number; error: string | null; fetched_at: Date }[]>`
    select api_id, status, features_kept, error, fetched_at from property_fetches where property_id = ${propertyId}
  `;
  const [last] = await getSql()<{ created_at: Date | null }[]>`
    select max(created_at) as created_at from analysis_runs where property_id = ${propertyId} and status = 'succeeded'
  `;
  const lastAnalyzedAt = last?.created_at ?? null;
  const hasLocation = row.lon !== null && row.lat !== null;
  const locationConfirmed = hasLocation && row.geocode_source === "manual";
  const lastFetched = fetches.reduce<Date | null>((m, f) => (m === null || f.fetched_at > m ? f.fetched_at : m), null);
  // 位置が、最後に周辺の情報を取ったときより新しければ（登録直後・ピンを置き直した後など）、自動で取りに行く
  const autoStart = locationConfirmed &&
    (lastFetched === null || (row.geocoded_at !== null && row.geocoded_at > lastFetched));
  const initialFetches: FetchRow[] = fetches.map((f) => ({ apiId: f.api_id, status: f.status, featuresKept: f.features_kept, error: f.error, fetchedAt: formatDate(f.fetched_at) }));
  const osmFetch = fetches.find((f) => f.api_id === OSM_SUPERMARKET);
  const supermarkets = hasLocation && osmFetch && osmFetch.status !== "failed" &&
    (!row.geocoded_at || osmFetch.fetched_at >= row.geocoded_at)
    ? (await getSql()<{ name: string; distance_m: number }[]>`
      select coalesce(nullif(g.properties->>'name', ''), nullif(g.properties->>'brand', ''), '名称未登録のスーパー') as name,
        extensions.st_distance(g.geom::extensions.geography, p.geom::extensions.geography) as distance_m
      from geo_features g, properties p
      where p.id = ${propertyId} and g.api_id = ${OSM_SUPERMARKET} and g.feature_id like ${`${propertyId}:%`}
        and extensions.st_dwithin(g.geom::extensions.geography, p.geom::extensions.geography, 3000)
      order by distance_m limit 10
    `).map((r) => ({ name: r.name, distanceM: Math.round(r.distance_m) }))
    : [];

  const photoVersion = (await photoVersions(getSql(), [propertyId])).get(propertyId);
  const values: PropertyValues = {
    ...row,
    photo_url: photoVersion ? photoUrl(propertyId, photoVersion) : null,
    id: Number(row.id),
    land_sqm: row.land_sqm === null ? null : Number(row.land_sqm),
    building_sqm: row.building_sqm === null ? null : Number(row.building_sqm),
    sales_deadline: row.sales_deadline ? toDateInput(row.sales_deadline) : null,
  };

  return (
    <div className="grid gap-4">
      <PropertySteps
        current={locationConfirmed ? "surroundings" : "location"}
        propertyId={values.id}
        done={{ register: true, location: locationConfirmed, surroundings: fetches.length > 0, analysis: lastAnalyzedAt !== null }}
      />
      <div className={`${card} p-5 flex flex-wrap items-center gap-3`}>
        <div className="mr-auto">
          <div className="text-base font-extrabold text-ink">
            物件{values.id}：{values.name}
          </div>
          {created && <div className="text-xs text-[#157347] mt-1">登録しました。地図のピンを確認し、「この位置で確定」を押すと周辺の情報を取得します。</div>}
          {geocode === "failed" && <div className="text-xs text-[#b91c1c] mt-1">住所から位置を取れませんでした（見つからない、または住所検索につながらない）。地図をクリックして位置を指定してください。</div>}
        </div>
        {!locationConfirmed ? (
          // 位置がないと分析できない（集計が止まる）ので、押せなくして理由を出す
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-muted">地図の位置を確定すると分析できます</span>
            <span aria-disabled="true" className={`${btnPrimary} opacity-50 cursor-not-allowed`}>
              この物件を分析する →
            </span>
          </div>
        ) : lastAnalyzedAt ? (
          // 分析済みなら、前の結果を見るか、もう一度分析するかを選ぶ（AIの文章は数十秒かかり、費用もかかる）
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-muted">前回の分析：{formatDate(lastAnalyzedAt)}</span>
            <Link href={`/strategy?property=${values.id}`} className={btnSecondary}>
              前回の結果を見る
            </Link>
            <Link href={`/strategy?property=${values.id}`} className={btnPrimary}>
              分析画面へ →
            </Link>
          </div>
        ) : (
          <Link href={`/strategy?property=${values.id}`} className={btnPrimary}>
            分析画面へ →
          </Link>
        )}
      </div>
      <div className="flex justify-end">
        <DeletePropertyButton propertyId={values.id!} name={values.name} redirectAfterDelete />
      </div>
      <LocationMap
        propertyId={values.id!}
        lon={row.lon === null ? null : Number(row.lon)}
        lat={row.lat === null ? null : Number(row.lat)}
        source={row.geocode_source}
        geocodedAt={row.geocoded_at ? formatDate(row.geocoded_at) : null}
      />
      <SurroundingsPanel
        key={row.geocoded_at ? new Date(row.geocoded_at).toISOString() : "none"}
        propertyId={values.id!}
        hasLocation={locationConfirmed}
        autoStart={autoStart}
        initial={initialFetches}
        initialSupermarkets={supermarkets}
        analyzed={lastAnalyzedAt !== null}
      />
      <PropertyForm values={values} />
    </div>
  );
}
