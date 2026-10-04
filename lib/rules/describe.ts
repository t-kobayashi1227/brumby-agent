import { MEDIA, TARGETS } from "./catalog";
import type { Condition, Effect, Op, Rule } from "./engine";

// ルールの条件と効果を、日本語の文にする（ルール表の画面・販売戦略の画面・AIの説明で使う）
// あわせて、条件に使える値（事実カードなど）の一覧を持つ。ルール表の画面では、ここから選ぶ

export type Unit = "ratio" | "m" | "万円" | "人" | "件" | "㎡" | "rank" | "level" | "flag";

export interface FactOption {
  key: string;
  label: string;
  unit: Unit;
  /** 区・市の値（カードの comparison）と比べられるか */
  comparable: boolean;
  group: string;
}

/** 条件に使える値の一覧。カードの key を手で打たずに、ここから選ぶ（打ち間違いでルールが黙って効かなくなるのを防ぐ） */
export const FACT_OPTIONS: FactOption[] = [
  { group: "人口構成", key: "target.population", label: "半径の中の人口", unit: "人", comparable: false },
  { group: "人口構成", key: "target.age_30_49_ratio", label: "30〜49歳の人の割合", unit: "ratio", comparable: true },
  { group: "人口構成", key: "target.households_with_under18_ratio", label: "18歳未満のいる世帯の割合", unit: "ratio", comparable: true },
  { group: "人口構成", key: "target.couple_children_ratio", label: "夫婦と子供の世帯の割合", unit: "ratio", comparable: true },
  { group: "人口構成", key: "target.private_rented_ratio", label: "民営借家に住む世帯の割合", unit: "ratio", comparable: true },
  { group: "人口構成", key: "target.detached_ratio", label: "一戸建に住む世帯の割合", unit: "ratio", comparable: true },
  { group: "将来人口", key: "future.population_change", label: "総人口の増減（2025→2035年）", unit: "ratio", comparable: false },
  { group: "将来人口", key: "future.age_30_49_change", label: "30〜49歳の増減（2025→2035年）", unit: "ratio", comparable: false },
  { group: "将来人口", key: "future.children_change", label: "0〜14歳の増減（2025→2035年）", unit: "ratio", comparable: false },
  { group: "周辺施設", key: "facility.elementary_nearest", label: "最寄りの小学校までの直線距離", unit: "m", comparable: false },
  { group: "周辺施設", key: "facility.junior_high_nearest", label: "最寄りの中学校までの直線距離", unit: "m", comparable: false },
  { group: "周辺施設", key: "facility.nursery_nearest", label: "最寄りの保育園・幼稚園等までの直線距離", unit: "m", comparable: false },
  { group: "周辺施設", key: "facility.nursery_count", label: "半径の中の保育園・幼稚園等の数", unit: "件", comparable: false },
  { group: "周辺施設", key: "facility.station_nearest", label: "最寄りの駅までの直線距離", unit: "m", comparable: false },
  { group: "相場", key: "market.price_median", label: "周りの取引価格の中央値", unit: "万円", comparable: false },
  { group: "相場", key: "market.price_gap", label: "物件の価格と取引価格の中央値の差", unit: "ratio", comparable: false },
  { group: "相場", key: "land.trend_5y", label: "近くの住宅地の地価の5年間の変化", unit: "ratio", comparable: true },
  { group: "防災", key: "hazard.flood", label: "洪水の浸水深ランク（0＝区域外、1〜6）", unit: "rank", comparable: false },
  { group: "防災", key: "hazard.liquefaction", label: "液状化の傾向（1＝最も液状化しやすい〜6）", unit: "level", comparable: false },
  { group: "防災", key: "hazard.landslide", label: "土砂災害警戒区域に入っているか（1＝入っている）", unit: "flag", comparable: false },
  { group: "競合物件", key: "competitor.price_gap", label: "物件の価格と競合の平均価格の差", unit: "ratio", comparable: false },
  { group: "競合物件", key: "competitor.land_area_gap", label: "土地の面積と競合の平均の差", unit: "ratio", comparable: false },
  { group: "物件", key: "property.price_man_yen", label: "物件の価格", unit: "万円", comparable: false },
  { group: "物件", key: "property.land_sqm", label: "物件の土地の面積", unit: "㎡", comparable: false },
  { group: "物件", key: "property.building_sqm", label: "物件の建物の面積", unit: "㎡", comparable: false },
  { group: "判断", key: "decision.total_budget", label: "総予算（先に決めた額）", unit: "万円", comparable: false },
];

export function factLabel(key: string): FactOption {
  const found = FACT_OPTIONS.find((f) => f.key === key);
  if (found) return found;
  const age = /^target\.age_(\d+)_(\d+)_ratio$/.exec(key);
  if (age) return { group: "人口構成", key, label: `${age[1]}〜${age[2]}歳の人の割合`, unit: "ratio", comparable: true };
  return { group: "その他", key, label: key, unit: "ratio", comparable: false };
}

/** 画面で入力するときの単位。割合は % で入力し、保存するときに100で割る */
export function inputUnit(unit: Unit): string {
  const map: Record<Unit, string> = { ratio: "%", m: "m", 万円: "万円", 人: "人", 件: "件", "㎡": "㎡", rank: "", level: "", flag: "" };
  return map[unit];
}

/** 保存した値 → 画面に出す値（割合は %） */
export const toInput = (value: number, unit: Unit) => (unit === "ratio" ? Math.round(value * 1000) / 10 : value);
/** 画面で入力した値 → 保存する値 */
export const fromInput = (value: number, unit: Unit) => (unit === "ratio" ? Math.round(value * 10) / 1000 : value);

const OP_WORD: Record<Op, string> = { ">": "より大きい", ">=": "以上", "<": "未満", "<=": "以下", "==": "と同じ", "!=": "と違う" };

function formatNumber(value: number, unit: Unit) {
  if (unit === "ratio") return `${(value * 100).toFixed(1).replace(/\.0$/, "")}%`;
  const u = inputUnit(unit);
  return `${value.toLocaleString("ja-JP")}${u}`;
}

export function describeCondition(condition: Condition): string {
  if ("always" in condition) return "いつも";
  if ("all" in condition) return condition.all.map(describeCondition).join("、かつ ");
  const { label, unit } = factLabel(condition.fact);
  if (condition.than === "comparison") {
    const points = Math.round(Math.abs(condition.delta ?? 0) * 1000) / 10;
    if (condition.op === ">" || condition.op === ">=") {
      return points === 0 ? `${label}が、区・市の値より多い` : `${label}が、区・市の値より${points}ポイント以上多い`;
    }
    return points === 0 ? `${label}が、区・市の値より少ない` : `${label}が、区・市の値より${points}ポイント以上少ない`;
  }
  return `${label}が${formatNumber(condition.than, unit)}${OP_WORD[condition.op]}`;
}

const targetLabel = (id: string) => TARGETS.find((t) => t.id === id)?.label ?? id;
const mediaLabel = (id: string) => MEDIA.find((m) => m.id === id)?.label ?? id;

export function describeEffect(effect: Effect): string {
  if ("target" in effect) return `「${targetLabel(effect.target)}」に${effect.score >= 0 ? "+" : ""}${effect.score}点`;
  if ("total_man_yen" in effect) return `総予算を${effect.total_man_yen}万円にする`;
  if ("weight" in effect && effect.weight !== undefined) return `「${mediaLabel(effect.media)}」の重みの出発点を${effect.weight}にする`;
  if ("multiply" in effect && effect.multiply !== undefined) return `「${mediaLabel(effect.media)}」の重みを${effect.multiply}倍にする`;
  if ("fixed_man_yen" in effect && effect.fixed_man_yen !== undefined) return `「${mediaLabel(effect.media)}」を${effect.fixed_man_yen}万円に固定する`;
  if ("min_man_yen" in effect && effect.min_man_yen !== undefined) return `「${mediaLabel(effect.media)}」は最低${effect.min_man_yen}万円にする`;
  return JSON.stringify(effect);
}

export const KIND_LABEL: Record<Rule["kind"], string> = {
  total_budget: "総予算",
  media_weight: "媒体の重み",
  min_spend: "媒体の固定額・最低額",
  target_score: "狙う層の点数",
};

/** 条件の末端（all の中も順に）を取り出す */
export function leafConditions(condition: Condition): Extract<Condition, { fact: string }>[] {
  if ("always" in condition) return [];
  if ("all" in condition) return condition.all.flatMap(leafConditions);
  return [condition];
}
