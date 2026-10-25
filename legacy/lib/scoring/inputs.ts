import { ageClassOf, NEW_BUILD_MAX_AGE } from "./constants";
import { round } from "./engine";
import type { CompetitorValues, InputValue, ScoringConfig, ScoringInputs } from "./types";
import type { FactDraft } from "../types";

// 採点に使う項目の値を集める（設計書 D35）
// 優先順：物件の画面で手入力した値（manual_metrics）→ 物件の入力 → 分析の事実カード → 相場表
// 値が取れない項目は null（採点から外し、画面に「データなし」と出す）

/** 採点に使う物件の情報（properties の列） */
export interface ScoringProperty {
  property_type: string;
  price_man_yen: number | null;
  address: string;
  layout: string | null;
  land_sqm: number | null;
  building_sqm: number | null;
  parking: number | null;
  age_years: number | null;
  rooms: number | null;
  is_hiraya: boolean | null;
  has_garden: boolean | null;
  ward: string | null;
  town: string | null;
  manual_metrics: Record<string, unknown> | null;
  total_budget_man_yen: number | null;
}

/** 採点に使う競合物件の情報（competitors の列） */
export interface ScoringCompetitor {
  price_man_yen: number | null;
  land_sqm: number | null;
  building_sqm: number | null;
  layout: string | null;
  walk_min: number | null;
  parking: number | null;
  age_years: number | null;
}

/** 間取り（例：4LDK・3SLDK）から居室数を読む。読めなければ null */
export function roomsFromLayout(layout: string | null): number | null {
  const m = layout?.normalize("NFKC").match(/(\d+)\s*S?\s*[LDK]/i) ?? layout?.normalize("NFKC").match(/^(\d+)\s*(?:R|K)/i);
  return m ? Number(m[1]) : null;
}

/** 住所から区と町を読む（例：新潟市中央区上近江2丁目 → 中央区・上近江）。読めなければ null */
export function wardTownFromAddress(address: string): { ward: string | null; town: string | null } {
  const s = address.normalize("NFKC").replace(/\s/g, "");
  const m = s.match(/新潟市(.+?区)(.*)$/);
  if (!m) return { ward: null, town: null };
  const town = m[2].replace(/^大字/, "").split(/[0-9一二三四五六七八九十]+(?:丁目|番|-|$)/)[0] || null;
  return { ward: m[1], town };
}

/** 競合の駅徒歩（分）を、物件の駅距離と同じ直線距離（m）にそろえる（徒歩の目安は「直線×1.3、分速80m」） */
export const walkMinToStraightM = (min: number) => round((min * 80) / 1.3);

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

export function buildInputs(
  config: ScoringConfig,
  property: ScoringProperty,
  facts: (FactDraft & { seq?: number })[],
  competitors: ScoringCompetitor[],
): ScoringInputs {
  const manual = property.manual_metrics ?? {};
  const ok = new Map(facts.filter((f) => f.status === "ok").map((f) => [f.key, f]));
  const values: Record<string, InputValue> = {};
  const fromProperty = (key: string, v: number | null, text?: string) => {
    values[key] = { value: v, source: v === null ? "データなし" : "物件の入力", text: text ?? null };
  };
  const cardNo = (f: FactDraft & { seq?: number }) => (f.seq ? `F-${String(f.seq).padStart(2, "0")}` : "事実カード");
  /** 手入力 → 事実カード（値、または市との比） */
  const fromFact = (key: string, factKey: string, ratio = false) => {
    const m = num(manual[key]);
    if (m !== null) {
      values[key] = { value: m, source: "手入力" };
      return;
    }
    const f = ok.get(factKey);
    const v = f?.value === null || f?.value === undefined ? null : Number(f.value);
    if (!f || v === null) {
      values[key] = { value: null, source: "データなし" };
      return;
    }
    if (ratio) {
      const c = f.comparison === null || f.comparison === undefined ? null : Number(f.comparison);
      values[key] = c ? { value: round(v / c, 2), source: cardNo(f), text: f.valueText ?? null, factKey } : { value: null, source: "データなし" };
      return;
    }
    values[key] = { value: v, source: cardNo(f), text: f.valueText ?? null, factKey };
  };
  const manualOnly = (key: string) => {
    const m = num(manual[key]);
    values[key] = { value: m, source: m === null ? "データなし（手入力の欄あり）" : "手入力" };
  };

  // 物件の入力
  const isNewType = property.property_type.includes("新築");
  const age = property.age_years ?? (isNewType ? 0 : null);
  const rooms = property.rooms ?? roomsFromLayout(property.layout);
  fromProperty("価格_万円", property.price_man_yen);
  fromProperty("部屋数", rooms, property.rooms === null && rooms !== null ? `間取り「${property.layout}」から` : undefined);
  fromProperty("延床_㎡", property.building_sqm);
  fromProperty("土地_㎡", property.land_sqm);
  fromProperty("駐車_台", property.parking);
  fromProperty("築年数", age, property.age_years === null && age !== null ? "物件種別（新築）から" : undefined);
  fromProperty("平屋", property.is_hiraya === null ? null : Number(property.is_hiraya));
  fromProperty("庭", property.has_garden === null ? null : Number(property.has_garden));

  // 周辺（分析の事実カード）
  fromFact("駅_m", "facility.station_nearest");
  fromFact("小学校_m", "facility.elementary_nearest");
  fromFact("スーパー_m", "facility.supermarket_nearest");
  fromFact("病院_m", "facility.medical_nearest");
  fromFact("バス停_m", "facility.bus_stop_nearest");
  fromFact("保育園_800m内", "facility.nursery_count_800m");
  fromFact("子あり世帯比率_市比", "target.households_with_under18_ratio", true);
  fromFact("高齢者比率_市比", "target.age_65plus_ratio", true);
  // 自動で取れないもの（国勢調査などの追加は次の段階）
  for (const k of ["公園_m", "単身世帯比率_市比", "子育て世代_5年変化"]) manualOnly(k);

  // 区・町と相場
  const parsed = wardTownFromAddress(property.address);
  const ward = property.ward ?? parsed.ward;
  const town = property.town ?? parsed.town;
  const ageClass = age === null ? (isNewType ? "新築" : null) : ageClassOf(age);
  const manualMarket = num(manual["相場_万円"]);
  const ref = config.market.find((m) => m.ward === ward && m.ageClass === ageClass);
  values["相場_万円"] =
    manualMarket !== null
      ? { value: manualMarket, source: "手入力" }
      : ref
        ? { value: ref.priceManYen, source: "相場表", text: `${ref.ward}・${ref.ageClass}の取引の中央値${ref.n ? `（${ref.n}件）` : ""}` }
        : { value: null, source: "データなし" };
  const price = values["価格_万円"].value;
  const market = values["相場_万円"].value;
  values["価格_相場比"] = price !== null && market ? { value: round(price / market, 2), source: "計算" } : { value: null, source: "データなし" };

  const competitorValues: CompetitorValues[] = competitors.map((c) => ({
    価格_万円: c.price_man_yen,
    築年数: c.age_years,
    部屋数: roomsFromLayout(c.layout),
    "延床_㎡": c.building_sqm,
    "土地_㎡": c.land_sqm,
    駐車_台: c.parking,
    駅_m: c.walk_min === null ? null : walkMinToStraightM(c.walk_min),
    小学校_m: null,
  }));

  return {
    values,
    ward,
    town,
    ageClass,
    isNew: age === null ? (isNewType ? true : property.property_type.includes("中古") ? false : null) : age <= NEW_BUILD_MAX_AGE,
    competitors: competitorValues,
    inputBudgetManYen: property.total_budget_man_yen,
  };
}
