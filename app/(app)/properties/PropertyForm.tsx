"use client";

import { startTransition, useActionState } from "react";
import { PROPERTY_TYPES } from "../../../lib/rules/describe";
import { card, fieldLabel, input, btnPrimary } from "../../_lib/ui";
import { saveProperty, type PropertyFormState } from "./actions";

// 物件の登録・変更のフォーム（設計書 7章、D15）
// 総予算は入力があればそれを使い、空ならルール表の提案値を使う（判断カードに「入力値／提案値」を残す）

export interface PropertyValues {
  id?: number;
  name: string;
  property_type: string;
  price_man_yen: number | null;
  address: string;
  area_class: "center" | "suburb" | "outer" | null;
  layout: string | null;
  land_sqm: number | null;
  building_sqm: number | null;
  parking: number | null;
  access: string | null;
  features: string | null;
  total_budget_man_yen: number | null;
  sales_deadline: string | null;
  sales_goal: string | null;
}

const EMPTY: PropertyValues = {
  name: "", property_type: "新築戸建", price_man_yen: null, address: "", area_class: null, layout: null, land_sqm: null, building_sqm: null,
  parking: null, access: null, features: null, total_budget_man_yen: null, sales_deadline: null, sales_goal: null,
};

/** 販促目的の例（自由に書いてもよい） */
const GOAL_EXAMPLES = ["見学予約を増やしたい", "早く成約したい（販売期限が近い）", "周辺での認知を広げたい", "価格の見直しの判断材料がほしい"];

const str = (v: string | number | null) => (v === null ? "" : String(v));

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3.5">
      <div>
        <div className="text-[15px] font-bold text-ink">{title}</div>
        {note && <div className="text-[11px] text-muted mt-0.5">{note}</div>}
      </div>
      {children}
    </div>
  );
}

export default function PropertyForm({ values = EMPTY }: { values?: PropertyValues }) {
  const [state, formAction, pending] = useActionState<PropertyFormState, FormData>(saveProperty, {});
  const v = values;

  return (
    // action={formAction} にすると、保存に失敗したときも入力が元に戻ってしまう（React の form の自動リセット）ため、送信を自分で行う
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className={`${card} p-6 grid gap-7`}
    >
      {v.id && <input type="hidden" name="id" value={v.id} />}

      <Section title="基本情報" note="物件名と詳しい住所はAIには送りません（物件の番号と町丁目までに丸めて送ります）">
        <label className={fieldLabel}>
          物件名 <span className="text-[#b91c1c]">*</span>
          <input name="name" defaultValue={v.name} required placeholder="例：中央区○○ 新築戸建" className={input} />
        </label>
        <div className="grid grid-cols-3 gap-3.5">
          <label className={fieldLabel}>
            物件種別 <span className="text-[#b91c1c]">*</span>
            <select name="property_type" defaultValue={v.property_type} className={`${input} bg-white`}>
              {PROPERTY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </label>
          <label className={fieldLabel}>
            売出価格（万円）
            <input name="price_man_yen" inputMode="numeric" defaultValue={str(v.price_man_yen)} placeholder="例：3780" className={input} />
          </label>
          <label className={fieldLabel}>
            エリアの区分
            <select name="area_class" defaultValue={v.area_class ?? ""} className={`${input} bg-white`}>
              <option value="">未選択（半径3kmで集計）</option>
              <option value="center">新潟市の中心部（半径1km）</option>
              <option value="suburb">新潟市の郊外（半径3km）</option>
              <option value="outer">周辺の市町村（半径3km）</option>
            </select>
          </label>
        </div>
        <label className={fieldLabel}>
          所在地 <span className="text-[#b91c1c]">*</span>
          <input name="address" defaultValue={v.address} required placeholder="例：新潟市中央区上近江1丁目2-3" className={input} />
          <span className="text-[11px] text-muted">保存すると、国土地理院の住所検索で位置（緯度経度）を取ります。地図のピンで確かめてください</span>
        </label>
      </Section>

      <Section title="建物・設備" note="特徴に書いた設備（ZEH・床暖房など）だけが、AIの文章や訴求に使われます。氏名・連絡先は書かないでください">
        <div className="grid grid-cols-4 gap-3.5">
          <label className={fieldLabel}>
            間取り
            <input name="layout" defaultValue={str(v.layout)} placeholder="例：4LDK" className={input} />
          </label>
          <label className={fieldLabel}>
            土地面積（㎡）
            <input name="land_sqm" inputMode="decimal" defaultValue={str(v.land_sqm)} className={input} />
          </label>
          <label className={fieldLabel}>
            建物面積（㎡）
            <input name="building_sqm" inputMode="decimal" defaultValue={str(v.building_sqm)} className={input} />
          </label>
          <label className={fieldLabel}>
            駐車場（台）
            <input name="parking" inputMode="numeric" defaultValue={str(v.parking)} className={input} />
          </label>
        </div>
        <label className={fieldLabel}>
          交通
          <input name="access" defaultValue={str(v.access)} placeholder="例：越後線 白山駅 徒歩12分" className={input} />
        </label>
        <label className={fieldLabel}>
          特徴
          <textarea name="features" defaultValue={str(v.features)} rows={2} placeholder="例：ZEH仕様、南向き、太陽光発電" className={input} />
        </label>
      </Section>

      <Section title="販売の条件" note="総予算を空欄にすると、ルール表の提案値を使います（販売戦略の画面で「入力値／提案値」を区別して表示）">
        <div className="grid grid-cols-3 gap-3.5">
          <label className={fieldLabel}>
            広告の総予算（万円）
            <input name="total_budget_man_yen" inputMode="numeric" defaultValue={str(v.total_budget_man_yen)} placeholder="空欄ならルールの提案値" className={input} />
          </label>
          <label className={fieldLabel}>
            販売期限
            <input name="sales_deadline" type="date" defaultValue={str(v.sales_deadline)} className={input} />
          </label>
          <label className={fieldLabel}>
            販促目的
            <input name="sales_goal" list="sales-goal-examples" defaultValue={str(v.sales_goal)} placeholder="例：見学予約を増やしたい" className={input} />
            <datalist id="sales-goal-examples">
              {GOAL_EXAMPLES.map((g) => <option key={g} value={g} />)}
            </datalist>
          </label>
        </div>
      </Section>

      <div className="flex items-center justify-end gap-3">
        {state.error && <div className="mr-auto rounded-md border border-[#f3c4c4] bg-[#fdecec] px-3 py-2 text-xs text-[#b91c1c]">{state.error}</div>}
        {state.ok && <div className="mr-auto rounded-md border border-[#bfe5c6] bg-[#e9f8ec] px-3 py-2 text-xs text-[#157347]">{state.ok}</div>}
        <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-60`}>
          {pending ? "保存中…" : v.id ? "保存する" : "登録する"}
        </button>
      </div>
    </form>
  );
}
