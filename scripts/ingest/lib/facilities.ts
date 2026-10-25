import type { Sql } from "../../../lib/db";

// 施設（facilities）への書き込み。位置は経度・緯度で受け取り、PostGIS で geography の点にする

export interface FacilityRow {
  dataset_id: string;
  kind: string;
  name: string;
  address: string | null;
  departments?: string[] | null;
  attrs?: Record<string, unknown> | null;
  source_ref?: string | null;
  lon: number;
  lat: number;
  raw?: Record<string, unknown> | null;
}

export async function insertFacilities(sql: Sql, rows: FacilityRow[], chunkSize = 1000): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize).map((r) => ({
      ...r,
      departments: r.departments ?? null,
      attrs: r.attrs ?? null,
      source_ref: r.source_ref ?? null,
      raw: r.raw ?? null,
    }));
    await sql`
      insert into facilities (dataset_id, kind, name, address, departments, attrs, source_ref, geog, raw)
      select x.dataset_id, x.kind, x.name, x.address,
        (select array_agg(d) from jsonb_array_elements_text(x.departments) as d),
        x.attrs, x.source_ref,
        extensions.st_setsrid(extensions.st_point(x.lon, x.lat), 4326)::extensions.geography,
        x.raw
      from jsonb_to_recordset(${sql.json(chunk as never)}) as x(
        dataset_id text, kind text, name text, address text, departments jsonb, attrs jsonb,
        source_ref text, lon float8, lat float8, raw jsonb)
    `;
  }
}

/** GeoJSON の点（Point）の経度・緯度。点でなければエラー */
export function pointOf(geometry: { type: string; coordinates?: unknown }): { lon: number; lat: number } {
  if (geometry.type !== "Point" || !Array.isArray(geometry.coordinates)) throw new Error(`点ではない図形です：${geometry.type}`);
  const [lon, lat] = geometry.coordinates as number[];
  return { lon, lat };
}
