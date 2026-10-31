import Link from "next/link";
import { notFound } from "next/navigation";
import type { StrategyResult } from "../../../../lib/agents/run";
import { getSql, inOrder } from "../../../../lib/db";
import type { DatasetInfo } from "../../../../lib/facts/build";
import { formatNumber } from "../../../../lib/facts/format";
import type { FactSheet } from "../../../../lib/facts/types";
import { parsePropertyId } from "../../../../lib/property";
import { sourceList, usedFactIds } from "../../../../lib/report";
import { card, emptyState } from "../../../_lib/ui";
import Report from "./Report";
import StrategyRunner, { type RunStatus } from "./StrategyRunner";

// ⑤販売戦略レポート（docs/設計まとめ.md「⑤画面の表示」）。[id] は物件の番号
// 上に物件の見出しと「戦略を作る」、その下に最新の完了した戦略を3つのタブで出す。根拠は、その戦略に使った事実シートから引く

export const dynamic = "force-dynamic";

interface PropertyRow {
  code: string;
  property_class: string;
  price_man_yen: number;
  address: string;
  layout: string;
  building_sqm: string;
  land_sqm: string;
  parking: number;
  building_age: number;
  has_location: boolean;
}

export default async function StrategyDetailPage({ params }: PageProps<"/strategy/[id]">) {
  const { id } = await params;
  const propertyId = parsePropertyId(id);
  if (propertyId === null) notFound();

  const sql = getSql();
  const [p] = await sql<PropertyRow[]>`
    select code, property_class, price_man_yen, address, layout, building_sqm, land_sqm, parking, building_age, geog is not null as has_location
    from properties where id = ${propertyId}
  `;
  if (!p) return <div className={emptyState}>物件 {propertyId} が見つかりません。</div>;

  const transports = await sql<{ mode: string; line: string | null; stop_name: string; walk_min: number }[]>`
    select mode, line, stop_name, walk_min from property_transports where property_id = ${propertyId} order by position
  `;
  const [latestRun] = await sql<{ id: string; status: RunStatus["status"]; stage: string | null; error: string | null; cost_usd: string; started_at: Date | null }[]>`
    select id, status, stage, error, cost_usd, started_at from strategy_runs where property_id = ${propertyId} order by created_at desc limit 1
  `;
  const [done] = await sql<{ result: StrategyResult; finished_at: Date; content: FactSheet; cost_usd: string }[]>`
    select r.result, r.finished_at, r.cost_usd, f.content
    from strategy_runs r join fact_sheets f on f.id = r.fact_sheet_id
    where r.property_id = ${propertyId} and r.status = 'succeeded' and r.form = '3回'
    order by r.finished_at desc limit 1
  `;

  let report: React.ReactNode = <div className={emptyState}>まだ販売戦略がありません。上の「戦略を作る」を押してください。</div>;
  if (done) {
    const [datasets, media] = await inOrder(
      () => sql<(DatasetInfo & { attribution: string | null })[]>`select id, name, provider, as_of, row_count, attribution from datasets`,
      () => sql<{ id: string; name: string }[]>`select id, name from media`,
    );
    const facts = done.content.事実;
    const { rows, credits } = sourceList(facts, usedFactIds(done.result.戦略, done.result.媒体), [...datasets]);
    report = (
      <>
        <div className="text-[11px] text-muted mb-2">
          作成日時 {done.finished_at.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}・事実シート {done.content.作成日時} 時点
        </div>
        <Report result={done.result} facts={facts} sources={rows} credits={credits} mediaNames={Object.fromEntries(media.map((m) => [m.id, m.name]))} />
      </>
    );
  }

  const initial: RunStatus | null = latestRun
    ? {
        id: Number(latestRun.id),
        status: latestRun.status,
        stage: latestRun.stage,
        error: latestRun.error,
        costUsd: Number(latestRun.cost_usd),
        startedAt: latestRun.started_at?.toISOString() ?? null,
      }
    : null;
  const access = transports.map((t) => `${t.line ? `${t.line} ` : ""}${t.mode === "バス" ? `「${t.stop_name}」停` : t.stop_name} 徒歩${t.walk_min}分`).join("／");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <Link href="/properties" className="text-xs text-brand underline">
          ← 物件一覧に戻る
        </Link>
        <div className="mr-auto" />
        <Link href={`/properties/${propertyId}`} className="text-xs text-brand underline">
          物件情報を直す
        </Link>
        <Link href={`/properties/${propertyId}/facts`} className="text-xs text-brand underline">
          事実シートを見る
        </Link>
      </div>

      <div className={`${card} p-5`}>
        <div className="text-[11px] text-muted">物件ID {p.code}・{p.property_class}</div>
        <div className="text-[18px] font-bold text-ink mt-0.5">{p.address}</div>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-[13px] text-body">
          <span>
            価格 <b className="text-ink text-[15px]">{formatNumber(p.price_man_yen)}万円</b>
          </span>
          <span>間取り {p.layout}</span>
          <span>
            建物 {Number(p.building_sqm)}㎡・土地 {Number(p.land_sqm)}㎡
          </span>
          <span>{p.building_age === 0 ? "新築" : `築${p.building_age}年`}</span>
          <span>駐車 {p.parking}台</span>
          {access && <span>{access}</span>}
        </div>
      </div>

      <StrategyRunner propertyId={propertyId} initial={initial} hasReport={!!done} hasLocation={p.has_location} />
      {report}
    </div>
  );
}
