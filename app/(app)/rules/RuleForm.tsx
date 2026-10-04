"use client";

import { useActionState, useState } from "react";
import { MEDIA, TARGETS } from "../../../lib/rules/catalog";
import { FACT_OPTIONS, KIND_LABEL, factLabel, inputUnit, leafConditions, toInput } from "../../../lib/rules/describe";
import type { Condition, Effect, Op, Rule } from "../../../lib/rules/engine";
import { btnPrimary, fieldLabel, input } from "../../_lib/ui";
import { deleteRule, saveRule, type ActionState } from "./actions";

// ルールの追加・変更のフォーム（設計書 D14）。条件は「何を見るか」を一覧から選んで組み立てる

export interface RuleData {
  id: string;
  kind: Rule["kind"];
  condition: Condition;
  effect: Effect;
  note: string;
  enabled: boolean;
}

interface Leaf {
  fact: string;
  compare: "comparison" | "value";
  op: Op;
  value: string;
}

const select = `${input} bg-white`;
/** 横に並べる欄（共通の input は横幅いっぱいになるので使わない） */
const inline = "mt-1 px-3 py-[9px] border border-field rounded-md text-[13px] bg-white";
const groups = [...new Set(FACT_OPTIONS.map((f) => f.group))];

function toLeaf(c: Extract<Condition, { fact: string }>): Leaf {
  const unit = factLabel(c.fact).unit;
  if (c.than === "comparison") {
    return { fact: c.fact, compare: "comparison", op: c.op === "<" || c.op === "<=" ? "<" : ">", value: String(Math.round(Math.abs(c.delta ?? 0) * 1000) / 10) };
  }
  return { fact: c.fact, compare: "value", op: c.op, value: String(toInput(c.than, unit)) };
}

const emptyLeaf = (): Leaf => ({ fact: "target.households_with_under18_ratio", compare: "comparison", op: ">", value: "3" });

function LeafFields({ index, leaf, onChange }: { index: number; leaf: Leaf; onChange: (leaf: Leaf) => void }) {
  const fact = factLabel(leaf.fact);
  const compare = fact.comparable ? leaf.compare : "value";
  return (
    <div className="grid gap-2 border border-line rounded-md p-3 bg-white">
      <div className="text-xs font-bold text-sub">条件{index + 1}</div>
      <label className={fieldLabel}>
        何を見るか
        <select name={`c${index}_fact`} value={leaf.fact} onChange={(e) => onChange({ ...leaf, fact: e.target.value })} className={select}>
          {groups.map((g) => (
            <optgroup key={g} label={g}>
              {FACT_OPTIONS.filter((f) => f.group === g).map((f) => (
                <option key={f.key} value={f.key}>{f.label}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <label className={`${fieldLabel} w-44`}>
          比べる相手
          <select name={`c${index}_compare`} value={compare} onChange={(e) => onChange({ ...leaf, compare: e.target.value as Leaf["compare"], op: e.target.value === "comparison" ? ">" : ">=" })} className={select}>
            {fact.comparable && <option value="comparison">区・市の値</option>}
            <option value="value">決まった値</option>
          </select>
        </label>
        {compare === "comparison" ? (
          <>
            <span className="text-[13px] text-body pb-2.5">より</span>
            <input name={`c${index}_value`} type="number" step="0.1" min="0" value={leaf.value} onChange={(e) => onChange({ ...leaf, value: e.target.value })} required className={`${inline} w-24`} />
            <span className="text-[13px] text-body pb-2.5">ポイント以上</span>
            <select name={`c${index}_op`} value={leaf.op === "<" || leaf.op === "<=" ? "<" : ">"} onChange={(e) => onChange({ ...leaf, op: e.target.value as Op })} className={`${inline} w-28`}>
              <option value=">">多い</option>
              <option value="<">少ない</option>
            </select>
          </>
        ) : (
          <>
            <input name={`c${index}_value`} type="number" step="any" value={leaf.value} onChange={(e) => onChange({ ...leaf, value: e.target.value })} required className={`${inline} w-32`} />
            <span className="text-[13px] text-body pb-2.5">{inputUnit(fact.unit)}</span>
            <select name={`c${index}_op`} value={leaf.op} onChange={(e) => onChange({ ...leaf, op: e.target.value as Op })} className={`${inline} w-32`}>
              <option value=">=">以上</option>
              <option value=">">より大きい</option>
              <option value="<=">以下</option>
              <option value="<">未満</option>
            </select>
          </>
        )}
      </div>
      {compare === "comparison" && <div className="text-[11px] text-muted">例：3ポイント以上多い ＝ 区・市の値が20.0%なら、23.0%より多いとき</div>}
    </div>
  );
}

function EffectFields({ kind, effect }: { kind: Rule["kind"]; effect?: Effect }) {
  const e = (effect ?? {}) as Record<string, unknown>;
  if (kind === "target_score") {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <label className={`${fieldLabel} flex-1 min-w-56`}>
          狙う層
          <select name="e_target" defaultValue={String(e.target ?? TARGETS[0].id)} className={select}>
            {TARGETS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <span className="text-[13px] text-body pb-2.5">に</span>
        <input name="e_score" type="number" step="1" defaultValue={Number(e.score ?? 1)} required className={`${inline} w-24`} />
        <span className="text-[13px] text-body pb-2.5">点（マイナスも可）</span>
      </div>
    );
  }
  if (kind === "total_budget") {
    return (
      <div className="flex items-end gap-2">
        <span className="text-[13px] text-body pb-2.5">総予算を</span>
        <input name="e_total" type="number" step="1" min="1" defaultValue={Number(e.total_man_yen ?? 20)} required className={`${inline} w-28`} />
        <span className="text-[13px] text-body pb-2.5">万円にする</span>
      </div>
    );
  }
  const mediaSelect = (
    <label className={`${fieldLabel} flex-1 min-w-56`}>
      媒体
      <select name="e_media" defaultValue={String(e.media ?? MEDIA[0].id)} className={select}>
        {MEDIA.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
      </select>
    </label>
  );
  if (kind === "media_weight") {
    const mode = e.weight !== undefined ? "weight" : "multiply";
    return (
      <div className="flex flex-wrap items-end gap-2">
        {mediaSelect}
        <label className={`${fieldLabel} w-44`}>
          どうするか
          <select name="e_media_mode" defaultValue={mode} className={select}>
            <option value="multiply">重みを掛ける（倍率）</option>
            <option value="weight">重みの出発点にする</option>
          </select>
        </label>
        <input name="e_media_value" type="number" step="0.1" min="0" defaultValue={Number(e.weight ?? e.multiply ?? 1.2)} required className={`${inline} w-24`} />
      </div>
    );
  }
  const mode = e.fixed_man_yen !== undefined ? "fixed" : "min";
  return (
    <div className="flex flex-wrap items-end gap-2">
      {mediaSelect}
      <label className={`${fieldLabel} w-36`}>
        どうするか
        <select name="e_spend_mode" defaultValue={mode} className={select}>
          <option value="min">最低額にする</option>
          <option value="fixed">固定額にする</option>
        </select>
      </label>
      <input name="e_spend_value" type="number" step="0.1" min="0" defaultValue={Number(e.fixed_man_yen ?? e.min_man_yen ?? 2)} required className={`${inline} w-24`} />
      <span className="text-[13px] text-body pb-2.5">万円</span>
    </div>
  );
}

function Message({ state }: { state: ActionState }) {
  if (state.error) return <div className="rounded-md border border-[#f3c4c4] bg-[#fdecec] px-3 py-2 text-xs text-[#b91c1c]">{state.error}</div>;
  if (state.ok) return <div className="rounded-md border border-[#bfe5c6] bg-[#e9f8ec] px-3 py-2 text-xs text-[#157347]">{state.ok}</div>;
  return null;
}

/** rule があれば変更、なければ追加 */
export default function RuleForm({ rule }: { rule?: RuleData }) {
  const [state, formAction, pending] = useActionState(saveRule, {});
  const [kind, setKind] = useState<Rule["kind"]>(rule?.kind ?? "target_score");
  const initialLeaves = rule ? leafConditions(rule.condition).map(toLeaf) : [];
  const [condMode, setCondMode] = useState<"always" | "1" | "2">(rule && "always" in rule.condition ? "always" : initialLeaves.length >= 2 ? "2" : "1");
  const [leaves, setLeaves] = useState<Leaf[]>([initialLeaves[0] ?? emptyLeaf(), initialLeaves[1] ?? emptyLeaf()]);
  const setLeaf = (i: number, leaf: Leaf) => setLeaves((ls) => ls.map((l, j) => (j === i ? leaf : l)));

  return (
    <form action={formAction} className="grid gap-3 bg-subtle rounded-lg p-4">
      {rule && <input type="hidden" name="id" value={rule.id} />}
      {rule ? (
        <input type="hidden" name="kind" value={rule.kind} />
      ) : (
        <label className={`${fieldLabel} max-w-72`}>
          ルールの種類
          <select name="kind" value={kind} onChange={(e) => setKind(e.target.value as Rule["kind"])} className={select}>
            {(["target_score", "total_budget", "media_weight", "min_spend"] as const).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </label>
      )}

      <div className="grid gap-2">
        <label className={`${fieldLabel} max-w-72`}>
          条件
          <select name="cond_mode" value={condMode} onChange={(e) => setCondMode(e.target.value as typeof condMode)} className={select}>
            <option value="always">条件なし（いつも）</option>
            <option value="1">条件1つ</option>
            <option value="2">条件2つ（両方当てはまるとき）</option>
          </select>
        </label>
        {condMode !== "always" && <LeafFields index={0} leaf={leaves[0]} onChange={(l) => setLeaf(0, l)} />}
        {condMode === "2" && <LeafFields index={1} leaf={leaves[1]} onChange={(l) => setLeaf(1, l)} />}
      </div>

      <div className="grid gap-1">
        <div className={fieldLabel}>効果（当てはまったとき）</div>
        <EffectFields key={kind} kind={kind} effect={rule?.effect} />
      </div>

      <label className={fieldLabel}>
        理由（BRUMBY様の言葉で）
        <textarea name="note" defaultValue={rule?.note ?? ""} required rows={2} className={input} />
      </label>
      <div className="flex flex-wrap items-end gap-5">
        <label className="flex gap-1.5 items-center text-[13px] text-body">
          <input type="checkbox" name="enabled" defaultChecked={rule?.enabled ?? true} />
          このルールを使う
        </label>
        <label className={`${fieldLabel} flex-1 min-w-48`}>
          直した人（任意）
          <input name="updated_by" placeholder="例：打ち合わせ（10/20）" className={input} />
        </label>
        <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-60`}>
          {pending ? "保存中…" : rule ? "保存する" : "追加する"}
        </button>
      </div>
      <Message state={state} />
      <div className="text-[11px] text-muted">保存すると版が上がり、「変更の履歴」に残ります。次に分析したときから、このルールで判断します。</div>
    </form>
  );
}

export function DeleteRuleButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteRule, {});
  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm(`${id} を削除しますか？（変更の履歴に削除前の内容は残ります。外すだけなら「このルールを使う」を外すほうが安全です）`)) e.preventDefault();
      }}
      className="grid gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <button type="submit" disabled={pending} className="px-5 py-2.5 bg-white border border-[#f3c4c4] rounded-md text-[#b91c1c] text-[13px] cursor-pointer disabled:opacity-60 w-fit">
        {pending ? "削除中…" : "このルールを削除する"}
      </button>
      <Message state={state} />
    </form>
  );
}
