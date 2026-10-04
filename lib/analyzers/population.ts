import type { Analyzer, AnalyzerContext, FactDraft } from "../types";
import { singleVersion } from "./versions";

// ① 人口構成（設計書 5.3）：物件の周り（半径）の年齢層・世帯・住まいの割合を、物件のある市区町村の値と比べる
// 半径の集計は、町丁目の値を「円と重なる面積の割合」で割り振って足す（ST_Intersection / ST_Area）

/** 分母がこれより少ないと、割合がぶれやすいので insufficient にする */
const MIN_DENOMINATOR = 50;

interface Ratio {
  key: string;
  label: string;
  numerator: string[];   // 足し合わせる stat_key
  denominator: string;
}

/** 狙う層の年齢（例：30〜49歳）を、国勢調査の5歳ごとの項目にする */
function ageKeys([from, to]: [number, number]): string[] {
  if (from % 5 !== 0 || (to + 1) % 5 !== 0) throw new Error(`狙う層の年齢は5歳ごとに区切ってください（例：30〜49歳）：${from}〜${to}`);
  const keys: string[] = [];
  for (let a = from; a <= to; a += 5) keys.push(`age_${String(a).padStart(2, "0")}_${String(a + 4).padStart(2, "0")}`);
  return keys;
}

function ratios(ctx: AnalyzerContext): Ratio[] {
  const [from, to] = ctx.params.target_age;
  return [
    { key: `target.age_${from}_${to}_ratio`, label: `${from}〜${to}歳の人`, numerator: ageKeys(ctx.params.target_age), denominator: "age_total" },
    { key: "target.households_with_under18_ratio", label: "18歳未満のいる世帯", numerator: ["hh_with_under18"], denominator: "hh_general" },
    { key: "target.couple_children_ratio", label: "夫婦と子供から成る世帯", numerator: ["hh_couple_children"], denominator: "hh_general" },
    { key: "target.private_rented_ratio", label: "民営借家に住む世帯", numerator: ["tenure_private_rented"], denominator: "tenure_total" },
    { key: "target.detached_ratio", label: "一戸建に住む世帯", numerator: ["dwelling_detached"], denominator: "dwelling_total" },
  ];
}

export const populationAnalyzer: Analyzer = {
  name: "人口構成",
  async run(ctx) {
    const radius = ctx.params.radius_m;
    const scope = { type: "radius", meters: radius };
    const areasVersion = singleVersion(ctx.versions, "estat/census2020_boundary");
    const censusVersion = singleVersion(ctx.versions, "estat/census2020_small_area");
    const defs = ratios(ctx);
    if (!areasVersion || !censusVersion) {
      return defs.map((d) => ({ key: d.key, status: "not_available", scope, basis: { reason: "国勢調査のデータがありません" }, datasetVersionIds: [] }) as FactDraft);
    }
    const statKeys = [...new Set(["pop_total", "households", ...defs.flatMap((d) => [...d.numerator, d.denominator])])];

    // 円と重なる町丁目ごとに、重なりの面積の割合（w）を出し、値に掛けて足す
    const inRadius = await ctx.sql<{ stat_key: string; value: number; areas: number }[]>`
      with circle as (
        select extensions.st_buffer(p.geom::extensions.geography, ${radius})::extensions.geometry as g
        from properties p where p.id = ${ctx.property.id}
      ), hit as (
        select a.key_code,
               extensions.st_area(extensions.st_intersection(a.geom, c.g)::extensions.geography)
                 / nullif(extensions.st_area(a.geom::extensions.geography), 0) as w
        from areas a, circle c
        where a.dataset_version_id = ${areasVersion.id} and extensions.st_intersects(a.geom, c.g)
      )
      select v.stat_key, sum(v.value * h.w)::float8 as value, count(distinct h.key_code)::int as areas
      from hit h
      join census_values v on v.key_code = h.key_code and v.dataset_version_id = ${censusVersion.id}
      where v.stat_key = any(${statKeys})
      group by v.stat_key
    `;
    const sums = new Map(inRadius.map((r) => [r.stat_key, Number(r.value)]));
    const areaCount = inRadius[0]?.areas ?? 0;

    // 比べる値：物件の地点を含む町丁目の市区町村（新潟市は区）
    const [city] = await ctx.sql<{ city_code: string; city_name: string }[]>`
      select a.city_code, a.city_name from areas a, properties p
      where p.id = ${ctx.property.id} and a.dataset_version_id = ${areasVersion.id} and extensions.st_intersects(a.geom, p.geom)
      limit 1
    `;
    const cityValues = new Map<string, number>();
    if (city) {
      const rows = await ctx.sql<{ stat_key: string; value: number }[]>`
        select stat_key, value::float8 as value from census_values
        where dataset_version_id = ${censusVersion.id} and key_code = ${city.city_code} and stat_key = any(${statKeys})
      `;
      for (const r of rows) cityValues.set(r.stat_key, Number(r.value));
    }

    const versionIds = [areasVersion.id, censusVersion.id];
    const method = "町丁目の値を、半径の円と重なる面積の割合で割り振って足した値（国勢調査をもとに作成）";
    const facts: FactDraft[] = [
      {
        key: "target.population",
        value: Math.round(sums.get("pop_total") ?? 0),
        valueText: `半径${radius}mの人口 約${Math.round(sums.get("pop_total") ?? 0).toLocaleString("ja-JP")}人、世帯 約${Math.round(sums.get("households") ?? 0).toLocaleString("ja-JP")}`,
        unit: "人",
        scope,
        basis: { households: Math.round(sums.get("households") ?? 0), areas: areaCount, method, census_year: 2020 },
        status: areaCount > 0 ? "ok" : "insufficient",
        datasetVersionIds: versionIds,
        attribution: censusVersion.attribution,
      },
    ];

    for (const d of defs) {
      const num = d.numerator.reduce((a, k) => a + (sums.get(k) ?? 0), 0);
      const den = sums.get(d.denominator) ?? 0;
      const cityNum = d.numerator.reduce((a, k) => a + (cityValues.get(k) ?? 0), 0);
      const cityDen = cityValues.get(d.denominator) ?? 0;
      const value = den > 0 ? num / den : null;
      const comparison = cityDen > 0 ? cityNum / cityDen : null;
      facts.push({
        key: d.key,
        value: value === null ? null : Math.round(value * 1000) / 1000,
        valueText: value === null ? null : `${d.label} ${(value * 100).toFixed(1)}%${comparison === null ? "" : `（${city?.city_name} ${(comparison * 100).toFixed(1)}%）`}`,
        unit: "ratio",
        comparison: comparison === null ? null : Math.round(comparison * 1000) / 1000,
        scope,
        basis: {
          numerator: Math.round(num),
          denominator: Math.round(den),
          denominator_label: d.denominator,
          areas: areaCount,
          comparison_area: city ? { key_code: city.city_code, name: city.city_name } : null,
          method,
          census_year: 2020,
        },
        status: den >= MIN_DENOMINATOR ? "ok" : "insufficient",
        datasetVersionIds: versionIds,
        attribution: censusVersion.attribution,
      });
    }
    return facts;
  },
};
