import type { Sql } from "./db";

// 物件の写真（property_photos）。なければ共通の仮画像（public/house.jpg）を出す

export const PLACEHOLDER_PHOTO = "/house.jpg";

/** 受け付ける写真の大きさの上限（ブラウザで縮めてから送るので、ふつうは数百KB） */
export const MAX_PHOTO_BYTES = 2.5 * 1024 * 1024;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

let ready = false;

/** マイグレーション（20261012120000_property_photos.sql）が共有DBに入っているか。入る前は写真を使わない */
export async function photosReady(sql: Sql): Promise<boolean> {
  if (ready) return true;
  const [r] = await sql<{ ok: boolean }[]>`select to_regclass('public.property_photos') is not null as ok`;
  ready = Boolean(r?.ok);
  return ready;
}

/** 写真の版（更新日時）。物件ID → 版。版を URL に付けて、差し替えたときにブラウザの古い画像を使わないようにする */
export async function photoVersions(sql: Sql, propertyIds?: number[]): Promise<Map<number, number>> {
  if (!(await photosReady(sql))) return new Map();
  const rows = await sql<{ property_id: number; v: Date }[]>`
    select property_id, updated_at as v from property_photos ${propertyIds ? sql`where property_id = any(${propertyIds})` : sql``}
  `;
  return new Map(rows.map((r) => [Number(r.property_id), new Date(r.v).getTime()]));
}

/** 画面で使う写真の URL。写真がなければ仮画像 */
export const photoUrl = (propertyId: number, version: number | undefined) => (version ? `/properties/${propertyId}/photo?v=${version}` : PLACEHOLDER_PHOTO);
