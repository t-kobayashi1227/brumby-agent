import type { Geometry } from "geojson";
import { pickFromZip, rawFiles, readGeojsonFromZip, readShapefile } from "../lib/files";
import { defineJob, insertRows } from "../lib/runner";

// 国土数値情報の地価と将来推計人口（利用者が data/raw/<コード>/ に置いた zip を読む）
//   npm run ingest -- land-prices    地価公示 L01（D02）と都道府県地価調査 L02（D03）。2026年・新潟
//   npm run ingest -- mesh250        250mメッシュ将来推計人口 R6推計（D11）。既定は新潟市だけ（area=pref で県全体）
// 項目の意味は国土数値情報のページで 2026-10-25 に確かめた

// 用途区分（L01_002・L02_001）
const USE: Record<string, string> = { "000": "住宅地", "003": "宅地見込地", "005": "商業地", "007": "準工業地", "009": "工業地", "010": "市街化調整区域内の現況宅地", "013": "林地", "020": "林地" };

function pointOf(geometry: Geometry): { lon: number; lat: number } {
  if (geometry.type !== "Point") throw new Error(`点ではない図形です：${geometry.type}`);
  const [lon, lat] = geometry.coordinates;
  return { lon, lat };
}

export const landPrices = defineJob({
  datasets: ["D02", "D03"],
  rawDir: "L01",
  table: "land_prices",
  options: [],

  async load({ sql, raw, log, setAsOf }) {
    const l01 = raw.find(/\.zip$/i, "国土数値情報 地価公示（L01、2026、新潟）の zip");
    // 地価調査は別のフォルダ（data/raw/L02/）に置く
    const l02 = rawFiles("L02", { refresh: false, log }).find(/\.zip$/i, "国土数値情報 都道府県地価調査（L02、2026、新潟）の zip");

    const rows: Record<string, unknown>[] = [];
    // L01：L01_001 行政区域コード、L01_002 用途区分、L01_003 連番、L01_007 年、L01_008 価格（円/㎡）、L01_009 対前年変動率（%）、
    //      L01_024 標準地名、L01_025 所在並びに地番、L01_028 利用の現況（大分類）
    for (const f of readGeojsonFromZip(l01.body, /L01-\d+_15\.geojson$/)) {
      const p = f.properties;
      rows.push({
        dataset_id: "D02",
        point_id: `${p.L01_001}-${p.L01_002}-${p.L01_003}`,
        year: Number(p.L01_007),
        price_per_sqm: Number(p.L01_008),
        change_rate: p.L01_009 == null ? null : Number(p.L01_009),
        use_category: USE[String(p.L01_002)] ?? String(p.L01_002),
        address: p.L01_025,
        ...pointOf(f.geometry),
        raw: sql.json({ 標準地名: p.L01_024, 利用の現況: p.L01_028, ...p } as never),
      });
    }
    // L02：L02_001 用途区分、L02_002 連番、L02_005 年、L02_006 価格、L02_007 対前年変動率、L02_020 行政区域コード、
    //      L02_022 所在並びに地番、L02_025 利用の現況（大分類）
    for (const f of readGeojsonFromZip(l02.body, /L02-\d+_15\.geojson$/)) {
      const p = f.properties;
      rows.push({
        dataset_id: "D03",
        point_id: `${p.L02_020}-${p.L02_001}-${p.L02_002}`,
        year: Number(p.L02_005),
        price_per_sqm: Number(p.L02_006),
        change_rate: p.L02_007 == null ? null : Number(p.L02_007),
        use_category: USE[String(p.L02_001)] ?? String(p.L02_001),
        address: p.L02_022,
        ...pointOf(f.geometry),
        raw: sql.json({ 利用の現況: p.L02_025, ...p } as never),
      });
    }
    await sql`create temp table lp (dataset_id text, point_id text, year smallint, price_per_sqm integer, change_rate numeric, use_category text, address text, lon float8, lat float8, raw jsonb) on commit drop`;
    await insertRows(sql, "lp", rows, 500);
    await sql`
      insert into land_prices (dataset_id, point_id, year, price_per_sqm, change_rate, use_category, address, geog, raw)
      select dataset_id, point_id, year, price_per_sqm, change_rate, use_category, address,
        extensions.st_setsrid(extensions.st_point(lon, lat), 4326)::extensions.geography, raw
      from lp
    `;
    for (const id of ["D02", "D03"]) {
      const years = [...new Set(rows.filter((r) => r.dataset_id === id).map((r) => r.year))];
      if (years.length === 1) setAsOf(id, String(years[0]));
    }
    log(`地価公示 ${rows.filter((r) => r.dataset_id === "D02").length}地点、地価調査 ${rows.filter((r) => r.dataset_id === "D03").length}地点を入れました`);
  },
});

// ---- 250mメッシュ将来推計人口（R6推計、2020年国勢調査がもと） ----
// PTN_2020：2020年の総数。2025年からは年ごとに PT00（総数）・PTA（0〜14歳）・PTB（15〜64歳）・PTC（65歳以上）・PTD（75歳以上）・PTE（80歳以上）
// HITOKU_年・GASSAN_年：秘匿の記号と、合算先のメッシュ。値は小数（推計値）
// 1行に約500項目あり、そのままだと大きいので、年ごとの総数と年齢3区分だけを population に入れる
const CITY_PREFIX = "151";

export const mesh250 = defineJob({
  datasets: ["D11"],
  rawDir: "mesh250r6",
  table: "population_mesh",
  options: ["area"],

  async load({ sql, raw, args, log, check }) {
    if (args.area !== undefined && args.area !== "city" && args.area !== "pref") throw new Error("area は city（新潟市、既定）か pref（県全体）です");
    const cityOnly = args.area !== "pref";
    const zip = raw.find(/\.zip$/i, "国土数値情報 250mメッシュ将来推計人口（新潟）の zip");
    const rows: Record<string, unknown>[] = [];
    let read = 0;
    for await (const f of readShapefile(pickFromZip(zip.body, ".shp"), pickFromZip(zip.body, ".dbf"), "utf-8")) {
      read++;
      const p = f.properties;
      if (cityOnly && !String(p.SHICODE).startsWith(CITY_PREFIX)) continue;
      const population: Record<string, Record<string, unknown>> = { "2020": { 総数: p.PTN_2020 } };
      for (const key of Object.keys(p)) {
        const m = /^PT00_(\d{4})$/.exec(key);
        if (!m) continue;
        const y = m[1];
        population[y] = {
          総数: p[`PT00_${y}`],
          "0〜14歳": p[`PTA_${y}`],
          "15〜64歳": p[`PTB_${y}`],
          "65歳以上": p[`PTC_${y}`],
          "75歳以上": p[`PTD_${y}`],
          ...(p[`HITOKU${y}`] ? { 秘匿: p[`HITOKU${y}`], 合算先: p[`GASSAN${y}`] } : {}),
        };
      }
      rows.push({ mesh_code: String(p.MESH_ID), shicode: String(p.SHICODE), population: sql.json(population as never), geojson: JSON.stringify(f.geometry) });
    }
    await sql`create temp table mesh_rows (mesh_code text, shicode text, population jsonb, geojson text) on commit drop`;
    await insertRows(sql, "mesh_rows", rows, 500);
    await sql`
      insert into population_mesh (mesh_code, dataset_id, geom, population)
      select mesh_code, 'D11',
        extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
          extensions.st_setsrid(extensions.st_geomfromgeojson(geojson), 4326)), 3)),
        population || jsonb_build_object('市区町村コード', shicode)
      from mesh_rows
    `;
    log(`${read}メッシュのうち、${rows.length}メッシュを入れました${cityOnly ? "（新潟市だけ）" : ""}`);
    check("読んだメッシュ", read);
  },
});
