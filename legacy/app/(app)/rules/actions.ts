"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "../../../lib/db";
import { MEDIA } from "../../../lib/rules/catalog";
import { FACT_OPTIONS, PROPERTY_TYPES, fromInput } from "../../../lib/rules/describe";
import type { Condition, Effect, Op, Rule } from "../../../lib/rules/engine";
import type { Sql } from "../../../lib/db";

// ルール表の画面から、ルールを追加・変更・削除する（設計書 D14）
// PoC では Basic認証の共通パスワードを知る人なら誰でも編集できる（D14）。誰が直したかは履歴で追う
// 変えると rules の version が上がり、変更（削除も）が rule_revisions に残る（DBのトリガー）

export interface ActionState {
  ok?: string;
  error?: string;
}

const KINDS: Rule["kind"][] = ["target_score", "appeal_score", "total_budget", "media_weight", "min_spend"];
const OPS: Op[] = [">", ">=", "<", "<="];

function text(formData: FormData, name: string) {
  return String(formData.get(name) ?? "").trim();
}

function number(formData: FormData, name: string, label: string) {
  const raw = text(formData, name);
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n)) throw new Error(`${label}に数値を入れてください`);
  return n;
}

/** 条件の末端1つ（c0_、c1_ の項目）を読む */
function leaf(formData: FormData, i: number): Condition {
  const label = `条件${i + 1}`;
  const fact = FACT_OPTIONS.find((f) => f.key === text(formData, `c${i}_fact`));
  if (!fact) throw new Error(`${label}：何を見るかを選んでください`);
  if (fact.unit === "text") {
    const word = text(formData, `c${i}_value`);
    if (!word) throw new Error(`${label}：入っているか調べる言葉を入れてください`);
    return { fact: fact.key, op: "contains", than: word };
  }
  const op = text(formData, `c${i}_op`) as Op;
  if (!OPS.includes(op)) throw new Error(`${label}：比べ方を選んでください`);
  const value = number(formData, `c${i}_value`, label);
  if (text(formData, `c${i}_compare`) === "comparison") {
    if (!fact.comparable) throw new Error(`${label}：「${fact.label}」は比べる値がありません`);
    // 割合でない値（1㎡あたりの価格 など）は、比べる値そのものと比べる
    if (fact.unit !== "ratio") return { fact: fact.key, op, than: "comparison" };
    // 区・市の値より「○ポイント多い」は ＞ 比べる値＋○、「○ポイント少ない」は ＜ 比べる値−○
    const delta = Math.round(Math.abs(value) * 10) / 1000;
    return { fact: fact.key, op, than: "comparison", delta: op === "<" || op === "<=" ? -delta : delta };
  }
  return { fact: fact.key, op, than: fromInput(value, fact.unit) };
}

function readCondition(formData: FormData): Condition {
  const mode = text(formData, "cond_mode");
  const types = formData.getAll("when_type").map(String).filter((t) => (PROPERTY_TYPES as readonly string[]).includes(t));
  const when = types.length > 0 ? { when: { property_type: types } } : {};
  if (mode === "always") return { always: true, ...when };
  if (mode === "1") return { ...leaf(formData, 0), ...when };
  if (mode === "2") return { all: [leaf(formData, 0), leaf(formData, 1)], ...when };
  throw new Error("条件の数を選んでください");
}

async function readEffect(sql: Sql, formData: FormData, kind: Rule["kind"]): Promise<Effect> {
  if (kind === "target_score") {
    const candidate = text(formData, "e_candidate");
    const [found] = await sql`select id from target_candidates where id = ${candidate}`;
    if (!found) throw new Error("効果：狙う層の候補を選んでください");
    return { candidate, score: number(formData, "e_score", "効果：点数") };
  }
  if (kind === "appeal_score") {
    const appeal = text(formData, "e_appeal");
    const [found] = await sql`select id from appeal_items where id = ${appeal}`;
    if (!found) throw new Error("効果：訴求の素材を選んでください");
    return { appeal, score: number(formData, "e_score", "効果：点数") };
  }
  if (kind === "total_budget") {
    const total = number(formData, "e_total", "効果：総予算");
    if (total <= 0) throw new Error("効果：総予算は0より大きい額にしてください");
    return { total_man_yen: total };
  }
  const media = text(formData, "e_media");
  if (!MEDIA.some((m) => m.id === media)) throw new Error("効果：媒体を選んでください");
  if (kind === "media_weight") {
    const mode = text(formData, "e_media_mode");
    const value = number(formData, "e_media_value", "効果：重み");
    if (value < 0) throw new Error("効果：重みは0以上にしてください");
    if (mode === "weight") return { media, weight: value };
    if (mode === "multiply") return { media, multiply: value };
    throw new Error("効果：出発点か倍率かを選んでください");
  }
  const mode = text(formData, "e_spend_mode");
  const value = number(formData, "e_spend_value", "効果：金額");
  if (value < 0) throw new Error("効果：金額は0以上にしてください");
  if (mode === "fixed") return { media, fixed_man_yen: value };
  if (mode === "min") return { media, min_man_yen: value };
  throw new Error("効果：固定額か最低額かを選んでください");
}

/** 追加（id なし）と変更（id あり） */
export async function saveRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const sql = getSql();
    const id = text(formData, "id");
    const kind = text(formData, "kind") as Rule["kind"];
    if (!KINDS.includes(kind)) throw new Error("ルールの種類を選んでください");
    const condition = readCondition(formData);
    const effect = await readEffect(sql, formData, kind);
    const note = text(formData, "note");
    if (!note) throw new Error("理由を入れてください");
    const enabled = formData.get("enabled") === "on";
    const updatedBy = text(formData, "updated_by") || "ルール表の画面";

    if (id) {
      const rows = await sql`
        update rules
        set condition = ${sql.json(condition as never)}, effect = ${sql.json(effect as never)},
            note = ${note}, enabled = ${enabled}, updated_by = ${updatedBy}
        where id = ${id} and kind = ${kind}
        returning id
      `;
      if (rows.length === 0) throw new Error(`ルール ${id} がありません`);
      revalidatePath("/rules/legacy");
      return { ok: `${id} を保存しました` };
    }

    // 番号は「R-」＋（今ある一番大きい番号＋1）
    const [{ next }] = await sql<{ next: number }[]>`
      select coalesce(max(substring(id from '^R-(\\d+)$')::int), 0) + 1 as next from rules
    `;
    const newId = `R-${String(next).padStart(2, "0")}`;
    await sql`
      insert into rules (id, kind, condition, effect, note, enabled, updated_by)
      values (${newId}, ${kind}, ${sql.json(condition as never)}, ${sql.json(effect as never)}, ${note}, ${enabled}, ${updatedBy})
    `;
    revalidatePath("/rules/legacy");
    return { ok: `${newId} を追加しました` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

export async function deleteRule(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const id = text(formData, "id");
    const rows = await getSql()`delete from rules where id = ${id} returning id`;
    if (rows.length === 0) throw new Error(`ルール ${id} がありません`);
    revalidatePath("/rules/legacy");
    return { ok: `${id} を削除しました（変更の履歴に、削除前の内容が残っています）` };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
