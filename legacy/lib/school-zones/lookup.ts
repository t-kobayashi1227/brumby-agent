import type { Sql } from "../db";
import { resolveZone, type ParsedAddress, type ZoneRow } from "./parse";

// 市の通学区域（school_zones）を住所で引く。分析（lib/analyzers/facilities.ts）と物件の画面で共通に使う

/** 市の通学区域の版（source/dataset）。長岡市を取り込んだらここに足す */
export const SCHOOL_ZONE_SOURCES = ["niigata_city/tsugakukuiki"];

/** その市の、使用中の通学区域の版。なければ null */
export async function activeSchoolZoneVersion(sql: Sql, cityCode: string): Promise<{ id: number; attribution: string } | null> {
  const [row] = await sql<{ id: number; attribution: string }[]>`
    select id, attribution from dataset_versions
    where source || '/' || dataset = any(${SCHOOL_ZONE_SOURCES}) and coverage = ${`city:${cityCode}`} and status = 'active'
    order by id desc limit 1
  `;
  return row ? { id: Number(row.id), attribution: row.attribution } : null;
}

/** 版と住所から、小学校・中学校を決める */
export async function findSchoolZone(sql: Sql, versionId: number, address: ParsedAddress) {
  const rows = await sql<ZoneRow[]>`
    select ward, town, chome, lot_scope, lot_text, lot_ranges, elementary_school, junior_high_school
    from school_zones
    where dataset_version_id = ${versionId} and city_code = ${address.cityCode} and starts_with(${address.rest}, town)
  `;
  return resolveZone(rows, address);
}
