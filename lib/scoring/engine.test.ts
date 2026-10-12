import { existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { compareCompetitors, decideBudget, responseCoefficients, runScoring, scoreAffordability, scoreCompetition, scoreRuleLayer, scoreSalability } from "./engine";
import { buildInputs, roomsFromLayout, wardTownFromAddress } from "./inputs";
import type { InputValue, Persona, ScoringConfig, ScoringInputs } from "./types";
import { parseScoringWorkbook } from "../../scripts/scoring/parse";

// 採点ルール表（設計書 D35）の計算が、Excel の試算シートの式と同じになることを確かめる

const persona = (over: Partial<Persona> = {}): Persona => ({
  id: "B",
  label: "小中学生のいる家族",
  description: "",
  repAge: 40,
  downPaymentRate: 0.15,
  purchaseMethod: "loan",
  incomeDist: [0.016, 0.033, 0.066, 0.139, 0.197, 0.32, 0.164, 0.057, 0, 0.008],
  savingsDist: [],
  ageMix: { "30代": 0.5, "40代": 0.5 },
  buyerShareNew: 0.661,
  buyerShareUsed: 0.387,
  enabled: true,
  sortOrder: 1,
  ...over,
});

const baseConfig = (over: Partial<ScoringConfig> = {}): ScoringConfig => ({
  personas: [persona()],
  items: [{ key: "駐車_台", layer: "物件", importance: { B: 2 }, note: "" }],
  rules: [
    { id: "R16", layer: "物件", itemKey: "駐車_台", lower: null, upper: 0, reason: "駐車なし", source: null, fit: { B: "×" }, basisClass: null, basisNote: "", exclusiveGroup: "駐車_台", enabled: true },
    { id: "R17", layer: "物件", itemKey: "駐車_台", lower: 1, upper: 1, reason: "駐車1台", source: null, fit: { B: "－" }, basisClass: null, basisNote: "", exclusiveGroup: "駐車_台", enabled: true },
    { id: "R18", layer: "物件", itemKey: "駐車_台", lower: 2, upper: 2, reason: "駐車2台", source: null, fit: { B: "◎" }, basisClass: null, basisNote: "", exclusiveGroup: "駐車_台", enabled: true },
  ],
  params: {},
  competitorItems: [],
  market: [],
  popularity: [],
  media: [],
  usage: [],
  results: [],
  version: null,
  ...over,
});

const inputs = (values: Record<string, number | null>, over: Partial<ScoringInputs> = {}): ScoringInputs => ({
  values: Object.fromEntries(Object.entries(values).map(([k, v]): [string, InputValue] => [k, { value: v, source: "test" }])),
  ward: "中央区",
  town: "上近江",
  ageClass: "新築",
  isNew: true,
  competitors: [],
  inputBudgetManYen: null,
  ...over,
});

describe("物件・生活環境・市場の層", () => {
  it("該当したルールの点÷排他グループごとの最大の加点で0〜100点にする", () => {
    const config = baseConfig();
    // ◎(+2)×重視度2×5点 = 20点。満点も20点
    expect(scoreRuleLayer(config, inputs({ 駐車_台: 2 }), "B", "物件")).toMatchObject({ score: 100, raw: 20, max: 20 });
    // －は0点
    expect(scoreRuleLayer(config, inputs({ 駐車_台: 1 }), "B", "物件")).toMatchObject({ score: 0, raw: 0, max: 20 });
    // マイナスは0点で止める
    expect(scoreRuleLayer(config, inputs({ 駐車_台: 0 }), "B", "物件")).toMatchObject({ score: 0, raw: -20 });
  });

  it("値がない項目は素点からも満点からも外し、全部ないなら層を「データなし」にする", () => {
    const config = baseConfig();
    const r = scoreRuleLayer(config, inputs({ 駐車_台: null }), "B", "物件");
    expect(r.score).toBeNull();
    expect(r.missing).toEqual(["駐車_台"]);
  });
});

describe("購入可能性", () => {
  it("ローン：PMTで必要年収を出し、年収帯を按分して上回る割合を満点割合で割る", () => {
    const r = scoreAffordability(baseConfig(), inputs({ 価格_万円: 3780 }), persona());
    // 借入3213万円・35年・1.5% → 年間返済約118.0万円 → 必要年収約590万円
    expect(r.detail).toMatchObject({ method: "loan", years: 35, loanManYen: 3213, targetImage: "世帯年収600万円以上" });
    expect((r.detail as { requiredIncomeManYen: number }).requiredIncomeManYen).toBeCloseTo(590.2, 0);
    // 500〜700万の帯の(700−590)/200 ＋ 700万以上 = 約0.405 → ÷0.6 → 67点
    expect(r.score).toBe(67);
  });

  it("現金：今の家の売却見込みを引き、貯蓄の使える割合で割った額を貯蓄分布で判定する", () => {
    const savings = Array(19).fill(0);
    savings[18] = 0.211; // 4000万以上（上限6000万で按分）
    const r = scoreAffordability(baseConfig(), inputs({ 価格_万円: 3780 }), persona({ purchaseMethod: "cash", savingsDist: savings }));
    // (3780−1100)÷0.5 = 5360万円 → 0.211×(6000−5360)/2000 = 0.0675 → ÷0.6 → 11点
    expect(r.detail).toMatchObject({ method: "cash", requiredSavingsManYen: 5360, targetImage: "貯蓄5,400万円以上（今の家の売却と合わせて購入）" });
    expect(r.score).toBe(11);
  });
});

describe("競合", () => {
  const config = baseConfig({
    competitorItems: [{ key: "価格_万円", label: "価格", direction: -1, importance: { B: 2 }, tieMargin: 100 }],
    market: [{ ward: "中央区", ageClass: "新築", priceManYen: 3500, buildingSqm: 100, landSqm: 135, ageYears: 0, n: 190 }],
  });

  it("勝ち−負けを競合の件数で割り、重視度で重み付けして50点を中心に採点する", () => {
    const c = compareCompetitors(config, inputs({ 価格_万円: 3780 }, { competitors: [{ 価格_万円: 3680 }, { 価格_万円: 3880 }, { 価格_万円: 3980 }] }));
    // 3680・3880とは100万円差（同等とみなす差）で引き分け、3980には勝ち → 1/3
    expect(c.items[0]).toMatchObject({ against: "競合" });
    expect(c.items[0].net).toBeCloseTo(1 / 3);
    // 50 ＋ 50×(2×1/3)÷2 = 66.7 → 67点
    expect(scoreCompetition(config, c, "B").score).toBe(67);
  });

  it("競合がないときは層を外し、項目は周辺の取引の中央値と比べる（±0.5点）", () => {
    const c = compareCompetitors(config, inputs({ 価格_万円: 3780 }));
    expect(c.hasCompetitors).toBe(false);
    expect(c.items[0]).toMatchObject({ against: "周辺の取引", net: -0.5, median: 3500 });
    expect(scoreCompetition(config, c, "B").score).toBeNull();
  });
});

describe("総合・予算・媒体", () => {
  it("採点できない層は重みから外し、買い手の多さを15%で合わせる", () => {
    const r = runScoring(baseConfig(), inputs({ 駐車_台: 2, 価格_万円: null }));
    // 物件100点だけが採点できる → 100×0.85 ＋ 買い手の多さ100×0.15
    expect(r.personas[0]).toMatchObject({ total: 100, buyerScore: 100 });
  });

  it("売れやすさと広告予算（1万円単位）・最初に使う額（千円単位）", () => {
    const config = baseConfig({ popularity: [{ ward: "中央区", town: "上近江", score: 71 }] });
    const s = scoreSalability(config, inputs({ 価格_相場比: 1.08 }), { rank: 1, id: "B", label: "B", description: "", total: 83.1, buyerScore: 100, layers: [], targetImage: null });
    // 71×0.35 ＋ 30×0.4 ＋ 83.1×0.25 = 57.6 → 58点（標準）
    expect(s).toMatchObject({ score: 58, class: "標準", priceRatio: { score: 30 } });
    const b = decideBudget(config, inputs({ 価格_万円: 3780 }), s);
    // 3780万円×0.5%×1.0 = 18.9万円 → 19万円。最初に60%＝11.4万円
    expect(b).toMatchObject({ totalManYen: 19, initialManYen: 11.4, additionalManYen: 7.6, source: "rule" });
  });

  it("入力された総予算があれば提案値より優先する（D15）", () => {
    const s = { popularity: { label: "", score: 50 }, priceRatio: { value: null, score: null }, fit: { label: null, score: null }, score: 50, class: "標準" as const };
    expect(decideBudget(baseConfig(), inputs({ 価格_万円: 3780 }, { inputBudgetManYen: 30 }), s)).toMatchObject({ totalManYen: 30, source: "input", suggestedManYen: 19 });
  });

  it("反響係数：問い合わせが少ないうちは1.00、多ければ平均の単価÷その媒体の単価（0.5〜2.0）", () => {
    const config = baseConfig({
      media: [
        { id: "a", label: "a", statName: null, flatReach: 10, enabled: true, formatExample: "", sortOrder: 1 },
        { id: "b", label: "b", statName: null, flatReach: 10, enabled: true, formatExample: "", sortOrder: 2 },
      ],
      results: [
        { mediaId: "a", costYen: 100000, inquiries: 20 },
        { mediaId: "b", costYen: 300000, inquiries: 5 },
      ],
    });
    // 平均 400000/25 = 16000円。a は 5000円 → 3.2 → 2.0 に制限。b は5件で開始件数（10）未満 → 1.00
    expect(responseCoefficients(config)).toEqual({ a: 2, b: 1 });
  });
});

describe("入力の読み取り", () => {
  it("間取りから居室数、住所から区と町を読む", () => {
    expect(roomsFromLayout("4LDK")).toBe(4);
    expect(roomsFromLayout("３SLDK")).toBe(3);
    expect(roomsFromLayout(null)).toBeNull();
    expect(wardTownFromAddress("新潟県新潟市中央区上近江2丁目3-4")).toEqual({ ward: "中央区", town: "上近江" });
    expect(wardTownFromAddress("新潟市西区山田")).toEqual({ ward: "西区", town: "山田" });
  });

  it("手入力の値を事実カードより優先し、市との比は値÷比べる値にする", () => {
    const property = {
      property_type: "新築戸建", price_man_yen: 3780, address: "新潟市中央区上近江2丁目", layout: "4LDK", land_sqm: 165, building_sqm: 105, parking: 2,
      age_years: null, rooms: null, is_hiraya: null, has_garden: true, ward: null, town: null, manual_metrics: { 駅_m: 900 }, total_budget_man_yen: null,
    };
    const facts = [
      { key: "facility.station_nearest", value: 1600, status: "ok" as const, datasetVersionIds: [1] },
      { key: "target.age_65plus_ratio", value: 0.3, comparison: 0.25, status: "ok" as const, datasetVersionIds: [2] },
    ];
    const config = baseConfig({ market: [{ ward: "中央区", ageClass: "新築", priceManYen: 3500, buildingSqm: null, landSqm: null, ageYears: null, n: null }] });
    const r = buildInputs(config, property, facts, []);
    expect(r.values["駅_m"]).toMatchObject({ value: 900, source: "手入力" });
    expect(r.values["高齢者比率_市比"]).toMatchObject({ value: 1.2 });
    expect(r.values["部屋数"].value).toBe(4);
    expect(r.values["築年数"].value).toBe(0);
    expect(r.values["平屋"].value).toBeNull();
    expect(r.values["価格_相場比"].value).toBe(1.08);
    expect(r).toMatchObject({ ward: "中央区", town: "上近江", ageClass: "新築", isNew: true });
  });
});

// Excel 本体での確認（ファイルは Git に入れない。SCORING_XLSX にパスを入れたときだけ動く）
const xlsx = process.env.SCORING_XLSX;
describe.skipIf(!xlsx || !existsSync(xlsx))("Excel 初版 v0.26 の試算シート", () => {
  it("サンプル物件（中央区・新築・3,780万円・4LDK）の第1ターゲットは B、予算19万円", () => {
    const { config, warnings } = parseScoringWorkbook(xlsx!);
    expect(warnings).toEqual([]);
    const v = (value: number) => ({ value, source: "試算" });
    const values = {
      価格_万円: v(3780), 部屋数: v(4), "延床_㎡": v(105), "土地_㎡": v(165), 駐車_台: v(2), 築年数: v(0), 駅_m: v(1600), バス停_m: v(250), 平屋: v(0), 庭: v(1),
      小学校_m: v(640), 保育園_800m内: v(3), スーパー_m: v(480), 病院_m: v(1200), 公園_m: v(320), 子あり世帯比率_市比: v(1.15), 高齢者比率_市比: v(1.2),
      単身世帯比率_市比: v(0.8), 子育て世代_5年変化: v(1.08), 相場_万円: v(3500), 価格_相場比: v(1.08),
    };
    const competitors = [
      { 価格_万円: 3680, 築年数: 0, 部屋数: 4, "延床_㎡": 102, "土地_㎡": 150, 駐車_台: 2, 駅_m: 2400, 小学校_m: 900 },
      { 価格_万円: 3880, 築年数: 0, 部屋数: 3, "延床_㎡": 98, "土地_㎡": 170, 駐車_台: 2, 駅_m: 1500, 小学校_m: 700 },
      { 価格_万円: 3980, 築年数: 3, 部屋数: 4, "延床_㎡": 108, "土地_㎡": 190, 駐車_台: 1, 駅_m: 1400, 小学校_m: 600 },
    ];
    const r = runScoring(config, { values, ward: "中央区", town: "上近江", ageClass: "新築", isNew: true, competitors, inputBudgetManYen: null });
    expect(r.personas.map((p) => p.id).slice(0, 3)).toEqual(["B", "A", "F"]);
    expect(r.personas[0].targetImage).toBe("世帯年収600万円以上");
    expect(r.budget).toMatchObject({ totalManYen: 19, initialManYen: 11.4 });
    expect(r.media.filter((m) => m.share > 0).map((m) => m.id)).toEqual(["instagram", "youtube", "line", "portal", "google_search"]);
  });
});
