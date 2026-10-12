import Link from "next/link";
import { stepClass } from "../_lib/ui";

// 物件の登録から販売戦略までの段階（登録 → 位置 → 周辺の情報 → 分析）。いまの段階と、済んだ段階を出す。印刷では出さない

export type PropertyStep = "register" | "location" | "surroundings" | "analysis";

const STEPS: { key: PropertyStep; label: string; href: (id: number) => string }[] = [
  { key: "register", label: "物件の登録", href: (id) => `/properties/${id}` },
  { key: "location", label: "位置の確認", href: (id) => `/properties/${id}` },
  { key: "surroundings", label: "周辺の情報", href: (id) => `/properties/${id}` },
  { key: "analysis", label: "分析・販売戦略", href: (id) => `/strategy?property=${id}` },
];

const doneClass = "px-4 py-2 rounded-md text-xs font-bold bg-[#e9f8ec] text-[#157347] border border-[#bfe5c6]";

export default function PropertySteps({ current, propertyId, done = {} }: { current: PropertyStep; propertyId?: number; done?: Partial<Record<PropertyStep, boolean>> }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4 print:hidden">
      {STEPS.map((s, i) => {
        const active = s.key === current;
        const className = !active && done[s.key] ? doneClass : stepClass(active);
        const label = `${i + 1}. ${s.label}${!active && done[s.key] ? " ✓" : ""}`;
        return propertyId && !active ? (
          <Link key={s.key} href={s.href(propertyId)} className={className}>
            {label}
          </Link>
        ) : (
          <div key={s.key} className={className}>
            {label}
          </div>
        );
      })}
    </div>
  );
}
