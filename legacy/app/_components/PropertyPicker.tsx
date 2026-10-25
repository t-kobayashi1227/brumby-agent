import Link from "next/link";
import { card } from "../_lib/ui";

// 物件を選ぶ帯（?property=<id> で切り替える画面の上に置く）。印刷では出さない

export default function PropertyPicker({ properties, current, href, children }: { properties: { id: number; name: string }[]; current: number; href: (id: number) => string; children?: React.ReactNode }) {
  return (
    <div className={`${card} p-4 mb-4 flex flex-wrap items-center gap-3 print:hidden`}>
      <div className="text-[13px] font-bold text-ink">物件</div>
      {properties.map((p) => (
        <Link key={p.id} href={href(p.id)} className={`text-[13px] px-3 py-1.5 rounded-md border ${p.id === current ? "border-brand text-brand font-bold" : "border-line text-body"}`}>
          {p.id}. {p.name}
        </Link>
      ))}
      {properties.length === 0 && <Link href="/properties/new" className="text-[13px] text-brand underline">物件を登録する</Link>}
      {children && <div className="ml-auto">{children}</div>}
    </div>
  );
}
