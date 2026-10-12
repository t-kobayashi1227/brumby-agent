"use server";

import { revalidatePath } from "next/cache";
import { getSql, type Sql } from "../../../lib/db";
import { AGE_BANDS, MARKS } from "../../../lib/scoring/constants";
import { SCORING_TABLES, type FieldDef, type TableDef } from "../../../lib/scoring/tables";

// 採点ルール表（設計書 D35）の表を /rules の画面から直す
// 変更は scoring_revisions に残る（トリガー）

export interface ScoringFormState {
  ok?: string;
  error?: string;
}

function tableOf(formData: FormData): TableDef {
  const def = SCORING_TABLES[String(formData.get("__table") ?? "")];
  if (!def) throw new Error("編集する表が正しくありません");
  return def;
}

const text = (formData: FormData, name: string) => {
  const v = String(formData.get(name) ?? "").trim();
  return v === "" ? null : v;
};

function number(raw: string | null, label: string, int: boolean): number | null {
  if (raw === null) return null;
  const n = Number(raw.replace(/[,，]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${label}には数字を入れてください`);
  if (int && !Number.isInteger(n)) throw new Error(`${label}は整数で入れてください`);
  return n;
}

/** 入力欄の値を、列の値にする。jsonb の列は sql.json で包む */
function readField(sql: Sql, formData: FormData, f: FieldDef): unknown {
  const prefixed = (prefix: string) => [...formData.keys()].filter((k) => k.startsWith(`${f.name}.`)).map((k) => [k.slice(prefix.length), String(formData.get(k) ?? "").trim()] as const);
  switch (f.type) {
    case "text":
    case "longtext": {
      const v = text(formData, f.name);
      if (f.required && v === null) throw new Error(`${f.label}を入れてください`);
      // 複数行の欄は空でも ''（NOT NULL の列）
      return v ?? (f.type === "longtext" ? "" : null);
    }
    case "int":
    case "num": {
      const v = number(text(formData, f.name), f.label, f.type === "int");
      if (f.required && v === null) throw new Error(`${f.label}を入れてください`);
      return v;
    }
    case "bool":
      return formData.get(f.name) === "on";
    case "enum": {
      const v = text(formData, f.name);
      if (v === null) {
        if (f.required) throw new Error(`${f.label}を選んでください`);
        return null;
      }
      if (!f.options?.includes(v)) throw new Error(`${f.label}を選び直してください`);
      return f.name === "direction" ? Number(v) : v;
    }
    case "persona_num": {
      const out: Record<string, number> = {};
      for (const [id, raw] of prefixed(`${f.name}.`)) {
        const n = number(raw === "" ? null : raw, `${f.label}（${id}）`, false);
        if (n !== null) out[id] = n;
      }
      return sql.json(out);
    }
    case "persona_mark": {
      const out: Record<string, string> = {};
      for (const [id, raw] of prefixed(`${f.name}.`)) {
        if (raw === "") continue;
        if (!(MARKS as string[]).includes(raw)) throw new Error(`${f.label}（${id}）は ◎〇－△× から選んでください`);
        out[id] = raw;
      }
      return sql.json(out);
    }
    case "age_num": {
      const out: Record<string, number> = {};
      for (const band of AGE_BANDS) {
        const n = number(text(formData, `${f.name}.${band}`), `${f.label}（${band}）`, false);
        if (n !== null) out[band] = n;
      }
      return sql.json(out);
    }
    case "num_list": {
      const raw = text(formData, f.name);
      const list = raw === null ? [] : raw.split(/[,，\s]+/).filter(Boolean).map((x) => number(x, f.label, false) ?? 0);
      return sql.json(list);
    }
  }
}

/** 主キーで行を指す where 句 */
function wherePk(sql: Sql, def: TableDef, formData: FormData) {
  const pks = def.fields.filter((f) => f.pk);
  const parts = pks.map((f) => {
    const v = text(formData, `__pk.${f.name}`);
    if (v === null) throw new Error("変更する行が正しくありません");
    return sql`${sql(f.name)} = ${v}`;
  });
  return parts.reduce((a, b) => sql`${a} and ${b}`);
}

export async function saveScoringRow(_prev: ScoringFormState, formData: FormData): Promise<ScoringFormState> {
  try {
    const def = tableOf(formData);
    const insert = formData.get("__mode") === "insert";
    if (insert && !def.canAdd) throw new Error(`${def.label}には行を追加できません`);
    const sql = getSql();
    const values: Record<string, unknown> = {};
    for (const f of def.fields) {
      if ((f.pk || f.adminOnly) && !insert) continue;
      values[f.name] = readField(sql, formData, f);
    }
    if (def.table === "scoring_params") {
      // 層の重み（5層）は合計100%にする
      const layerKeys = ["物件", "購入可能性", "生活環境", "市場", "競合"];
      const key = text(formData, "__pk.key");
      if (key && layerKeys.includes(key)) {
        const others = await sql<{ s: string | null }[]>`select sum(value) as s from scoring_params where key = any(${layerKeys}) and key <> ${key}`;
        const total = Number(others[0]?.s ?? 0) + Number(values.value);
        if (Math.abs(total - 1) > 0.001) {
          // 保存はするが、合計が100%でないことを知らせる（ほかの層を直す途中のことがあるため）
          await save(sql, def, formData, values, insert);
          return { ok: `保存しました。5つの層の重みの合計が ${Math.round(total * 1000) / 10}% です（100%にそろえてください）` };
        }
      }
    }
    await save(sql, def, formData, values, insert);
    return { ok: insert ? "追加しました（次の分析から使います）" : "保存しました（次の分析から使います）" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

async function save(sql: Sql, def: TableDef, formData: FormData, values: Record<string, unknown>, insert: boolean) {
  // 変更者は入れない（取り込みのときの「import」などが残らないよう、空にする）
  const row = { ...values, updated_by: null };
  if (insert) await sql`insert into ${sql(def.table)} ${sql(row)}`;
  else {
    const result = await sql`update ${sql(def.table)} set ${sql(row)} where ${wherePk(sql, def, formData)}`;
    if (result.count === 0) throw new Error("変更する行が見つかりません（ほかの人が消した可能性があります）");
  }
  revalidatePath("/rules");
}

export async function deleteScoringRow(_prev: ScoringFormState, formData: FormData): Promise<ScoringFormState> {
  try {
    const def = tableOf(formData);
    if (!def.canDelete) throw new Error(`${def.label}の行は削除できません（「使う」を外してください）`);
    const sql = getSql();
    await sql`delete from ${sql(def.table)} where ${wherePk(sql, def, formData)}`;
    revalidatePath("/rules");
    return { ok: "削除しました" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

// 反響の記録（Excel：反響の記録）。問い合わせ1件あたりの費用から反響係数を出し、媒体配分に反映する

export async function addMediaResult(_prev: ScoringFormState, formData: FormData): Promise<ScoringFormState> {
  try {
    const mediaId = text(formData, "media_id");
    if (!mediaId) throw new Error("媒体を選んでください");
    const int = (name: string, label: string) => {
      const n = number(text(formData, name), label, true) ?? 0;
      if (n < 0) throw new Error(`${label}は0以上にしてください`);
      return n;
    };
    const startedOn = text(formData, "started_on");
    if (startedOn !== null && !/^\d{4}-\d{2}-\d{2}$/.test(startedOn)) throw new Error("掲載開始日は日付で入れてください");
    const propertyId = number(text(formData, "property_id"), "物件", true);
    const row = {
      property_id: propertyId,
      media_id: mediaId,
      started_on: startedOn,
      cost_yen: int("cost_yen", "費用"),
      inquiries: int("inquiries", "問い合わせ数"),
    };
    const sql = getSql();
    await sql`insert into media_results ${sql(row)}`;
    revalidatePath("/rules");
    return { ok: "反響の記録を追加しました（反響係数は次の分析から使います）" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteMediaResult(id: number): Promise<ScoringFormState> {
  if (!Number.isInteger(id) || id <= 0) return { error: "行が正しくありません" };
  await getSql()`delete from media_results where id = ${id}`;
  revalidatePath("/rules");
  return { ok: "削除しました" };
}
