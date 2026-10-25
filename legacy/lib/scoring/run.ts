import type { Sql } from "../db";
import type { FactDraft } from "../types";
import { scoringDecisions } from "./decisions";
import { runScoring } from "./engine";
import { buildInputs, type ScoringCompetitor, type ScoringProperty } from "./inputs";
import { loadScoringConfig } from "./load";

// 分析の「ルール」の段階で、採点ルール表で採点して判断カードを作る（設計書 D35）

export async function loadScoringProperty(sql: Sql, propertyId: number): Promise<{ property: ScoringProperty; competitors: ScoringCompetitor[] }> {
  const [p] = await sql<(Omit<ScoringProperty, "land_sqm" | "building_sqm"> & { land_sqm: string | null; building_sqm: string | null })[]>`
    select property_type, price_man_yen, address, layout, land_sqm, building_sqm, parking, age_years, rooms, is_hiraya, has_garden, ward, town, manual_metrics, total_budget_man_yen
    from properties where id = ${propertyId}
  `;
  if (!p) throw new Error(`物件 ${propertyId} がありません`);
  const competitors = await sql<(Omit<ScoringCompetitor, "land_sqm" | "building_sqm"> & { land_sqm: string | null; building_sqm: string | null })[]>`
    select price_man_yen, land_sqm, building_sqm, layout, walk_min, parking, age_years from competitors where property_id = ${propertyId} order by position
  `;
  const num = (v: string | null) => (v === null ? null : Number(v));
  return {
    property: { ...p, land_sqm: num(p.land_sqm), building_sqm: num(p.building_sqm) },
    competitors: competitors.map((c) => ({ ...c, land_sqm: num(c.land_sqm), building_sqm: num(c.building_sqm) })),
  };
}

/** 採点して判断カードを返す。facts は seq の順（1から）に並んだ事実カード */
export async function scoreProperty(sql: Sql, propertyId: number, facts: FactDraft[]): Promise<{ decisions: FactDraft[]; version: number | null }> {
  const [config, { property, competitors }] = await Promise.all([loadScoringConfig(sql), loadScoringProperty(sql, propertyId)]);
  if (config.personas.length === 0) {
    throw new Error("採点ルール表の設定がありません（npm run import-scoring で Excel を取り込んでください）");
  }
  const inputs = buildInputs(config, property, facts.map((f, i) => ({ ...f, seq: i + 1 })), competitors);
  const result = runScoring(config, inputs);
  return { decisions: scoringDecisions(result, inputs, facts), version: config.version };
}
