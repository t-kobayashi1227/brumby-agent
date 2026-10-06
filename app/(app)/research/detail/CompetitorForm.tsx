"use client";

import { startTransition, useActionState, useState } from "react";
import Link from "next/link";
import { card, fieldLabel, input, btnPrimary, btnSecondary, compTabClass } from "../../../_lib/ui";
import { saveCompetitors, type CompetitorFormState } from "../actions";

// 競合物件の入力（3件まで。設計書 7章、D30）。3件分を1つのフォームで保存する（タブは見た目の切り替えだけ）
// すべて空の枠は保存しない（前に入れた分は消える）。競合は未入力でも分析できる

export interface CompetitorValues {
  position: number;
  priceManYen: number | null;
  location: string | null;
  landSqm: number | null;
  buildingSqm: number | null;
  layout: string | null;
  walkMin: number | null;
  parking: number | null;
  features: string | null;
  sourceType: "portal" | "seen" | "other" | null;
  sourceSite: string | null;
  confirmedOn: string | null;
  enteredBy: string | null;
}

const SITES = ["SUUMO", "アットホーム", "LIFULL HOME'S", "不動産会社のサイト"];
const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));

export default function CompetitorForm({ propertyId, competitors }: { propertyId: number; competitors: CompetitorValues[] }) {
  const [state, formAction, pending] = useActionState<CompetitorFormState, FormData>(saveCompetitors, {});
  const [tab, setTab] = useState(1);
  const byPosition = (p: number) => competitors.find((c) => c.position === p);
  const enteredBy = competitors.find((c) => c.enteredBy)?.enteredBy ?? "";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className={`${card} p-6 max-w-[720px]`}
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="text-sm font-bold text-ink mb-1">気になる競合物件（最大3件）</div>
      <div className="text-[11px] text-muted mb-3.5">
        価格・間取りなどの条件と、自分の言葉で書いた特徴だけを入力します（ポータルサイトの写真や文章は転載しません）。空の枠は保存しません。
      </div>
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
            <div className="grid grid-cols-2 gap-2.5">
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

      <div className="flex flex-wrap items-center gap-3 mt-5">
        {state.error && <div className="w-full rounded-md border border-[#f3c4c4] bg-[#fdecec] px-3 py-2 text-xs text-[#b91c1c]">{state.error}</div>}
        {state.ok && <div className="w-full rounded-md border border-[#bfe5c6] bg-[#e9f8ec] px-3 py-2 text-xs text-[#157347]">{state.ok}</div>}
        <Link href={`/research?property=${propertyId}`} className={btnSecondary}>
          戻る
        </Link>
        <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-60 ml-auto`}>
          {pending ? "保存中…" : "保存する"}
        </button>
        <Link href={`/strategy?property=${propertyId}`} className={btnSecondary}>
          分析へ進む（競合は未入力でもよい）→
        </Link>
      </div>
    </form>
  );
}
