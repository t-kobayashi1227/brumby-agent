"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { card, tableHead } from "../../_lib/ui";
import DeletePropertyButton from "../properties/DeletePropertyButton";

// 販売戦略（/strategy）の物件の一覧。/dashboard と同じ表の形にし、物件が増えても見やすくする
// 物件を選ぶと ?property=<id> で販売戦略を開く。写真は物件の画面で登録したもの（なければ共通の仮画像）

export interface PropertyListItem {
  id: number;
  name: string;
  propertyType: string;
  priceManYen: number | null;
  address: string;
  /** 物件の写真。なければ共通の仮画像 */
  photoUrl: string;
  layout: string | null;
  hasLocation: boolean;
  lastAnalyzedAt: string | null;
  insufficientCount: number;
  topTarget: { label: string; score: number; max: number | null; targetImage: string | null } | null;
  salability: string | null;
  totalBudgetManYen: number | null;
}

type SortKey = "default" | "lastAnalyzedAt" | "priceDesc" | "score";

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "default", label: "登録順" },
  { key: "lastAnalyzedAt", label: "分析が新しい順" },
  { key: "priceDesc", label: "価格が高い順" },
  { key: "score", label: "第1ターゲットの点が高い順" },
];

const SALABILITY_CLASS: Record<string, string> = {
  売れやすい: "bg-[#dcf5df] text-[#157347]",
  標準: "bg-primary-soft text-primary",
  売れにくい: "bg-[#fde2e1] text-[#b91c1c]",
};

const COLS = "grid-cols-[2.6fr_0.9fr_1.9fr_1fr_1fr]";

const formatDate = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/** 位置がある物件は販売戦略を開き、位置がない物件は物件の画面で位置を決める */
const hrefOf = (p: PropertyListItem) => (p.hasLocation ? `/strategy?property=${p.id}` : `/properties/${p.id}`);

export default function PropertyList({ properties }: { properties: PropertyListItem[] }) {
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [open, setOpen] = useState(false);

  const rows = [...properties];
  if (sortKey === "lastAnalyzedAt") rows.sort((a, b) => (b.lastAnalyzedAt ?? "").localeCompare(a.lastAnalyzedAt ?? ""));
  if (sortKey === "priceDesc") rows.sort((a, b) => (b.priceManYen ?? -1) - (a.priceManYen ?? -1));
  if (sortKey === "score") rows.sort((a, b) => (b.topTarget?.score ?? -1) - (a.topTarget?.score ?? -1));
  const currentLabel = sortOptions.find((o) => o.key === sortKey)?.label ?? "登録順";
  const analyzed = properties.filter((p) => p.lastAnalyzedAt !== null).length;

  return (
    <div className={`${card} p-5`}>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-3.5">
        <div>
          <div className="text-lg font-bold text-ink">販売戦略を見る物件を選んでください</div>
          <div className="text-xs text-muted mt-0.5">
            {properties.length}件（分析済み {analyzed}件）
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/properties/new" className="py-1.5 px-3.5 rounded-full border border-brand text-brand text-[13px] font-bold">
            ＋ 物件を登録する
          </Link>
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
                <div className="absolute right-0 top-full mt-1.5 w-56 bg-white border border-line rounded-md shadow-lg z-20 py-1">
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
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[930px]">
          <div className={`${tableHead} grid grid-cols-[minmax(0,1fr)_70px] gap-2`}>
            <div className={`grid ${COLS} gap-2`}>
              <div>物件</div>
              <div>価格</div>
              <div>第1ターゲット</div>
              <div>売れやすさ・予算</div>
              <div>最終分析</div>
            </div>
            <div>操作</div>
          </div>
          {rows.length === 0 && <div className="py-8 text-center text-[13px] text-muted">物件がありません。</div>}
          {rows.map((p) => (
            <div key={p.id} className="grid grid-cols-[minmax(0,1fr)_70px] gap-2 border-b border-divider items-center hover:bg-subtle">
              <Link href={hrefOf(p)} aria-label={`${p.name}を開く`} className={`grid ${COLS} gap-2 py-3 px-1 items-center`}>
              <div className="flex items-center gap-3 min-w-0">
                <div className="relative w-15 h-15 rounded-md shrink-0 overflow-hidden">
                  <Image src={p.photoUrl} alt={p.name} fill sizes="60px" style={{ objectFit: "cover" }} />
                </div>
                <div className="min-w-0">
                  <div className="text-base font-semibold text-ink truncate">{p.name}</div>
                  <div className="text-xs text-muted mt-0.5 truncate" title={p.address}>
                    {p.address}
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">{[p.propertyType, p.layout].filter(Boolean).join("・")}</div>
                </div>
              </div>
              <div className="text-sm font-bold text-ink">{p.priceManYen !== null ? `${p.priceManYen.toLocaleString("ja-JP")}万円` : "―"}</div>
              <div className="text-sm min-w-0">
                {p.topTarget ? (
                  <>
                    <div className="truncate">
                      {p.topTarget.label}
                      <span className="ml-1.5 font-bold text-primary">
                        {p.topTarget.max === 100 || p.topTarget.max === null ? `${p.topTarget.score}点` : `${p.topTarget.score}/${p.topTarget.max}点`}
                      </span>
                    </div>
                    {p.topTarget.targetImage && <div className="text-[11px] text-muted truncate">{p.topTarget.targetImage}</div>}
                  </>
                ) : (
                  <span className="text-muted">―</span>
                )}
              </div>
              <div className="text-sm">
                {p.salability ? <span className={`inline-block px-2 py-0.5 rounded text-[11px] font-bold ${SALABILITY_CLASS[p.salability] ?? "bg-divider text-muted"}`}>{p.salability}</span> : <span className="text-muted">―</span>}
                {p.totalBudgetManYen !== null && <div className="text-[11px] text-muted mt-0.5">広告予算 {p.totalBudgetManYen}万円</div>}
              </div>
              <div className="text-sm">
                {p.lastAnalyzedAt ? (
                  <>
                    <div>{formatDate(p.lastAnalyzedAt)}</div>
                    {p.insufficientCount > 0 && <div className="text-[11px] text-[#92610d] mt-0.5">データ不足 {p.insufficientCount}件</div>}
                  </>
                ) : (
                  <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${p.hasLocation ? "bg-[#fef3c2] text-[#92610d]" : "bg-divider text-muted"}`}>
                    {p.hasLocation ? "未分析" : "位置が未設定"}
                  </span>
                )}
              </div>
              </Link>
              <DeletePropertyButton propertyId={p.id} name={p.name} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
