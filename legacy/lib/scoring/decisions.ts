import { ITEM_LABEL } from "./constants";
import type { ScoringResult } from "./engine";
import type { AppealResult, LayerResult, PersonaResult, ScoringInputs } from "./types";
import type { FactDraft } from "../types";

// 採点の結果を判断カード（facts の kind=decision）にする（設計書 D35）
// key は前の方式と同じもの（decision.target_rank・decision.appeals・decision.total_budget・decision.media.*）を使い、
// basis に採点ルール表の理由を足す。新しく decision.persona_scores・decision.salability を作る

export const SCORING_ATTRIBUTION = "採点ルール表（BRUMBY様と作成。初版 v0.26 から /rules で編集）";

/** 訴求は上位いくつまで使うか（D23。採点ルール表では4つまで。2026-10-12に決定） */
export const APPEAL_LIMIT = 4;

/** decision.target_rank の basis.ranking の1件（前の方式の形に、層ごとの点数などを足したもの） */
export interface ScoredTargetItem {
  rank: number;
  id: string;
  label: string;
  description: string;
  /** 総合（0〜100） */
  score: number;
  max: number;
  rules: { id: string; version: number; note: string }[];
  confidence: "normal" | "low";
  available: boolean;
  layers: LayerResult[];
  buyerScore: number;
  targetImage: string | null;
}

/** decision.appeals の basis.items の1件 */
export interface ScoredAppealItem {
  id: string;
  label: string;
  description: string;
  score: number;
  selected: boolean;
  needsFacts: string[];
  rules: { id: string; version: number; note: string }[];
  judgement: AppealResult["judgement"];
  against: AppealResult["against"];
  own: number | null;
  compareTo: number | null;
  net: number;
  importance: number;
}

const fmt = (v: number | null, key: string) => {
  if (v === null) return "—";
  const unit = key.endsWith("_万円") ? "万円" : key.endsWith("_㎡") ? "㎡" : key.endsWith("_m") ? "m" : key.endsWith("_台") ? "台" : key === "築年数" ? "年" : key === "部屋数" ? "室" : "";
  return `${Math.round(v * 10) / 10}${unit}`;
};

function appealDescription(a: AppealResult): string {
  if (a.against === "比べられない") return "比べる相手のデータがありません";
  const who = a.against === "競合" ? "競合物件" : "周辺の取引の中央値";
  const result = a.net > 0 ? "有利" : a.net < 0 ? "不利" : "同等";
  return `${who}（${fmt(a.compareTo, a.key)}）と比べて${result}（この物件 ${fmt(a.own, a.key)}）`;
}

export function scoringDecisions(result: ScoringResult, inputs: ScoringInputs, facts: FactDraft[]): FactDraft[] {
  // 判断カードの出典：採点に使った事実カードの版
  const usedKeys = new Set(Object.values(inputs.values).map((v) => v.factKey).filter((k): k is string => !!k));
  const versionIds = [...new Set(facts.filter((f) => usedKeys.has(f.key)).flatMap((f) => f.datasetVersionIds.map(Number)))];
  const base = { kind: "decision" as const, scope: { type: "scoring" }, datasetVersionIds: versionIds, attribution: SCORING_ATTRIBUTION };
  const out: FactDraft[] = [];

  const missingInputs = Object.entries(inputs.values).filter(([, v]) => v.value === null).map(([k]) => k);
  out.push({
    ...base,
    key: "decision.persona_scores",
    value: result.personas[0]?.total ?? null,
    // AIが引用できるよう、層ごとの点数とターゲット像も文に入れる（検証は引用したカードの文の数字と照合する）
    valueText: result.personas
      .map((p) => `${p.rank}位 ${p.label} 総合${p.total}点（${p.layers.map((l) => `${l.layer}${l.score === null ? "データなし" : `${l.score}点`}`).join("・")}・買い手の多さ${p.buyerScore}点${p.targetImage ? `・${p.targetImage}` : ""}）`)
      .join(" ／ "),
    unit: "点",
    basis: {
      personas: result.personas,
      inputs: inputs.values,
      ward: inputs.ward,
      town: inputs.town,
      age_class: inputs.ageClass,
      is_new: inputs.isNew,
      competitors: result.comparison,
      missing_inputs: missingInputs,
    },
    status: result.personas.length ? "ok" : "insufficient",
  });

  const ranking: ScoredTargetItem[] = result.personas.map((p: PersonaResult) => ({
    rank: p.rank,
    id: p.id,
    label: p.label,
    description: p.description,
    score: p.total,
    max: 100,
    rules: [],
    confidence: "normal",
    available: true,
    layers: p.layers,
    buyerScore: p.buyerScore,
    targetImage: p.targetImage,
  }));
  const top3 = ranking.slice(0, 3);
  out.push({
    ...base,
    key: "decision.target_rank",
    value: top3[0]?.score ?? null,
    valueText: top3.length
      ? top3.map((t) => `第${t.rank}ターゲット ${t.label}（総合${t.score}点${t.targetImage ? `・${t.targetImage}` : ""}）`).join(" ／ ") + topReasons(top3[0])
      : "ペルソナが登録されていません",
    unit: "score",
    basis: { ranking, tied: false, unresolved: top3.length === 0, method: "scoring" },
    status: top3.length ? "ok" : "insufficient",
  });

  const appealItems: ScoredAppealItem[] = result.appeals.map((a) => ({
    id: a.key,
    label: a.label,
    description: appealDescription(a),
    score: a.strength,
    selected: false,
    needsFacts: [],
    rules: [],
    judgement: a.judgement,
    against: a.against,
    own: a.own,
    compareTo: a.compareTo,
    net: a.net,
    importance: a.importance,
  }));
  appealItems.filter((a) => a.score > 0).slice(0, APPEAL_LIMIT).forEach((a) => (a.selected = true));
  const selected = appealItems.filter((a) => a.selected);
  out.push({
    ...base,
    key: "decision.appeals",
    value: selected.length,
    valueText: selected.length
      ? selected.map((a, i) => `${i + 1}. ${a.label}（${a.judgement}：${a.description}）`).join(" ／ ")
      : "競合・周辺の取引と比べて有利な項目がありません",
    unit: "件",
    basis: { items: appealItems, limit: APPEAL_LIMIT, target: result.personas[0]?.id ?? null, has_competitors: result.comparison.hasCompetitors },
    status: selected.length ? "ok" : "insufficient",
  });

  const s = result.salability;
  out.push({
    ...base,
    key: "decision.salability",
    value: s.score,
    valueText: s.score === null ? "売れやすさを判断できません" : `売れやすさ ${s.score}点（${s.class}）`,
    unit: "点",
    basis: { ...s },
    status: s.score === null ? "insufficient" : "ok",
  });

  const b = result.budget;
  if (b.totalManYen === null) {
    out.push({ ...base, key: "decision.total_budget", status: "not_available", basis: { source: null, reason: "物件の価格が入っていないため、予算を計算できません" } });
  } else {
    out.push({
      ...base,
      key: "decision.total_budget",
      value: b.totalManYen,
      valueText:
        b.source === "input"
          ? `広告の総予算 ${b.totalManYen}万円（入力値）。最初に${b.initialManYen}万円、${b.addRule}`
          : `広告の総予算 ${b.totalManYen}万円（物件価格×基準率×${b.multiplier}）。最初に${b.initialManYen}万円、${b.addRule}`,
      unit: "万円",
      basis: {
        source: b.source,
        rules: [],
        suggested_man_yen: b.suggestedManYen,
        multiplier: b.multiplier,
        initial_man_yen: b.initialManYen,
        additional_man_yen: b.additionalManYen,
        add_rule: b.addRule,
        suggestion: b.suggestion,
        options: b.options,
        property_price_man_yen: inputs.values["価格_万円"]?.value ?? null,
      },
      status: "ok",
    });
    for (const m of result.media) {
      out.push({
        ...base,
        key: `decision.media.${m.id}`,
        value: m.amountManYen,
        // AIが媒体を選んだ理由を書けるよう、届きやすさの順位と根拠（利用率）も文に入れる
        valueText: `${m.label} ${m.amountManYen}万円（${Math.round(m.share * 100)}%）。届きやすさ${m.rank}位（${
          m.basis.kind === "usage" ? `${m.basis.statName}の利用率 第1ターゲット${m.basis.targetUsage}%・全年代${m.basis.allAges}%` : `年代別の統計なし・一律${m.basis.flatReach}`
        }${m.coefficient !== 1 ? `・反響係数${m.coefficient}` : ""}）${m.selected ? "" : "。上位に入らず配分なし"}`,
        unit: "万円",
        comparison: b.totalManYen,
        basis: {
          media: m.label,
          role: m.formatExample,
          share: m.share,
          reach: m.reach,
          rank: m.rank,
          selected: m.selected,
          reach_basis: m.basis,
          coefficient: m.coefficient,
          initial_man_yen: m.initialManYen,
          target: result.personas[0]?.id ?? null,
          target_label: result.personas[0]?.label ?? null,
          rules: [],
        },
        status: "ok",
      });
    }
  }
  return out;
}

/** 第1ターゲットの主な加点の理由（点の大きい順に3つ） */
function topReasons(t: ScoredTargetItem): string {
  const hits = t.layers.flatMap((l) => l.hits ?? []).filter((h) => h.points > 0).sort((a, b) => b.points - a.points).slice(0, 3);
  return hits.length ? `。第1ターゲットの主な理由：${hits.map((h) => h.reason).join("、")}` : "";
}

/** 層の該当ルールの説明（AIのプロンプト・印刷用） */
export function layerSummary(l: LayerResult): string {
  if (l.score === null) return `${l.layer}：データなし`;
  if (l.hits) {
    const hits = l.hits.filter((h) => h.points !== 0).map((h) => `${h.reason}（${h.mark ?? "－"}${h.points > 0 ? "+" : ""}${h.points}）`);
    return `${l.layer} ${l.score}点${hits.length ? `：${hits.join("、")}` : ""}${l.missing?.length ? `（データなし：${l.missing.map((k) => ITEM_LABEL[k] ?? k).join("・")}）` : ""}`;
  }
  return `${l.layer} ${l.score}点`;
}
