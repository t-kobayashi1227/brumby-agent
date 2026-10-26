"use client";

import { usePathname } from "next/navigation";
import { findPage } from "../_lib/routes";

export default function Header() {
  const page = findPage(usePathname());
  const title = page && !page.ownHeading ? page.title : "";
  return (
    <div className="print:hidden h-14 shrink-0 flex items-center px-7 justify-between">
      <div className="text-base font-bold text-ink">{title}</div>
      <div className="flex items-center gap-3">
        <div className="text-xs font-bold text-sub">BRUMBY AI物件販売戦略</div>
        <div className="size-8 rounded-full bg-primary-soft flex items-center justify-center text-xs text-primary font-bold">担</div>
      </div>
    </div>
  );
}
