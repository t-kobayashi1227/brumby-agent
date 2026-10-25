import type { Analyzer, AnalyzerContext, FactDraft } from "../types";
import { fetchRecord, notFetched } from "./common";
import { singleVersion } from "./versions";

// ② 将来人口（設計書 5.3）：物件の周り（半径）の、2025年→2035年の人口と子育て世代の増減
// 国土数値情報の将来推計人口250mメッシュ（XKT013）。メッシュの中心が円に入るものを足す
// 年齢別は2025年から（2020年は総数だけ）なので、2025年を起点にする
// 人が少ないメッシュは秘匿され（HITOKU = *）、値は近くのメッシュ（@）に合算されているので、合算後の値（PT00 など）をそのまま足す

const FROM_YEAR = 2025;
const TO_YEAR = 2035;

/** 5歳ごとの項目の番号（PT01＝0〜4歳、PT02＝5〜9歳 …） */
function ageColumns([from, to]: [number, number]): string[] {
  const cols: string[] = [];
  for (let a = from; a <= to; a += 5) cols.push(`PT${String(a / 5 + 1).padStart(2, "0")}`);
  return cols;
}

interface Group {
  key: string;
  label: string;
  columns: string[];
}

async function sumMeshes(ctx: AnalyzerContext, radius: number, columns: string[], year: number) {
  const fields = columns.map((c) => `${c}_${year}`);
  const [row] = await ctx.sql<{ total: number; meshes: number }[]>`
    select coalesce(sum((select sum((g.properties->>f)::numeric) from unnest(${fields}::text[]) f)), 0)::float8 as total,
           count(*)::int as meshes
    from geo_features g, properties p
    where p.id = ${ctx.property.id} and g.api_id = 'XKT013'
      and extensions.st_dwithin(extensions.st_centroid(g.geom)::extensions.geography, p.geom::extensions.geography, ${radius})
  `;
  return { total: Number(row.total), meshes: row.meshes };
}

export const futureAnalyzer: Analyzer = {
  name: "将来人口",
  async run(ctx) {
    const radius = ctx.params.radius_m;
    const [from, to] = ctx.params.target_age;
    const groups: Group[] = [
      { key: "future.population_change", label: "総人口", columns: ["PT00"] },
      { key: `future.age_${from}_${to}_change`, label: `${from}〜${to}歳`, columns: ageColumns(ctx.params.target_age) },
      { key: "future.children_change", label: "0〜14歳", columns: ["PTA"] },
    ];
    const scope = { type: "radius", meters: radius, from_year: FROM_YEAR, to_year: TO_YEAR };
    const version = singleVersion(ctx.versions, "reinfolib/XKT013");
    const record = await fetchRecord(ctx, "XKT013");
    if (!version || !record || record.status === "failed") return groups.map((g) => notFetched(g.key, record, scope));
    if (radius > record.keep_m) {
      return groups.map((g) => ({
        key: g.key,
        status: "insufficient",
        scope,
        basis: { reason: `周りのデータを取った範囲（半径${record.keep_m}m）より、集計の半径（${radius}m）が大きい` },
        datasetVersionIds: [version.id],
        attribution: version.attribution,
      }) as FactDraft);
    }

    const facts: FactDraft[] = [];
    for (const g of groups) {
      const before = await sumMeshes(ctx, radius, g.columns, FROM_YEAR);
      const after = await sumMeshes(ctx, radius, g.columns, TO_YEAR);
      const change = before.total > 0 ? after.total / before.total - 1 : null;
      facts.push({
        key: g.key,
        value: change === null ? null : Math.round(change * 1000) / 1000,
        valueText: change === null
          ? null
          : `${g.label} ${FROM_YEAR}年 約${Math.round(before.total).toLocaleString("ja-JP")}人 → ${TO_YEAR}年 約${Math.round(after.total).toLocaleString("ja-JP")}人（${change >= 0 ? "+" : ""}${(change * 100).toFixed(1)}%）`,
        unit: "ratio",
        scope,
        basis: {
          [`population_${FROM_YEAR}`]: Math.round(before.total),
          [`population_${TO_YEAR}`]: Math.round(after.total),
          meshes: before.meshes,
          method: "250mメッシュの中心が半径の円に入るものを足した推計値（国土数値情報 将来推計人口をもとに作成）",
        },
        status: before.meshes > 0 && before.total >= 50 ? "ok" : "insufficient",
        datasetVersionIds: [version.id],
        attribution: version.attribution,
      });
    }
    return facts;
  },
};
