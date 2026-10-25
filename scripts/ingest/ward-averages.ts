import type { Sql } from "../../lib/db";

// 区内の町の平均件数（docs/設計まとめ.md「周りの施設（L）の渡し方」）
// npm run ingest -- ward-averages [area=pref]
// 同じ区の町ごとに、町の中心から 1km 以内の施設の数を種類ごとに数え、その平均を ward_facility_averages に入れる
// 事実シートの「比較」（例：西区の町の平均 2.1件）に使う。施設を入れ直したら、計算し直す
// 水面（hcode 8154）は町に数えない。既定は新潟市の区だけ。area=pref で県内の市町村も（市町村全体を1つの「区」として）計算する

const RADIUS_M = 1000;
const WATER = 8154;

export async function computeWardAverages(sql: Sql, area: string | undefined): Promise<string> {
  if (area !== undefined && area !== "city" && area !== "pref") throw new Error("area は city（新潟市、既定）か pref（県全体）です");
  const prefix = area === "pref" ? "15%" : "151%";
  const rows = await sql.begin(async (tx) => {
    // 町の数 × 施設の種類だけ数えるので時間がかかる。このトランザクションだけ時間制限を延ばす
    await tx`set local statement_timeout = '10min'`;
    await tx`delete from ward_facility_averages where radius_m = ${RADIUS_M}`;
    return tx<{ ward: string; kinds: number; towns: number }[]>`
      with kinds as (select distinct kind from facilities),
      counts as (
        select t.ward, k.kind, (
          select count(*) from facilities f
          where f.kind = k.kind and extensions.st_dwithin(f.geog, t.center, ${RADIUS_M})
        ) as n
        from towns t cross join kinds k
        where t.city_code like ${prefix} and coalesce(t.hcode, 0) <> ${WATER}
      ),
      ins as (
        insert into ward_facility_averages (ward, kind, radius_m, avg_count, town_count)
        select ward, kind, ${RADIUS_M}, round(avg(n)::numeric, 2), count(*)
        from counts group by ward, kind
        returning ward, kind, town_count
      )
      select ward, count(*)::int as kinds, max(town_count)::int as towns from ins group by ward order by ward
    `;
  });
  return `区内の町の平均件数を計算しました：${rows.map((r) => `${r.ward}（町 ${r.towns}・${r.kinds}種類）`).join("、")}`;
}
