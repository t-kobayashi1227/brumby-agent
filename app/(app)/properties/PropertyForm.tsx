"use client";

import { startTransition, useActionState, useRef } from "react";
import { PROPERTY_TYPES } from "../../../lib/rules/describe";
import { ITEM_LABEL, MANUAL_METRIC_KEYS } from "../../../lib/scoring/constants";
import { card, fieldLabel, input, btnPrimary } from "../../_lib/ui";
import { saveProperty, type PropertyFormState } from "./actions";
import PhotoField, { type PhotoChange } from "./PhotoField";

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
  /** 採点ルール表（D35）に使う値 */
  age_years: number | null;
  rooms: number | null;
  is_hiraya: boolean | null;
  has_garden: boolean | null;
  ward: string | null;
  town: string | null;
  manual_metrics: Record<string, number> | null;
  /** 今の写真の URL（写真がなければ null。DB の列ではない） */
  photo_url?: string | null;
}

/** 新潟市の8区（採点ルール表の相場・エリア人気は区ごと） */
const WARDS = ["北区", "東区", "中央区", "江南区", "秋葉区", "南区", "西区", "西蒲区"];

/** 手入力の欄の単位と例 */
const MANUAL_HINT: Record<string, string> = {
  バス停_m: "m（例：250）",
  スーパー_m: "m（例：480）",
  病院_m: "m（例：1200）",
  公園_m: "m（例：320）",
  駅_m: "m。空欄なら自動（直線）",
  小学校_m: "m。空欄なら自動（直線）",
  保育園_800m内: "か所。空欄なら自動",
  子あり世帯比率_市比: "市平均=1。空欄なら自動",
  高齢者比率_市比: "市平均=1。空欄なら自動",
  単身世帯比率_市比: "市平均=1（例：0.8）",
  子育て世代_5年変化: "1=増減なし（例：1.08）",
  相場_万円: "万円。空欄なら区×築年数の中央値",
};

const boolValue = (v: boolean | null) => (v === null ? "" : v ? "1" : "0");

const EMPTY: PropertyValues = {
  name: "", property_type: "新築戸建", price_man_yen: null, address: "", area_class: null, layout: null, land_sqm: null, building_sqm: null,
  parking: null, access: null, features: null, total_budget_man_yen: null, sales_deadline: null, sales_goal: null,
  age_years: null, rooms: null, is_hiraya: null, has_garden: null, ward: null, town: null, manual_metrics: null,
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
  // 写真は縮めたものを送信のときに入れる（元の大きな写真は送らない）
  const photo = useRef<PhotoChange | null>(null);

  return (
    // action={formAction} にすると、保存に失敗したときも入力が元に戻ってしまう（React の form の自動リセット）ため、送信を自分で行う
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const p = photo.current;
        if (p?.blob) {
          data.set("photo", p.blob, "photo.jpg");
          data.set("photo_width", String(p.width ?? ""));
          data.set("photo_height", String(p.height ?? ""));
        } else if (p?.remove) data.set("photo_remove", "1");
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
        <PhotoField currentUrl={v.photo_url ?? null} onChange={(c) => (photo.current = c)} />
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

      <Section title="採点に使う情報" note="ターゲットの評価（採点ルール表）に使います。空欄の項目は、自動で取れる値を使うか、採点から外して「データなし」と表示します">
        <div className="grid grid-cols-3 lg:grid-cols-6 gap-3.5">
          <label className={fieldLabel}>
            築年数（年）
            <input name="age_years" inputMode="numeric" defaultValue={str(v.age_years)} placeholder="新築は0" className={input} />
          </label>
          <label className={fieldLabel}>
            居室数
            <input name="rooms" inputMode="numeric" defaultValue={str(v.rooms)} placeholder="空欄なら間取りから" className={input} />
          </label>
          <label className={fieldLabel}>
            平屋
            <select name="is_hiraya" defaultValue={boolValue(v.is_hiraya)} className={`${input} bg-white`}>
              <option value="">未入力</option>
              <option value="1">はい</option>
              <option value="0">いいえ</option>
            </select>
          </label>
          <label className={fieldLabel}>
            庭
            <select name="has_garden" defaultValue={boolValue(v.has_garden)} className={`${input} bg-white`}>
              <option value="">未入力</option>
              <option value="1">あり</option>
              <option value="0">なし</option>
            </select>
          </label>
          <label className={fieldLabel}>
            区
            <select name="ward" defaultValue={v.ward ?? ""} className={`${input} bg-white`}>
              <option value="">住所から読む</option>
              {WARDS.map((w) => <option key={w}>{w}</option>)}
            </select>
          </label>
          <label className={fieldLabel}>
            町
            <input name="town" defaultValue={str(v.town)} placeholder="空欄なら住所から" className={input} />
          </label>
        </div>
        <details>
          <summary className="text-xs text-brand font-bold cursor-pointer select-none">周辺の距離・地域の値を手入力する（自動で取れない値・自動の値を直したいとき）</summary>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 mt-3">
            {MANUAL_METRIC_KEYS.map((k) => (
              <label key={k} className={fieldLabel}>
                {ITEM_LABEL[k] ?? k}
                <input name={`m_${k}`} inputMode="decimal" defaultValue={str(v.manual_metrics?.[k] ?? null)} placeholder={MANUAL_HINT[k]} className={input} />
              </label>
            ))}
          </div>
        </details>
      </Section>

      <Section title="販売の条件" note="総予算を空欄にすると、採点ルール表の提案値（物件価格×基準率×売れやすさの倍率）を使います（販売戦略の画面で「入力値／提案値」を区別して表示）">
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
