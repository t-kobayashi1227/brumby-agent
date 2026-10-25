// ④戦略の作成（docs/設計まとめ.md「処理の流れ」）
// 1. 物件・立地・価格・買い手を同時に動かす（お互いの答えは見ない）
// 2. メインが4つの答えと事実シート全体から戦略を決める  3. 媒体がメインのターゲットから媒体と配分を決める
// 4. 点検：プログラムで形を見て、確認エージェントが中身を見る  5. 問題のある文は、メインか媒体に1回だけ作り直させる（PoC では止めている：REBUILD）
// 6. 配分から金額を計算する。入力・出力・費用・点検の結果は、すべて DB（strategy_runs・agent_calls・check_results）に残す

import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod/v4";
import { simulate } from "../calc/budget";
import type { Sql } from "../db";
import { createFactSheet } from "../facts";
import type { Fact, FactCategory, FactSheet } from "../facts/types";
import { checkProgram, removeSentences, splitWhere, type CheckIssue, type CheckTarget } from "./checks";
import { MODEL } from "./cost";
import { callModel } from "./llm";
import { agentPrompt, rebuildMessage } from "./prompts";
import {
  analysisSchema,
  checkSchema,
  mainSchema,
  mediaSchema,
  type AgentName,
  type AnalysisAgent,
  type AnalysisOutput,
  type CheckOutput,
  type MainOutput,
  type MediaOutput,
} from "./schemas";

export type RunStage = "分析" | "メイン" | "媒体" | "確認" | "作り直し" | "金額の計算";

/** 4つの分析エージェントに渡す事実の分類（設計まとめ「エージェントと渡す事実」） */
const ANALYSIS_FACTS: Record<AnalysisAgent, FactCategory[]> = {
  物件: ["P", "M"],
  立地: ["R", "S", "L", "T", "H"],
  価格: ["P", "M", "K"],
  買い手: ["P", "A", "B"],
};
const MEDIA_FACTS: FactCategory[] = ["P", "B", "C"];

/** 確認エージェントの点検項目の番号（指示文の 1〜5） */
const AI_CHECK_NAMES: Record<number, string> = {
  1: "数字が事実の値と一致しない",
  2: "事実からその内容が言えない",
  3: "事実で支えられない言い切り",
  4: "災害を軽く書いている",
  5: "価格を約束する表現",
};

export function factsOf(sheet: FactSheet, categories: FactCategory[]): Fact[] {
  return sheet.事実.filter((f) => categories.includes(f.id.split("-")[0] as FactCategory));
}

/** DB への書き込みを1つずつ順に行う（同時に投げると、プーラー経由で止まることがあるため。lib/facts/collect.ts の inOrder） */
function serial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  };
}

export interface RunResult {
  runId: number;
  factSheetId: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  checks: { round1: number; round2: number | null };
}

/** 実行中のまま、これより長く経った実行は、止まったものとみなす（サーバーが途中で止まったときなど） */
const STALE_MINUTES = 15;

/**
 * 問題のある文を作り直すか。PoC では時間を縮めるため作り直さない（2026-10-26 小林さんと決定。1回の実行が約2.3分→約1.5分）
 * 点検は今までどおり行い、結果は check_results に残す（作り直さないので action は「なし」）。IDのない文を外すのは続ける
 */
export const REBUILD = false;

/**
 * 戦略を作る。onStarted は strategy_runs の行を作ったときに呼ぶ（画面は、その id で進み具合を読みに行く）
 * 同じ物件で実行中のものがあれば、例外にする（strategy_runs_one_active）
 */
export async function runStrategy(
  sql: Sql,
  propertyId: number,
  onStage?: (stage: RunStage) => void,
  onStarted?: (runId: number) => void,
): Promise<RunResult> {
  const db = serial();

  // 最新の事実シートを使う。無ければ作る
  const [latest] = await sql<{ id: string; content: FactSheet }[]>`
    select id, content from fact_sheets where property_id = ${propertyId} order by created_at desc limit 1
  `;
  const { id: factSheetId, sheet } = latest ? { id: Number(latest.id), sheet: latest.content } : await createFactSheet(sql, propertyId);
  const mediaIds = (await sql<{ id: string }[]>`select id from media order by sort`).map((m) => m.id);
  const [{ ad_budget_man_yen: adBudget }] = await sql<{ ad_budget_man_yen: number | null }[]>`select ad_budget_man_yen from properties where id = ${propertyId}`;

  await sql`
    update strategy_runs set status = 'failed', error = '途中で止まりました（サーバーが止まった可能性があります）', finished_at = now()
    where property_id = ${propertyId} and status in ('queued', 'running') and started_at < now() - make_interval(mins => ${STALE_MINUTES})
  `;
  const [active] = await sql`select 1 from strategy_runs where property_id = ${propertyId} and status in ('queued', 'running')`;
  if (active) throw new Error("この物件は、いま戦略を作っている途中です。終わるまで待ってください");
  const [run] = await sql<{ id: string }[]>`
    insert into strategy_runs (property_id, fact_sheet_id, status, stage, started_at)
    values (${propertyId}, ${factSheetId}, 'running', '分析', now()) returning id
  `;
  const runId = Number(run.id);
  onStarted?.(runId);
  const setStage = (stage: RunStage) => {
    onStage?.(stage);
    return db(() => sql`update strategy_runs set stage = ${stage} where id = ${runId}`);
  };

  /** エージェントを1回呼び、agent_calls に入力・出力・トークン数・費用を残す。失敗したら例外 */
  const call = async <S extends z.ZodType>(agent: AgentName, attempt: 1 | 2, input: unknown, schema: S, extra: Anthropic.MessageParam[] = []) => {
    const prompt = agentPrompt(agent);
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: JSON.stringify(input) }, ...extra];
    const [row] = await db(
      () => sql<{ id: string }[]>`
        insert into agent_calls (run_id, agent, attempt, model, prompt_file, prompt_sha256, input)
        values (${runId}, ${agent}, ${attempt}, ${MODEL}, ${prompt.file}, ${prompt.sha256}, ${sql.json({ messages } as never)})
        returning id
      `,
    );
    const callId = Number(row.id);
    try {
      const r = await callModel(prompt.system, messages, schema);
      await db(
        () => sql`
          update agent_calls set
            output = ${r.output === null ? null : sql.json(r.output as never)}, raw_text = ${r.rawText},
            status = ${r.error ? "failed" : "succeeded"}, error = ${r.error},
            input_tokens = ${r.usage.input_tokens}, output_tokens = ${r.usage.output_tokens},
            cache_read_tokens = ${r.usage.cache_read_input_tokens ?? 0}, cache_creation_tokens = ${r.usage.cache_creation_input_tokens ?? 0},
            cost_usd = ${r.costUsd}, finished_at = now()
          where id = ${callId}
        `,
      );
      if (r.error || r.output === null) throw new Error(`${agent}エージェント：${r.error}`);
      return { output: r.output, rawText: r.rawText, callId, messages };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db(() => sql`update agent_calls set status = 'failed', error = coalesce(error, ${message}), finished_at = coalesce(finished_at, now()) where id = ${callId}`);
      throw e;
    }
  };

  const saveChecks = (round: 1 | 2, issues: CheckIssue[], checker: "プログラム" | "AI", agentCallId: number | null) =>
    db(async () => {
      for (const i of issues) {
        await sql`
          insert into check_results (run_id, agent_call_id, round, checker, target, location, check_name, problem, action)
          values (${runId}, ${agentCallId}, ${round}, ${checker}, ${i.target}, ${i.location}, ${i.check_name}, ${i.problem}, ${i.action})
        `;
      }
    });

  const aiIssues = (out: CheckOutput, action: CheckIssue["action"]): CheckIssue[] =>
    out.issues.map((i) => ({ ...splitWhere(i.where), check_name: AI_CHECK_NAMES[i.check] ?? `点検${i.check}`, problem: i.problem, action }));

  try {
    // 1. 4つの分析（同時）
    const analysisAgents: AnalysisAgent[] = ["物件", "立地", "価格", "買い手"];
    const analyses = Object.fromEntries(
      await Promise.all(
        analysisAgents.map(async (agent) => {
          const r = await call(agent, 1, { 距離の種類: sheet.距離の種類, 事実: factsOf(sheet, ANALYSIS_FACTS[agent]) }, analysisSchema(agent));
          return [agent, r.output as AnalysisOutput] as const;
        }),
      ),
    ) as Record<AnalysisAgent, AnalysisOutput>;

    // 2. メイン（事実シート全体と4つの分析）
    await setStage("メイン");
    const mainInput = { 事実シート: sheet, 担当の分析: analyses };
    const mainCall = await call("メイン", 1, mainInput, mainSchema);
    let main: MainOutput = mainCall.output;

    // 3. 媒体（P・B・C とメインの答え）
    await setStage("媒体");
    const mediaInput = (m: MainOutput) => ({ 距離の種類: sheet.距離の種類, 事実: factsOf(sheet, MEDIA_FACTS), メインの答え: m });
    const mediaCall = await call("媒体", 1, mediaInput(main), mediaSchema);
    let mediaOut: MediaOutput = mediaCall.output;

    // 4. 点検（1回目）：プログラム → 確認エージェント。IDのない文はここで外す
    await setStage("確認");
    const program1 = checkProgram(main, mediaOut, sheet.事実, mediaIds).map((i) =>
      REBUILD || i.action !== "作り直し" ? i : { ...i, action: "なし" as const },
    );
    await saveChecks(1, program1, "プログラム", null);
    ({ main, media: mediaOut } = removeSentences(main, mediaOut, program1));
    const check1 = await call("確認", 1, { 事実シート: sheet, 点検する文章: { メイン: main, 媒体: mediaOut } }, checkSchema);
    const ai1 = aiIssues(check1.output, REBUILD ? "作り直し" : "なし");
    await saveChecks(1, ai1, "AI", check1.callId);

    // 5. 作り直し（1回だけ）。作り直した後に残った問題は、警告なしで出し、点検の結果だけ DB に残す
    const toRebuild = [...program1, ...ai1].filter((i) => i.action === "作り直し");
    let round2: number | null = null;
    if (toRebuild.length > 0) {
      await setStage("作り直し");
      const problemsFor = (t: CheckTarget) => toRebuild.filter((i) => i.target === t).map((i) => `${i.location}：${i.problem}`);
      const rebuild = async (t: CheckTarget, input: unknown, prev: { rawText: string }) => {
        const extra: Anthropic.MessageParam[] = [
          { role: "assistant", content: prev.rawText },
          { role: "user", content: rebuildMessage(problemsFor(t)) },
        ];
        return t === "メイン" ? (await call("メイン", 2, input, mainSchema, extra)).output : (await call("媒体", 2, input, mediaSchema, extra)).output;
      };
      if (problemsFor("メイン").length) main = (await rebuild("メイン", mainInput, mainCall)) as MainOutput;
      if (problemsFor("媒体").length) mediaOut = (await rebuild("媒体", mediaInput(mainCall.output), mediaCall)) as MediaOutput;

      const program2 = checkProgram(main, mediaOut, sheet.事実, mediaIds).map((i) => ({ ...i, action: i.action === "外す" ? i.action : ("なし" as const) }));
      await saveChecks(2, program2, "プログラム", null);
      ({ main, media: mediaOut } = removeSentences(main, mediaOut, program2));
      const check2 = await call("確認", 2, { 事実シート: sheet, 点検する文章: { メイン: main, 媒体: mediaOut } }, checkSchema);
      const ai2 = aiIssues(check2.output, "なし");
      await saveChecks(2, ai2, "AI", check2.callId);
      round2 = program2.length + ai2.length;
    }

    // 6. 配分から金額（10万・20万・30万円と、①の総額）
    await setStage("金額の計算");
    const budget = simulate(
      mediaOut.media.map((m) => ({ id: m.id, share: m.share })),
      adBudget,
    );

    const [totals] = await db(
      () => sql<{ calls: number; input_tokens: number; output_tokens: number; cost_usd: string }[]>`
        select count(*)::int as calls, coalesce(sum(input_tokens), 0)::int as input_tokens, coalesce(sum(output_tokens), 0)::int as output_tokens,
          coalesce(sum(cost_usd), 0) as cost_usd
        from agent_calls where run_id = ${runId}
      `,
    );
    const result = { fact_sheet_id: factSheetId, 分析: analyses, メイン: main, 媒体: mediaOut, 予算シミュレーション: budget };
    await db(
      () => sql`
        update strategy_runs set status = 'succeeded', result = ${sql.json(result as never)},
          input_tokens = ${totals.input_tokens}, output_tokens = ${totals.output_tokens}, cost_usd = ${totals.cost_usd}, finished_at = now()
        where id = ${runId}
      `,
    );
    return {
      runId,
      factSheetId,
      costUsd: Number(totals.cost_usd),
      inputTokens: totals.input_tokens,
      outputTokens: totals.output_tokens,
      calls: totals.calls,
      checks: { round1: program1.length + ai1.length, round2 },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    await db(
      () => sql`
        update strategy_runs r set status = 'failed', error = ${message}, finished_at = now(),
          input_tokens = coalesce((select sum(input_tokens) from agent_calls where run_id = r.id), 0),
          output_tokens = coalesce((select sum(output_tokens) from agent_calls where run_id = r.id), 0),
          cost_usd = coalesce((select sum(cost_usd) from agent_calls where run_id = r.id), 0)
        where id = ${runId}
      `,
    );
    throw e;
  }
}
