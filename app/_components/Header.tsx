"use client";

import { usePathname } from "next/navigation";
import { findPage } from "../_lib/routes";

export default function Header() {
  const page = findPage(usePathname());
  const title = page?.title ?? "";
  return (
    <div className="print:hidden h-14 shrink-0 bg-white border-b border-line flex items-center px-6 justify-between">
      <div className="flex items-center gap-2.5">
        <div className="text-base font-bold text-ink">{title}</div>
        {page?.mock && (
          <span className="px-2 py-0.5 rounded-full border border-[#f0d9a8] bg-[#fff8e8] text-[11px] font-bold text-[#8a5a00]">見本の画面（数値は架空。PoCの対象外）</span>
        )}
      </div>
      <div className="flex items-center gap-3">
        <div className="text-xs font-bold text-sub">BRUMBY AI物件販売戦略</div>
        <div className="size-8 rounded-full bg-[#dde3ee] flex items-center justify-center text-xs text-sub font-bold">担</div>
      </div>
    </div>
  );
}
