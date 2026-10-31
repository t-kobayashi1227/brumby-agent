"use server";

import { revalidatePath } from "next/cache";
import { getSql, inOrder } from "../../../lib/db";
import { parsePropertyId } from "../../../lib/property";
import { readMediaResult, readSalesRecord } from "../../../lib/records";

// 販売の記録の保存（docs/設計まとめ.md「販売の記録」）。物件の中身をログに出さない

export interface RecordFormState {
  ok?: string;
  error?: string;
  /** 送るたびに変わる値（同じ文が続いても、画面が「保存した」を出し直せるように） */
  at?: number;
}

const fail = (error: unknown): RecordFormState => ({ error: error instanceof Error ? error.message : String(error), at: Date.now() });

async function choices() {
  const sql = getSql();
  const [media, targets] = await inOrder(
    () => sql<{ id: string }[]>`select id from media order by sort`,
    () => sql<{ name: string }[]>`select name from target_candidates order by id`,
  );
  return { mediaIds: media.map((m) => m.id), households: targets.map((t) => t.name) };
}

function propertyIdOf(formData: FormData): number {
  const id = parsePropertyId(String(formData.get("property_id") ?? ""));
  if (id === null) throw new Error("物件の番号が正しくありません。画面を読み込み直してください");
  return id;
}

export async function saveSalesRecord(_prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  try {
    const propertyId = propertyIdOf(formData);
    const values = readSalesRecord(formData, await choices());
    const sql = getSql();
    await sql`
      insert into sales_records ${sql({ property_id: propertyId, ...values })}
      on conflict (property_id) do update set ${sql(values)}
    `;
    revalidatePath(`/records/${propertyId}`);
    revalidatePath("/records");
    return { ok: "保存しました。", at: Date.now() };
  } catch (error) {
    return fail(error);
  }
}

/** 媒体の実績を保存する。result_id があればその行を修正し、無ければ行を足す */
export async function saveMediaResult(_prev: RecordFormState, formData: FormData): Promise<RecordFormState> {
  try {
    const propertyId = propertyIdOf(formData);
    const values = readMediaResult(formData, await choices());
    const resultRaw = String(formData.get("result_id") ?? "").trim();
    const sql = getSql();
    if (resultRaw !== "") {
      const resultId = Number(resultRaw);
      if (!Number.isInteger(resultId) || resultId <= 0) throw new Error("行の番号が正しくありません。画面を読み込み直してください");
      const updated = await sql`update media_results set ${sql(values)} where id = ${resultId} and property_id = ${propertyId} returning id`;
      if (updated.length === 0) throw new Error("修正する行が見つかりません。画面を読み込み直してください");
    } else {
      await sql`insert into media_results ${sql({ property_id: propertyId, ...values })}`;
    }
    revalidatePath(`/records/${propertyId}`);
    revalidatePath("/records");
    return { ok: resultRaw !== "" ? "修正しました。" : "追加しました。", at: Date.now() };
  } catch (error) {
    return fail(error);
  }
}

export async function deleteMediaResult(propertyId: number, resultId: number): Promise<RecordFormState> {
  if (parsePropertyId(propertyId) === null || !Number.isInteger(resultId)) return fail("番号が正しくありません。画面を読み込み直してください");
  await getSql()`delete from media_results where id = ${resultId} and property_id = ${propertyId}`;
  revalidatePath(`/records/${propertyId}`);
  revalidatePath("/records");
  return { ok: "削除しました。", at: Date.now() };
}
