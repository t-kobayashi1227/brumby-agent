import { getSql } from "../../../lib/db";
import { loadReport, targetRanking, mediaBreakdown, totalBudgetOptions, findFact } from "../../../lib/report";
import { CENSUS_SOURCE, MLIT_SOURCE } from "../../_lib/data";
import { emptyState } from "../../_lib/ui";
import StrategyClient from "./StrategyClient";
import AnalysisRunner from "./AnalysisRunner";
import EvaluationPanel from "./EvaluationPanel";
import type { EvaluationRow } from "./evaluation";

// 販売戦略レポート（設計書 7章）：最新の分析結果（カード・判断カード・AIの文章）をそのまま見せる
// ?property=<id> で物件を切り替える（プロトタイプにはまだ物件選択の導線がないため、省略時は1）

// 分析の各段階（とくにAIの文章）は数十秒かかる。この画面の Server Actions の上限（秒）。Vercel のプランの上限を超える値は効かない（設計書 D34・12章）
export const maxDuration = 300;

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function StrategyPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const propertyId = Number(sp.property) > 0 ? Number(sp.property) : 1;

  const sql = getSql();
  const report = await loadReport(sql, propertyId);
  if (!report) return <div className={emptyState}>物件 {propertyId} が見つかりません。</div>;

  const hasRun = report.run.id !== 0;
  const narrative = report.narrative;
  const budgetFact = findFact(report.facts, "decision.total_budget");
  const totalManYen = budgetFact?.value ?? null;
  const source = (budgetFact?.basis as { source?: unknown } | null)?.source;
  const budgetSource = source === "input" || source === "rule" ? source : null;
  const budgetOptions = [...new Set([...totalBudgetOptions(report.rules), ...(totalManYen !== null ? [totalManYen] : [])])].sort((a, b) => a - b);

  // 評価（D18）：この実行の文章と、付けられた評価
  const [nar] = hasRun
    ? await sql<{ id: number; validation: { paragraphs?: { ok: boolean }[] } | null }[]>`select id, validation from narratives where run_id = ${report.run.id}`
    : [];
  const evaluations = nar
    ? (
        await sql<{ answer_key: string | null; criterion: string; score: number; memo: string | null; evaluator: string | null; created_at: Date }[]>`
          select answer_key, criterion, score, memo, evaluator, created_at from evaluations where narrative_id = ${nar.id} order by created_at
        `
      ).map((e): EvaluationRow => ({ answerKey: e.answer_key, criterion: e.criterion, score: e.score, memo: e.memo, evaluator: e.evaluator, createdAt: e.created_at.toISOString() }))
    : [];
  const paragraphs = nar?.validation?.paragraphs ?? [];
  const passRate = paragraphs.length ? { ok: paragraphs.filter((p) => p.ok).length, total: paragraphs.length } : null;

  const lastRadius = typeof report.run.params.radius_m === "number" ? report.run.params.radius_m : null;

  return (
    <>
      <AnalysisRunner propertyId={propertyId} lastRadius={hasRun ? lastRadius : null} />
      <StrategyClient
        hasRun={hasRun}
        runCreatedAt={hasRun ? report.run.createdAt.toISOString() : null}
        headline={narrative?.content.headline ?? null}
        sections={narrative?.content.sections ?? []}
        narrativeStatus={narrative?.status ?? null}
        facts={report.facts.map((f) => ({ seq: f.seq, valueText: f.valueText, attribution: f.attribution }))}
        targets={targetRanking(report.facts)}
        media={mediaBreakdown(report.facts).map((m) => ({ id: m.id, amount: m.amount, rules: m.rules }))}
        totalManYen={totalManYen}
        budgetSource={budgetSource}
        budgetOptions={budgetOptions}
        propertyId={propertyId}
        censusSource={CENSUS_SOURCE}
        mlitSource={MLIT_SOURCE}
      />
      {hasRun && <EvaluationPanel narrativeId={nar ? Number(nar.id) : null} runId={report.run.id} passRate={passRate} evaluations={evaluations} />}
    </>
  );
}
