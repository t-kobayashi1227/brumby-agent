import type { Sql } from "./db";
import { MEDIA } from "./rules/catalog";
import type { Rule, TargetRankItem } from "./rules/engine";
import type { NarrativeContent } from "./ai/schema";
import type { FactStatus } from "./types";

// 画面（/strategy・/research/result）に、本物のデータを渡すための読み込み（設計書 7章）
// 最新の「成功した分析」1件分を、画面がそのまま使える形にまとめる

export interface ReportFact {
  seq: number;
  key: string;
  kind: "fact" | "decision";
  value: number | null;
  valueText: string | null;
  unit: string | null;
  comparison: number | null;
  status: FactStatus;
  scope: Record<string, unknown> | null;
  basis: Record<string, unknown> | null;
  attribution: string | null;
}

export interface ReportProperty {
  id: number;
  name: string;
  propertyType: string;
  priceManYen: number | null;
  address: string;
  layout: string | null;
  landSqm: number | null;
  buildingSqm: number | null;
  parking: number | null;
  access: string | null;
  features: string | null;
}

export interface ReportCompetitor {
  position: number;
  priceManYen: number | null;
  location: string | null;
  landSqm: number | null;
  buildingSqm: number | null;
  layout: string | null;
  walkMin: number | null;
  parking: number | null;
  features: string | null;
}

export interface ReportNarrative {
  model: string;
  status: "ok" | "needs_review" | "failed";
  attempts: number;
  content: NarrativeContent;
  createdAt: Date;
}

export interface ReportRun {
  id: number;
  createdAt: Date;
  params: Record<string, unknown>;
}

export interface ReportData {
  property: ReportProperty;
  run: ReportRun;
  facts: ReportFact[];
  narrative: ReportNarrative | null;
  rules: Rule[];
  competitors: ReportCompetitor[];
}

export type { TargetRankItem };

/** decision.media.* の1媒体分（画面用にまとめた形） */
export interface MediaItem {
  id: string;
  label: string;
  role: string;
  amount: number;
  share: number;
  fixedManYen: number | null;
  minManYen: number | null;
  rules: { id: string; version: number; note: string }[];
}

/** 媒体の色（寄せ：プロトタイプのドーナツ図と同じ配色） */
export const MEDIA_COLOR: Record<string, string> = { sns: "#3b6fd6", posting: "#f2a93b", flyer: "#9b7bd1", lp: "#4caf7d" };

export interface PropertySummary {
  id: number;
  name: string;
  priceManYen: number | null;
  lastAnalyzedAt: Date | null;
  insufficientCount: number;
}

/** /dashboard用：物件の一覧と、最後に分析した日時・データ不足のカード数（設計書7章） */
export async function listProperties(sql: Sql): Promise<PropertySummary[]> {
  const rows = await sql<{ id: number; name: string; price_man_yen: number | null; last_analyzed_at: Date | null; insufficient_count: number | null }[]>`
    select p.id, p.name, p.price_man_yen,
      (select max(r.created_at) from analysis_runs r where r.property_id = p.id and r.status = 'succeeded') as last_analyzed_at,
      (select count(*) from facts f
       join analysis_runs r on r.id = f.run_id
       where r.property_id = p.id and r.status = 'succeeded'
         and r.id = (select max(r2.id) from analysis_runs r2 where r2.property_id = p.id and r2.status = 'succeeded')
         and f.status in ('insufficient', 'not_available')) as insufficient_count
    from properties p
    order by p.id
  `;
  return rows.map((r) => ({ id: Number(r.id), name: r.name, priceManYen: r.price_man_yen, lastAnalyzedAt: r.last_analyzed_at, insufficientCount: Number(r.insufficient_count ?? 0) }));
}

export async function loadReport(sql: Sql, propertyId: number): Promise<ReportData | null> {
  const [property] = await sql<
    { id: number; name: string; property_type: string; price_man_yen: number | null; address: string; layout: string | null; land_sqm: string | null; building_sqm: string | null; parking: number | null; access: string | null; features: string | null }[]
  >`select id, name, property_type, price_man_yen, address, layout, land_sqm, building_sqm, parking, access, features from properties where id = ${propertyId}`;
  if (!property) return null;

  const [run] = await sql<{ id: number; created_at: Date; params: Record<string, unknown> }[]>`
    select id, created_at, params from analysis_runs where property_id = ${propertyId} and status = 'succeeded' order by id desc limit 1
  `;
  if (!run) {
    return {
      property: toReportProperty(property),
      run: { id: 0, createdAt: new Date(0), params: {} },
      facts: [],
      narrative: null,
      rules: [],
      competitors: await loadCompetitors(sql, propertyId),
    };
  }

  const [facts, narrativeRows, rules, competitors] = await Promise.all([
    sql<
      { seq: number; key: string; kind: "fact" | "decision"; value: number | null; value_text: string | null; unit: string | null; comparison: number | null; status: FactStatus; scope: Record<string, unknown> | null; basis: Record<string, unknown> | null; attribution: string | null }[]
    >`select seq, key, kind, value, value_text, unit, comparison, status, scope, basis, attribution from facts where run_id = ${run.id} order by seq`,
    sql<{ model: string; status: "ok" | "needs_review" | "failed"; attempts: number; content: NarrativeContent; created_at: Date }[]>`
      select model, status, attempts, content, created_at from narratives where run_id = ${run.id}
    `,
    sql<Rule[]>`select id, kind, condition, effect, note, enabled, version from rules order by id`,
    loadCompetitors(sql, propertyId),
  ]);

  const narrative = narrativeRows[0]
    ? { model: narrativeRows[0].model, status: narrativeRows[0].status, attempts: narrativeRows[0].attempts, content: narrativeRows[0].content, createdAt: narrativeRows[0].created_at }
    : null;

  return {
    property: toReportProperty(property),
    run: { id: Number(run.id), createdAt: run.created_at, params: run.params },
    facts: facts.map((f) => ({
      seq: f.seq,
      key: f.key,
      kind: f.kind,
      value: f.value === null ? null : Number(f.value),
      valueText: f.value_text,
      unit: f.unit,
      comparison: f.comparison === null ? null : Number(f.comparison),
      status: f.status,
      scope: f.scope,
      basis: f.basis,
      attribution: f.attribution,
    })),
    narrative,
    rules,
    competitors,
  };
}

async function loadCompetitors(sql: Sql, propertyId: number): Promise<ReportCompetitor[]> {
  const rows = await sql<
    { position: number; price_man_yen: number | null; location: string | null; land_sqm: string | null; building_sqm: string | null; layout: string | null; walk_min: number | null; parking: number | null; features: string | null }[]
  >`select position, price_man_yen, location, land_sqm, building_sqm, layout, walk_min, parking, features from competitors where property_id = ${propertyId} order by position`;
  return rows.map((c) => ({
    position: c.position,
    priceManYen: c.price_man_yen,
    location: c.location,
    landSqm: c.land_sqm === null ? null : Number(c.land_sqm),
    buildingSqm: c.building_sqm === null ? null : Number(c.building_sqm),
    layout: c.layout,
    walkMin: c.walk_min,
    parking: c.parking,
    features: c.features,
  }));
}

function toReportProperty(row: { id: number; name: string; property_type: string; price_man_yen: number | null; address: string; layout: string | null; land_sqm: string | null; building_sqm: string | null; parking: number | null; access: string | null; features: string | null }): ReportProperty {
  return {
    id: Number(row.id),
    name: row.name,
    propertyType: row.property_type,
    priceManYen: row.price_man_yen,
    address: row.address,
    layout: row.layout,
    landSqm: row.land_sqm === null ? null : Number(row.land_sqm),
    buildingSqm: row.building_sqm === null ? null : Number(row.building_sqm),
    parking: row.parking,
    access: row.access,
    features: row.features,
  };
}

export function findFact(facts: ReportFact[], key: string): ReportFact | undefined {
  return facts.find((f) => f.key === key);
}

export interface NearbyFacility { label: string; name: string; walkMin: number; distanceM: number }

/** 最寄りの施設（距離の近い順）。F-04・F-05・F-08・F-10（周辺施設の部品）から作る */
export function nearbyFacilities(facts: ReportFact[]): NearbyFacility[] {
  const specs: { key: string; label: string }[] = [
    { key: "facility.nursery_nearest", label: "保育園・幼稚園等" },
    { key: "facility.elementary_nearest", label: "小学校" },
    { key: "facility.junior_high_nearest", label: "中学校" },
    { key: "facility.station_nearest", label: "駅" },
  ];
  const items = specs
    .map((s) => {
      const f = findFact(facts, s.key);
      if (!f || f.status !== "ok" || f.value === null) return null;
      const basis = f.basis as { name?: string; walk_min?: number } | null;
      return { label: s.label, name: basis?.name ?? s.label, walkMin: basis?.walk_min ?? Math.ceil((f.value * 1.3) / 80), distanceM: f.value };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
  return items.sort((a, b) => a.distanceM - b.distanceM);
}

export interface AreaStat { label: string; value: string; sub: string }

/** エリアの基本データ（人口構成。設計書5.3の①） */
export function areaStats(facts: ReportFact[]): AreaStat[] {
  const pop = findFact(facts, "target.population");
  const age = findFact(facts, "target.age_30_49_ratio");
  const rented = findFact(facts, "target.private_rented_ratio");
  const households = (pop?.basis as { households?: number } | null)?.households ?? null;

  const stats: AreaStat[] = [];
  if (pop?.value !== null && pop?.value !== undefined) stats.push({ label: "人口", value: `${pop.value.toLocaleString("ja-JP")}人`, sub: "" });
  if (households !== null) stats.push({ label: "世帯数", value: `${households.toLocaleString("ja-JP")}世帯`, sub: "" });
  if (age?.value !== null && age?.value !== undefined) {
    stats.push({ label: "30〜49歳の割合", value: `${(age.value * 100).toFixed(1)}%`, sub: age.comparison !== null && age.comparison !== undefined ? `市平均${(age.comparison * 100).toFixed(1)}%` : "" });
  }
  if (rented?.value !== null && rented?.value !== undefined) {
    const owned = 1 - rented.value;
    const ownedCmp = rented.comparison !== null && rented.comparison !== undefined ? 1 - rented.comparison : null;
    stats.push({ label: "持家率（推定）", value: `${(owned * 100).toFixed(1)}%`, sub: ownedCmp !== null ? `市平均${(ownedCmp * 100).toFixed(1)}%` : "" });
  }
  return stats;
}

/** decision.target_rank の basis.ranking を取り出す */
export function targetRanking(facts: ReportFact[]): TargetRankItem[] {
  const f = findFact(facts, "decision.target_rank");
  const ranking = f?.basis?.ranking;
  if (!Array.isArray(ranking)) return [];
  // 2026-10-06より前の分析には max・confidence・available がない
  return (ranking as Partial<TargetRankItem>[]).map((t) => ({
    rank: t.rank ?? 0,
    id: t.id ?? "",
    label: t.label ?? "",
    description: t.description ?? "",
    score: t.score ?? 0,
    max: t.max ?? 0,
    rules: t.rules ?? [],
    confidence: t.confidence ?? "normal",
    available: t.available ?? true,
  }));
}

/** decision.media.* を画面用にまとめる */
export function mediaBreakdown(facts: ReportFact[]): MediaItem[] {
  return MEDIA.map((m) => {
    const f = findFact(facts, `decision.media.${m.id}`);
    const basis = f?.basis as { share?: number; fixed_man_yen?: number | null; min_man_yen?: number | null; rules?: MediaItem["rules"] } | undefined;
    return {
      id: m.id,
      label: m.label,
      role: m.role,
      amount: f?.value ?? 0,
      share: basis?.share ?? 0,
      fixedManYen: basis?.fixed_man_yen ?? null,
      minManYen: basis?.min_man_yen ?? null,
      rules: basis?.rules ?? [],
    };
  });
}

/** 総予算のルール（kind=total_budget）がとり得る額。シミュレーションの選択肢に使う */
export function totalBudgetOptions(rules: Rule[]): number[] {
  const amounts = rules.filter((r) => r.enabled && r.kind === "total_budget").map((r) => (r.effect as { total_man_yen: number }).total_man_yen);
  return [...new Set(amounts)].sort((a, b) => a - b);
}

export interface DealCase {
  district: string;
  year: number;
  quarter: number;
  priceManYen: number;
  landSqm: number | null;
  buildingSqm: number | null;
}

/** 取引価格の個別事例（market.price_median と同じ地区・期間・種類の範囲から、個別の行を見せる） */
export async function loadDealCases(sql: Sql, facts: ReportFact[], limit = 12): Promise<DealCase[]> {
  const f = findFact(facts, "market.price_median");
  const basis = f?.basis as { districts?: string[]; from_quarter?: number; to_quarter?: number; trade_type?: string } | undefined;
  if (!basis?.districts?.length || basis.from_quarter === undefined || basis.to_quarter === undefined) return [];

  const rows = await sql<{ district_name: string; year: number; quarter: number; trade_price: string; area_sqm: string | null; total_floor_area_sqm: string | null }[]>`
    select t.district_name, t.year, t.quarter, t.trade_price, t.area_sqm, t.total_floor_area_sqm
    from transactions t
    where t.district_name = any(${basis.districts})
      and t.type = ${basis.trade_type ?? ""}
      and t.trade_price is not null
      and (t.year * 4 + t.quarter - 1) between ${basis.from_quarter} and ${basis.to_quarter}
      and coalesce(t.raw->>'Remarks', '') !~ '調停・競売等|関係者間取引|瑕疵有りの可能性'
      and t.dataset_version_id in (select id from dataset_versions where status = 'active')
    order by t.year desc, t.quarter desc, t.id desc
    limit ${limit}
  `;
  return rows.map((r) => ({
    district: r.district_name,
    year: r.year,
    quarter: r.quarter,
    priceManYen: Math.round(Number(r.trade_price) / 10000),
    landSqm: r.area_sqm === null ? null : Number(r.area_sqm),
    buildingSqm: r.total_floor_area_sqm === null ? null : Number(r.total_floor_area_sqm),
  }));
}
