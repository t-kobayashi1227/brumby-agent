// ③事実シートの組み立て（docs/設計まとめ.md「③事実シート」）
// collect.ts が DB から集めた値（Collected）を、事実（項目・値・比較・出典・時点・状態）に直す。DB には触れない
// 計算（距離・件数・割合・返済額・相場比）はここと lib/calc で済ませ、結果だけを「値」に入れる。取れなかった値は「取得できず」

import { calcLoan, loanTerm, shareAboveIncome, type LoanAssumptions } from "../calc/loan";
import {
  formatChange,
  formatDistance,
  formatManYen,
  formatManYen1,
  formatNearby,
  formatNumber,
  formatPct,
  median,
  type NearbyItem,
} from "./format";
import { numberFacts, type Fact, type FactCategory, type FactDraft, type FactStatus } from "./types";

// ---- 入力の形 ----

export interface DatasetInfo {
  id: string;
  name: string;
  provider: string;
  as_of: string | null;
  row_count: number | null;
}

export interface PropertyInput {
  code: string;
  property_class: "新築" | "中古";
  price_man_yen: number;
  address: string;
  layout: string;
  rooms: number | null;
  storerooms: number | null;
  building_sqm: number;
  land_sqm: number;
  parking: number;
  building_age: number;
  floors: string;
  has_garden: boolean;
  renovated: boolean;
  renovation_year: number | null;
  renovation_parts: string[] | null;
  features: string | null;
  ad_budget_man_yen: number | null;
}

export interface TransportInput {
  mode: "電車" | "バス";
  line: string | null;
  stop_name: string;
  walk_min: number;
}

export interface TownInfo {
  key_code: string;
  name: string;
  ward: string;
  city_code: string;
}

export interface AgeBand {
  from: number;
  /** 上限なし（築50年以上）は null */
  to: number | null;
}

/** 相場に使う戸建ての取引（collect.ts の条件で絞ったもの） */
export interface MarketTrade {
  year: number;
  building_year: number;
  /** 取引価格（円） */
  price: number;
  floor_sqm: number;
  land_sqm: number | null;
}

export interface MarketInput {
  band: AgeBand;
  /** 相場に使った取引の最初と最後の年 */
  fromYear: number;
  toYear: number;
  /** 物件のある区の、同じ築年数帯で、年の範囲に入る取引 */
  trades: MarketTrade[];
}

export interface LandPriceInput {
  dataset_id: string;
  address: string | null;
  price_per_sqm: number | null;
  change_rate: number | null;
  year: number;
  distance_m: number;
}

/** basis：何で照らし合わせたか（物件の位置の町丁目か、入力の住所か） */
export type SchoolInput =
  | { status: "decided"; school: string; distance_m: number | null; basis: "位置" | "住所" }
  | { status: "ambiguous"; candidates: string[]; basis: "位置" | "住所" }
  | { status: "none" };

export interface NearbyKindInput {
  /** 項目の名前（例：スーパー、小児科のある病院・診療所） */
  label: string;
  within1km: NearbyItem[];
  nearest3km: NearbyItem | null;
  /** 区内の町の平均件数。計算していなければ null */
  wardAverage: number | null;
  datasetIds: string[];
}

export interface StationInput {
  name: string;
  lines: string[];
  distance_m: number;
  /** 1日あたりの乗降客数。0 の駅は「公表なし」、S12 に無い駅は null（取得できず） */
  passengers: number | "公表なし" | null;
}

/** バス停（停留所の名前でまとめたもの）。系統数は事業者ごとの点の合計 */
export interface BusStopInput extends NearbyItem {
  routes: number | null;
  operators: string[];
}

export interface BusInput {
  within1km: NearbyItem[];
  nearest: BusStopInput | null;
  wardAverage: number | null;
}

export interface ZoneHit {
  dataset_id: string;
  kind: string;
  label: string;
  attrs: Record<string, unknown> | null;
}

/** 統計の値（metric → 値）。秘匿などは null */
export type MetricMap = Record<string, number | null>;

export interface MeshTotals {
  total2025: number;
  total2035: number;
  kids2025: number;
  kids2035: number;
}

export interface AreaInput {
  /** 町名別5歳階級人口（D10）の町と区。町が見つからなければ null */
  d10Town: MetricMap | null;
  d10Ward: MetricMap | null;
  /** 国勢調査（D05〜D08）の町と区。キーは dataset_id */
  censusTown: Record<string, MetricMap>;
  censusWard: Record<string, MetricMap>;
  meshNear: MeshTotals | null;
  meshWard: MeshTotals | null;
}

export interface StatRow {
  item: string;
  value: number;
}

export interface BuyersInput {
  /** 物件区分に合う区分（中古戸建を買った世帯 / 分譲戸建を買った世帯） */
  segment: string;
  income: StatRow[];
  incomeSource: string | null;
  ages: StatRow[];
  agesSource: string | null;
  search: StatRow[];
  searchSource: string | null;
  /** 総務省の調査（B06）。分類ごと・項目ごとに年代別の値 */
  media: { category: string; item: string; byAge: { age: string; value: number }[]; source: string | null }[];
}

export interface AssumptionRow {
  id: number;
  key: string;
  value: number;
  unit: string;
  as_of: string;
  /** 根拠（例：住宅市場動向調査…） */
  basis?: string;
}

export interface TargetInput {
  name: string;
  representative_age: number;
  definition: string | null;
  /** 今の家を売ったお金を頭金にする候補（50代の住み替え・60歳以上）。住み替えの頭金での返済も出す */
  uses_resale_down_payment?: boolean | null;
}

export interface CompetitorInput {
  position: number;
  price_man_yen: number | null;
  address: string | null;
  building_sqm: number | null;
  land_sqm: number | null;
  building_age: number | null;
  distance_m: number | null;
}

export interface MediaRow {
  id: string;
  name: string;
  category: string;
  purpose: string;
  reach_ages: string;
}

export interface Collected {
  /** 事実シートを作る日（YYYY-MM-DD、日本時間）。入力の事実の「時点」に使う */
  today: string;
  property: PropertyInput;
  transports: TransportInput[];
  datasets: Record<string, DatasetInfo>;
  town: TownInfo | null;
  market: MarketInput | null;
  /** 広さの近い取引だけの相場（docs/相場の出し方変更.md 3.8） */
  similarMarket: MarketInput | null;
  landPrice: LandPriceInput | null;
  zones: ZoneHit[];
  schools: { elementary: SchoolInput; juniorHigh: SchoolInput };
  facilities: NearbyKindInput[];
  departments: NearbyKindInput[];
  station: StationInput | null;
  bus: BusInput;
  area: AreaInput;
  buyers: BuyersInput;
  assumptions: AssumptionRow[];
  targets: TargetInput[];
  competitors: CompetitorInput[];
  media: MediaRow[];
}

// ---- 共通 ----

const NOT_FOUND: FactStatus = "取得できず";

/** 出典の文言（例：国土数値情報 A31a、e-Stat 国勢調査 T001082、OpenStreetMap） */
export function sourceOf(d: DatasetInfo | undefined): string {
  if (!d) return "不明";
  if (d.provider.startsWith("OpenStreetMap")) return "OpenStreetMap";
  const code = /（([A-Za-z0-9]+)）$/.exec(d.name)?.[1];
  if (code) return d.provider.includes(code) ? d.provider : `${d.provider} ${code}`;
  if (/\s/.test(d.provider)) return d.provider;
  return `${d.provider} ${d.name}`;
}

function sourcesOf(c: Collected, ids: string[]): { 出典: string; 時点: string } {
  const ds = ids.map((id) => c.datasets[id]).filter(Boolean);
  if (ds.length === 0) return { 出典: "不明", 時点: "不明" };
  return {
    出典: [...new Set(ds.map(sourceOf))].join("・"),
    時点: [...new Set(ds.map((d) => d.as_of ?? "不明"))].join("・"),
  };
}

function loaded(c: Collected, id: string): boolean {
  return (c.datasets[id]?.row_count ?? 0) > 0;
}

function fact(category: FactCategory, 項目: string, 値: string | null, src: { 出典: string; 時点: string }, opts: { 比較?: string; 状態?: FactStatus } = {}): FactDraft {
  return { category, 項目, 値, ...(opts.比較 ? { 比較: opts.比較 } : {}), ...src, 状態: opts.状態 ?? (値 === null ? NOT_FOUND : "取得") };
}

function sqm(n: number): string {
  const s = formatNumber(n, Number.isInteger(n) ? 0 : 2);
  return `${s.includes(".") ? s.replace(/\.?0+$/, "") : s}㎡`;
}

// ---- P 物件 ----

function propertyFacts(c: Collected): FactDraft[] {
  const p = c.property;
  const src = { 出典: "入力", 時点: c.today.slice(0, 7) };
  const layout =
    p.rooms !== null && p.storerooms !== null ? `居室${p.rooms}・納戸${p.storerooms}（${p.layout}）` : `${p.layout}（居室と納戸に分けられない書き方）`;
  const renovation = p.renovated
    ? `${p.renovation_year ?? "年は不明"}年：${(p.renovation_parts ?? []).join("・") || "箇所は不明"}`
    : "なし";
  return [
    fact("P", "物件区分", p.property_class, src),
    fact("P", "価格", formatManYen(p.price_man_yen * 10_000), src),
    fact("P", "間取り", layout, src),
    fact("P", "建物面積", sqm(p.building_sqm), src),
    fact("P", "土地面積", sqm(p.land_sqm), src),
    fact("P", "駐車台数", `${p.parking}台`, src),
    fact("P", "築年数", p.building_age === 0 ? "新築（築0年）" : `築${p.building_age}年`, src),
    fact("P", "階数", p.floors, src),
    fact("P", "庭", p.has_garden ? "あり" : "なし", src),
    fact("P", "リフォーム", renovation, src),
    fact("P", "特徴ピックアップ（物件資料のまま）", p.features ?? "入力なし", src),
    fact("P", "所在地", p.address, src),
    fact("P", "広告予算の総額", p.ad_budget_man_yen ? formatManYen(p.ad_budget_man_yen * 10_000) : "入力なし", src),
  ];
}

// ---- M 相場 ----

// 築0〜1年、2〜9年、10〜19年 … 40〜49年、50年以上（2026-10-27 小林さんと決定）
export function ageBandOf(age: number): AgeBand {
  if (age >= 50) return { from: 50, to: null };
  if (age <= 1) return { from: 0, to: 1 };
  if (age <= 9) return { from: 2, to: 9 };
  const from = Math.floor(age / 10) * 10;
  return { from, to: from + 9 };
}

export function bandLabel(b: AgeBand): string {
  return b.to === null ? `築${b.from}年以上` : `築${b.from}〜${b.to}年`;
}

/** 直近の年数と、直近だけで足りるとみなす件数（docs/相場の出し方変更.md 3.5） */
export const MARKET_RECENT_YEARS = 5;
export const MARKET_MIN_COUNT = 20;
/** 1坪の面積（㎡）。400/121 ≒ 3.30578 */
export const TSUBO_SQM = 400 / 121;

/** 1坪あたりの価格（円） */
export function pricePerTsubo(priceYen: number, floorSqm: number): number {
  return (priceYen / floorSqm) * TSUBO_SQM;
}

/**
 * 相場に使う取引を選ぶ。帯に入る取引のうち、直近5年（取り込んだ最新の年から数える）で20件以上なら直近5年、
 * 足りなければ全部の年（20件未満でもそのまま）。帯は広げない。0件なら null（2026-10-28 小林さんと決定）
 */
export function selectMarket(rows: MarketTrade[], band: AgeBand, latestYear: number): MarketInput | null {
  const inBand = rows.filter((r) => {
    const age = r.year - r.building_year;
    return age >= band.from && (band.to === null || age <= band.to);
  });
  const recent = inBand.filter((r) => r.year > latestYear - MARKET_RECENT_YEARS);
  const trades = recent.length >= MARKET_MIN_COUNT ? recent : inBand;
  if (trades.length === 0) return null;
  const years = trades.map((r) => r.year);
  return { band, fromYear: Math.min(...years), toYear: Math.max(...years), trades };
}

/** 広さの近い取引の範囲（物件の何倍か）と、件数が少ないとみなす件数（docs/相場の出し方変更.md 3.8） */
export const SIMILAR_SIZE_RATIO = { min: 0.7, max: 1.3 } as const;
export const SIMILAR_MIN_COUNT = 10;

/** 物件の面積から、広さの近い取引の範囲（㎡） */
export function similarRange(sqm: number): { min: number; max: number } {
  return { min: sqm * SIMILAR_SIZE_RATIO.min, max: sqm * SIMILAR_SIZE_RATIO.max };
}

/**
 * 広さの近い取引だけの相場。延床面積・土地面積がどちらも物件の 0.7〜1.3倍（両端を含む）の取引に絞り、
 * 年の範囲は selectMarket と同じ決まりで選ぶ。土地面積の無い取引は使わない
 */
export function selectSimilarMarket(
  rows: MarketTrade[],
  band: AgeBand,
  latestYear: number,
  property: { building_sqm: number; land_sqm: number },
): MarketInput | null {
  const floor = similarRange(property.building_sqm);
  const land = similarRange(property.land_sqm);
  const near = rows.filter(
    (r) => r.floor_sqm >= floor.min && r.floor_sqm <= floor.max && r.land_sqm !== null && r.land_sqm >= land.min && r.land_sqm <= land.max,
  );
  return selectMarket(near, band, latestYear);
}

const formatTsubo = (yen: number) => `${formatManYen1(yen)}/坪`;

function marketFacts(c: Collected): FactDraft[] {
  const src = sourcesOf(c, ["D01"]);
  const m = c.market;
  const p = c.property;
  const ward = c.town?.ward ?? "区";
  const band = bandLabel(m?.band ?? ageBandOf(p.building_age));
  const labels = {
    unit: `区の相場（${ward}・${band}・戸建・延床の坪単価）`,
    ratio: `相場比（${ward}の${band}の延床の坪単価の中央値に対する、物件の坪単価）`,
    floor: `区の相場の取引の延床面積（${ward}・${band}）`,
    land: `区の相場の取引の土地面積（${ward}・${band}）`,
  };
  if (!m) return [...Object.values(labels).map((l) => fact("M", l, null, src)), similarFact(c, ward, band, pricePerTsubo(p.price_man_yen * 10_000, p.building_sqm)), landFact(c)];
  // 区×築年数帯の、延床の坪単価の中央値で比べる。総額の相場は出さない（docs/相場の出し方変更.md 3.6）
  const period = { ...src, 時点: `${m.fromYear}〜${m.toYear}` };
  const unitMedian = median(m.trades.map((t) => pricePerTsubo(t.price, t.floor_sqm)));
  const own = pricePerTsubo(p.price_man_yen * 10_000, p.building_sqm);
  const floorMedian = median(m.trades.map((t) => t.floor_sqm));
  const landMedian = median(m.trades.flatMap((t) => (t.land_sqm === null ? [] : [t.land_sqm])));
  return [
    fact("M", labels.unit, unitMedian !== null ? `中央値${formatTsubo(unitMedian)}（${m.trades.length}件）` : null, period),
    fact("M", labels.ratio, unitMedian !== null ? `${(own / unitMedian).toFixed(2)}倍（物件${formatTsubo(own)}）` : null, period),
    fact("M", labels.floor, floorMedian !== null ? `中央値${sqm(floorMedian)}（物件${sqm(p.building_sqm)}）` : null, period),
    fact("M", labels.land, landMedian !== null ? `中央値${sqm(landMedian)}（物件${sqm(p.land_sqm)}）` : null, period),
    similarFact(c, ward, band, own),
    landFact(c),
  ];
}

/** 広さの近い取引の相場（docs/相場の出し方変更.md 3.8）。相場比は出さず、物件の坪単価を並べる */
function similarFact(c: Collected, ward: string, band: string, own: number): FactDraft {
  const p = c.property;
  const floor = similarRange(p.building_sqm);
  const land = similarRange(p.land_sqm);
  const label = `広さの近い取引の相場（${ward}・${band}・延床${Math.round(floor.min)}〜${Math.round(floor.max)}㎡・土地${Math.round(land.min)}〜${Math.round(land.max)}㎡・延床の坪単価）`;
  const s = c.similarMarket;
  const src = sourcesOf(c, ["D01"]);
  const unitMedian = s ? median(s.trades.map((t) => pricePerTsubo(t.price, t.floor_sqm))) : null;
  if (!s || unitMedian === null) return fact("M", label, null, src);
  const few = s.trades.length < SIMILAR_MIN_COUNT ? "。件数が少ない" : "";
  return fact("M", label, `中央値${formatTsubo(unitMedian)}（${s.trades.length}件${few}。物件${formatTsubo(own)}）`, { ...src, 時点: `${s.fromYear}〜${s.toYear}` });
}

function landFact(c: Collected): FactDraft {
  const l = c.landPrice;
  if (!l) return fact("M", "近くの公示地・基準地（住宅地）", "3km以内に住宅地の地点なし", sourcesOf(c, ["D02", "D03"]));
  const price = l.price_per_sqm !== null ? `${formatNumber(l.price_per_sqm)}円/㎡` : "価格不明";
  const change = l.change_rate !== null ? `（前年比${formatChange(l.change_rate)}）` : "";
  const where = l.address ? `、所在地：${l.address.replace(/\s+/g, "")}` : "";
  const kind = l.dataset_id === "D02" ? "公示地" : "基準地";
  return fact("M", `近くの${kind}（住宅地）`, `${price}${change}、物件から${formatDistance(l.distance_m)}${where}`, {
    ...sourcesOf(c, [l.dataset_id]),
    時点: String(l.year),
  });
}

// ---- R 規制 ----

function zoningFacts(c: Collected): FactDraft[] {
  const src = sourcesOf(c, ["D04"]);
  if (!loaded(c, "D04")) return [fact("R", "用途地域", null, src)];
  const labels = [...new Set(c.zones.filter((z) => z.kind === "用途地域").map((z) => z.label))];
  return [fact("R", "用途地域", labels.length ? labels.join("、") : "用途地域の指定なし", src)];
}

// ---- A エリア ----

function sum(map: MetricMap | null | undefined, keys: string[]): number | null {
  if (!map) return null;
  let s = 0;
  for (const k of keys) {
    const v = map[k];
    if (v === null || v === undefined) return null;
    s += v;
  }
  return s;
}

function ratio(map: MetricMap | null | undefined, num: string[], den: string): number | null {
  const n = sum(map, num);
  const d = sum(map, [den]);
  return n === null || d === null || d === 0 ? null : (n / d) * 100;
}

function range5(from: number, to: number, fmt: (a: number) => string): string[] {
  const out = [];
  for (let a = from; a <= to; a += 5) out.push(fmt(a));
  return out;
}

const D10_AGE = (a: number) => `${a}〜${a + 4}歳`;
const D05_AGE = (a: number) => `総数${a}～${a + 4}歳`;

/** 年齢の区切り。D10（町名別5歳階級人口）と、町が見つからないときに使う D05（国勢調査） */
const AGE_GROUPS: { label: string; d10: string[]; d05: string[] }[] = [
  { label: "0〜14歳", d10: range5(0, 10, D10_AGE), d05: ["総数15歳未満"] },
  { label: "20〜39歳", d10: range5(20, 35, D10_AGE), d05: range5(20, 35, D05_AGE) },
  { label: "40〜59歳", d10: range5(40, 55, D10_AGE), d05: range5(40, 55, D05_AGE) },
  { label: "65歳以上", d10: [...range5(65, 110, D10_AGE), "115歳〜"], d05: ["総数65歳以上"] },
];

function areaFacts(c: Collected): FactDraft[] {
  const a = c.area;
  const t = c.town;
  const ward = t?.ward ?? "区";
  const out: FactDraft[] = [];
  out.push(fact("A", "物件のある町", t ? `${t.ward} ${t.name}` : null, sourcesOf(c, ["D39"])));

  // 年齢構成：町名別5歳階級人口（新しい）を使い、町が見つからなければ国勢調査
  const useD10 = a.d10Town !== null && sum(a.d10Town, ["人口計"]) !== null;
  const ageSrc = useD10 ? sourcesOf(c, ["D10"]) : sourcesOf(c, ["D05"]);
  if (useD10) {
    const pop = sum(a.d10Town, ["人口計"]);
    const hh = sum(a.d10Town, ["世帯数"]);
    const wp = sum(a.d10Ward, ["人口計"]);
    const wh = sum(a.d10Ward, ["世帯数"]);
    out.push(
      fact("A", "町の人口と世帯数", pop !== null ? `${formatNumber(pop)}人・${hh !== null ? `${formatNumber(hh)}世帯` : "世帯数不明"}` : null, ageSrc, {
        比較: wp !== null ? `${ward} ${formatNumber(wp)}人・${wh !== null ? `${formatNumber(wh)}世帯` : "世帯数不明"}` : undefined,
      }),
    );
  }
  for (const g of AGE_GROUPS) {
    const town = useD10 ? ratio(a.d10Town, g.d10, "人口計") : ratio(a.censusTown.D05, g.d05, "総数、年齢「不詳」含む");
    const wardV = useD10 ? ratio(a.d10Ward, g.d10, "人口計") : ratio(a.censusWard.D05, g.d05, "総数、年齢「不詳」含む");
    out.push(fact("A", `${g.label}の割合`, town !== null ? formatPct(town) : null, ageSrc, { 比較: wardV !== null ? `${ward} ${formatPct(wardV)}` : undefined }));
  }

  // 世帯（D06 から計算。D09 は取り込まず、ここで割合を出す。docs/データ取り込み一覧.md 注1）
  const census: { label: string; ds: string; num: string[]; den: string }[] = [
    { label: "18歳未満の世帯員のいる世帯の割合", ds: "D06", num: ["18歳未満世帯員のいる一般世帯総数"], den: "一般世帯総数" },
    { label: "6歳未満の世帯員のいる世帯の割合", ds: "D06", num: ["6歳未満世帯員のいる一般世帯総数"], den: "一般世帯総数" },
    { label: "65歳以上の世帯員のいる世帯の割合", ds: "D06", num: ["65歳以上世帯員のいる一般世帯総数"], den: "一般世帯総数" },
    { label: "核家族世帯の割合", ds: "D06", num: ["核家族世帯"], den: "一般世帯総数" },
    // 親族のみの世帯のうち核家族でない世帯（3世代世帯など）。3世代世帯そのものの数ではないので、項目名にそう書く
    { label: "核家族以外の親族世帯の割合（3世代世帯などを含む）", ds: "D06", num: ["核家族以外の世帯"], den: "一般世帯総数" },
    { label: "夫婦と子供から成る世帯の割合", ds: "D06", num: ["うち夫婦と子供から成る世帯"], den: "一般世帯総数" },
    { label: "夫婦のみの世帯の割合", ds: "D06", num: ["うち夫婦のみの世帯"], den: "一般世帯総数" },
    { label: "持ち家率", ds: "D07", num: ["持ち家"], den: "住宅に住む一般世帯" },
    { label: "民営借家の割合", ds: "D07", num: ["民営借家"], den: "住宅に住む一般世帯" },
    { label: "一戸建ての割合", ds: "D08", num: ["一戸建"], den: "主世帯数" },
  ];
  for (const s of census) {
    const town = ratio(a.censusTown[s.ds], s.num, s.den);
    const wardV = ratio(a.censusWard[s.ds], s.num, s.den);
    const src = sourcesOf(c, [s.ds]);
    out.push(
      fact("A", s.label, town !== null ? formatPct(town) : null, { 出典: `${src.出典}から計算`, 時点: src.時点 }, {
        比較: wardV !== null ? `${ward} ${formatPct(wardV)}` : undefined,
      }),
    );
  }

  // 将来人口（D11）：物件から1km以内の250mメッシュ（中心が1km以内）の合計
  const meshSrc = sourcesOf(c, ["D11"]);
  const change = (m: MeshTotals | null, k: "total" | "kids") => {
    if (!m) return null;
    const from = k === "total" ? m.total2025 : m.kids2025;
    const to = k === "total" ? m.total2035 : m.kids2035;
    return from > 0 ? { from, to, pct: ((to - from) / from) * 100 } : null;
  };
  for (const [k, label] of [
    ["total", "将来の人口（2025→2035年、物件から1km以内）"],
    ["kids", "将来の0〜14歳の人口（2025→2035年、物件から1km以内）"],
  ] as const) {
    const near = change(a.meshNear, k);
    const wardV = change(a.meshWard, k);
    out.push(
      fact("A", label, near ? `${formatNumber(Math.round(near.from))}人→${formatNumber(Math.round(near.to))}人（${formatChange(near.pct)}）` : null, meshSrc, {
        比較: wardV ? `${ward} ${formatChange(wardV.pct)}` : undefined,
      }),
    );
  }
  return out;
}

// ---- S 学区 ----

function schoolFact(c: Collected, label: string, s: SchoolInput): FactDraft {
  const base = sourcesOf(c, ["D14"]);
  if (s.status === "none") return fact("S", label, null, base);
  const src = { ...base, 出典: `${base.出典}（${s.basis === "位置" ? "物件の位置の町丁目" : "入力の住所"}で照合）` };
  if (s.status === "ambiguous") return fact("S", label, `候補：${s.candidates.join("、")}`, src, { 状態: "要確認" });
  return fact("S", label, s.distance_m !== null ? `${s.school}（物件から${formatDistance(s.distance_m)}）` : s.school, src);
}

// ---- L 生活施設 ----

function nearbyFact(c: Collected, f: NearbyKindInput): FactDraft {
  const ward = c.town?.ward;
  return fact("L", `${f.label}（1km以内）`, formatNearby(f.within1km, f.nearest3km), sourcesOf(c, f.datasetIds), {
    比較: f.wardAverage !== null && ward ? `${ward}の町の平均 ${f.wardAverage.toFixed(1)}件` : undefined,
  });
}

// ---- T 交通 ----

function transportFacts(c: Collected): FactDraft[] {
  const out: FactDraft[] = [];
  const input = { 出典: "入力", 時点: c.today.slice(0, 7) };
  c.transports.forEach((t, i) => {
    const where = t.mode === "電車" ? `${t.line ? `${t.line} ` : ""}${t.stop_name}${t.stop_name.endsWith("駅") ? "" : "駅"}` : `${t.line ? `${t.line}` : "バス"}「${t.stop_name}」停`;
    out.push(fact("T", `交通${i + 1}（物件資料の徒歩分）`, `${where} 徒歩${t.walk_min}分`, input));
  });
  const s = c.station;
  out.push(
    fact("T", "最寄り駅（直線）", s ? `${s.name}駅${s.lines.length ? `（${s.lines.join("・")}）` : ""} ${formatDistance(s.distance_m)}` : null, sourcesOf(c, ["D25"])),
  );
  out.push(
    fact(
      "T",
      "最寄り駅の乗降客数（1日あたり）",
      !s ? null : typeof s.passengers === "number" ? `${formatNumber(s.passengers)}人` : s.passengers,
      sourcesOf(c, ["D26"]),
    ),
  );
  const b = c.bus;
  const n = b.nearest;
  const busDetail = n ? [n.routes !== null ? `系統数 ${n.routes}` : null, n.operators.length ? n.operators.join("・") : null].filter((x) => x !== null).join("：") : "";
  out.push(fact("T", "最寄りバス停（直線）", n ? `${n.name} ${formatDistance(n.distance_m)}${busDetail ? `（${busDetail}）` : ""}` : null, sourcesOf(c, ["D27"])));
  out.push(
    fact("T", "バス停（1km以内）", formatNearby(b.within1km, null).replace("。3km以内になし", ""), sourcesOf(c, ["D27"]), {
      比較: b.wardAverage !== null && c.town ? `${c.town.ward}の町の平均 ${b.wardAverage.toFixed(1)}件` : undefined,
    }),
  );
  return out;
}

// ---- H 災害 ----

/** 浸水深の区分の下限（m）。「0.5〜3.0m」「0.01m以上〜0.3m未満」「20m以上」など。読めなければ -1 */
export function depthLower(label: string): number {
  const m = /([\d.]+)\s*m?/.exec(label.normalize("NFKC"));
  return m ? Number(m[1]) : -1;
}

function hazardFacts(c: Collected): FactDraft[] {
  const hits = (kind: string) => c.zones.filter((z) => z.kind === kind);
  const out: FactDraft[] = [];

  // 洪水：川ごとの想定のうち、いちばん深い区分。川の名前を添える
  const floodSrc = sourcesOf(c, ["D31"]);
  if (!loaded(c, "D31")) out.push(fact("H", "洪水の想定浸水深（想定最大規模）", null, floodSrc));
  else {
    const flood = hits("洪水浸水想定");
    if (flood.length === 0) out.push(fact("H", "洪水の想定浸水深（想定最大規模）", "浸水想定区域の外", floodSrc));
    else {
      const rank = (z: ZoneHit) => Number(z.attrs?.["浸水深ランク"] ?? depthLower(z.label));
      const deepest = flood.reduce((a, b) => (rank(b) > rank(a) ? b : a));
      const rivers = [...new Set(flood.map((z) => z.attrs?.["河川名"]).filter((r): r is string => typeof r === "string" && r !== ""))];
      out.push(fact("H", "洪水の想定浸水深（想定最大規模）", `${deepest.label}${rivers.length ? `（${rivers.join("・")}の想定）` : ""}`, floodSrc));
    }
  }

  const landslideSrc = sourcesOf(c, ["D33"]);
  const landslide = [...new Set(hits("土砂災害警戒区域").map((z) => z.label))];
  out.push(fact("H", "土砂災害警戒区域", loaded(c, "D33") ? (landslide.length ? landslide.join("、") : "区域の外") : null, landslideSrc));

  const tsunamiSrc = sourcesOf(c, ["D34"]);
  const tsunami = hits("津波浸水想定");
  const deepestTsunami = tsunami.length ? tsunami.reduce((a, b) => (depthLower(b.label) > depthLower(a.label) ? b : a)).label : null;
  out.push(fact("H", "津波の想定浸水深", loaded(c, "D34") ? (deepestTsunami ?? "浸水想定区域の外") : null, tsunamiSrc));

  // 液状化は 250m ほどの区画ごとの判定。区画が無いところはデータの範囲外なので「取得できず」
  const liq = [...new Set(hits("液状化の傾向").map((z) => z.label))];
  out.push(fact("H", "液状化の発生傾向", liq.length ? liq.join("、") : null, sourcesOf(c, ["D35"])));

  const fill = [...new Set(hits("大規模盛土造成地").map((z) => z.label))];
  out.push(fact("H", "大規模盛土造成地", loaded(c, "D36") ? (fill.length ? fill.join("、") : "区域の外") : null, sourcesOf(c, ["D36"])));
  return out;
}

// ---- B 買い手 ----

function assumption(c: Collected, key: string): AssumptionRow {
  const a = c.assumptions.find((r) => r.key === key);
  if (!a) throw new Error(`前提値「${key}」がありません（assumptions を確かめてください）`);
  return a;
}

function buyerFacts(c: Collected): FactDraft[] {
  const out: FactDraft[] = [];
  const b = c.buyers;
  const la: LoanAssumptions = {
    downPaymentPct: assumption(c, "頭金の割合").value,
    repaymentRatioPct: assumption(c, "返済負担率").value,
    termYears: assumption(c, "返済期間").value,
    maxAgeAtPayoff: assumption(c, "完済年齢の上限").value,
  };
  const rates = [
    { label: "変動", row: assumption(c, "変動金利") },
    { label: "固定", row: assumption(c, "全期間固定金利") },
  ];
  const price = c.property.price_man_yen;
  const calcSrc = (row: AssumptionRow) => ({
    出典: `ローン計算（頭金${la.downPaymentPct}%・返済負担率${la.repaymentRatioPct}%・元利均等）`,
    時点: row.as_of,
  });
  const incomeBins = b.income.map((r) => ({ item: r.item, pct: r.value }));
  const b02 = c.datasets.B02?.as_of ?? "不明";
  // 年収分布は全国の値（新潟県の分布ではない）。項目名と出典に「全国」と書く（docs/事実シートの修正_実装案.md 2.2）
  const shareSrc = { 出典: `${b.incomeSource ?? "住宅市場動向調査"}（全国、${b.segment}の年収分布）から計算`, 時点: b02 };
  const share = (incomeYen: number) => (incomeBins.length ? shareAboveIncome(incomeBins, incomeYen / 10_000) : null);

  // 前提どおり（35年）の返済額と必要年収
  for (const { label, row } of rates) {
    const r = calcLoan(price, row.value, la);
    out.push(fact("B", `月々の返済額（${label}${row.value}%・${r.termYears}年）`, `約${formatManYen1(r.monthlyYen)}`, calcSrc(row)));
    out.push(fact("B", `必要年収（${label}${row.value}%）`, `約${formatManYen(r.requiredIncomeYen)}`, calcSrc(row)));
  }
  for (const { label, row } of rates) {
    const s = share(calcLoan(price, row.value, la).requiredIncomeYen);
    out.push(fact("B", `必要年収以上の世帯の割合（${label}${row.value}%、全国の${b.segment}の年収分布から）`, s !== null ? `約${Math.round(s)}%` : null, shareSrc));
  }

  const repayment = (a: LoanAssumptions, age: number) =>
    rates
      .map(({ label, row }) => {
        const r = calcLoan(price, row.value, a, age);
        const s = share(r.requiredIncomeYen);
        return `${label}${row.value}%：月々約${formatManYen1(r.monthlyYen)}・必要年収約${formatManYen(r.requiredIncomeYen)}（必要年収以上の割合 ${s !== null ? `約${Math.round(s)}%` : "取得できず"}）`;
      })
      .join("。");
  const termOf = (t: TargetInput) => loanTerm(la, t.representative_age);

  // ターゲット候補ごとの返済（代表年齢から返済期間を決める）。返済期間が同じ候補は数字も同じなので1行にまとめる
  // （docs/事実シートの修正_実装案.md 2.3。指示文は候補名で答えるだけなので、行に候補名を並べれば足りる）
  const terms = [...new Set(c.targets.map(termOf))].sort((x, y) => y - x);
  for (const term of terms) {
    const group = c.targets.filter((t) => termOf(t) === term);
    out.push(
      fact(
        "B",
        `【${group.map((t) => t.name).join("・")}】の返済の目安（返済期間${term}年）`,
        `代表年齢${group.map((t) => t.representative_age).join("・")}歳。${repayment(la, group[0].representative_age)}`,
        { 出典: `ローン計算（頭金${la.downPaymentPct}%・完済${la.maxAgeAtPayoff}歳まで）・${shareSrc.出典}`, 時点: rates[0].row.as_of },
      ),
    );
  }

  // 住み替えの候補は、今の家を売ったお金を頭金にするのが普通なので、二次取得者の自己資金比率を頭金にした返済も出す（2.4）
  // 前提値がまだ無い（マイグレーションを反映する前）ときは出さない
  const resale = c.assumptions.find((r) => r.key === `住み替えの頭金の割合（${c.property.property_class}）`);
  if (resale) {
    const lr = { ...la, downPaymentPct: resale.value };
    for (const t of c.targets.filter((t) => t.uses_resale_down_payment)) {
      out.push(
        fact("B", `【${t.name}】の返済の目安（住み替えで頭金${resale.value}%の場合、返済期間${termOf(t)}年）`, `代表年齢${t.representative_age}歳。${repayment(lr, t.representative_age)}`, {
          出典: `ローン計算（頭金${resale.value}%：${resale.basis ?? "前提値の表"}・完済${la.maxAgeAtPayoff}歳まで）・${shareSrc.出典}`,
          時点: resale.as_of,
        }),
      );
    }
  }

  const list = (rows: StatRow[]) => rows.map((r) => `${r.item} ${formatPct(r.value)}`).join("、");
  out.push(fact("B", `買主の年代（${b.segment}の世帯主）`, b.ages.length ? withRemainder(b.ages) : null, { 出典: b.agesSource ?? "住宅市場動向調査", 時点: b02 }));
  out.push(
    fact("B", `物件を探した方法（${b.segment}、複数回答）`, b.search.length ? list(b.search) : null, { 出典: b.searchSource ?? "住宅市場動向調査", 時点: b02 }),
  );
  const b06 = c.datasets.B06?.as_of ?? "不明";
  for (const m of b.media) {
    const 項目 = m.category === "情報源としての重要度" ? `${m.item}を情報源として重要と考える人の割合（年代別）` : `${m.item}の利用率（年代別）`;
    out.push(fact("B", 項目, m.byAge.map((r) => `${r.age}${formatPct(r.value, 0)}`).join("、"), { 出典: m.source ?? "総務省 情報通信メディアの利用時間と情報行動に関する調査", 時点: b06 }));
  }
  for (const t of c.targets) {
    out.push(
      fact("B", `ターゲット候補「${t.name}」の定義`, `${t.definition ?? "定義は未設定"}（代表年齢${t.representative_age}歳）`, {
        出典: "ターゲット候補の一覧（設計まとめ）",
        時点: "2026-10",
      }),
    );
  }
  return out;
}

/**
 * 割合の内訳を並べ、合計が100%に足りなければ残りを「無回答など」として足す（AI が残りを勝手に読まないように）
 * 残りは 0.1% 単位で丸めて 0 より大きいときだけ（docs/事実シートの修正_実装案.md 2.5）
 */
export function withRemainder(rows: StatRow[]): string {
  const list = rows.map((r) => `${r.item} ${formatPct(r.value)}`);
  const rest = Math.round((100 - rows.reduce((s, r) => s + r.value, 0)) * 10) / 10;
  return [...list, ...(rest > 0 ? [`無回答など ${formatPct(rest)}（100%から引いた残り）`] : [])].join("、");
}

// ---- K 競合 ----

function competitorFacts(c: Collected): FactDraft[] {
  const p = c.property;
  const src = { 出典: "入力", 時点: c.today.slice(0, 7) };
  return c.competitors.map((k) => {
    const parts = [
      k.price_man_yen !== null ? `価格${formatManYen(k.price_man_yen * 10_000)}` : "価格 入力なし",
      k.building_sqm !== null ? `建物面積${sqm(k.building_sqm)}` : "建物面積 入力なし",
      k.land_sqm !== null ? `土地面積${sqm(k.land_sqm)}` : "土地面積 入力なし",
      k.building_age !== null ? (k.building_age === 0 ? "新築" : `築${k.building_age}年`) : "築年数 入力なし",
      k.distance_m !== null ? `物件から${formatDistance(k.distance_m)}` : k.address ? "物件からの直線距離 取得できず（住所から位置を出せず）" : "住所 入力なし",
    ];
    const signed = (n: number, unit: string) => `${n > 0 ? "+" : ""}${formatNumber(n, Number.isInteger(n) ? 0 : 1)}${unit}`;
    const diffs = [
      k.price_man_yen !== null ? `価格 ${signed(p.price_man_yen - k.price_man_yen, "万円")}` : null,
      k.building_sqm !== null ? `建物面積 ${signed(Math.round((p.building_sqm - k.building_sqm) * 10) / 10, "㎡")}` : null,
      k.land_sqm !== null ? `土地面積 ${signed(Math.round((p.land_sqm - k.land_sqm) * 10) / 10, "㎡")}` : null,
      k.building_age !== null ? `築年数 ${signed(p.building_age - k.building_age, "年")}` : null,
    ].filter((d): d is string => d !== null);
    return fact("K", `競合物件${k.position}`, parts.join("・"), src, { 比較: diffs.length ? `この物件との差（この物件−競合）：${diffs.join("、")}` : undefined });
  });
}

// ---- C 媒体 ----

function mediaFacts(c: Collected): (FactDraft & { fixedId: string })[] {
  return c.media.map((m) => ({
    ...fact("C", m.name, `分類：${m.category}、主な目的：${m.purpose}、届きやすい年代（見立て）：${m.reach_ages}`, {
      出典: "媒体一覧（たたき台）",
      時点: "2026-10",
    }),
    fixedId: m.id,
  }));
}

/** 事実をすべて組み立て、ID を付ける */
export function buildFacts(c: Collected): Fact[] {
  return numberFacts([
    ...propertyFacts(c),
    ...marketFacts(c),
    ...zoningFacts(c),
    ...areaFacts(c),
    schoolFact(c, "小学校区", c.schools.elementary),
    schoolFact(c, "中学校区", c.schools.juniorHigh),
    ...c.facilities.map((f) => nearbyFact(c, f)),
    ...c.departments.map((f) => nearbyFact(c, f)),
    ...transportFacts(c),
    ...hazardFacts(c),
    ...buyerFacts(c),
    ...competitorFacts(c),
    ...mediaFacts(c),
  ]);
}
