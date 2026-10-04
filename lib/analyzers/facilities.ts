import type { Analyzer, AnalyzerContext, FactDraft } from "../types";
import { featuresAtPoint, fetchRecord, notFetched, walking } from "./common";
import { singleVersion } from "./versions";

// ④ 周辺施設（設計書 5.3）：最寄りの学校・保育園・駅、学区、施設の数、用途地域
// 距離は直線。徒歩の目安は「直線×1.3、分速80m」。最寄りの学校＝通う学校（学区）とは限らない

interface Nearest {
  properties: Record<string, unknown>;
  distance_m: number;
}

/** 物件から近い順に1つ。周りのデータを取った範囲（keep_m）の中だけを探す */
async function nearest(ctx: AnalyzerContext, apiId: string, withinM: number, filter: (p: Record<string, unknown>) => boolean) {
  const rows = await ctx.sql<Nearest[]>`
    select g.properties, extensions.st_distance(g.geom::extensions.geography, p.geom::extensions.geography) as distance_m
    from geo_features g, properties p
    where p.id = ${ctx.property.id} and g.api_id = ${apiId}
      and extensions.st_dwithin(g.geom::extensions.geography, p.geom::extensions.geography, ${withinM})
    order by g.geom::extensions.geography <-> p.geom::extensions.geography
    limit 50
  `;
  return rows.find((r) => filter(r.properties)) ?? null;
}

/** 最寄りの学校（小学校・中学校）。休校中（P29_007 = 2）は除く */
async function nearestSchool(ctx: AnalyzerContext, key: string, schoolClass: string): Promise<FactDraft> {
  const version = singleVersion(ctx.versions, "reinfolib/XKT006");
  const record = await fetchRecord(ctx, "XKT006");
  const scope = { type: "nearest", search_radius_m: record?.keep_m ?? null };
  if (!version || !record || record.status === "failed") return notFetched(key, record, scope);

  const found = await nearest(ctx, "XKT006", record.keep_m, (p) => p.P29_003_name_ja === schoolClass && Number(p.P29_007) !== 2);
  if (!found) {
    return { key, status: "insufficient", scope, basis: { reason: `半径${record.keep_m}m以内に${schoolClass}がありません` }, datasetVersionIds: [version.id], attribution: version.attribution };
  }
  const w = walking(found.distance_m);
  const name = String(found.properties.P29_004_ja);
  return {
    key,
    value: w.straight_m,
    valueText: `${name}（直線${w.straight_m}m、徒歩約${w.walk_min}分）`,
    unit: "m",
    scope,
    basis: { name, address: found.properties.P29_005_ja ?? null, ...w, rule: "直線×1.3、分速80m", note: "最寄りの学校が通う学校（学区）とは限らない" },
    status: "ok",
    datasetVersionIds: [version.id],
    attribution: version.attribution,
  };
}

async function nearestNursery(ctx: AnalyzerContext): Promise<FactDraft> {
  const key = "facility.nursery_nearest";
  const version = singleVersion(ctx.versions, "reinfolib/XKT007");
  const record = await fetchRecord(ctx, "XKT007");
  const scope = { type: "nearest", search_radius_m: record?.keep_m ?? null };
  if (!version || !record || record.status === "failed") return notFetched(key, record, scope);

  const found = await nearest(ctx, "XKT007", record.keep_m, () => true);
  if (!found) {
    return { key, status: "insufficient", scope, basis: { reason: `半径${record.keep_m}m以内に保育園・幼稚園等がありません` }, datasetVersionIds: [version.id], attribution: version.attribution };
  }
  const w = walking(found.distance_m);
  const name = String(found.properties.preSchoolName_ja);
  return {
    key,
    value: w.straight_m,
    valueText: `${name}（直線${w.straight_m}m、徒歩約${w.walk_min}分）`,
    unit: "m",
    scope,
    basis: { name, kind: found.properties.schoolClassCode_name_ja ?? "保育所等", address: found.properties.location_ja ?? null, ...w, rule: "直線×1.3、分速80m" },
    status: "ok",
    datasetVersionIds: [version.id],
    attribution: version.attribution,
  };
}

async function nurseryCount(ctx: AnalyzerContext): Promise<FactDraft> {
  const key = "facility.nursery_count";
  const radius = ctx.params.facility_radius_m;
  const version = singleVersion(ctx.versions, "reinfolib/XKT007");
  const record = await fetchRecord(ctx, "XKT007");
  const scope = { type: "radius", meters: radius };
  if (!version || !record || record.status === "failed") return notFetched(key, record, scope);

  const [row] = await ctx.sql<{ kinds: Record<string, number> | null }[]>`
    select jsonb_object_agg(kind, c) as kinds
    from (
      select coalesce(g.properties->>'schoolClassCode_name_ja', '保育所等') as kind, count(*)::int as c
      from geo_features g, properties p
      where p.id = ${ctx.property.id} and g.api_id = 'XKT007'
        and extensions.st_dwithin(g.geom::extensions.geography, p.geom::extensions.geography, ${radius})
      group by 1
    ) k
  `;
  const n = Object.values(row?.kinds ?? {}).reduce((a, b) => a + b, 0);
  return {
    key,
    value: n,
    valueText: `半径${radius}m以内に${n}か所`,
    unit: "count",
    scope,
    basis: { kinds: row?.kinds ?? {} },
    status: "ok",
    datasetVersionIds: [version.id],
    attribution: version.attribution,
  };
}

/** 学区。新潟市・長岡市などはデータがない（features_in_tiles = 0） */
async function district(ctx: AnalyzerContext, key: string, apiId: string, nameField: string, label: string): Promise<FactDraft> {
  const version = singleVersion(ctx.versions, `reinfolib/${apiId}`);
  const record = await fetchRecord(ctx, apiId);
  const scope = { type: "point" };
  if (!version || !record || record.status === "failed") return notFetched(key, record, scope);

  const [f] = await featuresAtPoint(ctx, apiId);
  if (!f) {
    const reason = record.features_in_tiles === 0 ? `この地域には${label}のデータがありません` : `物件の地点を含む${label}がありません`;
    return { key, status: "not_available", scope, basis: { reason }, datasetVersionIds: [version.id], attribution: version.attribution };
  }
  return {
    key,
    valueText: String(f.properties[nameField]),
    scope,
    basis: { school: f.properties[nameField], address: f.properties[`${nameField.slice(0, 4)}005`] ?? null },
    status: "ok",
    datasetVersionIds: [version.id],
    attribution: version.attribution,
  };
}

/**
 * 駅の乗降客数（人/日）。複数路線の駅は、中心の1路線の地物にだけ数が入っている
 * （重複コード 1：当該路線駅に記載、2：他路線駅に記載。データ有無コード 1：データ有）
 * 年ごとに4項目：S12_006＋4k（重複）、007＋4k（有無）、009＋4k（乗降客数）、k＝0 が2011年
 */
function ridership(features: Record<string, unknown>[]) {
  let best: { year: number; count: number } | null = null;
  for (let k = 0; ; k++) {
    const dupKey = `S12_${String(6 + 4 * k).padStart(3, "0")}`;
    if (!features.some((f) => dupKey in f)) break;
    for (const f of features) {
      if (String(f[dupKey]) !== "1") continue;
      if (String(f[`S12_${String(7 + 4 * k).padStart(3, "0")}`]) !== "1") continue;
      best = { year: 2011 + k, count: Number(f[`S12_${String(9 + 4 * k).padStart(3, "0")}`]) };
    }
  }
  return best;
}

async function nearestStation(ctx: AnalyzerContext): Promise<FactDraft> {
  const key = "facility.station_nearest";
  const version = singleVersion(ctx.versions, "reinfolib/XKT015");
  const record = await fetchRecord(ctx, "XKT015");
  const scope = { type: "nearest", search_radius_m: record?.keep_m ?? null };
  if (!version || !record || record.status === "failed") return notFetched(key, record, scope);

  const found = await nearest(ctx, "XKT015", record.keep_m, () => true);
  if (!found) {
    return { key, status: "insufficient", scope, basis: { reason: `半径${record.keep_m}m以内に駅がありません` }, datasetVersionIds: [version.id], attribution: version.attribution };
  }
  const name = String(found.properties.S12_001_ja);
  // 同じ駅（グループコード）の全路線を集めて、路線名と乗降客数を出す
  const group = await ctx.sql<{ properties: Record<string, unknown> }[]>`
    select properties from geo_features where api_id = 'XKT015' and properties->>'S12_001g' = ${String(found.properties.S12_001g)}
  `;
  const lines = [...new Set(group.map((g) => String(g.properties.S12_003_ja)))];
  const rides = ridership(group.map((g) => g.properties));
  const w = walking(found.distance_m);
  return {
    key,
    value: w.straight_m,
    valueText: `${name}駅（${lines.join("・")}）直線${w.straight_m}m、徒歩約${w.walk_min}分`,
    unit: "m",
    scope,
    basis: { name, lines, ...w, rule: "直線×1.3、分速80m", ridership_per_day: rides?.count ?? null, ridership_year: rides?.year ?? null },
    status: "ok",
    datasetVersionIds: [version.id],
    attribution: version.attribution,
  };
}

async function zoning(ctx: AnalyzerContext): Promise<FactDraft> {
  const key = "area.zoning";
  const version = singleVersion(ctx.versions, "reinfolib/XKT002");
  const record = await fetchRecord(ctx, "XKT002");
  const scope = { type: "point" };
  if (!version || !record || record.status === "failed") return notFetched(key, record, scope);

  const [f] = await featuresAtPoint(ctx, "XKT002");
  if (!f) {
    return {
      key,
      valueText: "用途地域の指定がない区域",
      scope,
      basis: { note: "市街化調整区域や都市計画区域の外などの可能性がある" },
      status: "ok",
      datasetVersionIds: [version.id],
      attribution: version.attribution,
    };
  }
  return {
    key,
    valueText: String(f.properties.use_area_ja),
    scope,
    basis: {
      building_coverage_ratio: f.properties.u_building_coverage_ratio_ja || null,
      floor_area_ratio: f.properties.u_floor_area_ratio_ja || null,
      city: f.properties.city_name ?? null,
    },
    status: "ok",
    datasetVersionIds: [version.id],
    attribution: version.attribution,
  };
}

export const facilitiesAnalyzer: Analyzer = {
  name: "周辺施設",
  run: async (ctx) => [
    await nearestSchool(ctx, "facility.elementary_nearest", "小学校"),
    await nearestSchool(ctx, "facility.junior_high_nearest", "中学校"),
    await district(ctx, "facility.elementary_district", "XKT004", "A27_004_ja", "小学校区"),
    await district(ctx, "facility.junior_high_district", "XKT005", "A32_004_ja", "中学校区"),
    await nearestNursery(ctx),
    await nurseryCount(ctx),
    await nearestStation(ctx),
    await zoning(ctx),
  ],
};
