import { unzipSync } from "fflate";
import type { Geometry, Position } from "geojson";
import { insertFacilities, type FacilityRow } from "../lib/facilities";
import { readShapefile } from "../lib/files";
import { defineJob } from "../lib/runner";

// D28 スーパー・ドラッグストア・コンビニ（OpenStreetMap、Geofabrik の中部地方 Shapefile 版）
// npm run ingest -- osm
// data/raw/osm/ に chubu-<日付>-free.shp.zip を置く（例：chubu-261024-free.shp.zip。日付 261024 が時点 2026-10-24）
// 店は「点」（gis_osm_pois_free_1）と「建物の形」（gis_osm_pois_a_free_1）の2通りで入っているので、両方を読む。形は中心を位置にする
// fclass：supermarket → スーパー、convenience → コンビニ、chemist → ドラッグストア
// （pharmacy は調剤薬局。薬局は医療情報ネットの方を使う）
// 中部地方のファイルなので、新潟県の町から約300m以内の店だけを残す。先に d39-towns を入れておく
// 出典表示は「© OpenStreetMap contributors」（ODbL）

const KINDS: Record<string, string> = { supermarket: "スーパー", convenience: "コンビニ", chemist: "ドラッグストア" };
const PREF_BBOX = [137.6, 36.7, 139.95, 38.6]; // 新潟県（佐渡を含む）のおおよその範囲

/** 図形の位置。点はそのまま、形は外周の頂点の平均（店の建物くらいの大きさなら十分） */
function positionOf(geometry: Geometry): { lon: number; lat: number } | null {
  if (geometry.type === "Point") return { lon: geometry.coordinates[0], lat: geometry.coordinates[1] };
  const ring: Position[] | undefined =
    geometry.type === "Polygon" ? geometry.coordinates[0] : geometry.type === "MultiPolygon" ? geometry.coordinates[0]?.[0] : undefined;
  if (!ring?.length) return null;
  const lon = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lat = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return { lon, lat };
}

export const osm = defineJob({
  datasets: ["D28"],
  rawDir: "osm",
  table: "facilities",
  options: [],

  async load({ sql, raw, log, setAsOf, check }) {
    const zip = raw.find(/\.shp\.zip$/i, "Geofabrik の chubu-<日付>-free.shp.zip");
    const date = /-(\d{2})(\d{2})(\d{2})-free/.exec(zip.name);
    if (date) setAsOf("D28", `20${date[1]}-${date[2]}-${date[3]}`);

    const files = unzipSync(zip.body, { filter: (f) => /^gis_osm_pois(_a)?_free_1\.(shp|dbf)$/.test(f.name) });
    const rows: FacilityRow[] = [];
    let unnamed = 0;
    for (const layer of ["gis_osm_pois_free_1", "gis_osm_pois_a_free_1"]) {
      for await (const f of readShapefile(files[`${layer}.shp`], files[`${layer}.dbf`], "utf-8")) {
        const p = f.properties;
        const kind = KINDS[String(p.fclass)];
        if (!kind || !f.geometry) continue;
        const pos = positionOf(f.geometry);
        if (!pos) continue;
        const [w, s, e, n] = PREF_BBOX;
        if (pos.lon < w || pos.lon > e || pos.lat < s || pos.lat > n) continue;
        const name = String(p.name ?? "").trim();
        if (!name) unnamed++;
        rows.push({
          dataset_id: "D28",
          kind,
          name: name || `（名前の無い${kind}）`,
          address: null,
          attrs: { osm_id: p.osm_id, fclass: p.fclass, 形: layer.includes("_a_") ? "建物" : "点" },
          source_ref: `${layer.includes("_a_") ? "a" : "p"}${p.osm_id}`,
          ...pos,
        });
      }
    }
    await insertFacilities(sql, rows);
    // 新潟県の町から約300m以上離れた店を消す（0.003度。geometry のまま比べて空間インデックスを使う）
    const removed = await sql`
      delete from facilities f
      where f.dataset_id = 'D28'
        and not exists (select 1 from towns t where extensions.st_dwithin(t.geom, f.geog::extensions.geometry, 0.003))
    `;
    log(`${zip.name}：新潟県の範囲の四角から ${rows.length}店を読み、新潟県の外の ${removed.count}店を除きました（名前の無い店 ${unnamed}）`);
    check("名前の無い店", unnamed);
  },
});
