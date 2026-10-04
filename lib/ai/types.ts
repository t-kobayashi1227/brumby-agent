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
  attribution: string | null;
}

export interface PropertySummary {
  name: string;
  propertyType: string;
  priceManYen: number | null;
  address: string;
  layout: string | null;
  landSqm: number | null;
  buildingSqm: number | null;
  access: string | null;
  features: string | null;
}

/** 検証（6.3）：文ごとに、数字が引用したカードと一致するかを確かめた結果 */
export interface SentenceValidation {
  text: string;
  cites: number[];
  /** カードの数字と一致しなかった数字（四捨五入の差は許したうえで残ったもの） */
  mismatches: string[];
  /** cites に、存在しないカード番号を指定していた場合 */
  unknownCites: number[];
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
