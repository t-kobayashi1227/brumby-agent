"use client";

import { startTransition, useActionState } from "react";
import { AGE_BANDS, MARKS } from "../../../lib/scoring/constants";
import type { FieldDef, TableDef } from "../../../lib/scoring/tables";
import { fieldLabel } from "../../_lib/ui";
import { deleteScoringRow, saveScoringRow, type ScoringFormState } from "./scoring-actions";

// 採点ルール表の1行を直す・追加するフォーム（設計書 D35）。入力欄は lib/scoring/tables.ts の定義から作る

type Values = Record<string, unknown>;

const small = "w-full mt-1 px-2 py-[6px] border border-field rounded-md text-[12px] bg-white";
const str = (v: unknown) => (v === null || v === undefined ? "" : typeof v === "object" ? "" : String(v));

function Field({ f, value, personaIds, editablePk }: { f: FieldDef; value: unknown; personaIds: string[]; editablePk: boolean }) {
  const label = (
    <span>
      {f.label}
      {f.required && <span className="text-[#b91c1c]"> *</span>}
      {f.hint && <span className="ml-1 text-[10px] text-muted">{f.hint}</span>}
    </span>
  );
  const span = f.wide ? "col-span-full" : "";
  if (f.pk && !editablePk) {
    return (
      <div className={`${fieldLabel} ${span}`}>
        {f.label}
        <div className="mt-1 py-[6px] text-[12px] font-bold text-ink">{str(value)}</div>
      </div>
    );
  }
  switch (f.type) {
    case "longtext":
      return (
        <label className={`${fieldLabel} ${span}`}>
          {label}
          <textarea name={f.name} defaultValue={str(value)} rows={2} className={small} />
        </label>
      );
    case "bool":
      return (
        <label className={`${fieldLabel} ${span} flex items-center gap-1.5 pt-5`}>
          <input type="checkbox" name={f.name} defaultChecked={value === undefined ? true : Boolean(value)} />
          {f.label}
        </label>
      );
    case "enum":
      return (
        <label className={`${fieldLabel} ${span}`}>
          {label}
          <select name={f.name} defaultValue={str(value)} className={small}>
            {!f.required && <option value="">—</option>}
            {f.options?.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </label>
      );
    case "persona_num":
    case "persona_mark": {
      const obj = (value ?? {}) as Record<string, unknown>;
      return (
        <div className={`${fieldLabel} ${span}`}>
          {label}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-1.5 mt-1">
            {personaIds.map((id) => (
              <label key={id} className="text-[11px] text-muted text-center">
                {id}
                {f.type === "persona_mark" ? (
                  <select name={`${f.name}.${id}`} defaultValue={str(obj[id])} className={`${small} text-center`}>
                    <option value="">空</option>
                    {MARKS.map((m) => (
                      <option key={m}>{m}</option>
                    ))}
                  </select>
                ) : (
                  <input name={`${f.name}.${id}`} inputMode="decimal" defaultValue={str(obj[id])} className={`${small} text-center`} />
                )}
              </label>
            ))}
          </div>
        </div>
      );
    }
    case "age_num": {
      const obj = (value ?? {}) as Record<string, unknown>;
      return (
        <div className={`${fieldLabel} ${span}`}>
          {label}
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-1">
            {AGE_BANDS.map((b) => (
              <label key={b} className="text-[11px] text-muted text-center">
                {b}
                <input name={`${f.name}.${b}`} inputMode="decimal" defaultValue={str(obj[b])} className={`${small} text-center`} />
              </label>
            ))}
          </div>
        </div>
      );
    }
    case "num_list":
      return (
        <label className={`${fieldLabel} ${span}`}>
          {label}
          <input name={f.name} defaultValue={Array.isArray(value) ? value.join(", ") : ""} className={small} />
        </label>
      );
    default:
      return (
        <label className={`${fieldLabel} ${span}`}>
          {label}
          <input name={f.name} inputMode={f.type === "int" || f.type === "num" ? "decimal" : undefined} defaultValue={str(value)} className={small} />
        </label>
      );
  }
}

export function ScoringRowForm({ def, values, personaIds, mode }: { def: TableDef; values: Values; personaIds: string[]; mode: "insert" | "update" }) {
  const [state, action, pending] = useActionState<ScoringFormState, FormData>(saveScoringRow, {});
  const [delState, delAction, deleting] = useActionState<ScoringFormState, FormData>(deleteScoringRow, {});
  const pks = def.fields.filter((f) => f.pk);
  const hidden = (
    <>
      <input type="hidden" name="__table" value={def.table} />
      <input type="hidden" name="__mode" value={mode} />
      {mode === "update" && pks.map((f) => <input key={f.name} type="hidden" name={`__pk.${f.name}`} value={str(values[f.name])} />)}
    </>
  );
  return (
    <div className="grid gap-2">
      <form
        onSubmit={(e) => {
          // 失敗したときに入力が消えないよう、送信を自分で行う
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          startTransition(() => action(data));
        }}
        className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5"
      >
        {hidden}
        {/* 管理者だけが直す列（ID・層・項目キー）は、変更のフォームに出さない */}
        {def.fields.filter((f) => mode === "insert" || !f.adminOnly).map((f) => (
          <Field key={f.name} f={f} value={values[f.name]} personaIds={personaIds} editablePk={mode === "insert"} />
        ))}
        <div className="col-span-full flex items-center gap-3">
          <button type="submit" disabled={pending} className="px-4 py-2 bg-brand rounded-md text-white text-xs font-bold cursor-pointer disabled:opacity-60">
            {pending ? "保存中…" : mode === "insert" ? "追加する" : "保存する"}
          </button>
          {state.ok && <span className="text-xs text-[#157347]">{state.ok}</span>}
          {state.error && <span className="text-xs text-[#b91c1c]">{state.error}</span>}
        </div>
      </form>
      {mode === "update" && def.canDelete && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!window.confirm("この行を削除します。よろしいですか？（変更履歴には残ります）")) return;
            const data = new FormData(e.currentTarget);
            startTransition(() => delAction(data));
          }}
          className="flex items-center gap-2"
        >
          <input type="hidden" name="__table" value={def.table} />
          {pks.map((f) => (
            <input key={f.name} type="hidden" name={`__pk.${f.name}`} value={str(values[f.name])} />
          ))}
          <button type="submit" disabled={deleting} className="px-3 py-1 rounded-md border border-[#f3c4c4] text-[#b91c1c] text-xs cursor-pointer">
            削除
          </button>
          {delState.error && <span className="text-xs text-[#b91c1c]">{delState.error}</span>}
          {delState.ok && <span className="text-xs text-[#157347]">{delState.ok}</span>}
        </form>
      )}
    </div>
  );
}
