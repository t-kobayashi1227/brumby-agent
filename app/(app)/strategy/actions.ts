"use server";

import { getSql } from "../../../lib/db";
import type { FactDraft, PropertyRow } from "../../../lib/types";
import { simulateMediaAllocation, type MediaAllocation, type Rule } from "../../../lib/rules/engine";
import { advanceRun, startRun, type RunProgress } from "../../../lib/analyzers/stages";
import { RADIUS_CHOICES } from "./radius";
import { ANSWERS, PER_ANSWER, PER_PROPERTY } from "./evaluation";
import { revalidatePath } from "next/cache";

/**
 * 分析を始める（設計書 D34）。同じ物件で進行中の実行があれば、それを返す（連打しても二重に動かない）
 * 画面は、この後 advanceAnalysis を status が running でなくなるまで呼ぶ
 */
export async function startAnalysis(propertyId: number, radiusM: number | null): Promise<RunProgress> {
  if (!Number.isInteger(propertyId) || propertyId <= 0) throw new Error("物件の番号が正しくありません");
  if (!(RADIUS_CHOICES as readonly (number | null)[]).includes(radiusM)) throw new Error("半径が選択肢にありません");
  return startRun(getSql(), propertyId, radiusM === null ? {} : { radius_m: radiusM });
}

/** 分析を1段階だけ進める（集計 → ルール → AI → 検証）。1回の呼び出しが実行時間の上限を超えないように分けている */
export async function advanceAnalysis(runId: number): Promise<RunProgress> {
  if (!Number.isInteger(runId) || runId <= 0) throw new Error("実行の番号が正しくありません");
  return advanceRun(getSql(), runId);
}

// 予算別シミュレーション（ルール表の画面と同じルールエンジンで、総予算だけを変えて計算し直す）

export async function simulateBudget(propertyId: number, totalManYen: number): Promise<MediaAllocation[]> {
  const sql = getSql();
  const [property] = await sql<{ property_type: string; price_man_yen: number | null; land_sqm: string | null; building_sqm: string | null }[]>`
    select property_type, price_man_yen, land_sqm, building_sqm from properties where id = ${propertyId}
  `;
  if (!property) throw new Error(`物件 ${propertyId} がありません`);

  const [run] = await sql<{ id: number }[]>`
    select id from analysis_runs where property_id = ${propertyId} and status = 'succeeded' order by id desc limit 1
  `;
  if (!run) throw new Error("分析の実行がありません");

  const [facts, rules] = await Promise.all([
    sql<{ key: string; value: number | null; value_text: string | null; comparison: number | null; status: FactDraft["status"] }[]>`
      select key, value, value_text, comparison, status from facts where run_id = ${run.id}
    `,
    sql<Rule[]>`select id, kind, condition, effect, note, enabled, version from rules order by id`,
  ]);

  const factDrafts: FactDraft[] = facts.map((f) => ({
    key: f.key,
    value: f.value === null ? null : Number(f.value),
    valueText: f.value_text,
    comparison: f.comparison === null ? null : Number(f.comparison),
    status: f.status,
    datasetVersionIds: [],
  }));
  // 条件の when（物件種別）を判定するため、種別も渡す
  const propertyRow = {
    property_type: property.property_type,
    price_man_yen: property.price_man_yen,
    land_sqm: property.land_sqm === null ? null : Number(property.land_sqm),
    building_sqm: property.building_sqm === null ? null : Number(property.building_sqm),
  } as unknown as PropertyRow;

  return simulateMediaAllocation(rules, factDrafts, propertyRow, totalManYen);
}

export interface EvaluationState {
  ok?: string;
  error?: string;
}

/**
 * 評価を保存する（設計書 D18・10章）。同じ人・同じ答え・同じ観点は上書きする（evaluations_one_per_evaluator）
 * 点を空にした欄は保存しない（前に付けた点は残る）
 */
export async function saveEvaluation(_prev: EvaluationState, formData: FormData): Promise<EvaluationState> {
  try {
    const narrativeId = Number(formData.get("narrative_id"));
    if (!Number.isInteger(narrativeId) || narrativeId <= 0) throw new Error("評価する文章がありません");
    const evaluator = String(formData.get("evaluator") ?? "").trim();
    if (!evaluator) throw new Error("評価した人の名前を入れてください");

    const cells = [
      ...ANSWERS.flatMap((a) => PER_ANSWER.map((c) => ({ answerKey: a.key as string | null, criterion: c.key as string }))),
      ...PER_PROPERTY.map((c) => ({ answerKey: null, criterion: c.key as string })),
    ];
    const rows = cells.flatMap(({ answerKey, criterion }) => {
      const raw = String(formData.get(`score|${answerKey ?? "-"}|${criterion}`) ?? "");
      if (raw === "") return [];
      const score = Number(raw);
      if (!Number.isInteger(score) || score < 1 || score > 5) throw new Error("点は1〜5で選んでください");
      const memo = String(formData.get(`memo|${answerKey ?? "-"}|${criterion}`) ?? "").trim() || null;
      return [{ answerKey, criterion, score, memo }];
    });
    if (rows.length === 0) throw new Error("点を1つ以上選んでください");

    const sql = getSql();
    await sql.begin(async (tx) => {
      for (const r of rows) {
        await tx`
          insert into evaluations (narrative_id, answer_key, criterion, score, memo, evaluator)
          values (${narrativeId}, ${r.answerKey}, ${r.criterion}, ${r.score}, ${r.memo}, ${evaluator})
          on conflict on constraint evaluations_one_per_evaluator
          do update set score = excluded.score, memo = excluded.memo, created_at = now()
        `;
      }
    });
    revalidatePath("/strategy");
    return { ok: `${rows.length}件の評価を保存しました（${evaluator}）` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
