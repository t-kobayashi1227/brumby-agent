"use client";

import { useState } from "react";
import { fieldLabel, input, compTabClass } from "../_lib/ui";

// 競合物件の入力欄（3件まで。設計書 7章、D30）。競合物件の入力画面と、物件の登録・変更のフォームで使う
// 3件分を1つのフォームで送る（タブは見た目の切り替えだけ）。保存は lib/competitors.ts

export interface CompetitorValues {
  position: number;
  priceManYen: number | null;
  location: string | null;
  landSqm: number | null;
  buildingSqm: number | null;
  layout: string | null;
  walkMin: number | null;
  /** 築年数（新築=0）。採点ルール表（D35）の競合比較に使う */
  ageYears: number | null;
  parking: number | null;
  features: string | null;
  sourceType: "portal" | "seen" | "other" | null;
  sourceSite: string | null;
  confirmedOn: string | null;
  enteredBy: string | null;
}

const SITES = ["SUUMO", "アットホーム", "LIFULL HOME'S", "不動産会社のサイト"];
const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export default function CompetitorFields({ competitors }: { competitors: CompetitorValues[] }) {
  const [tab, setTab] = useState(1);
  const byPosition = (p: number) => competitors.find((c) => c.position === p);
  const enteredBy = competitors.find((c) => c.enteredBy)?.enteredBy ?? "";

  return (
    <div>
      <div className="flex gap-1.5 mb-4.5">
        {[1, 2, 3].map((p) => (
          <button type="button" key={p} onClick={() => setTab(p)} className={compTabClass(tab === p)}>
            競合物件{p}
            {byPosition(p) ? "（入力済み）" : ""}
          </button>
        ))}
      </div>

      {[1, 2, 3].map((p) => {
        const c = byPosition(p);
        const f = (name: string) => `c${p}_${name}`;
        return (
          // 見えていない枠も送信するため、非表示にするだけで消さない
          <div key={p} className={tab === p ? "grid gap-3" : "hidden"}>
            <div className="grid grid-cols-3 gap-2.5 bg-subtle rounded-md p-3">
              <label className={fieldLabel}>
                どこで見たか
                <select name={f("source_type")} defaultValue={c?.sourceType ?? ""} className={`${input} bg-white`}>
                  <option value="">選んでください</option>
                  <option value="portal">ポータルサイト</option>
                  <option value="seen">現地などで見かけた</option>
                  <option value="other">その他</option>
                </select>
              </label>
              <label className={fieldLabel}>
                参照したサイト名
                <input name={f("source_site")} list="competitor-sites" defaultValue={str(c?.sourceSite)} placeholder="例：SUUMO" className={`${input} bg-white`} />
              </label>
              <label className={fieldLabel}>
                確認日
                <input name={f("confirmed_on")} type="date" defaultValue={str(c?.confirmedOn)} className={`${input} bg-white`} />
              </label>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <label className={fieldLabel}>
                売出価格（万円）
                <input name={f("price")} inputMode="numeric" defaultValue={str(c?.priceManYen)} className={input} />
              </label>
              <label className={fieldLabel}>
                所在地（町名まで）
                <input name={f("location")} defaultValue={str(c?.location)} placeholder="例：新潟市中央区○○" className={input} />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <label className={fieldLabel}>
                土地面積（㎡）
                <input name={f("land")} inputMode="decimal" defaultValue={str(c?.landSqm)} className={input} />
              </label>
              <label className={fieldLabel}>
                建物面積（㎡）
                <input name={f("building")} inputMode="decimal" defaultValue={str(c?.buildingSqm)} className={input} />
              </label>
              <label className={fieldLabel}>
                間取り
                <input name={f("layout")} defaultValue={str(c?.layout)} placeholder="例：4LDK" className={input} />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-2.5">
              <label className={fieldLabel}>
                築年数（新築は0）
                <input name={f("age")} inputMode="numeric" defaultValue={str(c?.ageYears)} className={input} />
              </label>
              <label className={fieldLabel}>
                駅徒歩（分）
                <input name={f("walk")} inputMode="numeric" defaultValue={str(c?.walkMin)} className={input} />
              </label>
              <label className={fieldLabel}>
                駐車場（台）
                <input name={f("parking")} inputMode="numeric" defaultValue={str(c?.parking)} className={input} />
              </label>
            </div>
            <label className={fieldLabel}>
              特徴（自分の言葉で）
              <textarea name={f("features")} defaultValue={str(c?.features)} rows={3} className={`${input} resize-none`} />
            </label>
          </div>
        );
      })}
      <datalist id="competitor-sites">
        {SITES.map((s) => <option key={s} value={s} />)}
      </datalist>

      <label className={`${fieldLabel} block mt-4 max-w-72`}>
        入力した人
        <input name="entered_by" defaultValue={enteredBy} placeholder="例：クラウドネイチャー 小林" className={input} />
      </label>
    </div>
  );
}
