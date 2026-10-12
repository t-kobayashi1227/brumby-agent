import type { Sql } from "./db";
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
  datasetVersionIds: number[];
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
  /** どこで・いつ確かめたか（D30） */
  sourceType: "portal" | "seen" | "other" | null;
  sourceSite: string | null;
  confirmedOn: string | null;
}

export interface ReportNarrative {
  model: string;
  status: "ok" | "needs_review" | "failed";
  attempts: number;
  content: NarrativeContent;
  createdAt: Date;
  promptVersion: string;
  /** 段落ごとの検証の結果（lib/ai/validate.ts）。要確認の段落に印を付けるため */
  validation: { ok: boolean; paragraphs: { sectionKey: string; paragraphKey: string; ok: boolean }[] } | null;
}

export interface ReportRun {
  id: number;
  createdAt: Date;
  params: Record<string, unknown>;
  /** 成功したが注意がある場合（AIの文章を作れなかった など） */
  error: string | null;
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
  /** 最初に使う額（採点ルール表の実行だけ） */
  initialManYen: number | null;
  /** 媒体の評価（採点ルール表の実行だけ）：届きやすさ・順位・配分に使ったか・届きやすさの根拠・反響係数 */
  evaluation: {
    reach: number;
    rank: number;
    selected: boolean;
    basis: { kind: "usage"; statName: string; targetUsage: number; allAges: number } | { kind: "flat"; flatReach: number } | null;
    coefficient: number;
    targetLabel: string | null;
  } | null;
  fixedManYen: number | null;
  minManYen: number | null;
  rules: { id: string; version: number; note: string }[];
}

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

/** ?property がないときに開く物件：最後に分析した物件。分析した物件がなければ最初の物件（物件がなければ 0） */
export function defaultPropertyId(properties: PropertySummary[]): number {
  const latest = properties.reduce<PropertySummary | null>(
    (m, p) => (p.lastAnalyzedAt !== null && (m?.lastAnalyzedAt == null || p.lastAnalyzedAt > m.lastAnalyzedAt) ? p : m),
    null,
  );
  return latest?.id ?? properties[0]?.id ?? 0;
}

/** /strategy の物件の一覧の1件：物件の情報と、最新の成功した分析の要点 */
export interface PropertyCard {
  id: number;
  name: string;
  propertyType: string;
  priceManYen: number | null;
  address: string;
  layout: string | null;
  landSqm: number | null;
  buildingSqm: number | null;
  hasLocation: boolean;
  lastAnalyzedAt: Date | null;
  insufficientCount: number;
  /** 第1ターゲット（採点ルール表の実行は総合点、古い実行はルールの点/満点） */
  topTarget: { label: string; score: number; max: number | null; targetImage: string | null } | null;
  salability: string | null;
  totalBudgetManYen: number | null;
}

/** /strategy の物件の一覧（登録順）。分析していない物件も出す */
export async function listPropertyCards(sql: Sql): Promise<PropertyCard[]> {
  const rows = await sql<
    { id: number; name: string; property_type: string; price_man_yen: number | null; address: string; layout: string | null; land_sqm: string | null; building_sqm: string | null; has_location: boolean; created_at: Date | null; insufficient: number | null; top: { label?: string; score?: number; max?: number; targetImage?: string | null } | null; salability: string | null; budget: string | null }[]
  >`
    with latest as (
      select distinct on (property_id) id, property_id, created_at from analysis_runs where status = 'succeeded' order by property_id, id desc
    )
    select p.id, p.name, p.property_type, p.price_man_yen, p.address, p.layout, p.land_sqm, p.building_sqm, p.geom is not null as has_location, l.created_at,
      (select count(*)::int from facts f where f.run_id = l.id and f.status in ('insufficient', 'not_available')) as insufficient,
      (select f.basis->'ranking'->0 from facts f where f.run_id = l.id and f.key = 'decision.target_rank') as top,
      (select f.basis->>'class' from facts f where f.run_id = l.id and f.key = 'decision.salability') as salability,
      (select f.value from facts f where f.run_id = l.id and f.key = 'decision.total_budget') as budget
    from properties p left join latest l on l.property_id = p.id
    order by p.id
  `;
  const num = (v: string | null) => (v === null ? null : Number(v));
  return rows.map((r) => ({
    id: Number(r.id),
    name: r.name,
    propertyType: r.property_type,
    priceManYen: r.price_man_yen,
    address: r.address,
    layout: r.layout,
    landSqm: num(r.land_sqm),
    buildingSqm: num(r.building_sqm),
    hasLocation: r.has_location,
    lastAnalyzedAt: r.created_at,
    insufficientCount: Number(r.insufficient ?? 0),
    topTarget: r.top?.label ? { label: r.top.label, score: Number(r.top.score ?? 0), max: r.top.max ?? null, targetImage: r.top.targetImage ?? null } : null,
    salability: r.salability,
    totalBudgetManYen: num(r.budget),
  }));
}

/** 物件の最新の成功した分析を読む。runId を渡すと、その実行を読む（印刷・比較用。物件の実行でなければ null） */
export async function loadReport(sql: Sql, propertyId: number, runId?: number): Promise<ReportData | null> {
  const [property] = await sql<
    { id: number; name: string; property_type: string; price_man_yen: number | null; address: string; layout: string | null; land_sqm: string | null; building_sqm: string | null; parking: number | null; access: string | null; features: string | null }[]
  >`select id, name, property_type, price_man_yen, address, layout, land_sqm, building_sqm, parking, access, features from properties where id = ${propertyId}`;
  if (!property) return null;

  const [run] = await sql<{ id: number; created_at: Date; params: Record<string, unknown>; error: string | null }[]>`
    select id, created_at, params, error from analysis_runs
    where property_id = ${propertyId} and status = 'succeeded' ${runId ? sql`and id = ${runId}` : sql``}
    order by id desc limit 1
  `;
  if (!run && runId) return null;
  if (!run) {
    return {
      property: toReportProperty(property),
      run: { id: 0, createdAt: new Date(0), params: {}, error: null },
      facts: [],
      narrative: null,
      rules: [],
      competitors: await loadCompetitors(sql, propertyId),
    };
  }

  const [facts, narrativeRows, rules, competitors] = await Promise.all([
    sql<
      { seq: number; key: string; kind: "fact" | "decision"; value: number | null; value_text: string | null; unit: string | null; comparison: number | null; status: FactStatus; scope: Record<string, unknown> | null; basis: Record<string, unknown> | null; attribution: string | null; dataset_version_ids: string[] }[]
    >`select seq, key, kind, value, value_text, unit, comparison, status, scope, basis, attribution, dataset_version_ids from facts where run_id = ${run.id} order by seq`,
    sql<{ model: string; status: "ok" | "needs_review" | "failed"; attempts: number; content: NarrativeContent; created_at: Date; prompt_version: string; validation: ReportNarrative["validation"] }[]>`
      select model, status, attempts, content, created_at, prompt_version, validation from narratives where run_id = ${run.id}
    `,
    sql<Rule[]>`select id, kind, condition, effect, note, enabled, version from rules order by id`,
    loadCompetitors(sql, propertyId),
  ]);

  const narrative = narrativeRows[0]
    ? {
        model: narrativeRows[0].model,
        status: narrativeRows[0].status,
        attempts: narrativeRows[0].attempts,
        content: narrativeRows[0].content,
        createdAt: narrativeRows[0].created_at,
        promptVersion: narrativeRows[0].prompt_version,
        validation: narrativeRows[0].validation,
      }
    : null;

  return {
    property: toReportProperty(property),
    run: { id: Number(run.id), createdAt: run.created_at, params: run.params, error: run.error },
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
      datasetVersionIds: f.dataset_version_ids.map(Number),
    })),
    narrative,
    rules,
    competitors,
  };
}

async function loadCompetitors(sql: Sql, propertyId: number): Promise<ReportCompetitor[]> {
  const rows = await sql<
    { position: number; price_man_yen: number | null; location: string | null; land_sqm: string | null; building_sqm: string | null; layout: string | null; walk_min: number | null; parking: number | null; features: string | null; source_type: ReportCompetitor["sourceType"]; source_site: string | null; confirmed_on: Date | null }[]
  >`select position, price_man_yen, location, land_sqm, building_sqm, layout, walk_min, parking, features, source_type, source_site, confirmed_on from competitors where property_id = ${propertyId} order by position`;
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
    sourceType: c.source_type,
    sourceSite: c.source_site,
    confirmedOn: c.confirmed_on ? new Date(c.confirmed_on).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" }) : null,
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
    { key: "facility.supermarket_nearest", label: "スーパー" },
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

export interface NearbyListItem { name: string; kind: string | null; straightM: number; walkMin: number }

export interface NearbyLists {
  /** 近い順に3校まで */
  elementary: NearbyListItem[];
  juniorHigh: NearbyListItem[];
  /** 半径 nurseryRadiusM の中の保育園・幼稚園等（近い順） */
  nurseries: NearbyListItem[];
  nurseryRadiusM: number | null;
  supermarkets: NearbyListItem[];
  supermarketRadiusM: number | null;
}

/**
 * 周辺の学校・保育園の一覧（名前・種類・距離）。2026-10-12 以降の分析だけにある
 * 学校は最寄りのカードの basis.nearby、保育園は 800m の数のカードの basis.facilities から作る
 */
export function nearbyLists(facts: ReportFact[]): NearbyLists {
  type Raw = { name: string; kind: string | null; straight_m: number; walk_min: number };
  const list = (key: string, field: "nearby" | "facilities") => {
    const f = findFact(facts, key);
    const raw = (f?.status === "ok" ? (f.basis as Record<string, unknown> | null)?.[field] : null) as Raw[] | null | undefined;
    return (raw ?? []).map((r) => ({ name: r.name, kind: r.kind, straightM: r.straight_m, walkMin: r.walk_min }));
  };
  const nursery = findFact(facts, "facility.nursery_count_800m");
  const supermarket = findFact(facts, "facility.supermarket_nearest");
  return {
    elementary: list("facility.elementary_nearest", "nearby"),
    juniorHigh: list("facility.junior_high_nearest", "nearby"),
    nurseries: list("facility.nursery_count_800m", "facilities"),
    nurseryRadiusM: (nursery?.scope as { meters?: number } | null)?.meters ?? null,
    supermarkets: list("facility.supermarket_nearest", "nearby"),
    supermarketRadiusM: supermarket?.status === "ok" || supermarket?.status === "insufficient"
      ? (supermarket.scope as { search_radius_m?: number } | null)?.search_radius_m ?? null
      : null,
  };
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

/**
 * decision.media.* を画面用にまとめる。媒体は実行ごとに判断カードにあるものを使う
 * （採点ルール表の媒体は /rules で増減できる。2026-10-12より前の実行は sns・posting などの4媒体）
 */
export function mediaBreakdown(facts: ReportFact[]): MediaItem[] {
  return facts
    .filter((f) => f.key.startsWith("decision.media."))
    .map((f) => {
      const basis = (f.basis ?? {}) as {
        media?: string; role?: string; share?: number; fixed_man_yen?: number | null; min_man_yen?: number | null; initial_man_yen?: number; rules?: MediaItem["rules"];
        reach?: number; rank?: number; selected?: boolean; reach_basis?: NonNullable<MediaItem["evaluation"]>["basis"]; coefficient?: number; target_label?: string | null;
      };
      return {
        id: f.key.slice("decision.media.".length),
        label: basis.media ?? f.key,
        role: basis.role ?? "",
        amount: f.value ?? 0,
        share: basis.share ?? 0,
        initialManYen: basis.initial_man_yen ?? null,
        evaluation:
          basis.reach !== undefined
            ? { reach: basis.reach, rank: basis.rank ?? 0, selected: basis.selected ?? (f.value ?? 0) > 0, basis: basis.reach_basis ?? null, coefficient: basis.coefficient ?? 1, targetLabel: basis.target_label ?? null }
            : null,
        fixedManYen: basis.fixed_man_yen ?? null,
        minManYen: basis.min_man_yen ?? null,
        rules: basis.rules ?? [],
      };
    });
}

/** 予算のシミュレーションの選択肢。採点ルール表の実行は判断カードの options、古い実行は総予算のルールの額 */
export function totalBudgetOptions(facts: ReportFact[], rules: Rule[]): number[] {
  const options = (findFact(facts, "decision.total_budget")?.basis as { options?: number[] } | null)?.options;
  if (Array.isArray(options)) return [...new Set(options)].sort((a, b) => a - b);
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

export interface DataSource {
  versionId: number;
  attribution: string;
  fetchedAt: Date;
  publishedAt: Date | null;
  period: string | null;
}

/** カードが使った公開データの版（出典と取得日。設計書 D12・D27） */
export async function loadDataSources(sql: Sql, facts: ReportFact[]): Promise<DataSource[]> {
  const ids = [...new Set(facts.flatMap((f) => f.datasetVersionIds))];
  if (ids.length === 0) return [];
  const rows = await sql<{ id: number; attribution: string; fetched_at: Date; source_published_at: Date | null; period: string | null }[]>`
    select id, attribution, fetched_at, source_published_at, period from dataset_versions where id = any(${ids}) order by attribution, id
  `;
  return rows.map((r) => ({ versionId: Number(r.id), attribution: r.attribution, fetchedAt: r.fetched_at, publishedAt: r.source_published_at, period: r.period }));
}

