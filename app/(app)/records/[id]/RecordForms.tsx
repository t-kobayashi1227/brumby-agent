"use client";

import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import { BUYER_AGE_BANDS, OTHER_MEDIA, SALE_STATUSES } from "../../../../lib/records";
import { ChartIcon, PencilIcon, PlusIcon, TrashIcon, UsersIcon } from "../../../_components/icons";
import { btnAction } from "../../../_lib/ui";
import { deleteMediaResult, saveMediaResult, saveSalesRecord, type RecordFormState } from "../actions";

// 販売の記録の入力（docs/設計まとめ.md「販売の記録」）
// 送るときは onSubmit から action を呼ぶ（form の action に渡すと、誤りがあったときも入力が消えるため）
// 欄の name は保存の処理（lib/records.ts）が読む名前のまま変えない

export interface SalesRecordValues {
  status: string;
  listed_on: string | null;
  list_price_man_yen: number | null;
  price_cut_count: number;
  final_price_man_yen: number | null;
  contracted_on: string | null;
  contract_price_man_yen: number | null;
  buyer_age_band: string | null;
  buyer_household: string | null;
  buyer_first_media_id: string | null;
  buyer_first_media_other: string | null;
  note: string | null;
}

export interface MediaResultRow {
  id: number;
  name: string;
  media_id: string | null;
  started_on: string;
  ended_on: string | null;
  cost_man_yen: number | null;
  reach_count: number | null;
  views: number | null;
  inquiries: number | null;
  viewings: number | null;
  note: string | null;
}

interface MediaOption {
  id: string;
  name: string;
}

// ---- 見た目の部品 ----

const label = "block text-[13px] font-medium text-ink";
const field = "w-full mt-1 h-10 px-3 bg-white rounded-lg border border-field text-[13px] text-ink placeholder:text-[#a3abbb] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15";
const th = "px-2 py-2 text-left text-xs font-bold text-sub bg-subtle whitespace-nowrap";
const td = "px-2 py-2.5 text-[13px] text-ink border-t border-line align-top tabular-nums";

function Card({ icon, title, note, children }: { icon: React.ReactNode; title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-line rounded-xl shadow-[0_1px_3px_rgba(22,35,63,0.04)]">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
        <span className="text-primary shrink-0">{icon}</span>
        <span className="text-[16px] font-bold text-ink shrink-0">{title}</span>
        <span className="text-xs text-muted min-w-0">{note}</span>
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Field({ name, title, unit, children }: { name: string; title: string; unit?: string; children?: React.ReactNode }) {
  return (
    <label className={label} htmlFor={name}>
      {title}
      {unit && <span className="ml-1 text-xs text-muted">（{unit}）</span>}
      {children}
    </label>
  );
}

function Select({ name, value, options, empty = "不明・未記録", onChange }: { name: string; value: string | null; options: readonly (string | { value: string; label: string })[]; empty?: string | null; onChange?: (v: string) => void }) {
  return (
    <select id={name} name={name} defaultValue={value ?? ""} className={`${field} pr-8`} onChange={onChange ? (e) => onChange(e.target.value) : undefined}>
      {empty !== null && <option value="">{empty}</option>}
      {options.map((o) => {
        const v = typeof o === "string" ? o : o.value;
        return (
          <option key={v} value={v}>
            {typeof o === "string" ? o : o.label}
          </option>
        );
      })}
    </select>
  );
}

function Message({ state }: { state: RecordFormState }) {
  if (state.error) return <div role="alert" className="mr-auto rounded-md border border-[#f3c4c4] bg-[#fdecec] px-3 py-2 text-xs text-[#b91c1c]">{state.error}</div>;
  if (state.ok) return <div role="status" className="mr-auto rounded-md border border-[#bfe5c6] bg-[#e9f8ec] px-3 py-2 text-xs text-[#157347]">{state.ok}</div>;
  return <div className="mr-auto" />;
}

/** 媒体の選択（媒体一覧＋その他）。その他を選ぶと名前の欄が出る */
function MediaSelect({ idName, otherName, media, value, other, empty }: { idName: string; otherName: string; media: MediaOption[]; value: string | null; other: string | null; empty: string | null }) {
  const [selected, setSelected] = useState(other ? OTHER_MEDIA : (value ?? ""));
  return (
    <>
      <Select
        name={idName}
        value={other ? OTHER_MEDIA : value}
        empty={empty}
        options={[...media.map((m) => ({ value: m.id, label: `${m.id} ${m.name}` })), { value: OTHER_MEDIA, label: "その他（一覧にない媒体）" }]}
        onChange={setSelected}
      />
      {selected === OTHER_MEDIA && <input name={otherName} defaultValue={other ?? ""} placeholder="媒体の名前（例：地元の住宅情報誌）" className={field} />}
    </>
  );
}

const submit = (action: (fd: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget);
  startTransition(() => action(fd));
};

// ---- 販売の結果 ----

export function SalesRecordForm({
  propertyId,
  initial,
  saved,
  media,
  households,
}: {
  propertyId: number;
  initial: SalesRecordValues;
  saved: boolean;
  media: MediaOption[];
  households: string[];
}) {
  const [state, action, pending] = useActionState(saveSalesRecord, {});
  const v = initial;
  return (
    <form onSubmit={submit(action)} className="grid gap-4">
      <input type="hidden" name="property_id" value={propertyId} />
      <Card icon={<ChartIcon className="size-5" />} title="販売の結果" note={saved ? "物件ごとに1件です。変わったら書き換えてください。" : "まだ記録がありません。わかる項目から入れて保存してください。"}>
        <div className="grid gap-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <Field name="status" title="販売の状況">
              <Select name="status" value={v.status} options={SALE_STATUSES} empty={null} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <Field name="listed_on" title="販売開始日">
              <input id="listed_on" name="listed_on" type="date" defaultValue={v.listed_on ?? ""} className={field} />
            </Field>
            <Field name="list_price_man_yen" title="販売開始時の価格" unit="万円">
              <input id="list_price_man_yen" name="list_price_man_yen" inputMode="numeric" defaultValue={v.list_price_man_yen ?? ""} className={field} />
            </Field>
            <Field name="price_cut_count" title="値下げの回数" unit="回">
              <input id="price_cut_count" name="price_cut_count" inputMode="numeric" defaultValue={v.price_cut_count} className={field} />
            </Field>
            <Field name="final_price_man_yen" title="最後の売出価格" unit="万円・値下げしたとき">
              <input id="final_price_man_yen" name="final_price_man_yen" inputMode="numeric" defaultValue={v.final_price_man_yen ?? ""} className={field} />
            </Field>
            <Field name="contracted_on" title="成約日">
              <input id="contracted_on" name="contracted_on" type="date" defaultValue={v.contracted_on ?? ""} className={field} />
            </Field>
            <Field name="contract_price_man_yen" title="成約価格" unit="万円">
              <input id="contract_price_man_yen" name="contract_price_man_yen" inputMode="numeric" defaultValue={v.contract_price_man_yen ?? ""} className={field} />
            </Field>
          </div>

          <div className="grid gap-2">
            <div className="flex items-center gap-2 text-[13px] font-bold text-ink">
              <UsersIcon className="size-4 text-primary" />
              買主のこと
              <span className="text-xs font-normal text-muted">わかる範囲で。わからない項目は「不明」のままにします。</span>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field name="buyer_age_band" title="買主の年代">
                <Select name="buyer_age_band" value={v.buyer_age_band} options={BUYER_AGE_BANDS} />
              </Field>
              <Field name="buyer_household" title="買主の世帯">
                <Select name="buyer_household" value={v.buyer_household} options={[...households, "その他"]} />
              </Field>
              <Field name="buyer_first_media_id" title="最初にこの物件を知った媒体">
                <MediaSelect idName="buyer_first_media_id" otherName="buyer_first_media_other" media={media} value={v.buyer_first_media_id} other={v.buyer_first_media_other} empty="不明・未記録" />
              </Field>
            </div>
          </div>

          <Field name="note" title="メモ">
            <textarea id="note" name="note" rows={3} defaultValue={v.note ?? ""} placeholder="例：内見で駐車のしやすさを評価された。2回目の値下げ後に問い合わせが増えた" className={`${field} h-auto py-2`} />
          </Field>
        </div>
      </Card>
      <div className="flex items-center gap-3">
        <Message state={state} />
        <button type="submit" disabled={pending} className={btnAction}>
          {pending ? "保存しています…" : "販売の結果を保存"}
        </button>
      </div>
    </form>
  );
}

// ---- 媒体ごとの実績 ----
// 表と入力欄を1つにまとめる。表の「修正」を押すと、その行の値が入力欄に入り、保存で上書きする

const show = (n: number | null, unit = "") => (n === null ? <span className="text-muted">―</span> : `${n.toLocaleString("ja-JP")}${unit}`);
const value = (n: number | null) => (n === null ? "" : String(n));

export function MediaResults({ propertyId, rows, media }: { propertyId: number; rows: MediaResultRow[]; media: MediaOption[] }) {
  const [editing, setEditing] = useState<MediaResultRow | null>(null);
  const [state, action, pending] = useActionState(saveMediaResult, {});
  const [deleting, startDelete] = useTransition();
  const [message, setMessage] = useState<RecordFormState>({});
  const formRef = useRef<HTMLFormElement>(null);
  // 保存できたら欄を空にして「追加」に戻す（誤りのときは入力を残す）。欄は key を変えて作り直す
  const [formKey, setFormKey] = useState(0);
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state.ok) {
      setFormKey((k) => k + 1);
      setEditing(null);
    }
  }

  const sum = (k: "cost_man_yen" | "inquiries" | "viewings") => rows.reduce<number | null>((s, r) => (r[k] === null ? s : (s ?? 0) + (r[k] as number)), null);
  const cost = sum("cost_man_yen");
  const inquiries = sum("inquiries");
  const viewings = sum("viewings");

  const edit = (r: MediaResultRow) => {
    setEditing(r);
    setFormKey((k) => k + 1);
    setMessage({});
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const cancel = () => {
    setEditing(null);
    setFormKey((k) => k + 1);
  };
  const remove = (r: MediaResultRow) => {
    if (!window.confirm(`「${r.name}」（${r.started_on}〜）の行を削除しますか`)) return;
    if (editing?.id === r.id) cancel();
    startDelete(async () => setMessage(await deleteMediaResult(propertyId, r.id)));
  };

  const e = editing;
  return (
    <>
      <Card icon={<ChartIcon className="size-5" />} title="媒体ごとの実績" note="期間ごとに1行です。ポータルの月ごとの報告は、月ごとに1行ずつ入れてください。">
        {rows.length === 0 ? (
          <p className="text-[13px] text-muted">まだ実績がありません。下の「媒体の実績を追加」から入れてください。</p>
        ) : (
          <div className="grid gap-3">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse">
                <thead>
                  <tr>
                    <th className={th}>媒体</th>
                    <th className={th}>期間</th>
                    <th className={th}>費用</th>
                    <th className={th}>表示・配布</th>
                    <th className={th}>閲覧</th>
                    <th className={th}>問い合わせ</th>
                    <th className={th}>内見</th>
                    <th className={th}>メモ</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className={e?.id === r.id ? "bg-[#eef4ff]" : undefined}>
                      <td className={`${td} font-medium`}>
                        {r.name}
                        {!r.media_id && <span className="ml-1 text-xs text-muted">（一覧外）</span>}
                      </td>
                      <td className={`${td} whitespace-nowrap`}>
                        {r.started_on}〜{r.ended_on ?? ""}
                      </td>
                      <td className={td}>{r.cost_man_yen === null ? show(null) : `${r.cost_man_yen.toLocaleString("ja-JP", { minimumFractionDigits: 1 })}万円`}</td>
                      <td className={td}>{show(r.reach_count)}</td>
                      <td className={td}>{show(r.views)}</td>
                      <td className={td}>{show(r.inquiries, "件")}</td>
                      <td className={td}>{show(r.viewings, "件")}</td>
                      <td className={`${td} text-body`}>{r.note}</td>
                      <td className={`${td} whitespace-nowrap`}>
                        <span className="flex items-center gap-3">
                          <button type="button" onClick={() => edit(r)} aria-label={`${r.name}の行を修正`} className="flex items-center gap-1 text-xs text-primary hover:opacity-80 cursor-pointer">
                            <PencilIcon className="size-4" />
                            修正
                          </button>
                          <button type="button" onClick={() => remove(r)} disabled={deleting} aria-label={`${r.name}の行を削除`} className="text-muted hover:text-[#b91c1c] cursor-pointer disabled:opacity-50">
                            <TrashIcon className="size-4" />
                          </button>
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[13px] text-body">
              <span>
                費用の合計 <b className="text-ink tabular-nums">{cost === null ? "―" : `${cost.toLocaleString("ja-JP", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}万円`}</b>
              </span>
              <span>
                問い合わせの合計 <b className="text-ink tabular-nums">{inquiries === null ? "―" : `${inquiries}件`}</b>
              </span>
              <span>
                内見の合計 <b className="text-ink tabular-nums">{viewings === null ? "―" : `${viewings}件`}</b>
              </span>
              {message.error && <span className="text-[#b91c1c]">{message.error}</span>}
              {message.ok && <span className="text-[#157347]">{message.ok}</span>}
            </div>
          </div>
        )}
      </Card>

      <form key={formKey} ref={formRef} onSubmit={submit(action)} className="grid gap-4 scroll-mt-4">
        <input type="hidden" name="property_id" value={propertyId} />
        {e && <input type="hidden" name="result_id" value={e.id} />}
        <Card
          icon={e ? <PencilIcon className="size-5" /> : <PlusIcon className="size-5" />}
          title={e ? "媒体の実績を修正" : "媒体の実績を追加"}
          note={e ? `「${e.name}」（${e.started_on}〜）の行を修正しています。` : "空の欄は「不明」として残します。0件のときは 0 を入れてください。"}
        >
          <div className="grid gap-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Field name="media_id" title="媒体">
                <MediaSelect idName="media_id" otherName="other_name" media={media} value={e?.media_id ?? null} other={e && !e.media_id ? e.name : null} empty="選んでください" />
              </Field>
              <Field name="started_on" title="開始日">
                <input id="started_on" name="started_on" type="date" defaultValue={e?.started_on ?? ""} className={field} />
              </Field>
              <Field name="ended_on" title="終了日" unit="続いているときは空">
                <input id="ended_on" name="ended_on" type="date" defaultValue={e?.ended_on ?? ""} className={field} />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
              <Field name="cost_man_yen" title="費用" unit="万円">
                <input id="cost_man_yen" name="cost_man_yen" inputMode="decimal" placeholder="例：3.5" defaultValue={value(e?.cost_man_yen ?? null)} className={field} />
              </Field>
              <Field name="reach_count" title="表示回数・配布部数">
                <input id="reach_count" name="reach_count" inputMode="numeric" defaultValue={value(e?.reach_count ?? null)} className={field} />
              </Field>
              <Field name="views" title="物件ページの閲覧数">
                <input id="views" name="views" inputMode="numeric" defaultValue={value(e?.views ?? null)} className={field} />
              </Field>
              <Field name="inquiries" title="問い合わせ" unit="件">
                <input id="inquiries" name="inquiries" inputMode="numeric" defaultValue={value(e?.inquiries ?? null)} className={field} />
              </Field>
              <Field name="viewings" title="内見" unit="件">
                <input id="viewings" name="viewings" inputMode="numeric" defaultValue={value(e?.viewings ?? null)} className={field} />
              </Field>
            </div>
            <Field name="media_note" title="メモ">
              <input id="media_note" name="note" placeholder="例：11月分の反響レポートより" defaultValue={e?.note ?? ""} className={field} />
            </Field>
          </div>
        </Card>
        <div className="flex items-center gap-3">
          <Message state={state} />
          {e && (
            <button type="button" onClick={cancel} className="px-5 py-2.5 bg-white border border-field rounded-lg text-body text-[13px] cursor-pointer">
              中止
            </button>
          )}
          <button type="submit" disabled={pending} className={btnAction}>
            {e ? <PencilIcon className="size-4" /> : <PlusIcon className="size-4" />}
            {pending ? "保存しています…" : e ? "保存" : "媒体の実績を追加"}
          </button>
        </div>
      </form>
    </>
  );
}
