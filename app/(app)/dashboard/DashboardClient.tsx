"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { card, tableHead } from "../../_lib/ui";

export interface DashboardProperty {
  id: number;
  name: string;
  priceManYen: number | null;
  lastAnalyzedAt: string | null;
  insufficientCount: number;
}

type SortKey = "default" | "lastAnalyzedAt" | "insufficientCount";

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "default", label: "登録順" },
  { key: "lastAnalyzedAt", label: "分析が新しい順" },
  { key: "insufficientCount", label: "データ不足が多い順" },
];

const formatDate = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function DashboardClient({ properties }: { properties: DashboardProperty[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [open, setOpen] = useState(false);

  const rows = [...properties];
  if (sortKey === "lastAnalyzedAt") rows.sort((a, b) => (b.lastAnalyzedAt ?? "").localeCompare(a.lastAnalyzedAt ?? ""));
  if (sortKey === "insufficientCount") rows.sort((a, b) => b.insufficientCount - a.insufficientCount);
  const currentLabel = sortOptions.find((o) => o.key === sortKey)?.label ?? "登録順";

  const analyzed = properties.filter((p) => p.lastAnalyzedAt !== null).length;
  const totalInsufficient = properties.reduce((n, p) => n + p.insufficientCount, 0);

  return (
    <>
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className={`${card} py-4 px-4.5`}>
          <div className="text-[13px] mb-2">登録物件数</div>
          <div className="text-2xl font-extrabold text-ink">{properties.length}件</div>
        </div>
        <div className={`${card} py-4 px-4.5`}>
          <div className="text-[13px] mb-2">分析済み</div>
          <div className="text-2xl font-extrabold text-ink">{analyzed}件</div>
        </div>
        <div className={`${card} py-4 px-4.5`}>
          <div className="text-[13px] mb-2">データ不足のカード（最新の分析の合計）</div>
          <div className="text-2xl font-extrabold text-ink">{totalInsufficient}件</div>
        </div>
      </div>
      <div id="properties" className={`${card} p-5 scroll-mt-4`}>
        <div className="flex justify-between items-center mb-3.5">
          <div className="text-lg font-bold text-ink">物件の状況</div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className="flex items-center gap-1.5 py-1.5 px-3.5 bg-white border border-field rounded-full text-[13px] text-body cursor-pointer"
            >
              {currentLabel}
              <span className="text-[10px]">▼</span>
            </button>
            {open && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                <div className="absolute right-0 top-full mt-1.5 w-48 bg-white border border-line rounded-md shadow-lg z-20 py-1">
                  {sortOptions.map((o) => (
                    <div
                      key={o.key}
                      onClick={() => {
                        setSortKey(o.key);
                        setOpen(false);
                      }}
                      className={`px-3.5 py-2 text-[13px] cursor-pointer hover:bg-subtle ${o.key === sortKey ? "text-brand font-bold" : "text-body"}`}
                    >
                      {o.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className={`${tableHead} grid-cols-[2.4fr_1fr_1fr]`}>
          <div>物件</div>
          <div>最終分析</div>
          <div>データ不足</div>
        </div>
        {rows.map((p) => (
          <Link key={p.id} href={`/research/result?property=${p.id}`} className="grid grid-cols-[2.4fr_1fr_1fr] gap-2 py-3 px-1 border-b border-divider items-center">
            <div className="flex items-center gap-3">
              <div className="relative w-15 h-15 rounded-md shrink-0 overflow-hidden">
                <Image src="/house.jpg" alt={p.name} fill sizes="56px" style={{ objectFit: "cover" }} />
              </div>
              <div>
                <div className="text-base font-semibold">{p.name}</div>
                <div className="text-sm mt-0.5">{p.priceManYen !== null ? `${p.priceManYen.toLocaleString("ja-JP")}万円` : "―"}</div>
              </div>
            </div>
            <div className="text-sm">{p.lastAnalyzedAt ? formatDate(p.lastAnalyzedAt) : "未分析"}</div>
            <div className="text-base">{p.insufficientCount}件</div>
          </Link>
        ))}
      </div>
    </>
  );
}
