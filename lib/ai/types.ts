import type { FactStatus } from "../types";

// AI（lib/ai/）で共通に使う型（設計書 6.2・6.3）

/** facts テーブルの行（番号を振って保存した後のカード） */
export interface FactRow {
  seq: number;
  key: string;
  kind: "fact" | "decision";
  value: number | null;
  valueText: string | null;
  unit: string | null;
  comparison: number | null;
  status: FactStatus;
  basis: Record<string, unknown> | null;
  attribution: string | null;
}

/**
 * AIに渡す物件の情報（D28：最小にする）。物件名は物件ID、住所は町丁目までに丸める。氏名・連絡先は持たない
 * features（特徴）・access（交通）は訴求の言い換えに使うので渡す。この欄に個人名などを書かない運用にする
 */
export interface PropertySummary {
  ref: string;                          // 例：物件1
  propertyType: string;
  priceManYen: number | null;
  area: string;                         // 町丁目まで（例：新潟市中央区上近江）
  layout: string | null;
  landSqm: number | null;
  buildingSqm: number | null;
  parking: number | null;
  access: string | null;
  features: string | null;
  competitorCount: number;
}

/** 検証（6.3）：文ごとに、数字・種別・比較語・禁止表現を確かめた結果 */
export interface SentenceValidation {
  kind: string;
  text: string;
  cites: number[];
  /** カードの数字と一致しなかった数字（四捨五入の差は許したうえで残ったもの） */
  mismatches: string[];
  /** cites に、存在しないカード番号を指定していた場合 */
  unknownCites: number[];
  /** 数字以外の不合格の理由（引用がない、比べる値のない比較語、禁止表現、入力にない設備） */
  issues: string[];
}

export interface ParagraphValidation {
  sectionKey: string;
  paragraphKey: string;
  sentences: SentenceValidation[];
  ok: boolean;
}

export interface ValidationResult {
  ok: boolean;
  paragraphs: ParagraphValidation[];
}
