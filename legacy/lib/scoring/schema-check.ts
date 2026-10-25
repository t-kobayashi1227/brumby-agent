import type { Sql } from "../db";

// 採点ルール表（設計書 D35）のマイグレーション（20261012100000_scoring.sql）が共有DBに入っているか
// 入る前は、新しい表・列を使わずに前の動き（旧ルール表）で動かす。入ったと分かったら、以後は確かめない

let ready = false;

export async function scoringSchemaReady(sql: Sql): Promise<boolean> {
  if (ready) return true;
  const [r] = await sql<{ tables: boolean; columns: boolean }[]>`
    select to_regclass('public.personas') is not null as tables,
      exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'properties' and column_name = 'age_years')
        and exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'competitors' and column_name = 'age_years') as columns
  `;
  ready = Boolean(r?.tables && r?.columns);
  return ready;
}

/** 物件の採点用の列（マイグレーション前は使わない） */
export const SCORING_PROPERTY_COLUMNS = ["age_years", "rooms", "is_hiraya", "has_garden", "ward", "town", "manual_metrics"] as const;
