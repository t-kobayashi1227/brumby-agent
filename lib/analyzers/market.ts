import type { Sql } from "../db";
import type { Analyzer, AnalyzerContext, FactDraft, VersionInfo } from "../types";
import { singleVersion } from "./versions";

// ③ 相場（設計書 5.3、D11、D13）
// 取引価格：物件のある地区 → 隣の地区 → 区・市 と、直近の期間で price_min_n 件以上になるまで範囲を広げる
// 地価：物件の近くの住宅地の地点の、同じ地点どうしの5年間の変化
// 「隣の地区」＝物件のある町丁目と境界が接している町丁目を含む地区（2026-10-04に決定）

/** 物件の種類 → 取引の種類（D11）。新築と中古は取引のデータでは区別できない */
const TRADE_TYPE: Record<string, string> = {
  新築戸建: "宅地(土地と建物)",
  中古戸建: "宅地(土地と建物)",
  土地: "宅地(土地)",
};

/** 相場から外す取引の事情（D11） */
const EXCLUDED_REMARKS = "調停・競売等|関係者間取引|瑕疵有りの可能性";

/** 新築戸建の相場に並べる「築浅」の年数 */
const RECENT_BUILD_YEARS = 5;

/** 地価の推移を見る年数と、近くの地点を探す範囲・数 */
const LAND_TREND_YEARS = 5;
const LAND_SEARCH_M = 3000;
const LAND_POINTS = 5;

type Level = "district" | "neighbors" | "city";
const LEVEL_LABEL: Record<Level, string> = { district: "物件のある地区", neighbors: "隣の地区まで", city: "区・市" };

interface Stats {
  n: number;
  median: number | null;
  q1: number | null;
  q3: number | null;
  unit_median: number | null;
}

interface Area {
  key_codes: string[];
  neighbor_key_codes: string[];
  city_code: string;
  city_name: string;
}

const quarterLabel = (i: number) => `${Math.floor(i / 4)}Q${(i % 4) + 1}`;

/** 物件のある町丁目と、境界が接している町丁目 */
async function locate(ctx: AnalyzerContext, areasVersion: VersionInfo): Promise<Area | null> {
  const [own] = await ctx.sql<{ key_codes: string[]; city_code: string; city_name: string }[]>`
    select array_agg(a.key_code) as key_codes, min(a.city_code) as city_code, min(a.city_name) as city_name
    from areas a, properties p
    where p.id = ${ctx.property.id} and a.dataset_version_id = ${areasVersion.id} and extensions.st_intersects(a.geom, p.geom)
  `;
  if (!own?.key_codes) return null;
  // 境界のデータには、わずかな隙間や重なりがあるので、約5m以内なら接しているとみなす
  const neighbors = await ctx.sql<{ key_code: string }[]>`
    select distinct b.key_code
    from areas a join areas b on b.dataset_version_id = a.dataset_version_id
    where a.dataset_version_id = ${areasVersion.id} and a.key_code = any(${own.key_codes})
      and b.key_code <> all(${own.key_codes}) and b.hcode = 8101
      and extensions.st_dwithin(a.geom, b.geom, 0.00005)
  `;
  return { key_codes: own.key_codes, neighbor_key_codes: neighbors.map((n) => n.key_code), city_code: own.city_code, city_name: own.city_name };
}

async function tradeStats(
  sql: Sql,
  opts: {
    txVersion: number;
    areasVersion: number;
    type: string;
    from: number;
    to: number;
    keyCodes: string[] | null;     // null なら市区町村全体
    cityCode: string;
    minBuildYear: number | null;
  },
): Promise<Stats & { districts: string[] }> {
  const areaFilter = opts.keyCodes
    ? sql`and (t.municipality_code, t.district_name) in (
          select municipality_code, district_name from district_areas
          where transactions_version_id = ${opts.txVersion} and areas_version_id = ${opts.areasVersion}
            and key_code = any(${opts.keyCodes}))`
    : sql`and t.municipality_code = ${opts.cityCode}`;
  const buildFilter = opts.minBuildYear === null ? sql`` : sql`and t.building_year >= ${opts.minBuildYear}`;
  const [row] = await sql<(Stats & { districts: string[] | null })[]>`
    select count(*)::int as n,
           percentile_cont(0.5) within group (order by t.trade_price)::float8 as median,
           percentile_cont(0.25) within group (order by t.trade_price)::float8 as q1,
           percentile_cont(0.75) within group (order by t.trade_price)::float8 as q3,
           percentile_cont(0.5) within group (order by t.unit_price)::float8 as unit_median,
           array_agg(distinct t.district_name) as districts
    from transactions t
    where t.dataset_version_id = ${opts.txVersion} and t.type = ${opts.type}
      and t.trade_price is not null
      and (t.year * 4 + t.quarter - 1) between ${opts.from} and ${opts.to}
      and coalesce(t.raw->>'Remarks', '') !~ ${EXCLUDED_REMARKS}
      ${areaFilter}
      ${buildFilter}
  `;
  return { ...row, districts: row.districts ?? [] };
}

/** 物件のある地区 → 隣の地区まで → 区・市 と、min 件以上になるまで広げる */
async function expand(ctx: AnalyzerContext, area: Area, base: Omit<Parameters<typeof tradeStats>[1], "keyCodes" | "cityCode">, min: number) {
  const steps: [Level, string[] | null][] = [
    ["district", area.key_codes],
    ["neighbors", [...area.key_codes, ...area.neighbor_key_codes]],
    ["city", null],
  ];
  const tried: { level: Level; n: number }[] = [];
  let last: (Stats & { districts: string[]; level: Level }) | null = null;
  for (const [level, keyCodes] of steps) {
    const stats = await tradeStats(ctx.sql, { ...base, keyCodes, cityCode: area.city_code });
    tried.push({ level, n: stats.n });
    last = { ...stats, level };
    if (stats.n >= min) break;
  }
  return { result: last!, tried };
}

const man = (yen: number | null) => (yen === null ? null : Math.round(yen / 10000));

async function landTrend(ctx: AnalyzerContext, area: Area, landVersions: VersionInfo[]): Promise<FactDraft[]> {
  const scope = { type: "nearest", search_radius_m: LAND_SEARCH_M, points: LAND_POINTS, years: LAND_TREND_YEARS };
  const versionIds = landVersions.map((v) => v.id);
  const attribution = landVersions[0]?.attribution ?? null;
  if (versionIds.length === 0) {
    return [{ key: "land.trend_5y", status: "not_available", scope, basis: { reason: "地価のデータがありません" }, datasetVersionIds: [] }];
  }
  const [{ latest }] = await ctx.sql<{ latest: number }[]>`select max(year)::int as latest from land_prices where dataset_version_id = any(${versionIds})`;
  const past = latest - LAND_TREND_YEARS;

  // 同じ地点（地点ID＋公示・調査の別）の、今年と5年前の価格。住宅地だけ
  const pairs = ctx.sql`
    select n.point_id, n.survey_type, n.address, n.city_code, n.geom, n.price_per_sqm as now_price, o.price_per_sqm as old_price
    from land_prices n
    join land_prices o on o.point_id = n.point_id and o.survey_type = n.survey_type and o.year = ${past}
      and o.dataset_version_id = any(${versionIds}) and o.price_per_sqm is not null
    where n.dataset_version_id = any(${versionIds}) and n.year = ${latest}
      and n.use_category = '住宅地' and n.price_per_sqm is not null
  `;
  const near = await ctx.sql<{ point_id: string; survey_type: string; address: string; now_price: number; old_price: number; distance_m: number }[]>`
    select x.point_id, x.survey_type, x.address, x.now_price, x.old_price,
           extensions.st_distance(x.geom::extensions.geography, p.geom::extensions.geography)::float8 as distance_m
    from (${pairs}) x, properties p
    where p.id = ${ctx.property.id}
      and extensions.st_dwithin(x.geom::extensions.geography, p.geom::extensions.geography, ${LAND_SEARCH_M})
    order by x.geom::extensions.geography <-> p.geom::extensions.geography
    limit ${LAND_POINTS}
  `;
  const [city] = await ctx.sql<{ ratio: number | null; n: number }[]>`
    select avg(now_price::float8 / old_price - 1)::float8 as ratio, count(*)::int as n from (${pairs}) x where x.city_code = ${area.city_code}
  `;

  const facts: FactDraft[] = [];
  if (near.length === 0) {
    facts.push({ key: "land.trend_5y", status: "insufficient", scope, basis: { reason: `半径${LAND_SEARCH_M}m以内に、${past}年と${latest}年の両方の価格がある住宅地の地点がありません` }, datasetVersionIds: versionIds, attribution });
    return facts;
  }
  const ratio = near.reduce((a, p) => a + (p.now_price / p.old_price - 1), 0) / near.length;
  const cityRatio = city?.ratio ?? null;
  facts.push({
    key: "land.trend_5y",
    value: Math.round(ratio * 1000) / 1000,
    valueText: `近くの住宅地${near.length}地点の地価 ${past}年→${latest}年 ${ratio >= 0 ? "+" : ""}${(ratio * 100).toFixed(1)}%${cityRatio === null ? "" : `（${area.city_name} ${cityRatio >= 0 ? "+" : ""}${(cityRatio * 100).toFixed(1)}%）`}`,
    unit: "ratio",
    comparison: cityRatio === null ? null : Math.round(cityRatio * 1000) / 1000,
    scope,
    basis: {
      from_year: past,
      to_year: latest,
      points: near.map((p) => ({ point_id: p.point_id, survey: p.survey_type, address: p.address, distance_m: Math.round(p.distance_m), [`price_${past}`]: p.old_price, [`price_${latest}`]: p.now_price })),
      comparison_area: { key_code: area.city_code, name: area.city_name, points: city?.n ?? 0 },
      method: "同じ地点どうしの変化率の平均（地価公示・地価調査をもとに作成）",
    },
    status: "ok",
    datasetVersionIds: versionIds,
    attribution,
  });
  const nearest = near[0];
  facts.push({
    key: "land.nearest_residential_price",
    value: nearest.now_price,
    valueText: `最寄りの住宅地の地価 ${nearest.now_price.toLocaleString("ja-JP")}円/㎡（${nearest.address}、直線${Math.round(nearest.distance_m)}m、${latest}年の地価${nearest.survey_type === "公示" ? "公示" : "調査"}）`,
    unit: "円/㎡",
    scope: { type: "nearest", search_radius_m: LAND_SEARCH_M },
    basis: { point_id: nearest.point_id, survey: nearest.survey_type, address: nearest.address, distance_m: Math.round(nearest.distance_m), year: latest },
    status: "ok",
    datasetVersionIds: versionIds,
    attribution,
  });
  return facts;
}

export const marketAnalyzer: Analyzer = {
  name: "相場",
  async run(ctx) {
    const type = TRADE_TYPE[ctx.property.property_type];
    const txVersion = singleVersion(ctx.versions, "reinfolib/XIT001");
    const areasVersion = singleVersion(ctx.versions, "estat/census2020_boundary");
    const landVersions = (ctx.versions.get("reinfolib/XPT002") ?? []).filter((v) => v.coverage.startsWith("pref:15/"));
    const baseScope = { type: "expanding", levels: ["物件のある地区", "隣の地区まで", "区・市"] };
    if (!type) {
      return [{ key: "market.price_median", status: "not_available", scope: baseScope, basis: { reason: `物件の種類「${ctx.property.property_type}」に対応する取引の種類がありません` }, datasetVersionIds: [] }];
    }
    if (!txVersion || !areasVersion) {
      return [{ key: "market.price_median", status: "not_available", scope: baseScope, basis: { reason: "取引価格または町丁目のデータがありません" }, datasetVersionIds: [] }];
    }
    const area = await locate(ctx, areasVersion);
    if (!area) {
      return [{ key: "market.price_median", status: "not_available", scope: baseScope, basis: { reason: "物件の地点を含む町丁目がありません" }, datasetVersionIds: [] }];
    }

    // 期間：取引データの最新の四半期から、さかのぼって price_years 年分
    const [{ latest }] = await ctx.sql<{ latest: number }[]>`
      select max(year * 4 + quarter - 1)::int as latest from transactions where dataset_version_id = ${txVersion.id}
    `;
    const from = latest - (ctx.params.price_years * 4 - 1);
    const period = `${quarterLabel(from)}-${quarterLabel(latest)}`;
    const versionIds = [txVersion.id, areasVersion.id];
    const base = { txVersion: txVersion.id, areasVersion: areasVersion.id, type, from, to: latest, minBuildYear: null };

    const facts: FactDraft[] = [];
    const { result, tried } = await expand(ctx, area, base, ctx.params.price_min_n);
    const enough = result.n >= ctx.params.price_min_n;
    const scope = { type: "expanding", level: result.level, level_label: LEVEL_LABEL[result.level], city: area.city_name };
    const basis = {
      n: result.n,
      period,
      trade_type: type,
      q1_man_yen: man(result.q1),
      q3_man_yen: man(result.q3),
      tried: tried.map((t) => ({ level: LEVEL_LABEL[t.level], n: t.n })),
      districts: result.districts.slice(0, 30),
      excluded: "調停・競売等、関係者間取引、瑕疵有りの可能性の取引は除く",
      note: "取引価格情報と成約価格情報の両方を含む",
    };
    facts.push({
      key: "market.price_median",
      value: man(result.median),
      valueText: result.median === null
        ? null
        : `取引価格の中央値 ${man(result.median)!.toLocaleString("ja-JP")}万円（${LEVEL_LABEL[result.level]}、${period}、${result.n}件、四分位 ${man(result.q1)!.toLocaleString("ja-JP")}〜${man(result.q3)!.toLocaleString("ja-JP")}万円）`,
      unit: "万円",
      comparison: ctx.property.price_man_yen,
      scope,
      basis,
      status: result.n === 0 ? "not_available" : enough ? "ok" : "insufficient",
      datasetVersionIds: versionIds,
      attribution: txVersion.attribution,
    });

    if (ctx.property.price_man_yen !== null && result.median !== null) {
      const gap = ctx.property.price_man_yen / man(result.median)! - 1;
      facts.push({
        key: "market.price_gap",
        value: Math.round(gap * 1000) / 1000,
        valueText: `物件の価格 ${ctx.property.price_man_yen.toLocaleString("ja-JP")}万円は、取引価格の中央値より${Math.abs(gap * 100).toFixed(1)}%${gap >= 0 ? "高い" : "低い"}`,
        unit: "ratio",
        comparison: man(result.median),
        scope,
        basis: { property_price_man_yen: ctx.property.price_man_yen, median_man_yen: man(result.median), n: result.n, period },
        status: enough ? "ok" : "insufficient",
        datasetVersionIds: versionIds,
        attribution: txVersion.attribution,
      });
    }

    // 土地は1㎡あたりの価格の中央値も出す
    if (type === "宅地(土地)" && result.unit_median !== null) {
      facts.push({
        key: "market.unit_price_median",
        value: Math.round(result.unit_median),
        valueText: `土地の1㎡あたりの取引価格の中央値 ${Math.round(result.unit_median).toLocaleString("ja-JP")}円/㎡（${LEVEL_LABEL[result.level]}、${result.n}件）${ctx.property.land_sqm ? `。物件は ${Math.round((ctx.property.price_man_yen ?? 0) * 10000 / ctx.property.land_sqm).toLocaleString("ja-JP")}円/㎡` : ""}`,
        unit: "円/㎡",
        comparison: ctx.property.land_sqm && ctx.property.price_man_yen ? Math.round((ctx.property.price_man_yen * 10000) / ctx.property.land_sqm) : null,
        scope,
        basis: { n: result.n, period },
        status: enough ? "ok" : "insufficient",
        datasetVersionIds: versionIds,
        attribution: txVersion.attribution,
      });
    }

    // 新築戸建は、築浅（築5年以内）の取引に絞った中央値も並べる
    if (ctx.property.property_type === "新築戸建") {
      const minBuildYear = Math.floor(latest / 4) - RECENT_BUILD_YEARS;
      const recent = await expand(ctx, area, { ...base, minBuildYear }, ctx.params.price_min_n);
      const r = recent.result;
      facts.push({
        key: "market.recent_build_price_median",
        value: man(r.median),
        valueText: r.median === null
          ? null
          : `築${RECENT_BUILD_YEARS}年以内（${minBuildYear}年以降の建築）の取引価格の中央値 ${man(r.median)!.toLocaleString("ja-JP")}万円（${LEVEL_LABEL[r.level]}、${r.n}件）`,
        unit: "万円",
        comparison: ctx.property.price_man_yen,
        scope: { type: "expanding", level: r.level, level_label: LEVEL_LABEL[r.level], city: area.city_name },
        basis: { n: r.n, period, min_build_year: minBuildYear, q1_man_yen: man(r.q1), q3_man_yen: man(r.q3), tried: recent.tried.map((t) => ({ level: LEVEL_LABEL[t.level], n: t.n })) },
        status: r.n === 0 ? "not_available" : r.n >= ctx.params.price_min_n ? "ok" : "insufficient",
        datasetVersionIds: versionIds,
        attribution: txVersion.attribution,
      });
    }

    facts.push(...(await landTrend(ctx, area, landVersions)));
    return facts;
  },
};
