"use client";

import { useState } from "react";
import Link from "next/link";
import UnderlineTabs from "../../../_components/UnderlineTabs";
import StatusBadge from "../../../_components/StatusBadge";
import { FutureFeatureNotice, ManualEntryNote } from "../../../_components/Notes";
import {
  type PropertyItem,
  monitorDetailTabDefs,
  competitionTrend,
  competitionTwoWeekDrop,
  weeklyResponse,
  daysBeforeSurvey,
  surveyDate,
  formatNumber,
} from "../../../_lib/data";
import { card, statBox, tableHead } from "../../../_lib/ui";

const nextActions: Record<PropertyItem["status"], string[]> = {
  順調: ["今の広告配分を維持する", "見学会の日程を追加し、見学の機会を逃さない", "2週間後に競合の掲載件数と反響を再確認する"],
  注意: ["閲覧に対して問合せが少ないため、物件ページの写真と訴求文を見直す", "競合が減っている今のうちに、SNS広告の出稿を強化する", "2週間後に競合の掲載件数と反響を再確認する"],
  要改善: ["訴求ポイントと媒体の配分をBRUMBYに相談する", "物件ページの写真と訴求文を見直す", "2週間後に競合の掲載件数と反響を再確認する"],
};

export default function MonitorDetail({ property }: { property: PropertyItem }) {
  const [tab, setTab] = useState("competition");
  const weeks = weeklyResponse(property);
  const maxViews = Math.max(...weeks.map((w) => w.views), 1);
  const listedOn = daysBeforeSurvey(property.days);
  const latest = competitionTrend[competitionTrend.length - 1];
  const first = competitionTrend[0];

  const history = [
    { date: listedOn, text: "物件を登録・販売開始" },
    ...competitionTrend.map((t) => ({ date: t.date, text: `競合の掲載件数を記録（SUUMO ${t.value}件）` })),
    { date: surveyDate, text: "今月の反響（閲覧数・問合せ・見学）を更新" },
  ]
    .filter((h) => h.date >= listedOn)
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return (
    <>
      <FutureFeatureNotice />
      <Link href="/monitor" className="inline-block text-[13px] text-body mb-3">
        ← 一覧に戻る
      </Link>
      <div className="text-[17px] font-extrabold text-ink mb-4">
        {property.name}　{property.price}
      </div>
      <UnderlineTabs tabs={monitorDetailTabDefs} active={tab} onChange={setTab} />

      {tab === "summary" && (
        <div className={`${card} p-5`}>
          <div className="flex justify-between items-baseline mb-3.5">
            <div className="text-[13px] font-bold text-ink">販売状況のサマリー（{surveyDate}時点）</div>
            <ManualEntryNote />
          </div>
          <div className="grid grid-cols-5 gap-3">
            {[
              ["販売期間", `${property.days}日`],
              ["今月の閲覧数", `${formatNumber(property.views)}件`],
              ["今月の問合せ", `${property.inquiries}件`],
              ["今月の見学", `${property.tours}件`],
            ].map(([label, value]) => (
              <div key={label} className={`${statBox} p-3.5`}>
                <div className="text-xs text-muted mb-1.5">{label}</div>
                <div className="text-xl font-extrabold text-ink">{value}</div>
              </div>
            ))}
            <div className={`${statBox} p-3.5`}>
              <div className="text-xs text-muted mb-1.5">AI診断</div>
              <StatusBadge status={property.status} />
            </div>
          </div>
        </div>
      )}

      {tab === "response" && (
        <div className={`${card} p-5`}>
          <div className="flex justify-between items-baseline mb-4">
            <div className="text-[13px] font-bold text-ink">今月の反響推移（週別）</div>
            <ManualEntryNote />
          </div>
          <div className="flex items-end gap-5 h-35 mb-4">
            {weeks.map((w) => (
              <div key={w.label} className="flex flex-col items-center gap-1.5">
                <div className="text-xs text-ink font-bold">{w.views}</div>
                <div className="w-9 bg-chart rounded-t" style={{ height: Math.round((w.views / maxViews) * 100) }} />
                <div className="text-[11px] text-muted">{w.label}</div>
              </div>
            ))}
          </div>
          <div className={`${tableHead} grid-cols-[1.4fr_1fr_1fr_1fr]`}>
            <div>週</div>
            <div>閲覧数</div>
            <div>問合せ</div>
            <div>見学</div>
          </div>
          {weeks.map((w) => (
            <div key={w.label} className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 py-2 px-1 border-b border-divider text-[13px] text-body">
              <div>{w.label}</div>
              <div>{w.views}</div>
              <div>{w.inquiries}</div>
              <div>{w.tours}</div>
            </div>
          ))}
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr] gap-2 py-2 px-1 text-[13px] font-extrabold text-ink">
            <div>今月の合計</div>
            <div>{property.views}</div>
            <div>{property.inquiries}</div>
            <div>{property.tours}</div>
          </div>
        </div>
      )}

      {tab === "competition" && (
        <div className={`${card} p-5`}>
          <div className="text-[13px] font-bold text-ink mb-1">競合の掲載件数の推移</div>
          <div className="text-[11px] text-muted mb-4">SUUMO掲載件数・入力の記録</div>
          <div className="flex items-end gap-5 h-35 mb-5">
            {competitionTrend.map((b, i) => (
              <div key={i} className="flex flex-col items-center gap-1.5">
                <div className="text-xs text-ink font-bold">{b.value}</div>
                <div className="w-9 bg-chart rounded-t" style={{ height: b.height }} />
                <div className="text-[11px] text-muted">{b.label}</div>
              </div>
            ))}
          </div>
          <div className="bg-[#fef8ea] rounded-lg py-3 px-4 text-[13px] text-[#7a5c1e]">直近2週間で{competitionTwoWeekDrop}件減少しています。</div>
        </div>
      )}

      {tab === "ai" && (
        <div className={`${card} p-5`}>
          <div className="flex items-center gap-2.5 mb-3.5">
            <div className="text-[13px] font-bold text-ink">AI診断</div>
            <StatusBadge status={property.status} />
          </div>
          <div className="text-[13px] font-bold text-ink mb-2">判断の材料</div>
          <ul className="grid gap-1.5 text-[13px] text-body mb-4">
            <li>・販売期間 {property.days}日、今月の問合せ {property.inquiries}件・見学 {property.tours}件</li>
            <li>
              ・SUUMOの競合掲載件数 {first.value}件（{first.label}）→ {latest.value}件（{latest.label}）
            </li>
          </ul>
          <div className="text-[13px] font-bold text-brand mb-2">次の一手</div>
          <ol className="grid gap-1.5 text-[13px] text-body">
            {nextActions[property.status].map((a, i) => (
              <li key={a}>
                {i + 1}. {a}
              </li>
            ))}
          </ol>
        </div>
      )}

      {tab === "history" && (
        <div className={`${card} p-5`}>
          <div className="text-[13px] font-bold text-ink mb-3">履歴</div>
          {history.map((h, i) => (
            <div key={i} className="grid grid-cols-[110px_1fr] gap-2 py-2 px-1 border-b border-divider text-[13px]">
              <div className="text-muted">{h.date}</div>
              <div className="text-body">{h.text}</div>
            </div>
          ))}
        </div>
      )}

      <div className={`${statBox} py-3.5 px-4.5 mt-4 text-[13px] text-body leading-[1.8]`}>
        <b className="text-ink">AIの見解：</b> SUUMOの競合掲載件数が減少しており、市場在庫が減っている可能性があります。この機会に広告出稿の強化を推奨します。
      </div>
    </>
  );
}
