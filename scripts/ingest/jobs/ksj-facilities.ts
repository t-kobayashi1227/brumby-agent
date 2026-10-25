import type { Geometry, Position } from "geojson";
import { insertFacilities, pointOf, type FacilityRow } from "../lib/facilities";
import { rawFiles, readGeojsonFromZip } from "../lib/files";
import { defineJob, insertRows } from "../lib/runner";

// 国土数値情報の施設（利用者が data/raw/<コード>/ に置いた zip の中の GeoJSON を読む）
//   npm run ingest -- p29-schools      小学校・中学校・幼稚園・認定こども園（D15・D16・D19・D20）
//   npm run ingest -- p14-childcare    保育園・地域型保育（D17・D18）
//   npm run ingest -- p05-offices      市役所・区役所（D24）
//   npm run ingest -- n02-stations     駅と乗降客数（D25・D26。N02 と S12 の2つの zip を使う）
//   npm run ingest -- p11-bus-stops    バス停（D27）
// 各コードの意味は、国土数値情報のコードリストで 2026-10-25 に確かめた

const ZIP = /\.zip$/i;

// ---- P29 学校（2023） ----
// P29_003 学校分類：16001 小学校、16002 中学校、16011 幼稚園、16013 幼保連携型認定こども園
// （16012 特別支援学校、16004 高等学校などは使わない）
const P29_KINDS: Record<string, { kind: string; dataset: string }> = {
  "16001": { kind: "小学校", dataset: "D15" },
  "16002": { kind: "中学校", dataset: "D16" },
  "16011": { kind: "幼稚園", dataset: "D19" },
  "16013": { kind: "認定こども園", dataset: "D20" },
};
// P29_006 管理者：1 国、2 都道府県、3 市区町村、4 民間
const OWNERS: Record<string, string> = { "1": "国立", "2": "都道府県立", "3": "市区町村立", "4": "私立" };

export const p29Schools = defineJob({
  datasets: ["D15", "D16", "D19", "D20"],
  rawDir: "P29",
  table: "facilities",
  options: [],

  async load({ sql, raw, log, check }) {
    const zip = raw.find(ZIP, "国土数値情報 学校（P29、2023、新潟）の zip");
    const features = readGeojsonFromZip(zip.body, /P29-\d+_15\.geojson$/);
    const rows: FacilityRow[] = [];
    for (const f of features) {
      const p = f.properties;
      const k = P29_KINDS[String(p.P29_003)];
      if (!k) continue;
      rows.push({
        dataset_id: k.dataset,
        kind: k.kind,
        name: String(p.P29_004),
        address: (p.P29_005 as string | null) ?? null,
        attrs: { 設置者: OWNERS[String(p.P29_006)] ?? null, city_code: p.P29_001 },
        source_ref: String(p.P29_002),
        ...pointOf(f.geometry),
        raw: p,
      });
    }
    await insertFacilities(sql, rows);
    log(`${zip.name}：${features.length}件のうち ${rows.length}件を入れました`);
    check("ファイルの件数", features.length);
  },
});

// ---- P14 福祉施設（2023） ----
// P14_007 小分類：050401 保育所、050406 へき地保育所 → 保育園
//                0505xx（小規模保育A〜C型、家庭的保育、居宅訪問型、事業所内保育）→ 地域型保育
// 認定こども園（050402〜050405）は P29 の方を使う（設計まとめ No.20）
const P14_MINOR: Record<string, string> = {
  "050401": "保育所",
  "050406": "へき地保育所",
  "050500": "地域型保育事業所（種類の記載なし）",
  "050501": "小規模保育事業所A型",
  "050502": "小規模保育事業所B型",
  "050503": "小規模保育事業所C型",
  "050504": "家庭的保育事業所",
  "050505": "居宅訪問型保育事業所",
  "050506": "事業所内保育事業所",
};

export const p14Childcare = defineJob({
  datasets: ["D17", "D18"],
  rawDir: "P14",
  table: "facilities",
  options: [],

  async load({ sql, raw, log, check }) {
    const zip = raw.find(ZIP, "国土数値情報 福祉施設（P14、2023、新潟）の zip");
    const features = readGeojsonFromZip(zip.body, /P14-\d+_15\.geojson$/);
    const rows: FacilityRow[] = [];
    for (const f of features) {
      const p = f.properties;
      const minor = String(p.P14_007);
      const type = P14_MINOR[minor];
      if (!type) continue;
      const nursery = minor === "050401" || minor === "050406";
      rows.push({
        dataset_id: nursery ? "D17" : "D18",
        kind: nursery ? "保育園" : "地域型保育",
        name: String(p.P14_008),
        address: [p.P14_002, p.P14_004].filter(Boolean).join("") || null,
        attrs: { 種類: type, city_code: p.P14_003 },
        ...pointOf(f.geometry),
        raw: p,
      });
    }
    await insertFacilities(sql, rows);
    log(`${zip.name}：${features.length}件のうち ${rows.length}件を入れました`);
    check("ファイルの件数", features.length);
  },
});

// ---- P05 市町村役場等及び公的集会施設（2022） ----
// P05_002 施設分類：1 本庁舎（市役所・区役所）だけを使う（2 支所・出張所、4 公民館、5 集会施設などは使わない）
export const p05Offices = defineJob({
  datasets: ["D24"],
  rawDir: "P05",
  table: "facilities",
  options: [],

  async load({ sql, raw, log }) {
    const zip = raw.find(ZIP, "国土数値情報 市町村役場等及び公的集会施設（P05、2022、新潟）の zip");
    const features = readGeojsonFromZip(zip.body, /P05-\d+_15\.geojson$/);
    const rows: FacilityRow[] = features
      .filter((f) => String(f.properties.P05_002) === "1")
      .map((f) => ({
        dataset_id: "D24",
        kind: "役所",
        name: String(f.properties.P05_003),
        address: (f.properties.P05_004 as string | null) ?? null,
        attrs: { city_code: f.properties.P05_001 },
        ...pointOf(f.geometry),
        raw: f.properties,
      }));
    await insertFacilities(sql, rows);
    log(`${zip.name}：${features.length}件のうち ${rows.length}件を入れました`);
  },
});

// ---- N02 鉄道・駅（2025）と S12 駅別乗降客数（2024） ----
// どちらも全国1ファイル。駅は線（ホームの形）なので、同じ駅（グループコード N02_005g）の線をまとめ、その中心を駅の位置にする
// 新潟県の範囲に入る駅だけを残す（町の境界 towns から約300m以内）。先に d39-towns を入れておく
// 乗降客数は S12 の最後の年（S12_058〜061 が2024年）：
//   S12_058 重複コード（2 は他の路線の値に含まれている）、S12_059 データの有無（1 あり）、S12_060 備考、S12_061 乗降客数（人/日）
const PREF_BBOX = [137.6, 36.7, 139.95, 38.6]; // 新潟県（佐渡を含む）のおおよその範囲

function linePoints(geometry: Geometry): Position[] {
  if (geometry.type === "LineString") return geometry.coordinates;
  if (geometry.type === "MultiLineString") return geometry.coordinates.flat();
  throw new Error(`想定していない図形の種類です：${geometry.type}`);
}

function inBbox(points: Position[]): boolean {
  const [w, s, e, n] = PREF_BBOX;
  return points.some(([lon, lat]) => lon >= w && lon <= e && lat >= s && lat <= n);
}

export const n02Stations = defineJob({
  datasets: ["D25", "D26"],
  rawDir: "N02",
  table: "facilities",
  options: [],

  async load({ sql, raw, log, check, setRowCount }) {
    const n02 = raw.find(ZIP, "国土数値情報 鉄道（N02、2025）の zip");
    const stations = readGeojsonFromZip(n02.body, /UTF-8\/N02-\d+_Station\.geojson$/);

    // S12 は別のフォルダ（data/raw/S12/）に置く
    const s12Zip = rawFiles("S12", { refresh: false, log }).find(ZIP, "国土数値情報 駅別乗降客数（S12、2024）の zip");
    const passengers = readGeojsonFromZip(s12Zip.body, /UTF-8\/S12-\d+_NumberOfPassengers\.geojson$/);

    // グループコードごとの乗降客数（重複コード 2 の行は他の路線に含まれているので足さない）
    const byGroup = new Map<string, { total: number; notes: string[] }>();
    for (const f of passengers) {
      const p = f.properties;
      if (Number(p.S12_059) !== 1 || Number(p.S12_058) === 2 || p.S12_061 == null) continue;
      const g = String(p.S12_001g);
      const cur = byGroup.get(g) ?? { total: 0, notes: [] };
      cur.total += Number(p.S12_061);
      if (p.S12_060) cur.notes.push(String(p.S12_060));
      byGroup.set(g, cur);
    }

    // 新潟県の範囲の駅の線を、グループコードごとに集める
    const pieces: Record<string, unknown>[] = [];
    for (const f of stations) {
      const pts = linePoints(f.geometry);
      if (!inBbox(pts)) continue;
      const p = f.properties;
      pieces.push({
        group_code: String(p.N02_005g),
        name: String(p.N02_005),
        line: String(p.N02_003),
        operator: String(p.N02_004),
        geojson: JSON.stringify(f.geometry),
      });
    }
    await sql`create temp table station_pieces (group_code text, name text, line text, operator text, geojson text) on commit drop`;
    await insertRows(sql, "station_pieces", pieces);

    const passengerRows = [...byGroup].map(([group_code, v]) => ({ group_code, total: v.total, notes: v.notes.join(" / ") || null }));
    await sql`create temp table station_passengers (group_code text, total integer, notes text) on commit drop`;
    await insertRows(sql, "station_passengers", passengerRows);

    // 駅ごとに1行。路線の一覧と乗降客数を attrs に入れる。新潟県の町から約300m以上離れた駅は入れない
    const [{ inserted, withPassengers }] = await sql<{ inserted: number; withPassengers: number }[]>`
      with grouped as (
        select group_code, min(name) as name,
          jsonb_agg(distinct jsonb_build_object('事業者', operator, '路線', line)) as lines,
          extensions.st_centroid(extensions.st_collect(extensions.st_setsrid(extensions.st_geomfromgeojson(geojson), 4326))) as center
        from station_pieces group by group_code
      ),
      kept as (
        select g.* from grouped g
        where exists (
          select 1 from towns t
          -- 0.003度（約300m）。geometry のまま比べて、空間インデックスを使う
          where extensions.st_dwithin(t.geom, g.center, 0.003)
        )
      ),
      ins as (
        insert into facilities (dataset_id, kind, name, address, attrs, source_ref, geog)
        select 'D25', '駅', k.name, null,
          jsonb_build_object('路線', k.lines, '乗降客数_2024', p.total, '乗降客数の備考', p.notes),
          k.group_code, k.center::extensions.geography
        from kept k left join station_passengers p using (group_code)
        returning (attrs->>'乗降客数_2024') is not null as has_passengers
      )
      select count(*)::int as inserted, count(*) filter (where has_passengers)::int as "withPassengers" from ins
    `;
    log(`新潟県の駅 ${inserted}駅を入れました（乗降客数のある駅 ${withPassengers}駅）`);
    setRowCount("D26", withPassengers);
    check("駅の数", inserted);
    check("乗降客数のある駅の数", withPassengers);
  },
});

// ---- P11 バス停留所（2022） ----
// P11_001 名前、P11_002 事業者、P11_003_01〜35 系統名、P11_004_01〜35 系統の区分
export const p11BusStops = defineJob({
  datasets: ["D27"],
  rawDir: "P11",
  table: "facilities",
  options: [],

  async load({ sql, raw, log }) {
    const zip = raw.find(ZIP, "国土数値情報 バス停留所（P11、2022、新潟）の zip");
    const features = readGeojsonFromZip(zip.body, /P11-\d+_15\.geojson$/);
    const rows: FacilityRow[] = features.map((f) => {
      const p = f.properties;
      const routes = Array.from({ length: 35 }, (_, i) => p[`P11_003_${String(i + 1).padStart(2, "0")}`]).filter((r): r is string => typeof r === "string" && r !== "");
      return {
        dataset_id: "D27",
        kind: "バス停",
        name: String(p.P11_001),
        address: null,
        attrs: { 事業者: p.P11_002, 系統: routes, 系統数: routes.length },
        ...pointOf(f.geometry),
        raw: p,
      };
    });
    await insertFacilities(sql, rows);
    log(`${zip.name}：${rows.length}件を入れました`);
  },
});
