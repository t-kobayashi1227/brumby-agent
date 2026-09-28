"use client";

import { useState } from "react";
import Link from "next/link";
import { compData } from "../../../_lib/data";
import { card, fieldLabel, input, btnPrimary, btnSecondary, compTabClass } from "../../../_lib/ui";

export default function ResearchDetailPage() {
  const [tab, setTab] = useState(0);
  const activeComp = compData[tab];
  return (
    <div className={`${card} p-6 max-w-[640px]`}>
      <div className="text-sm font-bold text-ink mb-1">気になる競合物件（最大3件）</div>
      <div className="text-[11px] text-muted mb-3.5">価格・間取りなどの条件だけを入力します（ポータルサイトの写真や文章は転載しません）。</div>
      <div className="flex gap-1.5 mb-4.5">
        {compData.map((_, i) => (
          <div key={i} onClick={() => setTab(i)} className={compTabClass(tab === i)}>
            競合物件{i + 1}
          </div>
        ))}
      </div>
      <div key={tab}>
        <div className="grid gap-3">
          <div>
            <label className={fieldLabel}>販売価格（万円）</label>
            <input defaultValue={activeComp.price} className={input} />
          </div>
          <div>
            <label className={fieldLabel}>所在地</label>
            <input defaultValue={activeComp.location} className={input} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={fieldLabel}>土地面積㎡</label>
              <input defaultValue={activeComp.land} className={input} />
            </div>
            <div>
              <label className={fieldLabel}>建物面積㎡</label>
              <input defaultValue={activeComp.building} className={input} />
            </div>
          </div>
          <div>
            <label className={fieldLabel}>間取り</label>
            <input defaultValue={activeComp.layout} className={input} />
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className={fieldLabel}>駅徒歩（分）</label>
              <input defaultValue={activeComp.walk} className={input} />
            </div>
            <div>
              <label className={fieldLabel}>駐車場（台）</label>
              <input defaultValue={activeComp.parking} placeholder="未入力" className={input} />
            </div>
          </div>
          <div>
            <label className={fieldLabel}>特徴</label>
            <textarea defaultValue={activeComp.features} rows={3} className={`${input} resize-none`} />
          </div>
        </div>
      </div>
      <div className="flex justify-between mt-6">
        <Link href="/research/input" className={btnSecondary}>
          戻る
        </Link>
        <Link href="/research/result" className={btnPrimary}>
          この内容でAI分析する
        </Link>
      </div>
    </div>
  );
}
