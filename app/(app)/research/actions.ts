"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "../../../lib/db";
import { readCompetitors, writeCompetitors } from "../../../lib/competitors";
import { scoringSchemaReady } from "../../../lib/scoring/schema-check";

// 競合物件の手入力（設計書 7章、D30）。物件ごとに3件まで。読み取り・保存は lib/competitors.ts
// ポータルサイトの写真や文章は転載しない。条件（価格・面積など）と、自分の言葉の特徴だけ

export interface CompetitorFormState {
  ok?: string;
  error?: string;
}

/** 3件分をまとめて保存する。すべて空の枠は削除する（入れ直し・取り消し） */
export async function saveCompetitors(_prev: CompetitorFormState, formData: FormData): Promise<CompetitorFormState> {
  try {
    const propertyId = Number(formData.get("property_id"));
    if (!Number.isInteger(propertyId) || propertyId <= 0) throw new Error("物件を選んでください");
    const rows = readCompetitors(formData);

    const sql = getSql();
    // 採点ルール表（D35）の築年数の列は、マイグレーションが入る前は保存しない
    const scoringReady = await scoringSchemaReady(sql);
    const saved = await sql.begin((tx) => writeCompetitors(tx, propertyId, rows, scoringReady));
    revalidatePath("/research/detail");
    revalidatePath("/research/result");
    return { ok: saved > 0 ? `競合物件 ${saved}件を保存しました。分析し直すと、結果に反映されます。` : "競合物件を空にしました（未入力のまま分析できます）。" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
