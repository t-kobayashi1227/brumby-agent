"use client";

import { useState } from "react";
import { FutureBadge } from "../../_components/Notes";
import type { ReportKey, ReportFormat } from "../../_lib/data";
import { card, checkLabel } from "../../_lib/ui";

const TEMPLATES: { key: ReportKey; label: string; future?: boolean }[] = [
  { key: "strategy", label: "販売戦略レポート（提案資料）" },
  { key: "monitor", label: "定期モニターレポート（A4）", future: true },
  { key: "summary", label: "経営者向けサマリー（A4）", future: true },
  { key: "ad", label: "広告提案資料（パワーポイント形式）", future: true },
];

export default function ReportPage() {
  const [checks, setChecks] = useState<Record<ReportKey, boolean>>({ strategy: true, monitor: false, summary: false, ad: false });
  const [format, setFormat] = useState<ReportFormat>("pdf");
  const [done, setDone] = useState(false);

  const toggle = (key: ReportKey) => {
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));
    setDone(false);
  };
  const changeFormat = (f: ReportFormat) => {
    setFormat(f);
    setDone(false);
  };

  return (
    <>
      <div className="grid grid-cols-[1.4fr_1fr] gap-5">
        <div className={`${card} p-5.5`}>
          <div className="text-sm font-bold text-ink mb-4">出力するレポートの種類を選択してください</div>
          <div className="text-[13px] text-body font-bold mb-2">レポートテンプレート</div>
          <div className="grid gap-2.5 mb-4.5">
            {TEMPLATES.map((t) => (
              <label key={t.key} className={`text-[13px] flex gap-2 ${t.future ? "text-muted" : "text-body"}`}>
                <input type="checkbox" checked={checks[t.key]} disabled={t.future} onChange={() => toggle(t.key)} />
                <span>
                  {t.label}
                  {t.future && <FutureBadge />}
                </span>
              </label>
            ))}
          </div>
          <div className="text-[13px] text-body font-bold mb-2">出力形式</div>
          <div className="flex gap-5 mb-5">
            <label className={checkLabel}>
              <input type="radio" name="fmt" checked={format === "pdf"} onChange={() => changeFormat("pdf")} />
              PDF形式
            </label>
            <label className="flex gap-1.5 text-[13px] text-muted">
              <input type="radio" name="fmt" checked={format === "ppt"} disabled onChange={() => changeFormat("ppt")} />
              <span>
                PowerPoint形式
                <FutureBadge />
              </span>
            </label>
          </div>
          <button onClick={() => setDone(true)} className="w-full p-3 bg-brand rounded-md text-white text-sm font-bold cursor-pointer">
            レポートを作成する →
          </button>
          {done && (
            <div className="mt-3.5 bg-[#e9f7ee] border border-[#b7e6c6] rounded-lg py-3 px-4 text-[13px] text-[#15803d]">
              レポートを作成しました。ダウンロード準備が完了しています。
            </div>
          )}
        </div>
        <div className={`${card} p-5.5`}>
          <div className="text-[13px] font-bold text-ink mb-3">プレビュー</div>
          <div className="border border-line rounded-lg p-4">
            <div className="text-[11px] text-muted mb-2.5">販売戦略レポート ・ 2026年9月28日</div>
            <div className="aspect-[1/1.3] bg-stripes rounded-md flex items-center justify-center font-mono text-[11px] text-muted">
              レポート表紙イメージ
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
