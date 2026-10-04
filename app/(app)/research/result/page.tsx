import { getSql } from "../../../../lib/db";
import { loadReport, findFact, areaStats, nearbyFacilities, loadDealCases } from "../../../../lib/report";
import { CENSUS_SOURCE, MLIT_SOURCE } from "../../../_lib/data";
import { emptyState } from "../../../_lib/ui";
import ResearchResultClient from "./ResearchResultClient";

// AI分析結果（競合診断）。設計書 5.3 の集計の部品①〜⑥のカードを、そのまま見せる
// ?property=<id> で物件を切り替える（省略時は1）

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

const formatDate = (d: Date) => d.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" });

export default async function ResearchResultPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const propertyId = Number(sp.property) > 0 ? Number(sp.property) : 1;

  const sql = getSql();
  const report = await loadReport(sql, propertyId);
  if (!report) return <div className={emptyState}>物件 {propertyId} が見つかりません。</div>;

  const hasRun = report.run.id !== 0;
  const marketFact = findFact(report.facts, "market.price_median");
  const marketBasis = marketFact?.basis as { n?: number; period?: string } | undefined;
  const market = marketFact && marketFact.value !== null
    ? { n: marketBasis?.n ?? 0, medianManYen: marketFact.value, q1ManYen: (marketFact.basis as { q1_man_yen?: number })?.q1_man_yen ?? null, q3ManYen: (marketFact.basis as { q3_man_yen?: number })?.q3_man_yen ?? null, period: marketBasis?.period ?? "", levelLabel: (marketFact.scope as { level_label?: string } | null)?.level_label ?? "" }
    : null;

  const hazardNotes = [
    findFact(report.facts, "hazard.flood")?.valueText,
    findFact(report.facts, "hazard.landslide")?.valueText,
    findFact(report.facts, "hazard.liquefaction")?.valueText,
  ].filter((v): v is string => !!v);

  const dealCases = hasRun ? await loadDealCases(sql, report.facts) : [];

  return (
    <ResearchResultClient
      hasRun={hasRun}
      surveyDate={hasRun ? formatDate(report.run.createdAt) : ""}
      propertyName={report.property.name}
      propertyPriceManYen={report.property.priceManYen}
      competitors={report.competitors}
      areaStats={areaStats(report.facts)}
      market={market}
      dealCases={dealCases}
      nearby={nearbyFacilities(report.facts)}
      zoning={findFact(report.facts, "area.zoning")?.valueText ?? null}
      hazardNotes={hazardNotes}
      censusSource={CENSUS_SOURCE}
      mlitSource={MLIT_SOURCE}
    />
  );
}
