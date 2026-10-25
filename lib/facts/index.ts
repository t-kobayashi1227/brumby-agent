// ③事実シートの作成と保存（docs/設計まとめ.md「③事実シート」）
// 物件の位置から事実を集め（collect）、組み立て（build）、fact_sheets に保存する。エージェントにはこの JSON だけを渡す

import type { Sql } from "../db";
import { buildFacts } from "./build";
import { collect, todayJst } from "./collect";
import type { FactStepKey } from "./steps";
import type { FactSheet } from "./types";

/** 日本時間の ISO 形式（2026-10-23T15:30:00+09:00） */
export function nowJstIso(now = new Date()): string {
  return `${new Date(now.getTime() + 9 * 3600_000).toISOString().slice(0, 19)}+09:00`;
}

/** 事実シートを作る（保存はしない）。onStep は段階に入るたびに呼ぶ（lib/facts/steps.ts） */
export async function makeFactSheet(
  sql: Sql,
  propertyId: number,
  now = new Date(),
  onStep?: (step: FactStepKey) => void,
): Promise<{ sheet: FactSheet; assumptionIds: number[] }> {
  const collected = await collect(sql, propertyId, todayJst(now), onStep);
  onStep?.("save");
  const sheet: FactSheet = {
    物件ID: collected.property.code,
    作成日時: nowJstIso(now),
    距離の種類: "直線距離",
    事実: buildFacts(collected),
  };
  return { sheet, assumptionIds: collected.assumptions.map((a) => a.id) };
}

/** 事実シートを作って保存し、fact_sheets の id を返す */
export async function createFactSheet(sql: Sql, propertyId: number, onStep?: (step: FactStepKey) => void): Promise<{ id: number; sheet: FactSheet }> {
  const { sheet, assumptionIds } = await makeFactSheet(sql, propertyId, new Date(), onStep);
  const [row] = await sql<{ id: string }[]>`
    insert into fact_sheets (property_id, content, assumption_ids)
    values (${propertyId}, ${sql.json(sheet as never)}, ${assumptionIds})
    returning id
  `;
  return { id: Number(row.id), sheet };
}
