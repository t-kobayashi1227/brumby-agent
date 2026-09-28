"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import StatusBadge from "../../_components/StatusBadge";
import { ManualEntryNote } from "../../_components/Notes";
import { kpis, properties, type PropertyItem } from "../../_lib/data";
import { card, tableHead } from "../../_lib/ui";

type SortKey = "default" | "days" | "inquiries" | "tours";

const sortOptions: { key: SortKey; label: string }[] = [
  { key: "default", label: "登録順" },
  { key: "days", label: "販売期間が長い順" },
  { key: "inquiries", label: "問合せが多い順" },
  { key: "tours", label: "見学が多い順" },
];

export default function DashboardPage() {
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [open, setOpen] = useState(false);

  const rows = properties.map((p, id) => ({ p, id }));
  if (sortKey !== "default") {
    rows.sort((a, b) => (b.p[sortKey as keyof PropertyItem] as number) - (a.p[sortKey as keyof PropertyItem] as number));
  }
  const currentLabel = sortOptions.find((o) => o.key === sortKey)?.label ?? "登録順";

  return (
    <>
      <div className="grid grid-cols-4 gap-4 mb-5">
        {kpis.map((k, i) => (
          <div key={i} className={`${card} py-4 px-4.5`}>
            <div className="text-[13px]  mb-2">{k.label}</div>
            <div className="text-2xl font-extrabold text-ink">{k.value}</div>
            <div className="text-xs font-bold text-[#1a8a4a] mt-1.5">{k.delta}</div>
            {k.manual && <ManualEntryNote className="block mt-1" />}
          </div>
        ))}
      </div>
      <div id="properties" className={`${card} p-5 scroll-mt-4`}>
        <div className="flex justify-between items-center mb-3.5">
          <div className="flex items-baseline gap-3">
            <div className="text-lg font-bold text-ink">販売中物件の状況</div>
            <span className="text-[11px] text-muted">
              問合せ・見学は今月の件数（<ManualEntryNote />）
            </span>
          </div>
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
                      className={`px-3.5 py-2 text-[13px] cursor-pointer hover:bg-subtle ${
                        o.key === sortKey ? "text-brand font-bold" : "text-body"
                      }`}
                    >
                      {o.label}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
        <div className={`${tableHead} grid-cols-[2.4fr_1fr_1fr_1fr_1fr]`}>
          <div>物件</div>
          <div>販売期間</div>
          <div>問合せ</div>
          <div>見学</div>
          <div>AI診断</div>
        </div>
        {rows.map(({ p, id }) => (
          <Link
            key={id}
            href={`/monitor/${id}`}
            className="grid grid-cols-[2.4fr_1fr_1fr_1fr_1fr] gap-2 py-3 px-1 border-b border-divider items-center"
          >
            <div className="flex items-center gap-3">
              <div className="relative w-15 h-15 rounded-md shrink-0 overflow-hidden">
                <Image src="/house.jpg" alt={p.name} fill sizes="56px" style={{ objectFit: "cover" }} />
              </div>
              <div>
                <div className="text-base font-semibold">{p.name}</div>
                <div className="text-sm mt-0.5">{p.price}</div>
              </div>
            </div>
            <div className="text-base">{p.days}日</div>
            <div className="text-base">{p.inquiries}</div>
            <div className="text-base">{p.tours}</div>
            <div>
              <StatusBadge status={p.status} />
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
