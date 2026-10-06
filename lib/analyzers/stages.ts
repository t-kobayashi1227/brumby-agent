import type { Sql } from "../db";
import { draftNarrative, MODEL, verifyNarrative } from "../ai/generate";
import { PROMPT_VERSION } from "../ai/prompt";
import { NarrativeContentSchema, type NarrativeContent } from "../ai/schema";
import type { ValidationResult } from "../ai/types";
import type { AppealDef, CandidateDef } from "../rules/catalog";
import { runRules, type Rule } from "../rules/engine";
import type { AnalysisParams, FactDraft } from "../types";
import { ANALYZERS, defaultParams, loadProperty } from "./run";
import { loadActiveVersions } from "./versions";

// 分析の実行を、段階（集計 → ルール → AI → 検証）ごとに別の呼び出しで進める（設計書 5.2・D34）
// 1回の呼び出しは1段階だけ。Vercel の実行時間の上限を超えないようにするため
// 画面は startRun で実行を作り、advanceRun を返り値の status が running でなくなるまで呼ぶ（返り値で進み具合を出す）
// 条件を変えて再実行すると、新しい実行として残る（古い結果と並べて比べられる）
// AIが失敗しても実行は成功にする。事実カードと判断カードだけでレポートを出し、文章の欄は「生成できませんでした」（設計書 8章）

export type Stage = "analyze" | "rules" | "ai" | "verify";
export const STAGES: Stage[] = ["analyze", "rules", "ai", "verify"];
export const STAGE_LABEL: Record<Stage, string> = { analyze: "集計", rules: "ルール", ai: "AI", verify: "検証" };

export interface RunProgress {
  runId: number;
  status: "running" | "succeeded" | "failed";
  stage: Stage | null;
  error: string | null;
}

/** この時間を過ぎても終わらない段階・実行は、途中で止まったものとみなす */
const STALE_MINUTES = 10;

async function readProgress(sql: Sql, runId: number): Promise<RunProgress> {
  const [row] = await sql<{ status: RunProgress["status"]; stage: Stage | null; error: string | null }[]>`
    select status, stage, error from analysis_runs where id = ${runId}
  `;
  if (!row) throw new Error(`実行 ${runId} がありません`);
  return { runId, status: row.status, stage: row.stage, error: row.error };
}

/**
 * 実行を作る。同じ物件で進行中の実行があれば、新しく作らずにそれを返す（ボタンの連打で二重に動かさない。設計書 8章）
 * 長い間進んでいない実行は、途中で止まったものとして failed にしてから作る
 */
export async function startRun(sql: Sql, propertyId: number, overrides: Partial<AnalysisParams> = {}): Promise<RunProgress> {
  const property = await loadProperty(sql, propertyId);

  await sql`
    update analysis_runs
    set status = 'failed', error = ${`途中で止まりました（${STALE_MINUTES}分以上進まなかった）`}, finished_at = now()
    where property_id = ${propertyId} and status = 'running'
      and coalesce(stage_started_at, created_at) < now() - make_interval(mins => ${STALE_MINUTES})
  `;
  const [running] = await sql<{ id: number }[]>`
    select id from analysis_runs where property_id = ${propertyId} and status = 'running' order by id desc limit 1
  `;
  if (running) return readProgress(sql, Number(running.id));

  const params = { ...defaultParams(property.area_class), ...overrides };
  const versions = await loadActiveVersions(sql);
  const allVersionIds = [...versions.values()].flat().map((v) => v.id);
  const [rules] = await sql<{ version: number | null }[]>`select max(id) as version from rule_revisions`;
  const [run] = await sql<{ id: number }[]>`
    insert into analysis_runs (property_id, params, dataset_version_ids, rules_version, status, stage)
    values (${propertyId}, ${sql.json(params as never)}, ${allVersionIds}, ${rules?.version ?? null}, 'running', 'analyze')
    returning id
  `;
  return { runId: Number(run.id), status: "running", stage: "analyze", error: null };
}

async function insertFacts(sql: Sql, runId: number, facts: FactDraft[], firstSeq: number) {
  await sql.begin(async (tx) => {
    for (const [i, f] of facts.entries()) {
      await tx`
        insert into facts (run_id, seq, key, kind, value, value_text, unit, comparison, scope, basis, status, dataset_version_ids, attribution)
        values (${runId}, ${firstSeq + i}, ${f.key}, ${f.kind ?? "fact"}, ${f.value ?? null}, ${f.valueText ?? null}, ${f.unit ?? null},
                ${f.comparison ?? null}, ${f.scope ? tx.json(f.scope as never) : null}, ${f.basis ? tx.json(f.basis as never) : null},
                ${f.status}, ${f.datasetVersionIds}, ${f.attribution ?? null})
      `;
    }
  });
}

async function loadFactDrafts(sql: Sql, runId: number): Promise<FactDraft[]> {
  const rows = await sql<
    { key: string; kind: "fact" | "decision"; value: string | null; value_text: string | null; unit: string | null; comparison: string | null; scope: Record<string, unknown> | null; basis: Record<string, unknown> | null; status: FactDraft["status"]; dataset_version_ids: string[]; attribution: string | null }[]
  >`select key, kind, value, value_text, unit, comparison, scope, basis, status, dataset_version_ids, attribution from facts where run_id = ${runId} order by seq`;
  return rows.map((r) => ({
    key: r.key,
    kind: r.kind,
    value: r.value === null ? null : Number(r.value),
    valueText: r.value_text,
    unit: r.unit,
    comparison: r.comparison === null ? null : Number(r.comparison),
    scope: r.scope,
    basis: r.basis,
    status: r.status,
    datasetVersionIds: r.dataset_version_ids.map(Number),
    attribution: r.attribution,
  }));
}

interface NarrativeRow {
  content: NarrativeContent;
  validation: ValidationResult | null;
  status: "ok" | "needs_review" | "failed";
  attempts: number;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
}

async function saveNarrative(sql: Sql, runId: number, n: NarrativeRow) {
  await sql`
    insert into narratives (run_id, model, prompt_version, content, validation, status, attempts, input_tokens, output_tokens, duration_ms)
    values (${runId}, ${MODEL}, ${PROMPT_VERSION}, ${sql.json(n.content as never)}, ${n.validation ? sql.json(n.validation as never) : null},
            ${n.status}, ${n.attempts}, ${n.inputTokens}, ${n.outputTokens}, ${n.durationMs})
    on conflict (run_id) do update set
      model = excluded.model, prompt_version = excluded.prompt_version, content = excluded.content,
      validation = excluded.validation, status = excluded.status, attempts = excluded.attempts,
      input_tokens = excluded.input_tokens, output_tokens = excluded.output_tokens, duration_ms = excluded.duration_ms, created_at = now()
  `;
}

/** 文章を作れなかったとき：空の文章を status=failed で残し、実行は成功にする（設計書 8章） */
async function finishWithoutNarrative(sql: Sql, runId: number, reason: string) {
  const empty: NarrativeContent = { headline: { kind: "qualitative", text: "", cites: [] }, sections: [] };
  await saveNarrative(sql, runId, { content: empty, validation: null, status: "failed", attempts: 0, inputTokens: null, outputTokens: null, durationMs: null });
  await sql`update analysis_runs set status = 'succeeded', error = ${`AIの文章：${reason}`}, stage_started_at = null, finished_at = now() where id = ${runId}`;
}

const nextStage = (sql: Sql, runId: number, stage: Stage) =>
  sql`update analysis_runs set stage = ${stage}, stage_started_at = null where id = ${runId}`;

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));

/**
 * いまの段階を1つだけ進める。ほかの呼び出しが同じ段階を進めている間は、何もせずに今の状態を返す
 * withAi=false なら、ルールの段階で終える（取り込みの確認などで、AIを呼ばずに分析だけしたいとき）
 */
export async function advanceRun(sql: Sql, runId: number, options: { withAi?: boolean } = {}): Promise<RunProgress> {
  // この段階を進める権利を取る（stage_started_at が空か、古すぎるときだけ）
  const [claim] = await sql<{ stage: Stage; property_id: number; params: AnalysisParams }[]>`
    update analysis_runs set stage_started_at = now()
    where id = ${runId} and status = 'running'
      and (stage_started_at is null or stage_started_at < now() - make_interval(mins => ${STALE_MINUTES}))
    returning stage, property_id, params
  `;
  if (!claim) return readProgress(sql, runId);
  const withAi = options.withAi ?? true;

  try {
    switch (claim.stage) {
      case "analyze": {
        const property = await loadProperty(sql, Number(claim.property_id));
        const params = { ...defaultParams(property.area_class), ...claim.params };
        const versions = await loadActiveVersions(sql);
        const facts: FactDraft[] = [];
        for (const analyzer of ANALYZERS) facts.push(...(await analyzer.run({ sql, property, params, versions })));
        await insertFacts(sql, runId, facts, 1);
        await nextStage(sql, runId, "rules");
        break;
      }
      case "rules": {
        const property = await loadProperty(sql, Number(claim.property_id));
        const params = { ...defaultParams(property.area_class), ...claim.params };
        const facts = await loadFactDrafts(sql, runId);
        const rules = await sql<Rule[]>`select id, kind, condition, effect, note, enabled, version from rules order by id`;
        const candidates = await sql<CandidateDef[]>`
          select id, label, description, property_types, sort_order, enabled, confidence from target_candidates order by sort_order, id
        `;
        const appeals = await sql<AppealDef[]>`
          select id, label, description, needs_facts, property_types, sort_order, enabled from appeal_items order by sort_order, id
        `;
        const decisions = runRules({ rules, candidates, appeals }, facts, property, params);
        await insertFacts(sql, runId, decisions, facts.length + 1);
        if (withAi) await nextStage(sql, runId, "ai");
        else await sql`update analysis_runs set status = 'succeeded', stage_started_at = null, finished_at = now() where id = ${runId}`;
        break;
      }
      case "ai": {
        if (!process.env.ANTHROPIC_API_KEY) {
          await finishWithoutNarrative(sql, runId, "ANTHROPIC_API_KEY が設定されていません");
          break;
        }
        try {
          const draft = await draftNarrative(sql, runId);
          // 下書きは検証前なので要確認として残す。次の段階で検証して書き換える
          await saveNarrative(sql, runId, { content: draft.content, validation: null, status: "needs_review", attempts: 1, inputTokens: draft.inputTokens, outputTokens: draft.outputTokens, durationMs: draft.durationMs });
          await nextStage(sql, runId, "verify");
        } catch (error) {
          await finishWithoutNarrative(sql, runId, errorMessage(error));
        }
        break;
      }
      case "verify": {
        const [row] = await sql<{ content: unknown; input_tokens: number | null; output_tokens: number | null; duration_ms: number | null }[]>`
          select content, input_tokens, output_tokens, duration_ms from narratives where run_id = ${runId}
        `;
        const draft = NarrativeContentSchema.safeParse(row?.content);
        if (!draft.success) {
          await finishWithoutNarrative(sql, runId, "下書きが見つからないか、形が崩れています");
          break;
        }
        const usage = { inputTokens: row.input_tokens ?? 0, outputTokens: row.output_tokens ?? 0, durationMs: row.duration_ms ?? 0 };
        try {
          const result = await verifyNarrative(sql, runId, draft.data, usage);
          await saveNarrative(sql, runId, {
            content: result.content,
            validation: result.validation,
            status: result.validation.ok ? "ok" : "needs_review",
            attempts: result.attempts,
            inputTokens: result.inputTokens,
            outputTokens: result.outputTokens,
            durationMs: result.durationMs,
          });
          await sql`update analysis_runs set status = 'succeeded', stage_started_at = null, finished_at = now() where id = ${runId}`;
        } catch (error) {
          // 作り直しに失敗しても、下書きは要確認のまま残して実行は終える
          await sql`update analysis_runs set status = 'succeeded', error = ${`AIの文章の検証・作り直し：${errorMessage(error)}`}, stage_started_at = null, finished_at = now() where id = ${runId}`;
        }
        break;
      }
    }
  } catch (error) {
    await sql`update analysis_runs set status = 'failed', error = ${errorMessage(error)}, stage_started_at = null, finished_at = now() where id = ${runId}`;
  }
  return readProgress(sql, runId);
}

/** 最後まで続けて進める（npm run analyze 用）。画面では advanceRun を1段階ずつ呼ぶ */
export async function runAllStages(
  sql: Sql,
  propertyId: number,
  overrides: Partial<AnalysisParams> = {},
  options: { withAi?: boolean; onStage?: (p: RunProgress) => void } = {},
): Promise<RunProgress> {
  let progress = await startRun(sql, propertyId, overrides);
  options.onStage?.(progress);
  while (progress.status === "running") {
    const before = progress.stage;
    progress = await advanceRun(sql, progress.runId, options);
    options.onStage?.(progress);
    // ほかの呼び出しが同じ段階を進めているときは、少し待ってから見直す
    if (progress.status === "running" && progress.stage === before) await new Promise((r) => setTimeout(r, 2000));
  }
  return progress;
}
