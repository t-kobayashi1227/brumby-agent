import { describe, expect, it } from "vitest";
import type { MainOutput, MediaOutput } from "../lib/agents/schemas";
import { evidenceText, sourceList, usedFactIds } from "../lib/report";
import type { Fact } from "../lib/facts/types";

const fact = (id: string, 出典: string, 時点: string, 値: string | null = "x", 比較?: string): Fact => ({
  id,
  項目: `項目${id}`,
  値,
  ...(比較 ? { 比較 } : {}),
  出典,
  時点,
  状態: 値 === null ? "取得できず" : "取得",
});

const FACTS = [
  fact("A-03", "新潟市OD 町名別5歳階級人口", "2026-09", "15.8%", "西区 11.9%"),
  fact("L-11", "OpenStreetMap・新潟県 大規模小売店舗一覧", "2026-10-24・2026-09"),
  fact("H-02", "国土数値情報 A33", "2025"),
  fact("P-02", "入力", "2026-10"),
  fact("T-03", "国土数値情報 S12", "2024", null),
];

const DATASETS = [
  { id: "D10", name: "町名別5歳階級人口", provider: "新潟市OD", as_of: "2026-09", row_count: 1, attribution: "出典：新潟市オープンデータ（CC BY 2.1 JP）を加工して作成" },
  { id: "D28", name: "スーパー・ドラッグストア・コンビニ", provider: "OpenStreetMap（Geofabrik 中部地方）", as_of: "2026-10-24", row_count: 1, attribution: "© OpenStreetMap contributors（ODbL）" },
  { id: "D29", name: "大規模小売店舗一覧", provider: "新潟県", as_of: "2026-09", row_count: 1, attribution: null },
  { id: "D33", name: "土砂災害警戒区域（A33）", provider: "国土数値情報", as_of: "2025", row_count: 1, attribution: "この国土数値情報（土砂災害警戒区域データ）は…" },
  { id: "D34", name: "津波浸水想定（A40）", provider: "国土数値情報", as_of: "2017", row_count: 1, attribution: "出典：国土数値情報（国土交通省）を加工して作成（CC BY 4.0）" },
];

const s = (evidence: string[]) => ({ text: "t", evidence });
const main: MainOutput = {
  summary: s(["P-02", "A-03"]),
  targets: [{ rank: 1, name: "x", source: "候補", definition: null, reason: "r", evidence: ["A-03"], confidence: "高" }],
  not_fit: [],
  appeals: [{ rank: 1, ...s(["L-11"]) }],
  price_view: { position: "相場なみ", sellability: "標準", ...s(["P-02"]) },
  concerns: [{ ...s(["H-02"]), action: "a" }],
  direction: s([" A-03 "]),
};
const media: MediaOutput = { media: [], cautions: [] };

describe("レポートの根拠と出典", () => {
  it("使った事実ID（出た順、重なりなし）", () => {
    expect(usedFactIds(main, media)).toEqual(["P-02", "A-03", "L-11", "H-02"]);
  });

  it("根拠の書き方。取れなかった事実は「不明」", () => {
    expect(evidenceText(FACTS[0])).toBe("項目A-03 15.8%（西区 11.9%）");
    expect(evidenceText(FACTS[4])).toBe("項目T-03 不明");
  });

  it("出典と時点の一覧（事実シートの順）と、使ったデータのクレジット文言", () => {
    const r = sourceList(FACTS, usedFactIds(main, media), DATASETS);
    expect(r.rows).toEqual([
      { 出典: "新潟市OD 町名別5歳階級人口", 時点: "2026-09" },
      { 出典: "OpenStreetMap・新潟県 大規模小売店舗一覧", 時点: "2026-10-24・2026-09" },
      { 出典: "国土数値情報 A33", 時点: "2025" },
      { 出典: "入力", 時点: "2026-10" },
    ]);
    // 津波（A40）は使っていないので出さない。A33 は決まった文言
    expect(r.credits).toEqual(["出典：新潟市オープンデータ（CC BY 2.1 JP）を加工して作成", "© OpenStreetMap contributors（ODbL）", "この国土数値情報（土砂災害警戒区域データ）は…"]);
  });
});
