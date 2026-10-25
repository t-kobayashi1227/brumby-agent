"use client";

import { startTransition, useActionState, useState } from "react";
import { FLOORS, PROPERTY_CLASSES, RENOVATION_PARTS, TRANSPORT_MODES } from "../../../lib/property";
import { btnPrimary, btnSecondary, card, fieldLabel, input } from "../../_lib/ui";
import { saveProperty, type PropertyFormState } from "./actions";

// ①物件情報の入力フォーム（docs/設計まとめ.md「①物件情報の入力」の15項目）
// 見た目は前の設計のフォーム（legacy/app/(app)/properties/PropertyForm.tsx）を流用している
// - 交通：1つ目を入れると2つ目の欄が使える
// - リフォーム：「あり」を選ぶと、年と箇所の欄が出る
// - 競合物件：「競合物件を追加」で行が増え、行ごとに消せる

export interface TransportValues {
  mode: string;
  line: string | null;
  stop_name: string;
  walk_min: number;
}

export interface CompetitorValues {
  price_man_yen: number | null;
  address: string | null;
  building_sqm: number | null;
  land_sqm: number | null;
  building_age: number | null;
}

export interface PropertyValues {
  id?: number;
  property_class: string;
  price_man_yen: number | null;
  address: string;
  layout: string;
  building_sqm: number | null;
  land_sqm: number | null;
  parking: number | null;
  building_age: number | null;
  floors: string;
  has_garden: boolean | null;
  renovated: boolean | null;
  renovation_year: number | null;
  renovation_parts: string[] | null;
  features: string | null;
  ad_budget_man_yen: number | null;
  transports: TransportValues[];
  competitors: CompetitorValues[];
}

const EMPTY: PropertyValues = {
  property_class: "",
  price_man_yen: null,
  address: "",
  layout: "",
  building_sqm: null,
  land_sqm: null,
  parking: null,
  building_age: null,
  floors: "",
  has_garden: null,
  renovated: null,
  renovation_year: null,
  renovation_parts: null,
  features: null,
  ad_budget_man_yen: null,
  transports: [],
  competitors: [],
};

const EMPTY_COMPETITOR: CompetitorValues = { price_man_yen: null, address: null, building_sqm: null, land_sqm: null, building_age: null };

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const yesNo = (v: boolean | null) => (v === null ? "" : v ? "あり" : "なし");

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

const Required = () => <span className="text-[#b91c1c]">*</span>;

function TransportRow({ position, values, disabled, onFilled }: { position: 1 | 2; values?: TransportValues; disabled?: boolean; onFilled?: (filled: boolean) => void }) {
  const name = (k: string) => `t${position}_${k}`;
  return (
    <fieldset disabled={disabled} className={`grid grid-cols-2 lg:grid-cols-[120px_1fr_1fr_110px] gap-3.5 ${disabled ? "opacity-50" : ""}`}>
      <label className={fieldLabel}>
        種類 {position === 1 && <Required />}
        <select name={name("mode")} defaultValue={values?.mode ?? ""} className={`${input} bg-white`} onChange={(e) => onFilled?.(e.target.value !== "")}>
          <option value="">選ぶ</option>
          {TRANSPORT_MODES.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      <label className={fieldLabel}>
        路線名
        <input name={name("line")} defaultValue={str(values?.line)} placeholder="例：JR越後線／新潟交通バス" className={input} />
      </label>
      <label className={fieldLabel}>
        駅またはバス停の名前 {position === 1 && <Required />}
        <input name={name("stop_name")} defaultValue={str(values?.stop_name)} placeholder="例：寺尾駅／寺尾小学校前" className={input} onChange={(e) => onFilled?.(e.target.value.trim() !== "")} />
      </label>
      <label className={fieldLabel}>
        徒歩（分） {position === 1 && <Required />}
        <input name={name("walk_min")} inputMode="numeric" defaultValue={str(values?.walk_min)} placeholder="例：3" className={input} />
      </label>
    </fieldset>
  );
}

export default function PropertyForm({ values = EMPTY }: { values?: PropertyValues }) {
  const [state, formAction, pending] = useActionState<PropertyFormState, FormData>(saveProperty, {});
  const v = values;
  const [firstTransportFilled, setFirstTransportFilled] = useState(v.transports.length > 0);
  const [renovated, setRenovated] = useState(v.renovated === true);
  const [competitors, setCompetitors] = useState<(CompetitorValues & { key: number })[]>(v.competitors.map((c, i) => ({ ...c, key: i })));
  const [nextKey, setNextKey] = useState(v.competitors.length);

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

      <Section title="物件の基本" note="住所は番地まで入れてください。保存すると国土地理院の住所検索で位置を取り、物件の画面の地図で確かめられます">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
          <label className={fieldLabel}>
            物件区分 <Required />
            <select name="property_class" defaultValue={v.property_class} required className={`${input} bg-white`}>
              <option value="">選ぶ</option>
              {PROPERTY_CLASSES.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className={fieldLabel}>
            価格（万円） <Required />
            <input name="price_man_yen" inputMode="numeric" required defaultValue={str(v.price_man_yen)} placeholder="例：2480" className={input} />
          </label>
        </div>
        <label className={fieldLabel}>
          住所 <Required />
          <input name="address" required defaultValue={v.address} placeholder="例：新潟市西区寺尾東3丁目12-5" className={input} />
        </label>
      </Section>

      <Section title="交通" note="物件資料の「新潟交通バス「○○」停 徒歩3分」をそのまま移せる形です。1つ目を入れると2つ目が使えます">
        <TransportRow position={1} values={v.transports[0]} onFilled={(f) => f && setFirstTransportFilled(true)} />
        <TransportRow position={2} values={v.transports[1]} disabled={!firstTransportFilled} />
      </Section>

      <Section title="建物・土地">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <label className={fieldLabel}>
            間取り <Required />
            <input name="layout" required defaultValue={v.layout} placeholder="例：4LDK+S" className={input} />
          </label>
          <label className={fieldLabel}>
            建物面積（㎡） <Required />
            <input name="building_sqm" inputMode="decimal" required defaultValue={str(v.building_sqm)} className={input} />
          </label>
          <label className={fieldLabel}>
            土地面積（㎡） <Required />
            <input name="land_sqm" inputMode="decimal" required defaultValue={str(v.land_sqm)} className={input} />
          </label>
          <label className={fieldLabel}>
            駐車台数（台） <Required />
            <input name="parking" inputMode="numeric" required defaultValue={str(v.parking)} className={input} />
          </label>
          <label className={fieldLabel}>
            築年数（年） <Required />
            <input name="building_age" inputMode="numeric" required defaultValue={str(v.building_age)} placeholder="新築は0" className={input} />
          </label>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3.5">
          <label className={fieldLabel}>
            階数 <Required />
            <select name="floors" defaultValue={v.floors} required className={`${input} bg-white`}>
              <option value="">選ぶ</option>
              {FLOORS.map((f) => <option key={f}>{f}</option>)}
            </select>
          </label>
          <label className={fieldLabel}>
            庭 <Required />
            <select name="has_garden" defaultValue={yesNo(v.has_garden)} required className={`${input} bg-white`}>
              <option value="">選ぶ</option>
              <option>あり</option>
              <option>なし</option>
            </select>
          </label>
          <label className={fieldLabel}>
            リフォーム <Required />
            <select name="renovated" defaultValue={yesNo(v.renovated)} required className={`${input} bg-white`} onChange={(e) => setRenovated(e.target.value === "あり")}>
              <option value="">選ぶ</option>
              <option>あり</option>
              <option>なし</option>
            </select>
          </label>
          {renovated && (
            <label className={fieldLabel}>
              リフォームの年 <Required />
              <input name="renovation_year" inputMode="numeric" defaultValue={str(v.renovation_year)} placeholder="例：2023" className={input} />
            </label>
          )}
        </div>
        {renovated && (
          <div className={fieldLabel}>
            リフォームの箇所（複数選べます） <Required />
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-1.5">
              {RENOVATION_PARTS.map((p) => (
                <label key={p} className="flex items-center gap-1.5 text-[13px] text-body">
                  <input type="checkbox" name="renovation_parts" value={p} defaultChecked={v.renovation_parts?.includes(p)} /> {p}
                </label>
              ))}
            </div>
          </div>
        )}
      </Section>

      <Section title="特徴ピックアップ（任意）" note="物件資料のまとめ書きのまま貼ってください。そのままエージェントに渡します。氏名・連絡先は書かないでください">
        <textarea name="features" defaultValue={str(v.features)} rows={4} placeholder="例：シャッター車庫あり、南向きリビング、2023年キッチン・浴室リフォーム済み" className={input} />
      </Section>

      <Section title="競合物件（任意）" note="入力があれば、区の平均に加えて競合とも比べます。住所から位置を出し、物件との直線距離も事実にします。空の行は保存しません">
        <input type="hidden" name="competitor_count" value={competitors.length} />
        {competitors.map((c, i) => (
          <div key={c.key} className="grid grid-cols-2 lg:grid-cols-[110px_1fr_110px_110px_90px_auto] gap-3.5 items-end">
            <label className={fieldLabel}>
              価格（万円）
              <input name={`c${i}_price_man_yen`} inputMode="numeric" defaultValue={str(c.price_man_yen)} className={input} />
            </label>
            <label className={fieldLabel}>
              住所
              <input name={`c${i}_address`} defaultValue={str(c.address)} placeholder="例：新潟市西区寺尾東2丁目" className={input} />
            </label>
            <label className={fieldLabel}>
              建物面積（㎡）
              <input name={`c${i}_building_sqm`} inputMode="decimal" defaultValue={str(c.building_sqm)} className={input} />
            </label>
            <label className={fieldLabel}>
              土地面積（㎡）
              <input name={`c${i}_land_sqm`} inputMode="decimal" defaultValue={str(c.land_sqm)} className={input} />
            </label>
            <label className={fieldLabel}>
              築年数（年）
              <input name={`c${i}_building_age`} inputMode="numeric" defaultValue={str(c.building_age)} className={input} />
            </label>
            <button type="button" onClick={() => setCompetitors(competitors.filter((x) => x.key !== c.key))} className={`${btnSecondary} !px-3 !py-2`}>
              消す
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            onClick={() => {
              setCompetitors([...competitors, { ...EMPTY_COMPETITOR, key: nextKey }]);
              setNextKey(nextKey + 1);
            }}
            className={btnSecondary}
          >
            ＋ 競合物件を追加
          </button>
        </div>
      </Section>

      <Section title="広告予算の総額（任意）" note="入力があれば、エージェントが決めた媒体の配分（%）から、媒体ごとの金額をシステムが計算して表示します">
        <label className={`${fieldLabel} max-w-[220px]`}>
          総額（万円）
          <input name="ad_budget_man_yen" inputMode="numeric" defaultValue={str(v.ad_budget_man_yen)} placeholder="例：30" className={input} />
        </label>
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
