"use server";

import { revalidatePath } from "next/cache";
import { getSql } from "../../../lib/db";
import { scoringSchemaReady } from "../../../lib/scoring/schema-check";

// 競合物件の手入力（設計書 7章、D30）。物件ごとに3件まで
// どこで・いつ・誰が確かめたかも残す（source_type・source_site・confirmed_on・entered_by）
// ポータルサイトの写真や文章は転載しない。条件（価格・面積など）と、自分の言葉の特徴だけ

export interface CompetitorFormState {
  ok?: string;
  error?: string;
}

const SOURCE_TYPES = ["portal", "seen", "other"] as const;
const MAX_COMPETITORS = 3;

function text(formData: FormData, name: string): string | null {
  const v = String(formData.get(name) ?? "").trim();
  return v === "" ? null : v;
}

function num(formData: FormData, name: string, label: string, int = false): number | null {
  const raw = text(formData, name);
  if (raw === null) return null;
  const n = Number(raw.replace(/[,，]/g, ""));
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label}には0以上の数字を入れてください`);
  if (int && !Number.isInteger(n)) throw new Error(`${label}は整数で入れてください`);
  return n;
}

/** 3件分をまとめて保存する。すべて空の枠は削除する（入れ直し・取り消し） */
export async function saveCompetitors(_prev: CompetitorFormState, formData: FormData): Promise<CompetitorFormState> {
  try {
    const propertyId = Number(formData.get("property_id"));
    if (!Number.isInteger(propertyId) || propertyId <= 0) throw new Error("物件を選んでください");
    const enteredBy = text(formData, "entered_by");

    const rows: { position: number; values: Record<string, unknown> | null }[] = [];
    for (let position = 1; position <= MAX_COMPETITORS; position++) {
      const f = (name: string) => `c${position}_${name}`;
      const label = `競合${position}`;
      const values = {
        price_man_yen: num(formData, f("price"), `${label}の価格`, true),
        location: text(formData, f("location")),
        land_sqm: num(formData, f("land"), `${label}の土地面積`),
        building_sqm: num(formData, f("building"), `${label}の建物面積`),
        layout: text(formData, f("layout")),
        walk_min: num(formData, f("walk"), `${label}の駅徒歩`, true),
        age_years: num(formData, f("age"), `${label}の築年数`, true),
        parking: num(formData, f("parking"), `${label}の駐車場`, true),
        features: text(formData, f("features")),
      };
      const sourceType = text(formData, f("source_type"));
      const sourceSite = text(formData, f("source_site"));
      const confirmedOn = text(formData, f("confirmed_on"));
      const empty = Object.values(values).every((v) => v === null);
      if (empty) {
        rows.push({ position, values: null });
        continue;
      }
      // 根拠が追えるように、どこで・いつ確かめたかは必須にする（D30）
      if (!sourceType || !(SOURCE_TYPES as readonly string[]).includes(sourceType)) throw new Error(`${label}：どこで見たかを選んでください`);
      if (sourceType === "portal" && !sourceSite) throw new Error(`${label}：参照したサイト名を入れてください`);
      if (!confirmedOn || !/^\d{4}-\d{2}-\d{2}$/.test(confirmedOn)) throw new Error(`${label}：確認日を入れてください`);
      if (!enteredBy) throw new Error("入力した人の名前を入れてください");
      rows.push({ position, values: { ...values, source_type: sourceType, source_site: sourceSite, confirmed_on: confirmedOn, entered_by: enteredBy } });
    }

    const sql = getSql();
    // 採点ルール表（D35）の築年数の列は、マイグレーションが入る前は保存しない
    if (!(await scoringSchemaReady(sql))) for (const r of rows) if (r.values) delete r.values.age_years;
    await sql.begin(async (tx) => {
      for (const r of rows) {
        if (r.values === null) {
          await tx`delete from competitors where property_id = ${propertyId} and position = ${r.position}`;
          continue;
        }
        const v = { property_id: propertyId, position: r.position, ...r.values };
        await tx`
          insert into competitors ${tx(v)}
          on conflict (property_id, position) do update set ${tx(r.values)}
        `;
      }
    });
    revalidatePath("/research/detail");
    revalidatePath("/research/result");
    const saved = rows.filter((r) => r.values !== null).length;
    return { ok: saved > 0 ? `競合物件 ${saved}件を保存しました。分析し直すと、結果に反映されます。` : "競合物件を空にしました（未入力のまま分析できます）。" };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}
