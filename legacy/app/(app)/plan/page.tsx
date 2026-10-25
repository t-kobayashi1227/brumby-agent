"use client";

import { useState } from "react";
import Image from "next/image";
import { FutureFeatureNotice } from "../../_components/Notes";
import { planDefs } from "../../_lib/data";
import { planCardClass, planButtonClass } from "../../_lib/ui";

// Icons are pre-resized to 224px (2x the 112px display size) and served as-is, bypassing the image optimizer.
const planImages: Record<string, string> = {
  spot: "/plan/spot_plan.png",
  strategy: "/plan/strategy_plan.png",
  monitor: "/plan/monitor_plan.png",
};

export default function PlanPage() {
  const [selectedPlan, setSelectedPlan] = useState<string | null>(null);
  const [optionExpanded, setOptionExpanded] = useState(false);

  return (
    <>
      <FutureFeatureNotice />
      <div className="flex items-baseline gap-3 mb-4.5">
        <div className="text-base font-extrabold text-ink">ご利用プラン</div>
        <div className="text-[11px] text-muted">料金は仮置きです</div>
      </div>
      <div className="grid grid-cols-3 gap-4 mb-5.5">
        {planDefs.map((p) => {
          const selected = selectedPlan === p.key;
          const imageSrc = planImages[p.key];
          return (
            <div key={p.key} className={planCardClass(selected)}>
              <div className="text-sm font-extrabold text-ink mb-3">{p.name}</div>
              {imageSrc && (
                <Image src={imageSrc} alt={p.name} width={112} height={112} unoptimized loading="eager" className="block size-28 mx-auto mb-3 object-contain" />
              )}
              <div className="text-[13px] text-body mb-4">{p.desc}</div>
              <div className="text-xl font-extrabold text-ink mb-4">{p.price}</div>
              <button onClick={() => setSelectedPlan(p.key)} className={planButtonClass(selected)}>
                {selected ? "選択中 ✓" : "申し込む"}
              </button>
            </div>
          );
        })}
      </div>
      <div className="bg-[#fff8e6] border border-[#f0dba1] rounded-[10px] py-4.5 px-5 flex justify-between items-center gap-4 flex-wrap">
        <div className="flex items-center gap-3.5">
          <Image src="/plan/brumby_plan.png" alt="BRUMBY販売ウォッチ" width={112} height={112} unoptimized loading="eager" className="size-28 shrink-0 object-contain" />
          <div>
            <div className="text-[13px] font-bold text-[#7a5c1e] mb-1">オプション：BRUMBY販売ウォッチ（モニター代行）</div>
            <div className="text-xs text-[#8a6c2e]">競合調査・反響確認・定期レポートを弊社にて代行します。</div>
            {optionExpanded && (
              <div className="text-xs text-[#8a6c2e] mt-2">競合物件の入力・更新（週1回）、反響の入力、月次レポートの送付をBRUMBYの担当者が代行します。</div>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-xl font-extrabold text-ink">月額 20,000円〜（税別）</div>
          <button
            onClick={() => setOptionExpanded((v) => !v)}
            className="py-[9px] px-4 bg-white border border-[#f0dba1] rounded-md text-[#7a5c1e] text-[13px] font-bold cursor-pointer whitespace-nowrap"
          >
            詳しく見る
          </button>
        </div>
      </div>
    </>
  );
}
