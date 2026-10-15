import type postgres from "postgres";
import type { Sql } from "./db";
import type { CompetitorValues } from "../app/_components/CompetitorFields";
import { scoringSchemaReady } from "./scoring/schema-check";

// 競合物件の手入力（設計書 7章、D30）。物件ごとに3件まで
// 競合物件の入力画面（/research/detail）と物件の登録・変更のフォームの両方から使う
// どこで・いつ・誰が確かめたかも残す（source_type・source_site・confirmed_on・entered_by）

const SOURCE_TYPES = ["portal", "seen", "other"] as const;
export const MAX_COMPETITORS = 3;

/** 枠ごとの保存内容。values が null の枠は削除する（入れ直し・取り消し） */
export type CompetitorRow = { position: number; values: Record<string, unknown> | null };

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

/** フォームの c1_〜c3_ の欄を読んで確かめる。誤りがあれば Error を投げる（保存の前に呼ぶ） */
export function readCompetitors(formData: FormData): CompetitorRow[] {
  const enteredBy = text(formData, "entered_by");
  const rows: CompetitorRow[] = [];
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
    if (Object.values(values).every((v) => v === null)) {
      rows.push({ position, values: null });
      continue;
    }
    // 根拠が追えるように、どこで・いつ確かめたかは必須にする（D30）
    if (!sourceType || !(SOURCE_TYPES as readonly string[]).includes(sourceType)) throw new Error(`${label}：どこで見たかを選んでください`);
    if (sourceType === "portal" && !sourceSite) throw new Error(`${label}：参照したサイト名を入れてください`);
    if (!confirmedOn || !/^\d{4}-\d{2}-\d{2}$/.test(confirmedOn)) throw new Error(`${label}：確認日を入れてください`);
    if (!enteredBy) throw new Error("競合物件を入力した人の名前を入れてください");
    rows.push({ position, values: { ...values, source_type: sourceType, source_site: sourceSite, confirmed_on: confirmedOn, entered_by: enteredBy } });
  }
  return rows;
}

/** 3件分をまとめて保存する。tx はトランザクションの中で呼ぶ。scoringReady が false なら築年数は保存しない（D35 のマイグレーション前） */
export async function writeCompetitors(tx: postgres.TransactionSql, propertyId: number, rows: CompetitorRow[], scoringReady: boolean): Promise<number> {
  for (const r of rows) {
    if (r.values === null) {
      await tx`delete from competitors where property_id = ${propertyId} and position = ${r.position}`;
      continue;
    }
    const values = { ...r.values };
    if (!scoringReady) delete values.age_years;
    await tx`
      insert into competitors ${tx({ property_id: propertyId, position: r.position, ...values })}
      on conflict (property_id, position) do update set ${tx(values)}
    `;
  }
  return rows.filter((r) => r.values !== null).length;
}

const toDateInput = (d: Date) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

/** 物件の競合物件をフォームの値として読む */
export async function loadCompetitors(sql: Sql, propertyId: number): Promise<CompetitorValues[]> {
  const rows = await sql<
    { position: number; price_man_yen: number | null; location: string | null; land_sqm: string | null; building_sqm: string | null; layout: string | null; walk_min: number | null; age_years: number | null; parking: number | null; features: string | null; source_type: CompetitorValues["sourceType"]; source_site: string | null; confirmed_on: Date | null; entered_by: string | null }[]
  >`
    select position, price_man_yen, location, land_sqm, building_sqm, layout, walk_min, ${(await scoringSchemaReady(sql)) ? sql`age_years` : sql`null as age_years`}, parking, features, source_type, source_site, confirmed_on, entered_by
    from competitors where property_id = ${propertyId} order by position
  `;
  return rows.map((r) => ({
    position: r.position,
    priceManYen: r.price_man_yen,
    location: r.location,
    landSqm: r.land_sqm === null ? null : Number(r.land_sqm),
    buildingSqm: r.building_sqm === null ? null : Number(r.building_sqm),
    layout: r.layout,
    walkMin: r.walk_min,
    ageYears: r.age_years,
    parking: r.parking,
    features: r.features,
    sourceType: r.source_type,
    sourceSite: r.source_site,
    confirmedOn: r.confirmed_on ? toDateInput(r.confirmed_on) : null,
    enteredBy: r.entered_by,
  }));
}
