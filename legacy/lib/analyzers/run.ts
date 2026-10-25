import type { Sql } from "../db";
import type { AnalysisParams, Analyzer, PropertyRow } from "../types";
import { competitorsAnalyzer } from "./competitors";
import { facilitiesAnalyzer } from "./facilities";
import { futureAnalyzer } from "./future";
import { hazardAnalyzer } from "./hazard";
import { marketAnalyzer } from "./market";
import { populationAnalyzer } from "./population";

// 分析の部品の一覧・条件の初期値・物件の読み込み（設計書 5.2・5.3）
// 実行そのもの（段階ごとに進める）は stages.ts

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
