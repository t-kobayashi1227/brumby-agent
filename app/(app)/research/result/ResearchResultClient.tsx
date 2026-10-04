"use client";

import { useState } from "react";
import Link from "next/link";
import UnderlineTabs from "../../../_components/UnderlineTabs";
import AreaMap from "../../../_components/AreaMap";
import { SourceNote } from "../../../_components/Notes";
import { aiResultTabDefs, formatNumber } from "../../../_lib/data";
import { card, btnPrimary, btnSecondary, statBox, emptyState } from "../../../_lib/ui";

interface Competitor {
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

interface AreaStat { label: string; value: string; sub: string }
interface NearbyFacility { label: string; name: string; walkMin: number; distanceM: number }
interface DealCase { district: string; year: number; quarter: number; priceManYen: number; landSqm: number | null; buildingSqm: number | null }
interface MarketStats { n: number; medianManYen: number | null; q1ManYen: number | null; q3ManYen: number | null; period: string; levelLabel: string }

export interface ResearchResultClientProps {
  hasRun: boolean;
  surveyDate: string;
  propertyName: string;
  propertyPriceManYen: number | null;
  competitors: Competitor[];
  areaStats: AreaStat[];
  market: MarketStats | null;
  dealCases: DealCase[];
  nearby: NearbyFacility[];
  zoning: string | null;
  hazardNotes: string[];
  censusSource: string;
  mlitSource: string;
}

function compAvg(competitors: Competitor[], key: "priceManYen" | "landSqm"): number | null {
  const vals = competitors.map((c) => c[key]).filter((v): v is number => v !== null);
  if (vals.length === 0) return null;
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

export default function ResearchResultClient(props: ResearchResultClientProps) {
  const { hasRun, surveyDate, propertyPriceManYen, competitors, areaStats, market, dealCases, nearby, zoning, hazardNotes, censusSource, mlitSource } = props;
  const [tab, setTab] = useState("summary");

  if (!hasRun) {
    return <div className={emptyState}>この物件はまだ分析が実行されていません（npm run analyze）。</div>;
  }

  const avgCompPrice = compAvg(competitors, "priceManYen");
  const priceGap = propertyPriceManYen !== null && avgCompPrice !== null ? propertyPriceManYen - avgCompPrice : null;

  return (
    <>
      <UnderlineTabs tabs={aiResultTabDefs.filter((t) => t.key !== "deals" || dealCases.length > 0)} active={tab} onChange={setTab} />

      {tab === "summary" && (
        <div className={`${card} p-5`}>
          <div className="flex justify-between items-baseline mb-3.5">
            <div className="text-sm font-bold text-ink">競合物件との比較</div>
            <div className="text-xs text-muted">調査日：{surveyDate}</div>
          </div>
          {avgCompPrice !== null && priceGap !== null ? (
            <div className="grid grid-cols-3 gap-3 mb-5">
              <div className={`${statBox} p-3.5 text-center`}>
                <div className="text-xs text-muted mb-1.5">入力した競合物件</div>
                <div className="font-extrabold text-ink">
                  <span className="text-xl">{competitors.length}</span>
                  <span className="text-xs ml-0.5">件</span>
                </div>
              </div>
              <div className={`${statBox} p-3.5 text-center`}>
                <div className="text-xs text-muted mb-1.5">競合の平均価格</div>
                <div className="font-extrabold text-ink">
                  <span className="text-xl">{formatNumber(avgCompPrice)}</span>
                  <span className="text-xs ml-0.5">万円</span>
                </div>
              </div>
              <div className={`${statBox} p-3.5 text-center`}>
                <div className="text-xs text-muted mb-1.5">対象物件との価格差</div>
                <div className={`font-extrabold ${priceGap >= 0 ? "text-[#e6303e]" : "text-accent"}`}>
                  <span className="text-xl">{priceGap >= 0 ? "+" : ""}{formatNumber(priceGap)}</span>
                  <span className="text-xs ml-0.5">万円</span>
                </div>
                <div className="text-[11px] text-muted mt-1">競合の平均より{priceGap >= 0 ? "高い" : "低い"}</div>
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-muted mb-5">競合物件が入力されていません。</div>
          )}
          <div className="text-[13px] text-body leading-relaxed mb-2">
            狙う層・広告予算配分・訴求ポイントの詳しい分析は、AIの文章としてまとめています。
          </div>
          <SourceNote className="mb-4">
            競合物件の入力（{surveyDate}調査）／{mlitSource}
          </SourceNote>
          <Link href="/strategy" className={btnPrimary}>
            販売戦略（AIの分析）を見る →
          </Link>
        </div>
      )}

      {tab === "area" && (
        <div className="grid grid-cols-2 gap-4">
          <div className={`${card} p-4 flex flex-col`}>
            <div className="text-[13px] font-bold text-ink mb-2.5">エリアのイメージ図</div>
            <AreaMap />
            <div className="text-[11px] text-muted mt-1.5">※この地図はイメージ図です（実際の地図への差し替えは今後対応予定）</div>
          </div>
          <div className="flex flex-col gap-3">
            <div className={`${card} px-4 py-3 flex-1 flex flex-col`}>
              <div className="text-[13px] font-bold text-ink mb-2">エリアの基本データ（人口構成）</div>
              <div className="grid grid-cols-2 gap-2">
                {areaStats.map((a) => (
                  <div key={a.label} className={`${statBox} px-3 py-1.5 flex items-baseline gap-2`}>
                    <div className="text-[11px] text-muted shrink-0">{a.label}</div>
                    <div className="text-sm font-extrabold text-ink">{a.value}</div>
                    {a.sub && <div className="text-[10px] text-muted">（{a.sub}）</div>}
                  </div>
                ))}
              </div>
              <SourceNote className="mt-auto pt-2">{censusSource}</SourceNote>
            </div>

            <div className={`${card} px-4 py-3 flex-1 flex flex-col`}>
              <div className="text-[13px] font-bold text-ink mb-1.5">周辺の取引価格相場</div>
              {market ? (
                <div className="text-[13px] text-body">
                  中央値 {formatNumber(market.medianManYen ?? 0)}万円（四分位 {formatNumber(market.q1ManYen ?? 0)}〜{formatNumber(market.q3ManYen ?? 0)}万円、{market.n}件、{market.period}、{market.levelLabel}）
                </div>
              ) : (
                <div className="text-[13px] text-muted">取引価格のデータがありません</div>
              )}
              <SourceNote className="mt-auto pt-1.5">{mlitSource}</SourceNote>
            </div>

            <div className={`${card} px-4 py-3 flex-1 flex flex-col`}>
              <div className="flex items-center gap-2 mb-1.5">
                <div className="text-[13px] font-bold text-ink">入力した競合物件</div>
                <span className="rounded-full bg-divider border border-line px-2 py-px text-[10px] font-bold text-muted">ご入力</span>
              </div>
              <div className="grid grid-cols-[1.3fr_1fr_.8fr_.8fr] gap-2 text-[10px] text-muted px-1 pb-1 border-b border-canvas">
                <div>所在地</div>
                <div>価格</div>
                <div>間取り</div>
                <div>駅徒歩</div>
              </div>
              {competitors.map((c) => (
                <div key={c.position} className="grid grid-cols-[1.3fr_1fr_.8fr_.8fr] gap-2 py-1 px-1 border-b border-divider text-xs text-body">
                  <div>{c.location ?? "―"}</div>
                  <div className="font-bold text-accent">{c.priceManYen ?? "―"}万円</div>
                  <div>{c.layout ?? "―"}</div>
                  <div>{c.walkMin ?? "―"}分</div>
                </div>
              ))}
              <SourceNote className="mt-auto pt-1.5">競合物件の入力（{surveyDate}）</SourceNote>
            </div>
          </div>
        </div>
      )}

      {tab === "competitor" && (
        <div className={`${card} p-4.5`}>
          <div className="text-[13px] font-bold text-ink mb-1.5">現在販売中の類似物件（入力した競合物件）</div>
          <div className="text-[11px] text-muted">ご担当者様が入力した条件のみを表示しています（ポータルサイトの写真・文章は使用しません）。</div>
          {competitors.length === 0 ? (
            <div className="text-[13px] text-muted mt-3">競合物件が入力されていません。</div>
          ) : (
            <div className="grid grid-cols-3 gap-3.5 mt-3">
              {competitors.map((c) => (
                <div key={c.position} className="border border-canvas rounded-lg py-3 px-3.5">
                  <div className="text-[11px] font-bold text-muted mb-1">競合物件{c.position}</div>
                  <div className="text-sm font-extrabold text-accent mb-1.5">価格 {c.priceManYen ?? "―"}万円</div>
                  <div className="text-xs text-body">
                    土地{c.landSqm ?? "―"}㎡　建物{c.buildingSqm ?? "―"}㎡
                  </div>
                  <div className="text-xs text-body">
                    間取り{c.layout ?? "―"}　駅徒歩{c.walkMin ?? "―"}分
                  </div>
                  {!!c.parking && <div className="text-xs text-body">駐車場{c.parking}台</div>}
                  <div className="text-xs text-muted mt-1">{c.location}</div>
                  {c.features && <div className="text-[11px] text-muted mt-0.5">{c.features}</div>}
                </div>
              ))}
            </div>
          )}
          <SourceNote className="mt-4">競合物件の入力（{surveyDate}）</SourceNote>
        </div>
      )}

      {tab === "price" && (
        <div className={`${card} p-5`}>
          <div className="text-[13px] font-bold text-ink mb-3.5">周辺の取引価格相場</div>
          {market ? (
            <>
              <div className="grid grid-cols-3 gap-3.5 mb-5">
                <div className={`${statBox} p-3.5`}>
                  <div className="text-xs text-muted mb-1.5">中央値</div>
                  <div className="text-xl font-extrabold text-ink">{formatNumber(market.medianManYen ?? 0)}万円</div>
                </div>
                <div className={`${statBox} p-3.5`}>
                  <div className="text-xs text-muted mb-1.5">四分位の範囲</div>
                  <div className="text-xl font-extrabold text-ink">{formatNumber(market.q1ManYen ?? 0)}〜{formatNumber(market.q3ManYen ?? 0)}万円</div>
                </div>
                <div className={`${statBox} p-3.5`}>
                  <div className="text-xs text-muted mb-1.5">件数（{market.period}）</div>
                  <div className="text-xl font-extrabold text-ink">{market.n}件</div>
                </div>
              </div>
              <div className="text-[11px] text-muted">集計範囲：{market.levelLabel}（件数が十分になるまで、物件のある地区→隣の地区→区・市の順に広げています）</div>
              <div className="text-[11px] text-muted mt-1">価格帯別の件数グラフは今後対応予定です。</div>
            </>
          ) : (
            <div className="text-[13px] text-muted">取引価格のデータがありません</div>
          )}
          <SourceNote className="mt-4">{mlitSource}</SourceNote>
        </div>
      )}

      {tab === "deals" && dealCases.length > 0 && (
        <div className={`${card} p-4.5`}>
          <div className="text-sm font-bold text-ink mb-1">取引価格の事例</div>
          <div className="text-[11px] text-muted mb-3">国土交通省 不動産情報ライブラリの取引・成約価格情報（地区単位・四半期単位）</div>
          <div className="grid grid-cols-[1.4fr_1.2fr_1fr_1.2fr] gap-2 text-[11px] text-muted px-1 pb-2 border-b border-canvas">
            <div>地区名</div>
            <div>取引時期</div>
            <div>価格</div>
            <div>面積（土地／建物）</div>
          </div>
          {dealCases.map((d, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_1.2fr_1fr_1.2fr] gap-2 items-center py-2.5 px-1 border-b border-divider">
              <div className="text-xs text-ink font-semibold">{d.district}</div>
              <div className="text-xs text-sub">{d.year}年第{d.quarter}四半期</div>
              <div className="text-xs text-accent font-bold">{formatNumber(d.priceManYen)}万円</div>
              <div className="text-xs text-sub">
                {d.landSqm ?? "―"}㎡／{d.buildingSqm ?? "―"}㎡
              </div>
            </div>
          ))}
          <SourceNote className="mt-4">{mlitSource}</SourceNote>
        </div>
      )}

      {tab === "surroundings" && (
        <div className="grid grid-cols-[1.3fr_1fr] gap-4">
          <div className={`${card} p-4`}>
            <div className="text-[13px] font-bold text-ink mb-2.5">主な周辺施設（距離の近い順）</div>
            <div className="grid gap-2.5">
              {nearby.map((f, i) => (
                <div key={f.label} className="flex gap-2.5 items-center">
                  <div className="flex items-center justify-center w-[22px] h-[22px] shrink-0 rounded-full bg-brand text-white text-[11px] font-bold">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-ink">{f.label}　{f.name}</div>
                    <div className="text-[11px] text-muted">徒歩約{f.walkMin}分（直線{f.distanceM}m）</div>
                  </div>
                </div>
              ))}
            </div>
            {zoning && <div className="text-xs text-body mt-3">用途地域：{zoning}</div>}
            <div className="text-[11px] text-muted mt-3">徒歩分数は直線距離×1.3、分速80mで計算</div>
            <SourceNote className="mt-3">{mlitSource}（学校・保育園・駅・用途地域）</SourceNote>
          </div>
          <div className={`${card} p-4 flex flex-col`}>
            <div className="text-[13px] font-bold text-ink mb-2.5">防災（確認を促す情報）</div>
            {hazardNotes.length > 0 ? (
              <ul className="grid gap-2 text-xs text-body">
                {hazardNotes.map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="shrink-0">・</span>
                    {h}
                  </li>
                ))}
              </ul>
            ) : (
              <div className="text-xs text-muted">防災のデータがありません</div>
            )}
            <SourceNote className="mt-auto pt-3">{mlitSource}（ハザードマップ）</SourceNote>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2.5 mt-5">
        <button className={btnSecondary}>レポートを出力する（PDF）</button>
        <Link href="/strategy" className={btnPrimary}>
          販売戦略を作成する →
        </Link>
      </div>
    </>
  );
}
