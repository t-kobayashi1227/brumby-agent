import type { Sql } from "../db";
import type { AnalysisParams, Analyzer, FactDraft, PropertyRow } from "../types";
import { competitorsAnalyzer } from "./competitors";
import { facilitiesAnalyzer } from "./facilities";
import { futureAnalyzer } from "./future";
import { hazardAnalyzer } from "./hazard";
import { marketAnalyzer } from "./market";
import { populationAnalyzer } from "./population";
import type { AppealDef, CandidateDef } from "../rules/catalog";
import { runRules, type Rule } from "../rules/engine";
import { loadActiveVersions } from "./versions";

// 分析の実行（設計書 5.2）：実行を作る → 部品を順に呼ぶ → カードに番号を振って保存する
// 条件を変えて再実行すると、新しい実行として残る（古い結果と並べて比べられる）

/** 部品の一覧。作った順に足していく（設計書 5.3 の ①〜⑥） */
export const ANALYZERS: Analyzer[] = [hazardAnalyzer, facilitiesAnalyzer, populationAnalyzer, futureAnalyzer, marketAnalyzer, competitorsAnalyzer];

/** 条件の初期値。半径は中心部1km、郊外・周辺の市町村3km（設計書 5.3） */
export function defaultParams(areaClass: PropertyRow["area_class"]): AnalysisParams {
  return {
    radius_m: areaClass === "center" ? 1000 : 3000,
    facility_radius_m: 1000,
    price_min_n: 10,
    price_years: 3,
    target_age: [30, 49],
    min_top_score: 2,
    tie_margin: 0,
  };
}

export async function loadProperty(sql: Sql, propertyId: number): Promise<PropertyRow> {
  const [row] = await sql<PropertyRow[]>`
    select id, name, property_type, price_man_yen, address, area_class, land_sqm, building_sqm, layout, parking, access, features, total_budget_man_yen,
           extensions.st_x(geom) as lon, extensions.st_y(geom) as lat
    from properties where id = ${propertyId}
  `;
  if (!row) throw new Error(`物件 ${propertyId} がありません`);
  if (row.lon === null || row.lat === null) throw new Error(`物件 ${propertyId} に緯度経度がありません`);
  return { ...row, id: Number(row.id), land_sqm: row.land_sqm === null ? null : Number(row.land_sqm), building_sqm: row.building_sqm === null ? null : Number(row.building_sqm) };
}

export async function runAnalysis(
  sql: Sql,
  propertyId: number,
  overrides: Partial<AnalysisParams> = {},
  analyzers: Analyzer[] = ANALYZERS,
): Promise<{ runId: number; facts: FactDraft[] }> {
  const property = await loadProperty(sql, propertyId);
  const params = { ...defaultParams(property.area_class), ...overrides };
  const versions = await loadActiveVersions(sql);
  const allVersionIds = [...versions.values()].flat().map((v) => v.id);
  const [rules] = await sql<{ version: number | null }[]>`select max(id) as version from rule_revisions`;

  const [run] = await sql<{ id: number }[]>`
    insert into analysis_runs (property_id, params, dataset_version_ids, rules_version, status, stage)
    values (${propertyId}, ${sql.json(params as never)}, ${allVersionIds}, ${rules?.version ?? null}, 'running', 'analyze')
    returning id
  `;
  const runId = Number(run.id);

  try {
    const facts: FactDraft[] = [];
    for (const analyzer of analyzers) facts.push(...(await analyzer.run({ sql, property, params, versions })));

    // ルールで判断して、判断カード（kind = decision）を足す（設計書 6.1）
    await sql`update analysis_runs set stage = 'rules' where id = ${runId}`;
    const rules = await sql<Rule[]>`select id, kind, condition, effect, note, enabled, version from rules order by id`;
    const candidates = await sql<CandidateDef[]>`
      select id, label, description, property_types, sort_order, enabled, confidence from target_candidates order by sort_order, id
    `;
    const appeals = await sql<AppealDef[]>`
      select id, label, description, needs_facts, property_types, sort_order, enabled from appeal_items order by sort_order, id
    `;
    facts.push(...runRules({ rules, candidates, appeals }, facts, property, params));

    await sql.begin(async (tx) => {
      for (const [i, f] of facts.entries()) {
        await tx`
          insert into facts (run_id, seq, key, kind, value, value_text, unit, comparison, scope, basis, status, dataset_version_ids, attribution)
          values (${runId}, ${i + 1}, ${f.key}, ${f.kind ?? "fact"}, ${f.value ?? null}, ${f.valueText ?? null}, ${f.unit ?? null},
                  ${f.comparison ?? null}, ${f.scope ? tx.json(f.scope as never) : null}, ${f.basis ? tx.json(f.basis as never) : null},
                  ${f.status}, ${f.datasetVersionIds}, ${f.attribution ?? null})
        `;
      }
      await tx`update analysis_runs set status = 'succeeded', finished_at = now() where id = ${runId}`;
    });
    return { runId, facts };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`update analysis_runs set status = 'failed', error = ${message}, finished_at = now() where id = ${runId}`;
    throw error;
  }
}
