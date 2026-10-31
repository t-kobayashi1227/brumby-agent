// ④戦略の作成（docs/設計まとめ.md「処理の流れ」）
// 1. 戦略（Sonnet 5.5）：事実シート全体から、分析（事実 → 買い手にとっての意味 → 販売での使い方）と戦略を1回で作る
// 2. 媒体（Haiku 5.5）：戦略のターゲットと P・B・C の事実から媒体と配分を決める
// 3. 点検：プログラムで形を見て（IDのない文はここで外す）、確認（Sonnet 5.5）が中身を見る
//    PoC では作り直さない。点検が求める扱い（作り直し・外す・記録だけ）のまま check_results に残す
// 4. 配分から金額を計算する。入力・出力・費用・点検の結果は、すべて DB（strategy_runs・agent_calls・check_results）に残す

import type Anthropic from "@anthropic-ai/sdk";
import type { z } from "zod/v4";
import { simulate } from "../calc/budget";
import { serial, type Sql } from "../db";
import { createFactSheet } from "../facts";
import type { Fact, FactCategory, FactSheet } from "../facts/types";
import { checkProgram, removeSentences, splitWhere, type CheckIssue } from "./checks";
import { STRATEGY_MODEL, type Model } from "./cost";
import { callModel, DEFAULT_CALL, type CallOptions, type Effort } from "./llm";
import { agentPrompt } from "./prompts";
import { checkSchema, mainPart, mediaSchema, strategySchema, type AgentName, type CheckOutput, type MediaOutput, type StrategyOutput } from "./schemas";

type RunStage = "戦略" | "媒体" | "確認" | "金額の計算";

export interface RunOptions {
  /** 戦略担当のモデルと考える量（比べるときに Haiku や high を試す） */
  strategy: { model: Model; effort: Effort };
}

/** 実行が成功したときに strategy_runs.result に保存する形（⑤の画面はこれを読む） */
export interface StrategyResult {
  fact_sheet_id: number;
  構成: "3回";
  戦略担当: RunOptions["strategy"];
  戦略: StrategyOutput;
  媒体: MediaOutput;
  予算シミュレーション: ReturnType<typeof simulate>;
}

const DEFAULT_RUN: RunOptions = { strategy: { model: STRATEGY_MODEL, effort: "medium" } };

/** 確認担当。点検する側が見立てを読み違えないよう、戦略担当と同じ Sonnet 5.5 にする（docs/履歴/戦略の質を上げる修正案.md 4.1） */
const CHECK_CALL: CallOptions = { model: STRATEGY_MODEL, effort: "medium", maxTokens: 16000 };
/** 戦略担当は分析と戦略を1回で作るので出力が大きい（修正案 4.2） */
const STRATEGY_MAX_TOKENS = 64000;

const MEDIA_FACTS: FactCategory[] = ["P", "B", "C"];

/** 確認エージェントの点検項目の番号（指示文の 1〜5） */
const AI_CHECK_NAMES: Record<number, string> = {
  1: "数字が事実と合わない",
  2: "名前が事実にない",
  3: "見立てが事実と矛盾する",
  4: "災害を軽く書いている",
  5: "価格や売れることの約束",
};

export function factsOf(sheet: FactSheet, categories: FactCategory[]): Fact[] {
  return sheet.事実.filter((f) => categories.includes(f.id.split("-")[0] as FactCategory));
}

interface RunResult {
  runId: number;
  factSheetId: number;
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  calls: number;
  /** 点検で見つかった問題の件数（プログラムと確認） */
  checks: number;
}

/** 実行中のまま、これより長く経った実行は、止まったものとみなす（サーバーが途中で止まったときなど） */
const STALE_MINUTES = 15;

/**
 * 戦略を作る。onStarted は strategy_runs の行を作ったときに呼ぶ（画面は、その id で進み具合を読みに行く）
 * 同じ物件で実行中のものがあれば、例外にする（strategy_runs_one_active）
 */
export async function runStrategy(
  sql: Sql,
  propertyId: number,
  onStage?: (stage: RunStage) => void,
  onStarted?: (runId: number) => void,
  options: RunOptions = DEFAULT_RUN,
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
    insert into strategy_runs (property_id, fact_sheet_id, form, status, stage, started_at)
    values (${propertyId}, ${factSheetId}, '3回', 'running', '戦略', now()) returning id
  `;
  const runId = Number(run.id);
  onStarted?.(runId);
  onStage?.("戦略");
  const setStage = (stage: RunStage) => {
    onStage?.(stage);
    return db(() => sql`update strategy_runs set stage = ${stage} where id = ${runId}`);
  };

  /** エージェントを1回呼び、agent_calls に入力・出力・トークン数・費用を残す。失敗したら例外 */
  const call = async <S extends z.ZodType>(agent: AgentName, input: unknown, schema: S, callOptions: CallOptions = DEFAULT_CALL) => {
    const prompt = agentPrompt(agent);
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: JSON.stringify(input) }];
    const [row] = await db(
      () => sql<{ id: string }[]>`
        insert into agent_calls (run_id, agent, attempt, model, effort, prompt_file, prompt_sha256, input)
        values (${runId}, ${agent}, 1, ${callOptions.model}, ${callOptions.effort}, ${prompt.file}, ${prompt.sha256}, ${sql.json({ messages } as never)})
        returning id
      `,
    );
    const callId = Number(row.id);
    try {
      const r = await callModel(prompt.system, messages, schema, callOptions);
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
      return { output: r.output, callId };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      await db(() => sql`update agent_calls set status = 'failed', error = coalesce(error, ${message}), finished_at = coalesce(finished_at, now()) where id = ${callId}`);
      throw e;
    }
  };

  const saveChecks = (issues: CheckIssue[], checker: "プログラム" | "AI", agentCallId: number | null) =>
    db(async () => {
      for (const i of issues) {
        await sql`
          insert into check_results (run_id, agent_call_id, round, checker, target, location, check_name, problem, action)
          values (${runId}, ${agentCallId}, 1, ${checker}, ${i.target}, ${i.location}, ${i.check_name}, ${i.problem}, ${i.action})
        `;
      }
    });

  const aiIssues = (out: CheckOutput): CheckIssue[] =>
    out.issues.map((i) => ({ ...splitWhere(i.where), check_name: AI_CHECK_NAMES[i.check] ?? `点検${i.check}`, problem: i.problem, action: "作り直し" }));

  try {
    // 1. 戦略（事実シート全体）
    const strategyCall = await call("戦略", { 事実シート: sheet }, strategySchema, { ...options.strategy, maxTokens: STRATEGY_MAX_TOKENS });
    let main: StrategyOutput = strategyCall.output;

    // 2. 媒体（P・B・C と、戦略のうち分析を除いた部分）
    await setStage("媒体");
    const mediaCall = await call("媒体", { 距離の種類: sheet.距離の種類, 事実: factsOf(sheet, MEDIA_FACTS), メインの答え: mainPart(main) }, mediaSchema);
    let mediaOut: MediaOutput = mediaCall.output;

    // 3. 点検：プログラム → 確認エージェント。IDのない文はここで外す
    await setStage("確認");
    const program = checkProgram(main, mediaOut, sheet.事実, mediaIds);
    await saveChecks(program, "プログラム", null);
    ({ main, media: mediaOut } = removeSentences(main, mediaOut, program));
    const check = await call("確認", { 事実シート: sheet, 点検する文章: { 戦略: main, 媒体: mediaOut } }, checkSchema, CHECK_CALL);
    const ai = aiIssues(check.output);
    await saveChecks(ai, "AI", check.callId);

    // 4. 配分から金額（10万・20万・30万円と、①の総額）
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
    const result: StrategyResult = { fact_sheet_id: factSheetId, 構成: "3回", 戦略担当: options.strategy, 戦略: main, 媒体: mediaOut, 予算シミュレーション: budget };
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
      checks: program.length + ai.length,
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
