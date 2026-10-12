import Link from "next/link";
import { getSql } from "../../../lib/db";
import { listPropertyCards, loadReport, targetRanking, mediaBreakdown, totalBudgetOptions, findFact, areaStats, nearbyFacilities, nearbyLists, type ReportFact } from "../../../lib/report";
import type { ScoredAppealItem } from "../../../lib/scoring/decisions";
import type { InputValue, PersonaResult, SalabilityResult, CompetitorComparison } from "../../../lib/scoring/types";
import { CENSUS_SOURCE, MLIT_SOURCE } from "../../_lib/data";
import PropertySteps from "../../_components/PropertySteps";
import { card, emptyState } from "../../_lib/ui";
import StrategyClient from "./StrategyClient";
import AnalysisRunner from "./AnalysisRunner";
import PropertyList from "./PropertyList";
import { photoUrl, photoVersions } from "../../../lib/photos";

// 販売戦略レポート（設計書 7章）：最新の分析結果（カード・判断カード・AIの文章）をそのまま見せる
// ?property=<id> がなければ物件の一覧（写真・住所・価格・分析の結果）を出し、選ぶと ?property=<id> で開く。?done=<実行> は分析が終わった直後の印

// 分析の各段階（とくにAIの文章）は数十秒かかる。この画面の Server Actions の上限（秒）。Vercel のプランの上限を超える値は効かない（設計書 D34・12章）
export const maxDuration = 300;

const formatDate = (d: Date) => new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

export default async function StrategyPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const sql = getSql();
  const propertyId = Number(sp.property) > 0 ? Number(sp.property) : null;
  if (propertyId === null) {
    const [cards, photos] = await Promise.all([listPropertyCards(sql), photoVersions(sql)]);
    return <PropertyList properties={cards.map((c) => ({ ...c, lastAnalyzedAt: c.lastAnalyzedAt?.toISOString() ?? null, photoUrl: photoUrl(c.id, photos.get(c.id)) }))} />;
  }
  const backLink = (
    <Link href="/strategy" className="inline-block mb-3 text-xs text-brand underline print:hidden">
      ← 物件の一覧に戻る
    </Link>
  );

  const report = await loadReport(sql, propertyId);
  if (!report) return <>{backLink}<div className={emptyState}>物件 {propertyId} が見つかりません。</div></>;

  const hasRun = report.run.id !== 0;
  const [status] = await sql<{ has_location: boolean; fetched: boolean }[]>`
    select geom is not null as has_location, exists (select 1 from property_fetches f where f.property_id = p.id) as fetched
    from properties p where id = ${propertyId}
  `;
  const justFinished = hasRun && Number(sp.done) === report.run.id;
  const narrative = report.narrative;
  const budgetFact = findFact(report.facts, "decision.total_budget");
  const totalManYen = budgetFact?.value ?? null;
  const source = (budgetFact?.basis as { source?: unknown } | null)?.source;
  const budgetSource = source === "input" || source === "rule" ? source : null;
  const budgetOptions = [...new Set([...totalBudgetOptions(report.facts, report.rules), ...(totalManYen !== null ? [totalManYen] : [])])].sort((a, b) => a - b);
  const budgetBasis = (budgetFact?.basis ?? {}) as { initial_man_yen?: number; additional_man_yen?: number; add_rule?: string; suggestion?: string; multiplier?: number };

  // 採点ルール表（D35）：全ペルソナの点数と理由、採点に使った値、売れやすさ
  const scoresBasis = (findFact(report.facts, "decision.persona_scores")?.basis ?? null) as
    | { personas?: PersonaResult[]; inputs?: Record<string, InputValue>; competitors?: { hasCompetitors: boolean; items: CompetitorComparison[] } }
    | null;
  const salability = (findFact(report.facts, "decision.salability")?.basis ?? null) as SalabilityResult | null;
  const scoring = scoresBasis?.personas
    ? {
        personas: scoresBasis.personas,
        inputs: scoresBasis.inputs ?? {},
        comparison: scoresBasis.competitors ?? { hasCompetitors: false, items: [] },
        salability,
        budget: {
          initialManYen: budgetBasis.initial_man_yen ?? null,
          additionalManYen: budgetBasis.additional_man_yen ?? null,
          addRule: budgetBasis.add_rule ?? null,
          suggestion: budgetBasis.suggestion ?? null,
          multiplier: budgetBasis.multiplier ?? null,
        },
      }
    : null;

  // 訴求（ルール表で選ばれたもの）と、その根拠にした事実カード
  const appealsFact = findFact(report.facts, "decision.appeals");
  const appealItems = ((appealsFact?.basis ?? {}) as { items?: ScoredAppealItem[] }).items ?? [];
  const appeals = appealItems
    .filter((a) => a.selected)
    .map((a) => ({
      id: a.id,
      label: a.label,
      description: a.description,
      judgement: a.judgement ?? null,
      evidence: (a.needsFacts ?? [])
        .map((k) => findFact(report.facts, k))
        .filter((f): f is ReportFact => f !== undefined)
        .map((f) => ({ seq: f.seq, text: f.valueText })),
    }));
  // 訴求の判定（強く訴求・訴求・弱み）を全項目分（採点ルール表の実行だけ）
  const appealJudgements = appealItems.filter((a) => a.judgement !== undefined).map((a) => ({ id: a.id, label: a.label, judgement: a.judgement, description: a.description, score: a.score }));
  const media = mediaBreakdown(report.facts);
  const { property } = report;

  const lastRadius = typeof report.run.params.radius_m === "number" ? report.run.params.radius_m : null;

  const runnerOnTop = !hasRun;
  const runner = <AnalysisRunner propertyId={propertyId} />;

  return (
    <>
      {backLink}
      <PropertySteps
        current="analysis"
        propertyId={propertyId}
        done={{ register: true, location: status?.has_location, surroundings: status?.fetched, analysis: hasRun }}
      />
      {hasRun && (
        // 表示している結果がどの実行か。分析が終わった直後（?done=）は、そのことも出し続ける
        <div className={`${card} px-5 py-3 mb-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs print:hidden ${justFinished ? "border-[#bfe5c6] bg-[#e9f8ec]" : ""}`}>
          <div className={justFinished ? "font-bold text-[#157347]" : "text-body"}>
            {justFinished ? "分析が終わりました。" : ""}表示中：実行 {report.run.id}（{formatDate(report.run.createdAt)}）の結果
            {lastRadius !== null && `・人口構成の半径 ${lastRadius.toLocaleString("ja-JP")}m`}
          </div>
          {report.run.error && <div className="text-[#b91c1c]">注意：{report.run.error.slice(0, 120)}</div>}
          <div className="ml-auto flex gap-3">
            <Link href={`/strategy/compare?property=${propertyId}&b=${report.run.id}`} className="text-brand underline">前回の結果と比べる</Link>
            <Link href={`/properties/${propertyId}`} className="text-brand underline">物件の情報・位置を直す</Link>
          </div>
        </div>
      )}
      {runnerOnTop && runner}
      {/* 実行ごとに作り直す。分析が終わって同じ画面のまま結果に切り替わったとき、予算・媒体の状態が分析前のまま残らないように */}
      <StrategyClient
        key={report.run.id}
        hasRun={hasRun}
        runCreatedAt={hasRun ? report.run.createdAt.toISOString() : null}
        property={{
          name: property.name,
          address: property.address,
          photoUrl: photoUrl(propertyId, (await photoVersions(sql, [propertyId])).get(propertyId)),
          priceManYen: property.priceManYen,
          layout: property.layout,
          landSqm: property.landSqm,
          buildingSqm: property.buildingSqm,
          parking: property.parking,
          access: property.access,
        }}
        headline={narrative?.content?.headline ?? null}
        sections={narrative?.content?.sections ?? []}
        narrativeStatus={narrative?.status ?? null}
        facts={report.facts.map((f) => ({ seq: f.seq, valueText: f.valueText, attribution: f.attribution }))}
        targets={targetRanking(report.facts)}
        appeals={appeals}
        areaStats={areaStats(report.facts)}
        nearby={nearbyFacilities(report.facts)}
        nearbyLists={nearbyLists(report.facts)}
        media={media.map((m) => ({ id: m.id, label: m.label, role: m.role, amount: m.amount, initialManYen: m.initialManYen, rules: m.rules }))}
        scoring={scoring}
        appealJudgements={appealJudgements}
        mediaEvaluation={media.filter((m) => m.evaluation).map((m) => ({ id: m.id, label: m.label, formatExample: m.role, amount: m.amount, initialManYen: m.initialManYen, ...m.evaluation! }))}
        totalManYen={totalManYen}
        budgetSource={budgetSource}
        budgetOptions={budgetOptions}
        propertyId={propertyId}
        censusSource={CENSUS_SOURCE}
        mlitSource={MLIT_SOURCE}
      />
      {!runnerOnTop && <div className="mt-6">{runner}</div>}
    </>
  );
}
