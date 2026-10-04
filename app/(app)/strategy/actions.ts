"use server";

import { getSql } from "../../../lib/db";
import type { FactDraft, PropertyRow } from "../../../lib/types";
import { simulateMediaAllocation, type MediaAllocation, type Rule } from "../../../lib/rules/engine";

// 予算別シミュレーション（ルール表の画面と同じルールエンジンで、総予算だけを変えて計算し直す）

export async function simulateBudget(propertyId: number, totalManYen: number): Promise<MediaAllocation[]> {
  const sql = getSql();
  const [property] = await sql<{ price_man_yen: number | null; land_sqm: string | null; building_sqm: string | null }[]>`
    select price_man_yen, land_sqm, building_sqm from properties where id = ${propertyId}
  `;
  if (!property) throw new Error(`物件 ${propertyId} がありません`);

  const [run] = await sql<{ id: number }[]>`
    select id from analysis_runs where property_id = ${propertyId} and status = 'succeeded' order by id desc limit 1
  `;
  if (!run) throw new Error("分析の実行がありません");

  const [facts, rules] = await Promise.all([
    sql<{ key: string; value: number | null; comparison: number | null; status: FactDraft["status"] }[]>`
      select key, value, comparison, status from facts where run_id = ${run.id}
    `,
    sql<Rule[]>`select id, kind, condition, effect, note, enabled, version from rules order by id`,
  ]);

  const factDrafts: FactDraft[] = facts.map((f) => ({
    key: f.key,
    value: f.value === null ? null : Number(f.value),
    comparison: f.comparison === null ? null : Number(f.comparison),
    status: f.status,
    datasetVersionIds: [],
  }));
  const propertyRow = {
    price_man_yen: property.price_man_yen,
    land_sqm: property.land_sqm === null ? null : Number(property.land_sqm),
    building_sqm: property.building_sqm === null ? null : Number(property.building_sqm),
  } as unknown as PropertyRow;

  return simulateMediaAllocation(rules, factDrafts, propertyRow, totalManYen);
}
