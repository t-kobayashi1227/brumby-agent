"use client";

import { usePathname, useRouter } from "next/navigation";
import { pages, findPage } from "../_lib/routes";

/** Demo-only bar for jumping straight to any page. Not part of the real product UI. */
/** 架空のデータのモック（設計書 D27）は選択肢に出さない。URLを直接開いたときだけ表示される */
export default function PrototypeNav() {
  const router = useRouter();
  const page = findPage(usePathname());
  const current = page && !page.mock && pages.some((p) => p.href === page.href) ? page.href : "";
  return (
    <div className="bg-night text-[#c9d3e3] px-5 py-1.5 flex items-center gap-3.5 text-xs flex-wrap">
      <span className="opacity-70">プロトタイプ画面ジャンプ:</span>
      <select
        value={current}
        onChange={(e) => router.push(e.target.value)}
        className="bg-[#1f2f4d] text-white border border-[#33456b] rounded-md px-2 py-1 text-xs"
      >
        {current === "" && <option value="">（ナビにない画面）</option>}
        {pages.filter((p) => !p.mock).map((p) => (
          <option key={p.href} value={p.href}>
            {p.title}
          </option>
        ))}
      </select>
      <span className="opacity-55">※デモ用のショートカットです（実際の画面には表示されません）</span>
    </div>
  );
}
