import type { AnalysisParams, FactDraft, PropertyRow } from "../types";
import { MEDIA, matchesPropertyType, type AppealDef, type CandidateDef } from "./catalog";

// ルールの評価エンジン（設計書 6.1）。毎回同じ手順で計算する
// 1. 狙う層の候補に点数を付けて順位を出す（候補は target_candidates。狙う層の設計.md 5章）
// 2. 訴求の素材に点数を付け、上位3つを選ぶ（素材は appeal_items。D23）
// 3. 総予算を決める：入力があればそれを使い、なければ total_budget ルールの提案値（D15）
// 4. 媒体の重み → 比率 → 固定額・最低額を当てはめる → 千円単位に丸める
// 5. 効いたルールを記録する
// 条件は「事実カードの値と、定数または比べる値との単純な比較」だけ。when で物件種別を絞れる

export type Op = ">" | ">=" | "<" | "<=" | "==" | "!=" | "contains";

/** 条件を当てはめる物件種別（狙う層の設計.md 2章） */
export interface When {
  property_type?: string[];
}

export type Condition = (
  | { always: true }
  | { all: Condition[] }
  | { fact: string; op: Op; than: number | "comparison" | string; delta?: number }
) & { when?: When };

export type Effect =
  | { candidate: string; score: number }                       // target_score
  | { target: string; score: number }                          // target_score（2026-10-06より前の形。使わない）
  | { appeal: string; score: number }                          // appeal_score
  | { total_man_yen: number }                                  // total_budget
  | { media: string; weight?: number; multiply?: number }      // media_weight（weight＝出発点、multiply＝掛ける）
  | { media: string; fixed_man_yen?: number; min_man_yen?: number }; // min_spend

export interface Rule {
  id: string;
  kind: "total_budget" | "media_weight" | "min_spend" | "target_score" | "appeal_score";
  condition: Condition;
  effect: Effect;
  note: string;
  enabled: boolean;
  version: number;
}

export interface Applied {
  id: string;
  version: number;
  note: string;
}

/** 条件で参照できる値：事実カード（key）、物件の情報（property.xxx）、この計算で先に決めた値（decision.total_budget） */
type Found = { value: number | null; comparison: number | null; text: string | null };
type Lookup = (key: string) => Found | null;

function compare(a: number, op: Op, b: number) {
  switch (op) {
    case ">": return a > b;
    case ">=": return a >= b;
    case "<": return a < b;
    case "<=": return a <= b;
    case "==": return a === b;
    case "!=": return a !== b;
    default: return false;
  }
}

/** 条件の when（物件種別）に当てはまるか。all の中の when も見る */
export function matchesWhen(condition: Condition, propertyType: string): boolean {
  if (condition.when?.property_type && !matchesPropertyType(condition.when.property_type, propertyType)) return false;
  if ("all" in condition) return condition.all.every((c) => matchesWhen(c, propertyType));
  return true;
}

/** 条件を満たすか。参照する値がない・データが足りないときは満たさない（false） */
export function evaluate(condition: Condition, lookup: Lookup): boolean {
  if ("always" in condition) return true;
  if ("all" in condition) return condition.all.every((c) => evaluate(c, lookup));
  const found = lookup(condition.fact);
  if (!found) return false;
  // contains：数字でない値（用途地域の名前、物件の特徴 など）に、その言葉が入っているか
  if (condition.op === "contains") return typeof condition.than === "string" && (found.text ?? "").includes(condition.than);
  if (found.value === null) return false;
  const base = condition.than === "comparison" ? found.comparison : condition.than;
  if (typeof base !== "number") return false;
  return compare(found.value, condition.op, base + (condition.delta ?? 0));
}

/** 条件が見る値が、すべて取れているか（狙う層の満点の分母に入れるか。狙う層の設計.md 5章の5） */
export function isAvailable(condition: Condition, lookup: Lookup): boolean {
  if ("always" in condition) return true;
  if ("all" in condition) return condition.all.every((c) => isAvailable(c, lookup));
  const found = lookup(condition.fact);
  if (!found) return false;
  if (condition.op === "contains") return found.text !== null;
  if (found.value === null) return false;
  return condition.than !== "comparison" || found.comparison !== null;
}

/** 金額を千円（0.1万円）単位に丸める */
const roundThousand = (man: number) => Math.round(man * 10) / 10;

/**
 * 総予算を媒体に分ける。固定額 → 最低額 → 残りを重みの比率で分ける → 千円単位に丸め、端数は一番多い媒体で合わせる
 */
export function allocate(total: number, weights: Record<string, number>, fixed: Record<string, number>, mins: Record<string, number>) {
  const amounts: Record<string, number> = {};
  let rest = total;
  for (const [m, v] of Object.entries(fixed)) {
    amounts[m] = v;
    rest -= v;
  }
  let free = Object.keys(weights).filter((m) => !(m in fixed) && weights[m] > 0);
  // 最低額に届かない媒体は最低額に固定し、残りで分け直す（届かなくなる媒体がなくなるまで）
  for (;;) {
    const sum = free.reduce((a, m) => a + weights[m], 0);
    const short = free.filter((m) => mins[m] !== undefined && (rest * weights[m]) / sum < mins[m]);
    if (short.length === 0) {
      for (const m of free) amounts[m] = sum > 0 ? (rest * weights[m]) / sum : 0;
      break;
    }
    for (const m of short) {
      amounts[m] = mins[m];
      rest -= mins[m];
    }
    free = free.filter((m) => !short.includes(m));
  }
  for (const m of Object.keys(weights)) amounts[m] = roundThousand(amounts[m] ?? 0);
  const diff = roundThousand(total - Object.values(amounts).reduce((a, b) => a + b, 0));
  if (diff !== 0) {
    const largest = Object.keys(amounts).sort((a, b) => amounts[b] - amounts[a])[0];
    amounts[largest] = roundThousand(amounts[largest] + diff);
  }
  return amounts;
}

function buildLookup(property: PropertyRow, okFacts: Map<string, FactDraft>, decided: Map<string, number>): Lookup {
  return (key) => {
    if (key.startsWith("property.")) {
      const v = (property as unknown as Record<string, unknown>)[key.slice("property.".length)];
      if (typeof v === "number") return { value: v, comparison: null, text: null };
      if (typeof v === "string" && v.trim() !== "") return { value: null, comparison: null, text: v };
      return null;
    }
    if (key.startsWith("decision.")) {
      const v = decided.get(key);
      return v === undefined ? null : { value: v, comparison: null, text: null };
    }
    const f = okFacts.get(key);
    if (!f) return null;
    const value = f.value === null || f.value === undefined ? null : Number(f.value);
    return { value, comparison: f.comparison ?? null, text: f.valueText ?? null };
  };
}

export interface MediaAllocation {
  id: string;
  amount: number;
  weight: number;
  fixed: number | null;
  min: number | null;
  rules: Applied[];
}

/**
 * 媒体の重み → 固定額・最低額 → 配分（設計書 6.1の3）。総予算を渡して計算する部分だけを取り出したもの
 * ルール表の画面の「予算別シミュレーション」のように、総予算だけを変えて配分を見るときにも使う
 */
export function allocateMedia(active: Rule[], fired: (r: Rule) => boolean, total: number): MediaAllocation[] {
  const applied = (r: Rule): Applied => ({ id: r.id, version: r.version, note: r.note });

  const weights: Record<string, number> = Object.fromEntries(MEDIA.map((m) => [m.id, 0]));
  const fixed: Record<string, number> = {};
  const mins: Record<string, number> = {};
  const mediaRules = new Map(MEDIA.map((m) => [m.id, [] as Applied[]]));
  const weightRules = active.filter((r) => r.kind === "media_weight");
  for (const r of weightRules.filter((r) => (r.effect as { weight?: number }).weight !== undefined)) {
    const e = r.effect as { media: string; weight: number };
    if (e.media in weights && fired(r)) {
      weights[e.media] = e.weight;
      mediaRules.get(e.media)!.push(applied(r));
    }
  }
  for (const r of weightRules.filter((r) => (r.effect as { multiply?: number }).multiply !== undefined)) {
    const e = r.effect as { media: string; multiply: number };
    if (e.media in weights && fired(r)) {
      weights[e.media] *= e.multiply;
      mediaRules.get(e.media)!.push(applied(r));
    }
  }
  for (const r of active.filter((r) => r.kind === "min_spend")) {
    const e = r.effect as { media: string; fixed_man_yen?: number; min_man_yen?: number };
    if (!(e.media in weights) || !fired(r)) continue;
    if (e.fixed_man_yen !== undefined) fixed[e.media] = e.fixed_man_yen;
    if (e.min_man_yen !== undefined) mins[e.media] = e.min_man_yen;
    mediaRules.get(e.media)!.push(applied(r));
  }

  const amounts = allocate(total, weights, fixed, mins);
  return MEDIA.map((m) => ({
    id: m.id,
    amount: amounts[m.id] ?? 0,
    weight: Math.round(weights[m.id] * 100) / 100,
    fixed: fixed[m.id] ?? null,
    min: mins[m.id] ?? null,
    rules: mediaRules.get(m.id)!,
  }));
}

/** 状態が ok のカードだけを、key で引けるようにする */
const okFactMap = (facts: FactDraft[]) => new Map(facts.filter((f) => f.status === "ok").map((f) => [f.key, f]));

/** 使うルール：enabled で、when の物件種別に当てはまるもの */
const activeRules = (rules: Rule[], property: PropertyRow) => rules.filter((r) => r.enabled && matchesWhen(r.condition, property.property_type));

/** ルール表の画面の「予算別シミュレーション」用：総予算だけを変えて、配分を計算し直す（事実カードは変えない） */
export function simulateMediaAllocation(rules: Rule[], facts: FactDraft[], property: PropertyRow, totalManYen: number): MediaAllocation[] {
  const decided = new Map<string, number>([["decision.total_budget", totalManYen]]);
  const lookup = buildLookup(property, okFactMap(facts), decided);
  return allocateMedia(activeRules(rules, property), (r) => evaluate(r.condition, lookup), totalManYen);
}

/** decision.target_rank の basis.ranking の1件 */
export interface TargetRankItem {
  rank: number;
  id: string;
  label: string;
  description: string;
  score: number;
  /** 満点（指標が取れたルールの点の合計）。指標が取れなかった候補と公平に比べるため */
  max: number;
  rules: Applied[];
  confidence: "normal" | "low";
  /** 指標が1つも取れなかった候補は false（「判断できない」） */
  available: boolean;
}

/** decision.appeals の basis.items の1件 */
export interface AppealRankItem {
  id: string;
  label: string;
  description: string;
  score: number;
  selected: boolean;
  needsFacts: string[];
  rules: Applied[];
}

/** 訴求は上位いくつまで使うか（D23） */
export const APPEAL_LIMIT = 3;

export interface RuleTables {
  rules: Rule[];
  candidates: CandidateDef[];
  appeals: AppealDef[];
}

export function runRules(tables: RuleTables, facts: FactDraft[], property: PropertyRow, params: Partial<AnalysisParams> = {}): FactDraft[] {
  const active = activeRules(tables.rules, property);
  const okFacts = okFactMap(facts);
  const decided = new Map<string, number>();
  const lookup = buildLookup(property, okFacts, decided);
  /** 条件が参照した事実カードの版（判断カードの出典に残す） */
  const usedVersions = new Set<number>();
  const fired = (r: Rule) => {
    const ok = evaluate(r.condition, lookup);
    if (ok) collectVersions(r.condition, okFacts, usedVersions);
    return ok;
  };
  const applied = (r: Rule): Applied => ({ id: r.id, version: r.version, note: r.note });
  const attribution = "ルール表（仮のルール。BRUMBY様との打ち合わせで見直す）";
  const out: FactDraft[] = [];

  // 1. 狙う層の順位（狙う層の設計.md 5章）
  const minTop = params.min_top_score ?? 2;
  const tieMargin = params.tie_margin ?? 0;
  const candidates = tables.candidates.filter((c) => c.enabled && matchesPropertyType(c.property_types, property.property_type));
  const scored = candidates.map((c, order) => {
    const own = active.filter((r) => r.kind === "target_score" && (r.effect as { candidate?: string }).candidate === c.id);
    let score = 0;
    let max = 0;
    const hit: Applied[] = [];
    for (const r of own) {
      const points = (r.effect as { score: number }).score;
      if (!isAvailable(r.condition, lookup)) continue;
      if (points > 0) max += points;
      if (fired(r)) {
        score += points;
        hit.push(applied(r));
      }
    }
    return { c, order, score, max, rules: hit, available: max > 0 };
  });
  scored.sort((a, b) => Number(b.available) - Number(a.available) || b.score - a.score || a.c.sort_order - b.c.sort_order || a.order - b.order);
  const top = scored[0];
  // 1位との差が tie_margin 以内なら同じ順位（同点として併記）
  const ranking: TargetRankItem[] = scored.map((t, i) => {
    const tiedWithTop = t.available && top && top.score - t.score <= tieMargin;
    return {
      rank: tiedWithTop ? 1 : i + 1,
      id: t.c.id,
      label: t.c.label,
      description: t.c.description,
      score: t.score,
      max: t.max,
      rules: t.rules,
      confidence: t.c.confidence ?? "normal",
      available: t.available,
    };
  });
  const tied = ranking.filter((t) => t.rank === 1).length > 1;
  const unresolved = !top || !top.available || top.score < minTop;
  const rankText = (t: TargetRankItem) =>
    `${t.rank}位 ${t.label}（${t.available ? `${t.score}/${t.max}点` : "判断できない"}${t.confidence === "low" ? "・仮説" : ""}）`;
  out.push({
    key: "decision.target_rank",
    kind: "decision",
    value: top?.score ?? null,
    valueText: unresolved
      ? `エリアの特徴からは絞り込めない（1位の点が${minTop}点未満）${ranking.length ? ` ／ ${ranking.map(rankText).join(" ／ ")}` : ""}`
      : ranking.map(rankText).join(" ／ "),
    unit: "score",
    scope: { type: "rules" },
    basis: { ranking, tied, unresolved, min_top_score: minTop, tie_margin: tieMargin },
    status: unresolved ? "insufficient" : "ok",
    datasetVersionIds: [],
    attribution,
  });

  // 2. 訴求の素材（必要なカードが取れている素材だけに点を付け、上位3つ）
  const appeals = tables.appeals.filter(
    (a) => a.enabled && matchesPropertyType(a.property_types, property.property_type) && a.needs_facts.every((k) => lookup(k) !== null),
  );
  const appealScored = appeals.map((a, order) => {
    const hit = active.filter((r) => r.kind === "appeal_score" && (r.effect as { appeal?: string }).appeal === a.id && fired(r));
    return { a, order, score: hit.reduce((sum, r) => sum + (r.effect as { score: number }).score, 0), rules: hit.map(applied) };
  });
  appealScored.sort((x, y) => y.score - x.score || x.a.sort_order - y.a.sort_order || x.order - y.order);
  const appealItems: AppealRankItem[] = appealScored.map((x, i) => ({
    id: x.a.id,
    label: x.a.label,
    description: x.a.description,
    score: x.score,
    selected: x.score > 0 && i < APPEAL_LIMIT,
    needsFacts: x.a.needs_facts,
    rules: x.rules,
  }));
  for (const item of appealItems.filter((x) => x.selected)) {
    for (const k of item.needsFacts) for (const v of okFacts.get(k)?.datasetVersionIds ?? []) usedVersions.add(Number(v));
  }
  const selected = appealItems.filter((x) => x.selected);
  out.push({
    key: "decision.appeals",
    kind: "decision",
    value: selected.length,
    valueText: selected.length ? selected.map((x, i) => `${i + 1}. ${x.label}`).join(" ／ ") : "ルールに当てはまる訴求の素材がありません",
    unit: "件",
    scope: { type: "rules" },
    basis: { items: appealItems, limit: APPEAL_LIMIT, skipped: tables.appeals.filter((a) => a.enabled && !appeals.includes(a)).map((a) => a.id) },
    status: selected.length ? "ok" : "insufficient",
    datasetVersionIds: [],
    attribution,
  });

  // 3. 総予算：入力があればそれ、なければルールの提案値（当てはまるルールが複数あれば、一番大きい額）
  const budgetRules = active.filter((r) => r.kind === "total_budget" && fired(r));
  const input = property.total_budget_man_yen;
  const suggested = budgetRules.length > 0 ? Math.max(...budgetRules.map((r) => (r.effect as { total_man_yen: number }).total_man_yen)) : null;
  const total = input ?? suggested;
  if (total !== null) decided.set("decision.total_budget", total);

  if (total === null) {
    out.push({ key: "decision.total_budget", kind: "decision", status: "not_available", scope: { type: "rules" }, basis: { source: null, reason: "総予算が入力されておらず、総予算を決めるルールにも当てはまりませんでした（物件の価格が入っていない可能性）" }, datasetVersionIds: [], attribution });
  } else {
    // 4. 媒体の配分
    const media = allocateMedia(active, fired, total);
    out.push({
      key: "decision.total_budget",
      kind: "decision",
      value: total,
      valueText: input !== null ? `広告の総予算 ${total}万円（入力値）` : `広告の総予算 ${total}万円（ルールによる提案値）`,
      unit: "万円",
      scope: { type: "rules" },
      basis: {
        source: input !== null ? "input" : "rule",
        rules: input !== null ? [] : budgetRules.map(applied),
        suggested_man_yen: suggested,
        property_price_man_yen: property.price_man_yen,
      },
      status: "ok",
      datasetVersionIds: [],
      attribution,
    });
    for (const m of media) {
      const def = MEDIA.find((d) => d.id === m.id)!;
      out.push({
        key: `decision.media.${m.id}`,
        kind: "decision",
        value: m.amount,
        valueText: `${def.label} ${m.amount}万円（${Math.round((m.amount / total) * 100)}%）`,
        unit: "万円",
        comparison: total,
        scope: { type: "rules" },
        basis: {
          media: def.label,
          role: def.role,
          share: Math.round((m.amount / total) * 1000) / 1000,
          weight: m.weight,
          fixed_man_yen: m.fixed,
          min_man_yen: m.min,
          rules: m.rules,
        },
        status: "ok",
        datasetVersionIds: [],
        attribution,
      });
    }
  }

  // 判断カードの出典：条件が参照した事実カードの版（すべての判断を終えてから入れる）
  const versionIds = [...usedVersions];
  for (const f of out) f.datasetVersionIds = versionIds;
  return out;
}

function collectVersions(condition: Condition, byKey: Map<string, FactDraft>, out: Set<number>) {
  if ("always" in condition) return;
  if ("all" in condition) {
    for (const c of condition.all) collectVersions(c, byKey, out);
    return;
  }
  for (const v of byKey.get(condition.fact)?.datasetVersionIds ?? []) out.add(Number(v));
}
