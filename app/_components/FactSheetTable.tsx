"use client";

import { useState } from "react";
import { FACT_CATEGORIES, type Fact, type FactCategory } from "../../lib/facts/types";

// 事実シートの表（分類の凡例つき）。レポートの「根拠データ」と事実シートの画面で同じものを使う
// 置く先のカードは p-5 を前提にする（横スクロールの領域をカードの端まで広げるため -mx-5 px-5）

/**
 * 事実シートの列と幅（合計1110pxが表の最小幅。1440px幅の画面で横スクロールなしに収まる。広い画面では比率のまま広がり、狭い画面では横スクロール）
 * 比較は値と並べて読むので、値に次いで広くとる
 */
const FACT_COLUMNS = [
  { label: "ID", width: 64 },
  { label: "項目", width: 180 },
  { label: "値", width: 250 },
  { label: "比較", width: 220 },
  { label: "出典", width: 174 },
  { label: "時点", width: 130 },
  { label: "状態", width: 92 },
];
const MIN_WIDTH = FACT_COLUMNS.reduce((sum, c) => sum + c.width, 0);

/** 時点の表示。「2026-10-24（ダウンロード日）」のような補足は、日付の下に小さく分けて出す（日付の途中で折り返さない） */
function TimePoint({ value }: { value: string }) {
  const i = value.indexOf("（");
  if (i <= 0) return <span className="whitespace-nowrap">{value}</span>;
  return (
    <>
      <span className="whitespace-nowrap">{value.slice(0, i)}</span>
      <span className="block text-[12px] text-sub">{value.slice(i)}</span>
    </>
  );
}

/** 表の行の要素 id（凡例から飛ぶ先） */
const factRowId = (id: string) => `fact-row-${id}`;

/** ID の英字の凡例。この事実シートに出てくる分類だけを、設計まとめの表の順で出す。押すとその分類の1番目の行へ移る */
function FactLegend({ facts, onJump }: { facts: Fact[]; onJump: (id: string) => void }) {
  const items = (Object.keys(FACT_CATEGORIES) as FactCategory[])
    .map((c) => ({ c, first: facts.find((f) => f.id.startsWith(`${c}-`)) }))
    .filter((x): x is { c: FactCategory; first: Fact } => x.first !== undefined);
  return (
    <div className="mb-4">
      <div className="text-[13px] text-sub mb-2">ID の英字は事実の分類です（例：P-01 は「物件」の1番目）。押すと、その分類の最初の行へ移ります。</div>
      <div className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ c, first }) => (
          <div key={c} className="min-w-0">
            <button
              type="button"
              onClick={() => onJump(first.id)}
              className="flex w-full gap-2 rounded px-1.5 py-1 -mx-1.5 text-left cursor-pointer hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="shrink-0 font-mono font-bold text-primary w-4">{c}</span>
              <span className="min-w-0">
                <span className="font-bold text-ink underline decoration-line underline-offset-2">{FACT_CATEGORIES[c].name}</span>
                <span className="text-sub">：{FACT_CATEGORIES[c].contents}</span>
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FactSheetTable({ facts }: { facts: Fact[] }) {
  // 凡例から移った行を少しの間だけ、ホバーと同じ色にして、どこに移ったか分かるようにする
  const [jumped, setJumped] = useState<string | null>(null);
  const jump = (id: string) => {
    document.getElementById(factRowId(id))?.scrollIntoView({ behavior: "smooth", block: "start" });
    setJumped(id);
    window.setTimeout(() => setJumped((cur) => (cur === id ? null : cur)), 2000);
  };
  return (
    <>
      <FactLegend facts={facts} onJump={jump} />
      {/* 列の幅を決めて横スクロールにする（狭い画面で値や出典が細く折り返されないように）。ID の列は横に動かしても見えるよう固定する */}
      <div className="overflow-x-auto -mx-5 px-5">
        {/* border-collapse だと sticky が効かないブラウザがあるため border-separate にする（spacing 0 で見た目は collapse と同じ） */}
        <table className="w-full table-fixed text-[14px] text-ink border-separate border-spacing-0" style={{ minWidth: MIN_WIDTH }}>
          <colgroup>
            {FACT_COLUMNS.map((c) => (
              <col key={c.label} style={{ width: c.width }} />
            ))}
          </colgroup>
          <thead>
            <tr className="text-left text-sub bg-subtle">
              {FACT_COLUMNS.map((c, i) => (
                <th key={c.label} className={`px-3 py-2.5 font-bold text-[13px] whitespace-nowrap border-b border-line ${i === 0 ? "sticky left-0 z-10 bg-subtle" : ""}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {facts.map((f) => (
              <tr
                key={f.id}
                id={factRowId(f.id)}
                className={`group/row scroll-mt-4 align-top border-b border-line transition-colors duration-700 ${jumped === f.id ? "bg-primary-soft/40" : "hover:bg-primary-soft/40"}`}
              >
                <td className={`sticky left-0 px-3 transition-colors duration-700 ${jumped === f.id ? "bg-[#f4f8fd]" : "bg-white group-hover/row:bg-[#f4f8fd]"} py-3 font-mono text-[13px] text-sub whitespace-nowrap`}>{f.id}</td>
                <td className="px-3 py-3 font-bold leading-relaxed">{f.項目}</td>
                <td className={`px-3 py-3 leading-relaxed ${f.値 === null ? "text-sub" : ""}`}>{f.値 ?? "不明"}</td>
                <td className="px-3 py-3 leading-relaxed text-body">{f.比較 ?? ""}</td>
                <td className="px-3 py-3 leading-relaxed text-body">{f.出典}</td>
                <td className="px-3 py-3 text-body leading-relaxed">
                  <TimePoint value={f.時点} />
                </td>
                <td className="px-3 py-3 whitespace-nowrap">
                  <span className={`inline-block rounded px-2 py-0.5 text-[12px] ${f.状態 === "取得" ? "bg-primary-soft text-primary" : "bg-divider text-sub"}`}>{f.状態}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
