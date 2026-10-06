"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSql } from "../../../lib/db";
import { GEOCODER, geocodeAddress } from "../../../lib/geocode";
import { PROPERTY_TYPES } from "../../../lib/rules/describe";
import { fetchLayer, type FetchResult } from "../../../lib/surroundings/fetch";
import { LAYERS } from "../../../lib/surroundings/layers";

// 物件の登録・変更（設計書 7章 /properties/new、D15）
// 保存すると住所から緯度経度を取る。取れなかったとき・ずれていたときは、地図でピンを置き直す（setLocation）
// テスト物件は秘密保持契約の対象。物件の中身をログに出さない（D28）

export interface PropertyFormState {
  ok?: string;
  error?: string;
}

const AREA_CLASSES = ["center", "suburb", "outer"] as const;

function text(formData: FormData, name: string): string | null {
  const v = String(formData.get(name) ?? "").trim();
  return v === "" ? null : v;
}

/** 数字の欄。空なら null。カンマは取り除く */
function num(formData: FormData, name: string, label: string, opts: { int?: boolean; min?: number } = {}): number | null {
  const raw = text(formData, name);
  if (raw === null) return null;
  const n = Number(raw.replace(/[,，]/g, ""));
  if (!Number.isFinite(n)) throw new Error(`${label}には数字を入れてください`);
  if (opts.int && !Number.isInteger(n)) throw new Error(`${label}は整数で入れてください`);
  if (opts.min !== undefined && n < opts.min) throw new Error(`${label}は${opts.min}以上にしてください`);
  return n;
}

function readForm(formData: FormData) {
  const name = text(formData, "name");
  if (!name) throw new Error("物件名を入れてください");
  const address = text(formData, "address");
  if (!address) throw new Error("所在地を入れてください");
  const propertyType = text(formData, "property_type");
  if (!propertyType || !(PROPERTY_TYPES as readonly string[]).includes(propertyType)) throw new Error("物件種別を選んでください");
  const areaClass = text(formData, "area_class");
  if (areaClass !== null && !(AREA_CLASSES as readonly string[]).includes(areaClass)) throw new Error("エリアの区分を選び直してください");
  const deadline = text(formData, "sales_deadline");
  if (deadline !== null && !/^\d{4}-\d{2}-\d{2}$/.test(deadline)) throw new Error("販売期限は日付で入れてください");

  return {
    name,
    property_type: propertyType,
    price_man_yen: num(formData, "price_man_yen", "売出価格", { int: true, min: 1 }),
    address,
    area_class: areaClass,
    layout: text(formData, "layout"),
    land_sqm: num(formData, "land_sqm", "土地面積", { min: 0 }),
    building_sqm: num(formData, "building_sqm", "建物面積", { min: 0 }),
    parking: num(formData, "parking", "駐車場の台数", { int: true, min: 0 }),
    access: text(formData, "access"),
    features: text(formData, "features"),
    total_budget_man_yen: num(formData, "total_budget_man_yen", "広告の総予算", { int: true, min: 1 }),
    sales_deadline: deadline,
    sales_goal: text(formData, "sales_goal"),
  };
}

/** 住所から緯度経度を取って保存する。取れなければ位置を空にし、理由を返す */
async function geocodeAndStore(propertyId: number, address: string): Promise<string | null> {
  const sql = getSql();
  try {
    const hit = await geocodeAddress(address);
    if (!hit) {
      await sql`update properties set geom = null, geocode_source = null, geocoded_at = null where id = ${propertyId}`;
      return "住所から位置が見つかりませんでした。地図をクリックして位置を指定してください。";
    }
    await sql`
      update properties
      set geom = extensions.st_setsrid(extensions.st_makepoint(${hit.lon}, ${hit.lat}), 4326), geocode_source = ${GEOCODER}, geocoded_at = now()
      where id = ${propertyId}
    `;
    return null;
  } catch {
    return "住所検索につながりませんでした。時間をおいて「住所から位置を取り直す」を押すか、地図で位置を指定してください。";
  }
}

/** 新規登録（id なし）と変更（id あり）。新規は保存後に物件の画面へ移る */
export async function saveProperty(_prev: PropertyFormState, formData: FormData): Promise<PropertyFormState> {
  let createdId: number | null = null;
  let geocodeWarning: string | null = null;
  try {
    const sql = getSql();
    const v = readForm(formData);
    const id = Number(text(formData, "id") ?? 0);

    if (id > 0) {
      const [before] = await sql<{ address: string; geocode_source: string | null }[]>`select address, geocode_source from properties where id = ${id}`;
      if (!before) throw new Error(`物件 ${id} がありません`);
      await sql`update properties set ${sql(v)} where id = ${id}`;
      // 住所を変えたら位置を取り直す。地図で置いたピン（manual）も、住所が変わったら取り直す
      const warning = before.address !== v.address ? await geocodeAndStore(id, v.address) : null;
      revalidatePath(`/properties/${id}`);
      if (warning) return { error: `保存しました。${warning}` };
      return { ok: before.address !== v.address ? "保存しました。住所が変わったので、位置を取り直しました。地図のピンを確かめてください。" : "保存しました。" };
    }

    const [row] = await sql<{ id: number }[]>`insert into properties ${sql(v)} returning id`;
    createdId = Number(row.id);
    geocodeWarning = await geocodeAndStore(createdId, v.address);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
  redirect(`/properties/${createdId}?created=1${geocodeWarning ? "&geocode=failed" : ""}`);
}

/** 地図で置いたピンの位置を保存する */
export async function setLocation(propertyId: number, lon: number, lat: number): Promise<PropertyFormState> {
  if (!Number.isInteger(propertyId) || !Number.isFinite(lon) || !Number.isFinite(lat)) return { error: "位置が正しくありません" };
  if (lon < 137.5 || lon > 140.0 || lat < 36.7 || lat > 38.6) return { error: "新潟県の外の位置です（PoCは新潟県内だけ）" };
  const rows = await getSql()`
    update properties
    set geom = extensions.st_setsrid(extensions.st_makepoint(${lon}, ${lat}), 4326), geocode_source = 'manual', geocoded_at = now()
    where id = ${propertyId}
    returning id
  `;
  if (rows.length === 0) return { error: `物件 ${propertyId} がありません` };
  revalidatePath(`/properties/${propertyId}`);
  return { ok: "位置を保存しました。次の分析から、この位置で集計します。" };
}

/** 住所からもう一度位置を取る */
export async function regeocode(propertyId: number): Promise<PropertyFormState> {
  const [row] = await getSql()<{ address: string }[]>`select address from properties where id = ${propertyId}`;
  if (!row) return { error: `物件 ${propertyId} がありません` };
  const warning = await geocodeAndStore(propertyId, row.address);
  revalidatePath(`/properties/${propertyId}`);
  return warning ? { error: warning } : { ok: "住所から位置を取り直しました。地図のピンを確かめてください。" };
}

/**
 * 物件の周りの公開データを1種類だけ取る（設計書 4.2）。画面はこれを種類ごとに順に呼び、進み具合を出す
 * 1回の呼び出しは数秒（タイル数枚）なので、Vercel の実行時間の上限にかからない
 */
export async function fetchSurroundingLayer(propertyId: number, apiId: string): Promise<FetchResult> {
  const layer = LAYERS.find((l) => l.apiId === apiId);
  if (!Number.isInteger(propertyId) || propertyId <= 0 || !layer) throw new Error("物件または取るデータの指定が正しくありません");
  const apiKey = process.env.REINFOLIB_API_KEY;
  if (!apiKey) {
    return { apiId, name: layer.name, tiles: 0, featuresInTiles: 0, featuresKept: 0, status: "failed", error: "REINFOLIB_API_KEY が設定されていません（.env.local・Vercel の環境変数）" };
  }
  const result = await fetchLayer(getSql(), propertyId, apiKey, layer);
  return result;
}
