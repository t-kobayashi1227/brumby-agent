"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSql, type Sql } from "../../../lib/db";
import { geocodeAddress } from "../../../lib/geocode";
import { FLOORS, parseLayout, PROPERTY_CLASSES, RENOVATION_PARTS, TRANSPORT_MODES } from "../../../lib/property";

// ①物件情報の入力の保存（docs/設計まとめ.md「①物件情報の入力」）
// 保存すると住所から位置（国土地理院 住所検索）を取る。ずれていたら、物件の画面の地図でピンを置き直す
// テスト物件は秘密保持契約の対象。物件の中身をログに出さない

export interface PropertyFormState {
  ok?: string;
  error?: string;
}

function text(formData: FormData, name: string): string | null {
  const v = String(formData.get(name) ?? "").trim();
  return v === "" ? null : v;
}

function required(formData: FormData, name: string, label: string): string {
  const v = text(formData, name);
  if (v === null) throw new Error(`${label}を入れてください`);
  return v;
}

/** 数字の欄。空なら null。カンマは取り除く */
function num(formData: FormData, name: string, label: string, opts: { int?: boolean; min?: number; positive?: boolean } = {}): number | null {
  const raw = text(formData, name);
  if (raw === null) return null;
  const n = Number(raw.normalize("NFKC").replace(/[,，]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${label}には数字を入れてください`);
  if (opts.int && !Number.isInteger(n)) throw new Error(`${label}は整数で入れてください`);
  if (opts.min !== undefined && n < opts.min) throw new Error(`${label}は${opts.min}以上にしてください`);
  if (opts.positive && n <= 0) throw new Error(`${label}は0より大きい数にしてください`);
  return n;
}

function requiredNum(formData: FormData, name: string, label: string, opts: { int?: boolean; min?: number; positive?: boolean } = {}): number {
  const n = num(formData, name, label, opts);
  if (n === null) throw new Error(`${label}を入れてください`);
  return n;
}

function oneOf<T extends string>(value: string | null, choices: readonly T[], label: string): T {
  if (value === null || !(choices as readonly string[]).includes(value)) throw new Error(`${label}を選んでください`);
  return value as T;
}

function readProperty(formData: FormData) {
  const layout = required(formData, "layout", "間取り");
  const parsed = parseLayout(layout);
  const renovated = oneOf(text(formData, "renovated"), ["あり", "なし"], "リフォーム") === "あり";
  const parts = formData.getAll("renovation_parts").map(String);
  if (parts.some((p) => !(RENOVATION_PARTS as readonly string[]).includes(p))) throw new Error("リフォームの箇所を選び直してください");
  const renovationYear = renovated ? num(formData, "renovation_year", "リフォームの年", { int: true, min: 1950 }) : null;
  if (renovated && renovationYear === null) throw new Error("リフォームの年を入れてください");
  if (renovated && parts.length === 0) throw new Error("リフォームの箇所を1つ以上選んでください");
  return {
    property_class: oneOf(text(formData, "property_class"), PROPERTY_CLASSES, "物件区分"),
    price_man_yen: requiredNum(formData, "price_man_yen", "価格", { int: true, positive: true }),
    address: required(formData, "address", "住所"),
    layout,
    rooms: parsed?.rooms ?? null,
    storerooms: parsed?.storerooms ?? null,
    building_sqm: requiredNum(formData, "building_sqm", "建物面積", { positive: true }),
    land_sqm: requiredNum(formData, "land_sqm", "土地面積", { positive: true }),
    parking: requiredNum(formData, "parking", "駐車台数", { int: true, min: 0 }),
    building_age: requiredNum(formData, "building_age", "築年数", { int: true, min: 0 }),
    floors: oneOf(text(formData, "floors"), FLOORS, "階数"),
    has_garden: oneOf(text(formData, "has_garden"), ["あり", "なし"], "庭") === "あり",
    renovated,
    renovation_year: renovationYear,
    renovation_parts: renovated ? parts : null,
    features: text(formData, "features"),
    ad_budget_man_yen: num(formData, "ad_budget_man_yen", "広告予算の総額", { int: true, positive: true }),
  };
}

/** 交通（最大2つ）。1つ目は必須。2つ目は全部空なら無し */
function readTransports(formData: FormData) {
  const rows = [];
  for (const position of [1, 2]) {
    const p = (k: string) => text(formData, `t${position}_${k}`);
    const empty = !p("mode") && !p("line") && !p("stop_name") && !p("walk_min");
    if (empty) {
      if (position === 1) throw new Error("交通（1つ目）を入れてください");
      continue;
    }
    const label = `交通（${position}つ目）`;
    rows.push({
      position,
      mode: oneOf(p("mode"), TRANSPORT_MODES, `${label}の種類`),
      line: p("line"),
      stop_name: required(formData, `t${position}_stop_name`, `${label}の駅またはバス停の名前`),
      walk_min: requiredNum(formData, `t${position}_walk_min`, `${label}の徒歩分`, { int: true, min: 0 }),
    });
  }
  return rows;
}

interface CompetitorInput {
  position: number;
  price_man_yen: number | null;
  address: string | null;
  building_sqm: number | null;
  land_sqm: number | null;
  building_age: number | null;
}

/** 競合物件（任意・複数）。全部空の行は無視する */
function readCompetitors(formData: FormData): CompetitorInput[] {
  const count = Number(formData.get("competitor_count") ?? 0);
  const rows: CompetitorInput[] = [];
  for (let i = 0; i < count; i++) {
    const c = (k: string) => text(formData, `c${i}_${k}`);
    if (!c("price_man_yen") && !c("address") && !c("building_sqm") && !c("land_sqm") && !c("building_age")) continue;
    const label = `競合物件（${rows.length + 1}件目）`;
    rows.push({
      position: rows.length + 1,
      price_man_yen: num(formData, `c${i}_price_man_yen`, `${label}の価格`, { int: true, positive: true }),
      address: c("address"),
      building_sqm: num(formData, `c${i}_building_sqm`, `${label}の建物面積`, { positive: true }),
      land_sqm: num(formData, `c${i}_land_sqm`, `${label}の土地面積`, { positive: true }),
      building_age: num(formData, `c${i}_building_age`, `${label}の築年数`, { int: true, min: 0 }),
    });
  }
  return rows;
}

/** 住所から位置を出して保存する。出せなかったときは、その旨の文を返す */
async function geocodeAndStore(sql: Sql, propertyId: number, address: string): Promise<string | null> {
  let hit;
  try {
    hit = await geocodeAddress(address);
  } catch {
    return "住所検索に接続できませんでした。地図をクリックしてピンを置いてください。";
  }
  if (!hit) return "住所から位置を出せませんでした。地図をクリックしてピンを置いてください。";
  await sql`
    update properties
    set geog = extensions.st_setsrid(extensions.st_point(${hit.lon}, ${hit.lat}), 4326)::extensions.geography,
        location_source = '住所検索', geocode_title = ${hit.title}
    where id = ${propertyId}
  `;
  return null;
}

/** 競合物件の住所から位置を出す（出せなければ位置なし。直線距離の事実が「取得できず」になる） */
async function competitorsWithLocation(competitors: ReturnType<typeof readCompetitors>) {
  const out = [];
  for (const c of competitors) {
    const hit = c.address ? await geocodeAddress(c.address).catch(() => null) : null;
    out.push({ ...c, lon: hit?.lon ?? null, lat: hit?.lat ?? null });
  }
  return out;
}

async function writeChildren(tx: Sql, propertyId: number, transports: ReturnType<typeof readTransports>, competitors: Awaited<ReturnType<typeof competitorsWithLocation>>) {
  await tx`delete from property_transports where property_id = ${propertyId}`;
  for (const t of transports) await tx`insert into property_transports ${tx({ property_id: propertyId, ...t })}`;
  await tx`delete from competitors where property_id = ${propertyId}`;
  for (const { lon, lat, ...c } of competitors) {
    await tx`
      insert into competitors (property_id, position, price_man_yen, address, building_sqm, land_sqm, building_age, geog)
      values (${propertyId}, ${c.position}, ${c.price_man_yen}, ${c.address}, ${c.building_sqm}, ${c.land_sqm}, ${c.building_age},
        ${lon !== null && lat !== null ? ewktPoint(lon, lat) : null}::extensions.geography)
    `;
  }
}

/** 経度・緯度を、PostGIS が読める文字（EWKT）にする */
function ewktPoint(lon: number, lat: number): string {
  return `SRID=4326;POINT(${lon} ${lat})`;
}

export async function saveProperty(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  let createdId: number | null = null;
  try {
    const sql = getSql();
    // 先に全部の欄を確かめる（誤りがあれば何も保存しない）
    const values = readProperty(formData);
    const transports = readTransports(formData);
    const competitors = await competitorsWithLocation(readCompetitors(formData));
    const id = Number(text(formData, "id") ?? 0);

    if (id > 0) {
      const [before] = await sql<{ address: string }[]>`select address from properties where id = ${id}`;
      if (!before) throw new Error(`物件 ${id} がありません`);
      await sql.begin(async (tx) => {
        await tx`update properties set ${tx(values)} where id = ${id}`;
        await writeChildren(tx as unknown as Sql, id, transports, competitors);
      });
      // 住所を変えたら位置を取り直す（地図で直したピンも、住所が変わったら取り直す）
      const warning = before.address !== values.address ? await geocodeAndStore(sql, id, values.address) : null;
      revalidatePath(`/properties/${id}`);
      revalidatePath("/properties");
      if (warning) return { error: `保存しました。${warning}` };
      return { ok: before.address !== values.address ? "保存しました。住所が変わったので、位置を取り直しました。地図のピンを確かめてください。" : "保存しました。" };
    }

    createdId = await sql.begin(async (tx) => {
      const [row] = await tx<{ id: number }[]>`insert into properties ${tx(values)} returning id`;
      await writeChildren(tx as unknown as Sql, Number(row.id), transports, competitors);
      return Number(row.id);
    });
    await geocodeAndStore(sql, createdId, values.address);
    revalidatePath("/properties");
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  // 登録したら、物件の画面（地図で位置を確かめる）へ
  redirect(`/properties/${createdId}?created=1`);
}

/** 地図で置き直したピンの位置を保存する */
export async function setLocation(propertyId: number, lon: number, lat: number): Promise<PropertyFormState> {
  if (!Number.isInteger(Number(propertyId)) || Number(propertyId) <= 0) return { error: "物件の番号が正しくありません。画面を読み込み直してください" };
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return { error: "位置が正しくありません" };
  if (lon < 137.5 || lon > 140.0 || lat < 36.7 || lat > 38.6) return { error: "新潟県の外の位置です（PoCは新潟県内だけ）" };
  const rows = await getSql()`
    update properties
    set geog = extensions.st_setsrid(extensions.st_point(${lon}, ${lat}), 4326)::extensions.geography, location_source = '手で修正'
    where id = ${propertyId}
    returning id
  `;
  if (rows.length === 0) return { error: `物件 ${propertyId} がありません` };
  revalidatePath(`/properties/${propertyId}`);
  return { ok: "位置を確定しました。" };
}

/** 住所からもう一度位置を取る */
export async function regeocode(propertyId: number): Promise<PropertyFormState> {
  const sql = getSql();
  const [row] = await sql<{ address: string }[]>`select address from properties where id = ${propertyId}`;
  if (!row) return { error: `物件 ${propertyId} がありません` };
  const warning = await geocodeAndStore(sql, propertyId, row.address);
  revalidatePath(`/properties/${propertyId}`);
  return warning ? { error: warning } : { ok: "住所から位置を取り直しました。地図のピンを確かめてください。" };
}

/** 登録の前に、住所が国土地理院の住所検索で見つかるかを確かめる（保存はしない） */
export async function previewAddress(address: string): Promise<PropertyFormState> {
  const q = String(address ?? "").trim();
  if (q === "") return { error: "住所を入れてください" };
  if (q.length > 200) return { error: "住所が長すぎます" };
  let hit;
  try {
    hit = await geocodeAddress(q);
  } catch {
    return { error: "住所検索に接続できませんでした。登録したあと、地図でピンを置けます。" };
  }
  if (!hit) return { error: "この住所では位置を出せませんでした。番地まで入っているか確かめてください。登録したあと、地図でピンを置くこともできます。" };
  // 町丁目までしか当たらないこともあるため、「番地まで合った」とは言わない
  return { ok: `住所検索では「${hit.title || q}」として見つかりました。番地まで合っているとは限らないため、登録したあと地図でピンの位置を確かめてください。` };
}
