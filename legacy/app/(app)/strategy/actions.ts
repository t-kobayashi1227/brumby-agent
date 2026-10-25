"use server";

import { getSql } from "../../../lib/db";
import { advanceRun, startRun, type RunProgress } from "../../../lib/analyzers/stages";
import { RADIUS_CHOICES } from "./radius";

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

// 予算別シミュレーション：総予算だけを変えて、媒体の配分をし直す
// 採点ルール表（D35）の配分は、第1ターゲットへの届きやすさの比率で決まる。比率は実行の判断カード（decision.media.* の share）のまま使う

export interface SimulatedMedia {
  id: string;
  amount: number;
  initialManYen: number | null;
}

export async function simulateBudget(propertyId: number, totalManYen: number): Promise<SimulatedMedia[]> {
  if (!Number.isFinite(totalManYen) || totalManYen <= 0) throw new Error("総予算が正しくありません");
  const sql = getSql();
  const [run] = await sql<{ id: number }[]>`
    select id from analysis_runs where property_id = ${propertyId} and status = 'succeeded' order by id desc limit 1
  `;
  if (!run) throw new Error("分析の実行がありません");
  const rows = await sql<{ key: string; basis: { share?: number } | null }[]>`
    select key, basis from facts where run_id = ${run.id} and key like 'decision.media.%'
  `;
  const [budget] = await sql<{ basis: { initial_man_yen?: number; property_price_man_yen?: number } | null; value: string | null }[]>`
    select basis, value from facts where run_id = ${run.id} and key = 'decision.total_budget'
  `;
  // 最初に使う額の割合は、実行のときの総予算と初回の額から出す
  const initialRate = budget?.value && budget.basis?.initial_man_yen !== undefined ? budget.basis.initial_man_yen / Number(budget.value) : null;
  return rows.map((r) => {
    const share = r.basis?.share ?? 0;
    const amount = Math.round(totalManYen * share * 10) / 10;
    return {
      id: r.key.slice("decision.media.".length),
      amount,
      initialManYen: initialRate === null ? null : Math.round(totalManYen * initialRate * share * 10) / 10,
    };
  });
}
