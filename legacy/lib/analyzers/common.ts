import type { AnalyzerContext, FactDraft } from "../types";

// 物件の周りのデータ（geo_features・property_fetches）を使う部品で共通の処理

export interface FetchRecord {
  status: "ok" | "empty" | "failed";
  keep_m: number;
  features_in_tiles: number;
  fetched_at: Date;
}

/** その物件で、そのAPIのデータを取った記録 */
export async function fetchRecord(ctx: AnalyzerContext, apiId: string): Promise<FetchRecord | null> {
  const [row] = await ctx.sql<FetchRecord[]>`
    select status, keep_m, features_in_tiles, fetched_at from property_fetches
    where property_id = ${ctx.property.id} and api_id = ${apiId}
  `;
  return row ?? null;
}

/** 周りのデータを取っていない・取得に失敗したときのカード */
export function notFetched(key: string, record: FetchRecord | null, scope: Record<string, unknown>): FactDraft {
  return {
    key,
    status: "not_available",
    scope,
    basis: { reason: record ? "周りのデータの取得に失敗しました" : "周りのデータをまだ取っていません" },
    datasetVersionIds: [],
  };
}

/** 物件の地点を含む地物の属性 */
export async function featuresAtPoint(ctx: AnalyzerContext, apiId: string) {
  return ctx.sql<{ properties: Record<string, unknown> }[]>`
    select g.properties
    from geo_features g, properties p
    where p.id = ${ctx.property.id} and g.api_id = ${apiId} and extensions.st_intersects(g.geom, p.geom)
  `;
}

/** 徒歩の目安（設計書 5.3：直線距離×1.3、分速80m） */
export function walking(straightM: number) {
  const walkM = Math.round(straightM * 1.3);
  return { straight_m: Math.round(straightM), walk_m: walkM, walk_min: Math.max(1, Math.ceil(walkM / 80)) };
}
