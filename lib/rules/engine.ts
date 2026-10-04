import type { FactDraft, PropertyRow } from "../types";
import { MEDIA, TARGETS } from "./catalog";

// ルールの評価エンジン（設計書 6.1）。毎回同じ手順で計算する
// 1. 狙う層の候補に点数を付けて順位を出す
// 2. 総予算を決める
// 3. 媒体の重み → 比率 → 固定額・最低額を当てはめる → 千円単位に丸める
// 4. 効いたルールを記録する
// 条件は「事実カードの値と、定数または比べる値との単純な比較」だけ

export type Op = ">" | ">=" | "<" | "<=" | "==" | "!=";

export type Condition =
  | { always: true }
  | { all: Condition[] }
  | { fact: string; op: Op; than: number | "comparison"; delta?: number };

export type Effect =
  | { target: string; score: number }                          // target_score
  | { total_man_yen: number }                                  // total_budget
  | { media: string; weight?: number; multiply?: number }      // media_weight（weight＝出発点、multiply＝掛ける）
  | { media: string; fixed_man_yen?: number; min_man_yen?: number }; // min_spend

export interface Rule {
  id: string;
  kind: "total_budget" | "media_weight" | "min_spend" | "target_score";
  condition: Condition;
  effect: Effect;
  note: string;
  enabled: boolean;
  version: number;
}

interface Applied {
  id: string;
  version: number;
  note: string;
}

/** 条件で参照できる値：事実カード（key）、物件の情報（property.xxx）、この計算で先に決めた値（decision.total_budget） */
type Lookup = (key: string) => { value: number; comparison: number | null } | null;

function compare(a: number, op: Op, b: number) {
  switch (op) {
    case ">": return a > b;
    case ">=": return a >= b;
    case "<": return a < b;
    case "<=": return a <= b;
    case "==": return a === b;
    case "!=": return a !== b;
  }
}

/** 条件を満たすか。参照する値がない・データが足りないときは満たさない（false） */
export function evaluate(condition: Condition, lookup: Lookup): boolean {
  if ("always" in condition) return true;
  if ("all" in condition) return condition.all.every((c) => evaluate(c, lookup));
  const found = lookup(condition.fact);
  if (!found) return false;
  const base = condition.than === "comparison" ? found.comparison : condition.than;
  if (base === null || base === undefined) return false;
  return compare(found.value, condition.op, base + (condition.delta ?? 0));
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

export function runRules(rules: Rule[], facts: FactDraft[], property: PropertyRow): FactDraft[] {
  const active = rules.filter((r) => r.enabled);
  const byKey = new Map(facts.filter((f) => f.status === "ok" && typeof f.value === "number").map((f) => [f.key, f]));
  const decided = new Map<string, number>();
  const lookup: Lookup = (key) => {
    if (key.startsWith("property.")) {
      const v = (property as unknown as Record<string, unknown>)[key.slice("property.".length)];
      return typeof v === "number" ? { value: v, comparison: null } : null;
    }
    if (key.startsWith("decision.")) {
      const v = decided.get(key);
      return v === undefined ? null : { value: v, comparison: null };
    }
    const f = byKey.get(key);
    return f ? { value: Number(f.value), comparison: f.comparison ?? null } : null;
  };
  /** 条件が参照した事実カードの版（判断カードの出典に残す） */
  const usedVersions = new Set<number>();
  const fired = (r: Rule) => {
    const ok = evaluate(r.condition, lookup);
    if (ok) collectVersions(r.condition, byKey, usedVersions);
    return ok;
  };
  const applied = (r: Rule): Applied => ({ id: r.id, version: r.version, note: r.note });

  // 1. 狙う層の順位
  const scores = new Map(TARGETS.map((t) => [t.id, { score: 0, rules: [] as Applied[] }]));
  for (const r of active.filter((r) => r.kind === "target_score")) {
    const e = r.effect as { target: string; score: number };
    if (scores.has(e.target) && fired(r)) {
      const s = scores.get(e.target)!;
      s.score += e.score;
      s.rules.push(applied(r));
    }
  }
  const ranking = TARGETS.map((t, i) => ({ ...t, order: i, ...scores.get(t.id)! }))
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .map((t, i) => ({ rank: i + 1, id: t.id, label: t.label, description: t.description, score: t.score, rules: t.rules }));

  // 2. 総予算（当てはまるルールが複数あれば、一番大きい額）
  const budgetRules = active.filter((r) => r.kind === "total_budget" && fired(r));
  const total = budgetRules.length > 0 ? Math.max(...budgetRules.map((r) => (r.effect as { total_man_yen: number }).total_man_yen)) : null;
  if (total !== null) decided.set("decision.total_budget", total);

  // 3. 媒体の重み → 固定額・最低額 → 配分
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

  const versionIds = [...usedVersions];
  const attribution = "ルール表（仮のルール。BRUMBY様との打ち合わせで見直す）";
  const out: FactDraft[] = [];
  out.push({
    key: "decision.target_rank",
    kind: "decision",
    value: ranking[0].score,
    valueText: ranking.map((t) => `${t.rank}位 ${t.label}（${t.score}点）`).join(" ／ "),
    unit: "score",
    scope: { type: "rules" },
    basis: { ranking },
    status: "ok",
    datasetVersionIds: versionIds,
    attribution,
  });

  if (total === null) {
    out.push({ key: "decision.total_budget", kind: "decision", status: "not_available", scope: { type: "rules" }, basis: { reason: "総予算を決めるルールに当てはまりませんでした（物件の価格が入っていない可能性）" }, datasetVersionIds: versionIds, attribution });
    return out;
  }
  out.push({
    key: "decision.total_budget",
    kind: "decision",
    value: total,
    valueText: `広告の総予算 ${total}万円`,
    unit: "万円",
    scope: { type: "rules" },
    basis: { rules: budgetRules.map(applied), property_price_man_yen: property.price_man_yen },
    status: "ok",
    datasetVersionIds: versionIds,
    attribution,
  });

  const amounts = allocate(total, weights, fixed, mins);
  for (const m of MEDIA) {
    const amount = amounts[m.id] ?? 0;
    out.push({
      key: `decision.media.${m.id}`,
      kind: "decision",
      value: amount,
      valueText: `${m.label} ${amount}万円（${Math.round((amount / total) * 100)}%）`,
      unit: "万円",
      comparison: total,
      scope: { type: "rules" },
      basis: {
        media: m.label,
        role: m.role,
        share: Math.round((amount / total) * 1000) / 1000,
        weight: Math.round(weights[m.id] * 100) / 100,
        fixed_man_yen: fixed[m.id] ?? null,
        min_man_yen: mins[m.id] ?? null,
        rules: mediaRules.get(m.id),
      },
      status: "ok",
      datasetVersionIds: versionIds,
      attribution,
    });
  }
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
