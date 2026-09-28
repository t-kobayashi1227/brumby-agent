"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import UnderlineTabs from "../../../_components/UnderlineTabs";
import AreaMap from "../../../_components/AreaMap";
import { SourceNote } from "../../../_components/Notes";
import {
  aiResultTabDefs,
  diagnosisSummary,
  surveyDate,
  listingCounts,
  compData,
  areaStats,
  priceHistogram,
  priceHistogramTotal,
  targetProperty,
  dealCases,
  surroundingSummary,
  nearbyFacilities,
  formatNumber,
  targetPriceMan,
  CENSUS_SOURCE,
  MLIT_SOURCE,
} from "../../../_lib/data";
import { card, btnPrimary, btnSecondary, statBox } from "../../../_lib/ui";

export default function ResearchResultPage() {
  const [tab, setTab] = useState("summary");
  return (
    <>
      <UnderlineTabs tabs={aiResultTabDefs} active={tab} onChange={setTab} />

      {tab === "summary" && (
        <div className={`${card} p-5`}>
          <div className="flex justify-between items-baseline mb-3.5">
            <div className="text-sm font-bold text-ink">AI競合診断結果</div>
            <div className="text-xs text-muted">調査日：{surveyDate}</div>
          </div>
          <div className="flex items-center gap-3 bg-[#fff4e0] border border-[#f6d9a8] rounded-lg py-4 px-5 mb-4">
            <span className="text-[28px] leading-none text-[#e8920c]">⚠</span>
            <span className="text-lg font-extrabold text-ink">
              競争環境：<span className="text-[#e6303e]">{diagnosisSummary.competition}</span>
            </span>
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            <div className={`${statBox} p-3.5 text-center`}>
              <div className="text-xs text-muted mb-1.5">掲載件数</div>
              <div className="font-extrabold text-ink">
                {listingCounts.map((l, i) => (
                  <span key={l.site}>
                    {i > 0 && <span className="text-xs text-muted mx-1">／</span>}
                    <span className="text-xs mr-1">{l.site}</span>
                    <span className="text-xl">{l.count}</span>
                    <span className="text-xs ml-0.5">件</span>
                  </span>
                ))}
              </div>
              <div className="text-[11px] text-muted mt-1">（重複を含む）</div>
            </div>
            <div className={`${statBox} p-3.5 text-center`}>
              <div className="text-xs text-muted mb-1.5">競合の中心価格</div>
              <div className="font-extrabold text-ink">
                <span className="text-xl">約{formatNumber(diagnosisSummary.centerPrice)}</span>
                <span className="text-xs ml-0.5">万円</span>
              </div>
            </div>
            <div className={`${statBox} p-3.5 text-center`}>
              <div className="text-xs text-muted mb-1.5">対象物件との価格差</div>
              <div className="font-extrabold text-[#e6303e]">
                <span className="text-xl">+約{diagnosisSummary.priceGap}</span>
                <span className="text-xs ml-0.5">万円</span>
              </div>
              <div className="text-[11px] text-muted mt-1">競合の中心より高い</div>
            </div>
          </div>
          <div className="text-[13px] font-bold text-ink mb-2">AIの分析コメント</div>
          <p className="text-[13px] text-body leading-relaxed mb-5">{diagnosisSummary.comment}</p>
          <div className="text-[13px] font-bold text-brand mb-2">推奨アクション</div>
          <ol className="grid gap-2">
            {diagnosisSummary.actions.map((a, i) => (
              <li key={a} className="flex items-center gap-3 border border-line rounded-lg py-2 px-3 text-[13px] text-body">
                <span className="flex items-center justify-center w-6 h-6 shrink-0 rounded-full bg-brand text-white text-xs font-bold">
                  {i + 1}
                </span>
                {a}
              </li>
            ))}
          </ol>
          <SourceNote className="mt-4">
            競合物件の入力（{surveyDate}調査）／{MLIT_SOURCE}
          </SourceNote>
        </div>
      )}

      {tab === "area" && (
        <div className="grid grid-cols-2 gap-4">
          <div className={`${card} p-4 flex flex-col`}>
            <div className="text-[13px] font-bold text-ink mb-2.5">子育て世帯の割合（町丁目別）</div>
            <AreaMap />
          </div>
          <div className="flex flex-col gap-3">
            <div className={`${card} px-4 py-3 flex-1 flex flex-col`}>
              <div className="text-[13px] font-bold text-ink mb-2">エリアの基本データ（半径3km圏）</div>
              <div className="grid grid-cols-2 gap-2">
                {areaStats.map((a, i) => (
                  <div key={i} className={`${statBox} px-3 py-1.5 flex items-baseline gap-2`}>
                    <div className="text-[11px] text-muted shrink-0">{a.label}</div>
                    <div className="text-sm font-extrabold text-ink">{a.value}</div>
                    {a.sub && <div className="text-[10px] text-muted">（{a.sub}）</div>}
                  </div>
                ))}
              </div>
              <SourceNote className="mt-auto pt-2">{CENSUS_SOURCE}</SourceNote>
            </div>

            <div className={`${card} px-4 py-3 flex-1 flex flex-col`}>
              <div className="text-[13px] font-bold text-ink mb-1.5">周辺の取引価格帯（戸建）</div>
              <div className="flex items-end gap-2.5 h-[78px]">
                {priceHistogram.map((b) => (
                  <div key={b.label} className="flex flex-col items-center gap-0.5 flex-1">
                    <div className={`text-[11px] font-bold ${b.hasTarget ? "text-brand" : "text-ink"}`}>{b.value}</div>
                    <div className={`w-full rounded-t ${b.hasTarget ? "bg-brand" : "bg-chart"}`} style={{ height: Math.round(b.ratio * 48) }} />
                    <div className={`text-[10px] text-center whitespace-nowrap ${b.hasTarget ? "text-brand font-bold" : "text-muted"}`}>{b.label}</div>
                  </div>
                ))}
              </div>
              <div className="flex justify-between text-[10px] text-muted mt-1">
                <span>単位：万円／直近1年の取引・成約価格 {priceHistogramTotal}件</span>
                <span className="text-brand font-bold">■ 対象物件（{formatNumber(targetPriceMan)}万円）</span>
              </div>
              <SourceNote className="mt-auto pt-1.5">{MLIT_SOURCE}</SourceNote>
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
              {compData.map((c, i) => (
                <div key={i} className="grid grid-cols-[1.3fr_1fr_.8fr_.8fr] gap-2 py-1 px-1 border-b border-divider text-xs text-body">
                  <div>{c.location.replace("新潟市中央区", "")}</div>
                  <div className="font-bold text-accent">{c.price}万円</div>
                  <div>{c.layout}</div>
                  <div>{c.walk}分</div>
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
          <div className="grid grid-cols-3 gap-3.5 mt-3">
            {compData.map((c, i) => (
              <div key={i} className="border border-canvas rounded-lg py-3 px-3.5">
                <div className="text-[11px] font-bold text-muted mb-1">競合物件{i + 1}</div>
                <div className="text-sm font-extrabold text-accent mb-1.5">価格 {c.price}万円</div>
                <div className="text-xs text-body">
                  土地{c.land}㎡　建物{c.building}㎡
                </div>
                <div className="text-xs text-body">
                  間取り{c.layout}　駅徒歩{c.walk}分
                </div>
                {c.parking && <div className="text-xs text-body">駐車場{c.parking}台</div>}
                <div className="text-xs text-muted mt-1">{c.location}</div>
                {c.features && <div className="text-[11px] text-muted mt-0.5">{c.features}</div>}
              </div>
            ))}
          </div>
          <SourceNote className="mt-4">競合物件の入力（{surveyDate}）</SourceNote>
        </div>
      )}

      {tab === "price" && (
        <div className={`${card} p-5`}>
          <div className="text-[13px] font-bold text-ink mb-3.5">周辺の取引価格相場（戸建）</div>
          <div className="grid grid-cols-3 gap-3.5 mb-5">
            <div className={`${statBox} p-3.5`}>
              <div className="text-xs text-muted mb-1.5">平均価格</div>
              <div className="text-xl font-extrabold text-ink">3,850万円</div>
            </div>
            <div className={`${statBox} p-3.5`}>
              <div className="text-xs text-muted mb-1.5">価格帯</div>
              <div className="text-xl font-extrabold text-ink">3,200〜4,480万円</div>
            </div>
            <div className={`${statBox} p-3.5`}>
              <div className="text-xs text-muted mb-1.5">直近1年の取引件数</div>
              <div className="text-xl font-extrabold text-ink">{priceHistogramTotal}件</div>
            </div>
          </div>
          <div className="text-[11px] text-muted mb-2">価格帯別の取引件数（万円）</div>
          <div className="flex items-end gap-4 h-40">
            {priceHistogram.map((b, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5 flex-1">
                <div className="text-xs text-ink font-bold">{b.value}</div>
                <div className="w-full bg-chart rounded-t" style={{ height: b.height }} />
                <div className="text-[11px] text-muted text-center">{b.label}</div>
              </div>
            ))}
          </div>
          <SourceNote className="mt-4">国土交通省 不動産情報ライブラリ 取引・成約価格情報（直近4四半期、2026年9月取得）</SourceNote>
        </div>
      )}

      {tab === "deals" && (
        <div className={`${card} p-4.5`}>
          <div className="text-sm font-bold text-ink mb-1">取引価格の事例（2026年）</div>
          <div className="text-[11px] text-muted mb-3">
            国土交通省 不動産情報ライブラリの取引・成約価格情報（地区単位・四半期単位）
          </div>
          <div className="grid grid-cols-[1.4fr_1.2fr_1fr_1.2fr] gap-2 text-[11px] text-muted px-1 pb-2 border-b border-canvas">
            <div>地区名</div>
            <div>取引時期</div>
            <div>価格</div>
            <div>面積（土地／建物）</div>
          </div>
          {dealCases.map((d, i) => (
            <div key={i} className="grid grid-cols-[1.4fr_1.2fr_1fr_1.2fr] gap-2 items-center py-2.5 px-1 border-b border-divider">
              <div className="text-xs text-ink font-semibold">{d.district}</div>
              <div className="text-xs text-sub">{d.period}</div>
              <div className="text-xs text-accent font-bold">{d.price}</div>
              <div className="text-xs text-sub">
                {d.land}㎡／{d.building}㎡
              </div>
            </div>
          ))}
          <SourceNote className="mt-4">{MLIT_SOURCE}</SourceNote>
        </div>
      )}

      {tab === "surroundings" && (
        <>
          <div className="flex gap-3.5 items-start bg-[#fff8e6] border border-[#f3dfa1] rounded-[10px] py-4 px-4.5 mb-4">
            <div className="text-[22px]">💡</div>
            <div>
              <div className="text-[13px] font-extrabold text-[#7a5c1e] mb-1">AIの総合コメント</div>
              <div className="text-xs text-[#7a5c1e]">
                保育園・小学校・中学校がいずれも半径1km圏内にあり、子育てファミリーへの訴求材料になります。最寄り駅までは徒歩12分です。
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[.9fr_1.3fr_1fr] gap-4">
            <div>
              <div className="relative aspect-[4/3] rounded-lg overflow-hidden mb-2.5">
                <Image src="/house.jpg" alt={targetProperty.name} fill sizes="(min-width: 1024px) 30vw, 100vw" className="object-cover" loading="eager" />
              </div>
              <div className="text-[13px] font-extrabold text-ink">{targetProperty.name}</div>
              <div className="text-lg font-extrabold text-accent mb-3">{targetProperty.price}</div>
              <div className="text-[13px] font-bold text-ink mb-2">周辺環境の概要（半径1km圏内）</div>
              <div className="grid gap-2">
                {surroundingSummary.map((r) => (
                  <div key={r.label} className="flex gap-2 text-xs text-body">
                    <div className="w-[18px]">{r.icon}</div>
                    <div>
                      <div className="text-[11px] text-muted">{r.label}</div>
                      <div>{r.value}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className={`${card} p-4`}>
              <div className="text-[13px] font-bold text-ink mb-2.5">周辺施設マップ（半径1km圏内）</div>
              <AreaMap facilities />
            </div>
            <div className={`${card} p-4 flex flex-col`}>
              <div className="text-[13px] font-bold text-ink mb-2.5">主な周辺施設（距離の近い順）</div>
              <div className="grid gap-2.5">
                {nearbyFacilities.map((f, i) => (
                  <div key={f.name} className="flex gap-2.5 items-center">
                    <div className="flex items-center justify-center w-[22px] h-[22px] shrink-0 rounded-full bg-brand text-white text-[11px] font-bold">
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-ink">{f.name}</div>
                      <div className="text-[11px] text-muted">
                        徒歩{f.minutes}分（約{f.distance}）
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="text-[11px] text-muted mt-3">徒歩分数は距離÷80m/分で計算</div>
              <SourceNote className="mt-auto pt-4">{MLIT_SOURCE}（学校・保育園・医療機関・駅）</SourceNote>
            </div>
          </div>
        </>
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
