"use client";

import { startTransition, useActionState, useRef, useState, useTransition } from "react";
import { FLOORS, PROPERTY_CLASSES, RENOVATION_PARTS, TRANSPORT_MODES } from "../../../lib/property";
import {
  ArrowRightIcon,
  BuildingIcon,
  ChartIcon,
  CheckIcon,
  ChevronDownIcon,
  CloseIcon,
  HomeIcon,
  InfoIcon,
  LockIcon,
  PencilIcon,
  PinIcon,
  PlusIcon,
  TrainIcon,
  TrashIcon,
  UsersIcon,
} from "../../_components/icons";
import { previewAddress, saveProperty, type PropertyFormState } from "./actions";

// ①物件情報の入力フォーム（docs/設計まとめ.md「①物件情報の入力」の15項目）
// 見た目は 2026-10-26 のデザイン（物件情報入力ダッシュボード①〜③）に合わせた
// - 手順は「基本情報 → 詳細条件 → 分析情報」の3つ。PoCでは基本情報だけを使い、詳細条件と分析情報は鍵つきで操作できない
// - 右の「入力状況」は必須12項目（基本情報3・交通アクセス1・物件詳細8）の入力数を数える
// - 交通：「交通手段を追加」で2つ目の欄が出る（最大2つ）
// - リフォーム：「あり」を選ぶと、年と箇所の欄が出る
// - 競合物件・広告予算は開閉できる。閉じても入力は消えずに送られる（hidden で隠すだけ）
// - 欄の name は保存の処理（actions.ts）が読む名前のまま変えない

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

const COMPETITOR_FIELDS = ["price_man_yen", "address", "building_sqm", "land_sqm", "building_age"] as const;

/** 特徴ピックアップの入力例。押すと欄の末尾に足す */
const FEATURE_EXAMPLES = ["南向きリビング", "シャッター車庫あり", "小屋裏収納あり", "太陽光発電あり", "閑静な住宅街", "角地"];

const str = (v: string | number | null | undefined) => (v === null || v === undefined ? "" : String(v));
const yesNo = (v: boolean | null) => (v === null ? "" : v ? "あり" : "なし");

// ---- 入力状況（必須12項目と任意3項目）を数える ----

const BASIC_FIELDS = ["property_class", "price_man_yen", "address"];
const DETAIL_FIELDS = ["layout", "building_sqm", "land_sqm", "parking", "building_age", "floors", "has_garden"];

interface Progress {
  basic: number;
  transport: number;
  detail: number;
  optional: number;
}

const TOTALS = { basic: BASIC_FIELDS.length, transport: 1, detail: DETAIL_FIELDS.length + 1, optional: 3 };
const REQUIRED_TOTAL = TOTALS.basic + TOTALS.transport + TOTALS.detail;

function countProgress(fd: FormData): Progress {
  const has = (name: string) => String(fd.get(name) ?? "").trim() !== "";
  const renovated = String(fd.get("renovated") ?? "");
  // リフォームは「なし」か、「あり」で年と箇所まで入っていれば入力済み
  const renovationDone = renovated === "なし" || (renovated === "あり" && has("renovation_year") && fd.getAll("renovation_parts").length > 0);
  const competitorCount = Number(fd.get("competitor_count") ?? 0);
  let hasCompetitor = false;
  for (let i = 0; i < competitorCount; i++) if (COMPETITOR_FIELDS.some((k) => has(`c${i}_${k}`))) hasCompetitor = true;
  return {
    basic: BASIC_FIELDS.filter(has).length,
    transport: has("t1_mode") && has("t1_stop_name") && has("t1_walk_min") ? 1 : 0,
    detail: DETAIL_FIELDS.filter(has).length + (renovationDone ? 1 : 0),
    optional: [has("features"), hasCompetitor, has("ad_budget_man_yen")].filter(Boolean).length,
  };
}

/** 初めの表示用に、保存済みの値をフォームの送信と同じ形にする */
function valuesToFormData(v: PropertyValues): FormData {
  const fd = new FormData();
  const set = (name: string, value: string | number | null | undefined) => fd.set(name, str(value));
  set("property_class", v.property_class);
  set("price_man_yen", v.price_man_yen);
  set("address", v.address);
  set("layout", v.layout);
  set("building_sqm", v.building_sqm);
  set("land_sqm", v.land_sqm);
  set("parking", v.parking);
  set("building_age", v.building_age);
  set("floors", v.floors);
  set("has_garden", yesNo(v.has_garden));
  set("renovated", yesNo(v.renovated));
  set("renovation_year", v.renovation_year);
  for (const p of v.renovation_parts ?? []) fd.append("renovation_parts", p);
  set("features", v.features);
  set("ad_budget_man_yen", v.ad_budget_man_yen);
  const t = v.transports[0];
  if (t) {
    set("t1_mode", t.mode);
    set("t1_stop_name", t.stop_name);
    set("t1_walk_min", t.walk_min);
  }
  set("competitor_count", v.competitors.length);
  v.competitors.forEach((c, i) => COMPETITOR_FIELDS.forEach((k) => set(`c${i}_${k}`, c[k])));
  return fd;
}

// ---- 見た目の部品 ----

const label = "block text-[13px] font-medium text-ink";
const field = `w-full mt-1 h-10 px-3 bg-white rounded-lg border border-field text-[13px] text-ink placeholder:text-[#a3abbb] focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15`;
const selectField = `${field} pr-8`;

const Required = () => <span className="ml-0.5 text-[#e5484d]">*</span>;

function Badge({ required }: { required: boolean }) {
  return required ? (
    <span className="rounded-full bg-[#fdecec] px-2.5 py-0.5 text-[11px] font-bold text-[#e5484d]">必須</span>
  ) : (
    <span className="rounded-full bg-divider px-2.5 py-0.5 text-[11px] font-bold text-muted">任意</span>
  );
}

function SectionCard({
  icon,
  title,
  note,
  required,
  count,
  collapsible,
  open = true,
  onToggle,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  note: string;
  required: boolean;
  count?: string;
  collapsible?: boolean;
  open?: boolean;
  onToggle?: () => void;
  children: React.ReactNode;
}) {
  const head = (
    <>
      <span className="text-primary shrink-0">{icon}</span>
      <span className="text-[16px] font-bold text-ink shrink-0">{title}</span>
      <span className="text-xs text-muted truncate min-w-0">{note}</span>
      <span className="ml-auto flex items-center gap-3 shrink-0">
        <Badge required={required} />
        {count && <span className="text-xs text-sub tabular-nums">{count}</span>}
        {collapsible && <ChevronDownIcon className={`size-4 text-sub transition-transform ${open ? "rotate-180" : ""}`} />}
      </span>
    </>
  );
  return (
    <section className="bg-white border border-line rounded-xl shadow-[0_1px_3px_rgba(22,35,63,0.04)]">
      {collapsible ? (
        <button type="button" onClick={onToggle} aria-expanded={open} className="w-full flex items-center gap-3 px-5 py-4 text-left cursor-pointer">
          {head}
        </button>
      ) : (
        <div className="flex items-center gap-3 px-5 pt-4 pb-1">{head}</div>
      )}
      <div className={`px-5 pb-5 pt-2 grid gap-4 ${collapsible && !open ? "hidden" : ""}`}>{children}</div>
    </section>
  );
}

const STEPS = [
  { no: 1, label: "基本情報", locked: false },
  { no: 2, label: "詳細条件", locked: true },
  { no: 3, label: "分析情報", locked: true },
];

function Stepper() {
  return (
    <ol className="flex items-center gap-3">
      {STEPS.map((s, i) => (
        <li key={s.no} className="flex items-center gap-3">
          {i > 0 && <span className="h-px w-16 bg-field" aria-hidden="true" />}
          <span
            className={`flex items-center gap-2 ${s.locked ? "text-muted opacity-60 cursor-not-allowed" : "text-primary"}`}
            aria-disabled={s.locked || undefined}
            aria-current={s.locked ? undefined : "step"}
            title={s.locked ? "将来提供の機能です" : undefined}
          >
            <span className={`flex size-7 items-center justify-center rounded-full text-[13px] font-bold ${s.locked ? "bg-divider border border-field" : "bg-primary text-white"}`}>
              {s.locked ? <LockIcon className="size-3.5" /> : s.no}
            </span>
            <span className="text-[13px] font-bold">{s.label}</span>
            {s.locked && <span className="sr-only">（将来提供・操作できません）</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ProgressRing({ done, total }: { done: number; total: number }) {
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative mx-auto size-36">
      <svg viewBox="0 0 120 120" className="size-full -rotate-90" aria-hidden="true">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#e8edf5" strokeWidth="10" />
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - done / total)} className="text-primary transition-[stroke-dashoffset] duration-300" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <div className="tabular-nums">
          <span className="text-3xl font-bold text-ink">{done}</span>
          <span className="text-sm text-sub"> / {total}</span>
        </div>
        <div className="text-[11px] text-muted">項目完了</div>
      </div>
    </div>
  );
}

function StatusIcon({ done, total }: { done: number; total: number }) {
  if (done === total)
    return (
      <span className="flex size-4.5 items-center justify-center rounded-full bg-[#22a35a] text-white">
        <CheckIcon className="size-3" />
      </span>
    );
  return <span className={`size-4.5 rounded-full border-[3px] ${done > 0 ? "border-primary" : "border-field"}`} />;
}

function ProgressPanel({ progress }: { progress: Progress }) {
  const done = progress.basic + progress.transport + progress.detail;
  const rows = [
    { label: "基本情報", done: progress.basic, total: TOTALS.basic },
    { label: "交通アクセス", done: progress.transport, total: TOTALS.transport },
    { label: "物件詳細", done: progress.detail, total: TOTALS.detail },
  ];
  return (
    <aside className="grid gap-4 content-start xl:sticky xl:top-0">
      <div className="bg-white border border-line rounded-xl p-5 grid gap-5">
        <div className="text-[15px] font-bold text-ink">入力状況</div>
        <ProgressRing done={done} total={REQUIRED_TOTAL} />
        <dl className="grid gap-2.5 text-[13px]">
          {[
            { label: "入力済み", value: done, dot: "bg-primary" },
            { label: "未入力", value: REQUIRED_TOTAL - done, dot: "bg-field" },
            { label: "任意項目", value: progress.optional, dot: "bg-divider border border-field" },
          ].map((r) => (
            <div key={r.label} className="flex items-center gap-2.5">
              <span className={`size-2.5 rounded-full ${r.dot}`} />
              <dt className="text-body">{r.label}</dt>
              <dd className="ml-auto font-bold text-ink tabular-nums">{r.value}</dd>
            </div>
          ))}
        </dl>
        <div className="border-t border-line pt-4 grid gap-2.5">
          <div className="text-[13px] font-bold text-ink">必須項目の内訳</div>
          {rows.map((r) => (
            <div key={r.label} className="flex items-center gap-2.5 text-[13px]">
              <StatusIcon done={r.done} total={r.total} />
              <span className="text-body">{r.label}</span>
              <span className="ml-auto text-sub tabular-nums">
                {r.done} / {r.total}
              </span>
            </div>
          ))}
        </div>
      </div>
      {done === REQUIRED_TOTAL && (
        <div className="rounded-xl border border-[#cfe0fa] bg-primary-soft p-4">
          <div className="text-[13px] font-bold text-primary">必須項目がそろいました</div>
          <div className="mt-1 text-xs text-body leading-relaxed">このまま登録できます。任意の項目は、あとから追加・編集できます。</div>
        </div>
      )}
    </aside>
  );
}

function TransportRow({ position, values, onRemove }: { position: 1 | 2; values?: TransportValues; onRemove?: () => void }) {
  const name = (k: string) => `t${position}_${k}`;
  const req = position === 1;
  return (
    <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_32px] gap-4 items-end">
      <label className={label}>
        種別{req && <Required />}
        <select name={name("mode")} defaultValue={values?.mode ?? ""} required={req} className={selectField}>
          <option value="">選択してください</option>
          {TRANSPORT_MODES.map((m) => <option key={m}>{m}</option>)}
        </select>
      </label>
      <label className={label}>
        路線名
        <input name={name("line")} defaultValue={str(values?.line)} placeholder="例：JR越後線／新潟交通バス" className={field} />
      </label>
      <label className={label}>
        駅またはバス停名{req && <Required />}
        <input name={name("stop_name")} defaultValue={str(values?.stop_name)} required={req} placeholder="例：寺尾駅／寺尾小学校前" className={field} />
      </label>
      <label className={label}>
        徒歩（分）{req && <Required />}
        <input name={name("walk_min")} inputMode="numeric" defaultValue={str(values?.walk_min)} required={req} placeholder="例：3" className={field} />
      </label>
      {onRemove ? (
        <button type="button" onClick={onRemove} aria-label={`交通（${position}つ目）を消す`} className="h-10 flex items-center justify-center text-muted hover:text-[#e5484d] cursor-pointer">
          <TrashIcon className="size-4.5" />
        </button>
      ) : (
        <span className="hidden lg:block" />
      )}
    </div>
  );
}

export default function PropertyForm({ values = EMPTY, heading }: { values?: PropertyValues; heading?: React.ReactNode }) {
  const [state, formAction, pending] = useActionState<PropertyFormState, FormData>(saveProperty, {});
  const v = values;
  const formRef = useRef<HTMLFormElement>(null);
  const featuresRef = useRef<HTMLTextAreaElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<Progress>(() => countProgress(valuesToFormData(v)));
  // お知らせは新しく登録するときだけ出す
  const [showNotice, setShowNotice] = useState(!v.id);
  // 2つ目の交通。消したあとにもう一度足したときは、空の欄にする
  const [secondTransport, setSecondTransport] = useState<{ key: number; values?: TransportValues } | null>(v.transports[1] ? { key: 0, values: v.transports[1] } : null);
  const [renovated, setRenovated] = useState(v.renovated === true);
  const [competitors, setCompetitors] = useState<(CompetitorValues & { key: number })[]>(v.competitors.map((c, i) => ({ ...c, key: i })));
  const [nextKey, setNextKey] = useState(v.competitors.length);
  const [competitorsOpen, setCompetitorsOpen] = useState(v.competitors.length > 0);
  const [budgetOpen, setBudgetOpen] = useState(v.ad_budget_man_yen !== null);
  // 住所の確認の結果。確かめた住所も持ち、欄の住所と違う結果（確認中に書き換えたとき）は出さない
  const [addressCheck, setAddressCheck] = useState<PropertyFormState & { address?: string }>({});
  const [checkingAddress, startAddressCheck] = useTransition();

  // 入力のたびに数え直す。行の追加・削除のあとは、描画が終わってから数える
  const recount = () => {
    if (!formRef.current) return;
    const next = countProgress(new FormData(formRef.current));
    setProgress((prev) => (prev.basic === next.basic && prev.transport === next.transport && prev.detail === next.detail && prev.optional === next.optional ? prev : next));
  };
  const recountLater = () => requestAnimationFrame(recount);

  const addFeature = (text: string) => {
    const el = featuresRef.current;
    if (!el) return;
    const cur = el.value.trim();
    el.value = cur === "" ? text : `${cur}、${text}`;
    el.focus();
    recount();
  };

  const checkAddress = () => {
    const address = (addressRef.current?.value ?? "").trim();
    startAddressCheck(async () => {
      const result = await previewAddress(address);
      if ((addressRef.current?.value ?? "").trim() === address) setAddressCheck({ ...result, address });
    });
  };

  const doneCount = progress.basic + progress.transport + progress.detail;
  // 閉じた欄の入力で保存に失敗したときは、その欄を開いて見せる
  const showCompetitors = competitorsOpen || Boolean(state.error?.includes("競合物件"));
  const showBudget = budgetOpen || Boolean(state.error?.includes("広告予算"));

  return (
    <div className="grid gap-5">
      <div className="flex flex-wrap items-start gap-x-6 gap-y-4">
        <div className="grid gap-4">
          {heading}
          <Stepper />
        </div>
        {showNotice && (
          <div className="ml-auto flex items-start gap-3 rounded-xl border border-[#cfe0fa] bg-primary-soft px-4 py-3">
            <InfoIcon className="size-5 shrink-0 text-primary mt-0.5" />
            <div>
              <div className="text-[13px] font-bold text-primary">必須項目だけで登録できます。</div>
              <div className="text-xs text-body mt-0.5">任意の項目は、あとから追加・編集できます。</div>
            </div>
            <button type="button" onClick={() => setShowNotice(false)} aria-label="お知らせを閉じる" className="ml-2 text-sub hover:text-ink cursor-pointer">
              <CloseIcon className="size-4" />
            </button>
          </div>
        )}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_260px] items-start">
        {/* action={formAction} にすると、保存に失敗したときも入力が元に戻ってしまう（React の form の自動リセット）ため、送信を自分で行う */}
        <form
          ref={formRef}
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => formAction(data));
          }}
          onChange={recount}
          className="grid gap-4 min-w-0"
        >
          {v.id && <input type="hidden" name="id" value={v.id} />}

          <SectionCard icon={<HomeIcon />} title="基本情報" note="物件の基本的な情報を入力してください。" required count={`${progress.basic} / ${TOTALS.basic} 項目`}>
            <div className="grid grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 items-start">
              <label className={label}>
                物件区分<Required />
                <select name="property_class" defaultValue={v.property_class} required className={selectField}>
                  <option value="">選択してください</option>
                  {PROPERTY_CLASSES.map((c) => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className={label}>
                価格（万円）<Required />
                <input name="price_man_yen" inputMode="numeric" required defaultValue={str(v.price_man_yen)} placeholder="例：2480" className={field} />
              </label>
              <div className="col-span-2 lg:col-span-1">
                <label className={label} htmlFor="address">
                  住所<Required />
                </label>
                <div className="flex gap-3">
                  <input
                    id="address"
                    ref={addressRef}
                    name="address"
                    required
                    defaultValue={v.address}
                    placeholder="例：新潟市西区寺尾東3丁目12-5"
                    className={field}
                    onChange={() => setAddressCheck({})}
                  />
                  <button
                    type="button"
                    onClick={checkAddress}
                    disabled={checkingAddress}
                    className="mt-1 h-10 shrink-0 flex items-center gap-1.5 rounded-lg border border-primary bg-white px-4 text-[13px] font-bold text-primary cursor-pointer hover:bg-primary-soft disabled:opacity-60"
                  >
                    <PinIcon className="size-4" />
                    {checkingAddress ? "確認中…" : "住所を確認"}
                  </button>
                </div>
                {addressCheck.ok || addressCheck.error ? (
                  <p role="status" className={`mt-1.5 text-xs ${addressCheck.ok ? "text-primary" : "text-[#b91c1c]"}`}>
                    {addressCheck.ok ?? addressCheck.error}
                  </p>
                ) : (
                  <p className="mt-1.5 flex items-center gap-1 text-xs text-muted">
                    <PinIcon className="size-3.5 text-primary" />
                    番地まで入れてください。登録すると位置を取り、地図でピンの位置を確かめられます。
                  </p>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard icon={<TrainIcon />} title="交通アクセス" note="最寄り駅やバス停までのアクセスを入力してください。" required count={`${progress.transport} / ${TOTALS.transport} 項目`}>
            <TransportRow position={1} values={v.transports[0]} />
            {secondTransport ? (
              <TransportRow
                key={secondTransport.key}
                position={2}
                values={secondTransport.values}
                onRemove={() => {
                  setSecondTransport(null);
                  recountLater();
                }}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-[#b9cdf0] p-2.5">
                <button type="button" onClick={() => setSecondTransport({ key: nextKey })} className="flex items-center gap-1.5 rounded-md border border-line bg-white px-3.5 py-2 text-[13px] font-bold text-primary cursor-pointer hover:bg-primary-soft">
                  <PlusIcon className="size-4" />
                  交通手段を追加
                </button>
              </div>
            )}
          </SectionCard>

          <SectionCard icon={<BuildingIcon />} title="物件詳細" note="建物・土地の詳細情報を入力してください。" required count={`${progress.detail} / ${TOTALS.detail} 項目`}>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <label className={label}>
                間取り<Required />
                <input name="layout" required defaultValue={v.layout} placeholder="例：4LDK+S" className={field} />
              </label>
              <label className={label}>
                建物面積（㎡）<Required />
                <input name="building_sqm" inputMode="decimal" required defaultValue={str(v.building_sqm)} placeholder="例：120.50" className={field} />
              </label>
              <label className={label}>
                土地面積（㎡）<Required />
                <input name="land_sqm" inputMode="decimal" required defaultValue={str(v.land_sqm)} placeholder="例：150.00" className={field} />
              </label>
              <label className={label}>
                駐車台数（台）<Required />
                <input name="parking" inputMode="numeric" required defaultValue={str(v.parking)} placeholder="例：2" className={field} />
              </label>
              <label className={label}>
                築年数（年）<Required />
                <input name="building_age" inputMode="numeric" required defaultValue={str(v.building_age)} placeholder="新築は0" className={field} />
              </label>
              <label className={label}>
                階数<Required />
                <select name="floors" defaultValue={v.floors} required className={selectField}>
                  <option value="">選択してください</option>
                  {FLOORS.map((f) => <option key={f}>{f}</option>)}
                </select>
              </label>
              <label className={label}>
                庭<Required />
                <select name="has_garden" defaultValue={yesNo(v.has_garden)} required className={selectField}>
                  <option value="">選択してください</option>
                  <option>あり</option>
                  <option>なし</option>
                </select>
              </label>
              <label className={label}>
                リフォーム<Required />
                <select name="renovated" defaultValue={yesNo(v.renovated)} required className={selectField} onChange={(e) => setRenovated(e.target.value === "あり")}>
                  <option value="">選択してください</option>
                  <option>あり</option>
                  <option>なし</option>
                </select>
              </label>
            </div>
            {renovated && (
              <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,3fr)] gap-4 rounded-lg bg-subtle p-4">
                <label className={label}>
                  リフォームの年<Required />
                  <input name="renovation_year" inputMode="numeric" required defaultValue={str(v.renovation_year)} placeholder="例：2023" className={field} />
                </label>
                <fieldset>
                  <legend className={label}>
                    リフォームの箇所（複数選べます）<Required />
                  </legend>
                  <div className="flex flex-wrap gap-2 mt-1.5">
                    {RENOVATION_PARTS.map((p) => (
                      <label key={p} className="cursor-pointer">
                        <input type="checkbox" name="renovation_parts" value={p} defaultChecked={v.renovation_parts?.includes(p)} className="peer sr-only" />
                        <span className="flex items-center gap-1 rounded-md border border-field bg-white px-3 py-1.5 text-[13px] text-body peer-checked:border-[#b9cdf0] peer-checked:bg-primary-soft peer-checked:text-primary peer-checked:font-bold peer-focus-visible:ring-2 peer-focus-visible:ring-primary/30 [&>svg]:hidden peer-checked:[&>svg]:block">
                          <CheckIcon className="size-3.5" />
                          {p}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}
          </SectionCard>

          <SectionCard icon={<PencilIcon />} title="特徴ピックアップ（任意）" note="この物件のアピールポイントや特徴を自由に入力してください。" required={false}>
            <div className="grid lg:grid-cols-[minmax(0,1fr)_260px] gap-4">
              <div>
                <textarea
                  ref={featuresRef}
                  name="features"
                  defaultValue={str(v.features)}
                  rows={3}
                  placeholder="例：シャッター車庫あり、南向きリビング、2023年キッチン・浴室リフォーム済み"
                  className={`${field} h-auto! py-2.5 leading-relaxed`}
                />
                <p className="mt-1 text-[11px] text-muted">物件資料のまとめ書きのまま貼れます。氏名・連絡先は書かないでください。</p>
              </div>
              <div>
                <div className="text-xs text-sub">入力例（押すと追加）</div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {FEATURE_EXAMPLES.map((t) => (
                    <button key={t} type="button" onClick={() => addFeature(t)} className="rounded-full bg-divider px-2.5 py-1 text-[11px] text-body cursor-pointer hover:bg-primary-soft hover:text-primary">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </SectionCard>

          <SectionCard
            icon={<UsersIcon />}
            title="競合物件（任意）"
            note="周辺の競合物件を追加すると、競合とも比べられます。"
            required={false}
            collapsible
            open={showCompetitors}
            onToggle={() => setCompetitorsOpen(!showCompetitors)}
          >
            <input type="hidden" name="competitor_count" value={competitors.length} />
            {competitors.length > 0 && (
              <div className="overflow-x-auto">
                <div className="min-w-[640px] grid gap-2">
                  <div className="grid grid-cols-[32px_100px_minmax(0,1fr)_100px_100px_80px_32px] gap-3 rounded-md bg-subtle px-2 py-2 text-xs font-bold text-sub">
                    <span>No.</span>
                    <span>価格（万円）</span>
                    <span>住所</span>
                    <span>建物面積（㎡）</span>
                    <span>土地面積（㎡）</span>
                    <span>築年数（年）</span>
                    <span className="sr-only">操作</span>
                  </div>
                  {competitors.map((c, i) => (
                    <div key={c.key} className="grid grid-cols-[32px_100px_minmax(0,1fr)_100px_100px_80px_32px] gap-3 items-center px-2">
                      <span className="text-[13px] text-sub tabular-nums">{i + 1}</span>
                      <input name={`c${i}_price_man_yen`} aria-label={`競合物件${i + 1}の価格（万円）`} inputMode="numeric" defaultValue={str(c.price_man_yen)} className={`${field} mt-0!`} />
                      <input name={`c${i}_address`} aria-label={`競合物件${i + 1}の住所`} defaultValue={str(c.address)} placeholder="例：新潟市西区寺尾東2丁目" className={`${field} mt-0!`} />
                      <input name={`c${i}_building_sqm`} aria-label={`競合物件${i + 1}の建物面積（㎡）`} inputMode="decimal" defaultValue={str(c.building_sqm)} className={`${field} mt-0!`} />
                      <input name={`c${i}_land_sqm`} aria-label={`競合物件${i + 1}の土地面積（㎡）`} inputMode="decimal" defaultValue={str(c.land_sqm)} className={`${field} mt-0!`} />
                      <input name={`c${i}_building_age`} aria-label={`競合物件${i + 1}の築年数（年）`} inputMode="numeric" defaultValue={str(c.building_age)} className={`${field} mt-0!`} />
                      <button
                        type="button"
                        aria-label={`競合物件${i + 1}を消す`}
                        onClick={() => {
                          setCompetitors(competitors.filter((x) => x.key !== c.key));
                          recountLater();
                        }}
                        className="h-10 flex items-center justify-center text-muted hover:text-[#e5484d] cursor-pointer"
                      >
                        <TrashIcon className="size-4.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                setCompetitors([...competitors, { ...EMPTY_COMPETITOR, key: nextKey }]);
                setNextKey(nextKey + 1);
              }}
              className="flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#9dbaf0] py-2.5 text-[13px] font-bold text-primary cursor-pointer hover:bg-primary-soft"
            >
              <PlusIcon className="size-4" />
              競合物件を追加
            </button>
            <p className="text-[11px] text-muted">住所から位置を出し、物件との直線距離も比べます。空の行は保存しません。</p>
          </SectionCard>

          <SectionCard
            icon={<ChartIcon />}
            title="広告予算（任意）"
            note="販売戦略のシミュレーションに使います。"
            required={false}
            collapsible
            open={showBudget}
            onToggle={() => setBudgetOpen(!showBudget)}
          >
            <label className={`${label} max-w-[260px]`}>
              広告予算の総額（万円）
              <input name="ad_budget_man_yen" inputMode="numeric" defaultValue={str(v.ad_budget_man_yen)} placeholder="例：30" className={field} />
            </label>
            <p className="text-[11px] text-muted">入力すると、媒体ごとの配分（%）から金額をシステムが計算して表示します。</p>
          </SectionCard>

          <div className="sticky bottom-0 z-10 -mx-1 flex flex-wrap items-center justify-end gap-3 rounded-xl border border-line bg-white/95 px-4 py-3 backdrop-blur">
            {state.error && <div role="alert" className="mr-auto rounded-md border border-[#f3c4c4] bg-[#fdecec] px-3 py-2 text-xs text-[#b91c1c]">{state.error}</div>}
            {state.ok && <div role="status" className="mr-auto rounded-md border border-[#bfe5c6] bg-[#e9f8ec] px-3 py-2 text-xs text-[#157347]">{state.ok}</div>}
            {!state.error && !state.ok && (
              <div className="mr-auto text-xs text-sub">
                必須項目 <span className="font-bold text-ink tabular-nums">{doneCount}</span> / {REQUIRED_TOTAL}
              </div>
            )}
            <button type="submit" disabled={pending} className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-bold text-white shadow-sm cursor-pointer hover:bg-[#2459b0] disabled:opacity-60">
              {pending ? "保存中…" : v.id ? "保存する" : "登録して位置を確認"}
              {!pending && !v.id && <ArrowRightIcon className="size-4" />}
            </button>
          </div>
        </form>

        <ProgressPanel progress={progress} />
      </div>
    </div>
  );
}
