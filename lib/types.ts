import type { Sql } from "./db";

// 分析（集計の部品・ルール・AI）で共通に使う型（設計書 5章・6章）

export type FactStatus = "ok" | "insufficient" | "not_available";

/** 部品が返す事実カード。番号（seq）と実行（run_id）は、保存するときに付ける */
export interface FactDraft {
  key: string;                          // 例：hazard.flood
  kind?: "fact" | "decision";
  value?: number | null;
  valueText?: string | null;            // 数字でない値（学校名、浸水深の説明 など）
  unit?: string | null;
  comparison?: number | null;           // 比べる値（市区町村の値、物件の価格 など）
  scope?: Record<string, unknown> | null;
  basis?: Record<string, unknown> | null;
  status: FactStatus;
  datasetVersionIds: number[];
  attribution?: string | null;
}

/** 分析の条件。analysis_runs.params にそのまま保存する */
export interface AnalysisParams {
  radius_m: number;                     // 人口構成・将来人口の半径（中心部1km、郊外・周辺3km）
  facility_radius_m: number;            // 施設の数を数える半径
  price_min_n: number;                  // 相場で必要な件数
  price_years: number;                  // 相場の期間（直近何年）
  target_age: [number, number];         // 狙う層の年齢（例：30〜49歳）
}

export interface PropertyRow {
  id: number;
  name: string;
  property_type: string;
  price_man_yen: number | null;
  address: string;
  lon: number;
  lat: number;
  area_class: "center" | "suburb" | "outer" | null;
  land_sqm: number | null;
  building_sqm: number | null;
  layout: string | null;
  parking: number | null;
  access: string | null;
  features: string | null;
}

export interface VersionInfo {
  id: number;
  coverage: string;
  attribution: string;
}

/** 使用中の版。キーは「source/dataset」（例：reinfolib/XKT026） */
export type ActiveVersions = Map<string, VersionInfo[]>;

export interface AnalyzerContext {
  sql: Sql;
  property: PropertyRow;
  params: AnalysisParams;
  versions: ActiveVersions;
}

export interface Analyzer {
  name: string;
  run: (ctx: AnalyzerContext) => Promise<FactDraft[]>;
}
