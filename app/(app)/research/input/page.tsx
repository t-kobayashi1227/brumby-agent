import Link from "next/link";
import { listingCounts, surveyDate } from "../../../_lib/data";
import { card, fieldLabel, input, checkLabel, btnPrimary, btnSecondary } from "../../../_lib/ui";

const siteStyles = [
  { accent: "text-[#00a651]", border: "border-[#00a651]", bg: "bg-[#eefaf3]" },
  { accent: "text-[#e6303e]", border: "border-[#e6303e]", bg: "bg-[#fdf0f1]" },
];

const searchResults = listingCounts.map((l, i) => ({ label: `${l.site}の検索結果`, count: String(l.count), ...siteStyles[i] }));

const priceFields = [
  { label: "最低価格", value: "3,280", unit: "万円" },
  { label: "中心価格", value: "3,500", unit: "万円前後" },
  { label: "最高価格", value: "4,180", unit: "万円" },
];

const impressions = [
  { label: "競合が多い", checked: true },
  { label: "値下げ物件が目立つ", checked: true },
  { label: "新築物件が多い", checked: true },
  { label: "完成済み物件が多い", checked: false },
  { label: "大手ハウスメーカーが多い", checked: true },
  { label: "特になし", checked: false },
];

export default function ResearchInputPage() {
  return (
    <div className={`${card} p-6 max-w-[640px]`}>
      <div className="text-sm font-bold text-ink mb-4">検索結果の入力</div>
      <div className="grid grid-cols-3 gap-3.5 mb-5">
        <div>
          <label className={fieldLabel}>調査日</label>
          <input type="date" defaultValue={surveyDate.replaceAll("/", "-")} className={input} />
        </div>
        {searchResults.map((r) => (
          <div key={r.label} className={`border-2 ${r.border} ${r.bg} rounded-lg px-3 py-2.5 text-center`}>
            <div className={`text-xs font-bold ${r.accent} mb-1`}>{r.label}</div>
            <div className="flex items-baseline justify-center gap-1">
              <input
                defaultValue={r.count}
                className="w-14 bg-transparent text-center text-[26px] font-extrabold text-ink outline-none"
              />
              <span className="text-[13px] text-body">件</span>
            </div>
          </div>
        ))}
      </div>
      <div className="text-sm font-bold text-ink mb-2">価格帯（全体の傾向）</div>
      <div className="grid grid-cols-3 gap-2.5 mb-5">
        {priceFields.map((p) => (
          <div key={p.label} className="border border-field rounded-md px-3 py-2">
            <div className="text-xs text-muted mb-1">{p.label}</div>
            <div className="flex items-baseline gap-1">
              <input defaultValue={p.value} className="w-full min-w-0 text-[15px] font-bold text-ink outline-none" />
              <span className="shrink-0 text-xs text-muted">{p.unit}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="text-sm font-bold text-ink mb-2">市場を見た印象（複数選択可）</div>
      <div className="grid grid-cols-2 gap-2">
        {impressions.map((m) => (
          <label key={m.label} className={checkLabel}>
            <input type="checkbox" defaultChecked={m.checked} />
            {m.label}
          </label>
        ))}
      </div>
      <div className="flex justify-between mt-6">
        <Link href="/research" className={btnSecondary}>
          戻る
        </Link>
        <Link href="/research/detail" className={btnPrimary}>
          次へ
        </Link>
      </div>
    </div>
  );
}
