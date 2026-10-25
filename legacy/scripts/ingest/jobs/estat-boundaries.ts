import { unzipSync } from "fflate";
import * as shapefile from "shapefile";
import type { Geometry, Position } from "geojson";
import type { IngestJob } from "../lib/runner";

// 町丁目の境界（e-Stat 統計GIS 国勢調査2020 小地域）
// npm run ingest -- estat-boundaries --pref 15
// APIはなく、統計GISのダウンロード（Shapefile、世界測地系の緯度経度）を使う。APIキーは要らない
// 1つの町丁目（KEY_CODE）が飛び地で複数の図形に分かれていることがあるので、1つの MultiPolygon にまとめる

const DOWNLOAD = "https://www.e-stat.go.jp/gis/statmap-search/data";
const SURVEY_ID = "A002005212020"; // 国勢調査2020 小地域（町丁・字等別）

interface Attributes {
  KEY_CODE: string;   // 都道府県2＋市区町村3＋町・大字4＋丁目2（例：15102116002）
  PREF: string;
  CITY: string;
  CITY_NAME: string;
  S_NAME: string;     // 町丁字名。水面は「水面」
  HCODE: number;      // 8101：町丁目、8154：水面
}

interface Area {
  key_code: string;
  pref_code: string;
  city_code: string;
  city_name: string;
  name: string | null;
  hcode: number;
  polygons: Position[][][];
}

function polygonsOf(geometry: Geometry): Position[][][] {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`想定していない図形の種類です：${geometry.type}`);
}

export const estatBoundaries: IngestJob = {
  source: "estat",
  dataset: "census2020_boundary",
  table: "areas",
  attribution: "出典：政府統計の総合窓口(e-Stat)（https://www.e-stat.go.jp/）「国勢調査 2020年 小地域（町丁・字等別）境界データ」",
  options: ["pref"],

  describe(args) {
    return { coverage: `pref:${args.pref ?? "15"}`, period: "2020" };
  },

  async load({ sql, versionId, args, saveRaw, log }) {
    const pref = args.pref ?? "15";
    const url = `${DOWNLOAD}?dlserveyId=${SURVEY_ID}&code=${pref}&coordSys=1&format=shape&downloadType=5&datum=2011`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`境界データの取得に失敗しました（${res.status}）`);
    const zip = new Uint8Array(await res.arrayBuffer());
    await saveRaw(`r2ka${pref}.zip`, zip, "application/zip");
    log(`ダウンロードしました（${(zip.length / 1024 / 1024).toFixed(1)}MB）`);

    const files = unzipSync(zip);
    const file = (ext: string) => {
      const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(ext));
      if (!name) throw new Error(`zipの中に ${ext} がありません`);
      return files[name];
    };
    const source = await shapefile.open(file(".shp"), file(".dbf"), { encoding: "shift_jis" });

    const areas = new Map<string, Area>();
    let pieces = 0;
    for (let r = await source.read(); !r.done; r = await source.read()) {
      pieces++;
      const p = r.value.properties as unknown as Attributes;
      const area = areas.get(p.KEY_CODE) ?? {
        key_code: p.KEY_CODE,
        pref_code: p.PREF,
        city_code: p.PREF + p.CITY,
        city_name: p.CITY_NAME,
        name: p.S_NAME || null,
        hcode: Number(p.HCODE),
        polygons: [],
      };
      area.polygons.push(...polygonsOf(r.value.geometry));
      areas.set(p.KEY_CODE, area);
    }
    log(`図形 ${pieces}個を、町丁目 ${areas.size}個にまとめました`);

    // 図形は GeoJSON の文字列で渡し、PostGIS で読む。自己交差などがあれば MakeValid で直す
    const rows = [...areas.values()].map(({ polygons, ...a }) => ({
      ...a,
      geojson: JSON.stringify({ type: "MultiPolygon", coordinates: polygons }),
    }));
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await sql`
        insert into areas (dataset_version_id, key_code, pref_code, city_code, city_name, name, hcode, geom)
        select ${versionId}, x.key_code, x.pref_code, x.city_code, x.city_name, x.name, x.hcode,
          extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
            extensions.st_setsrid(extensions.st_geomfromgeojson(x.geojson), 4326)), 3))
        from jsonb_to_recordset(${sql.json(chunk)}) as x(
          key_code text, pref_code text, city_code text, city_name text, name text, hcode smallint, geojson text)
        on conflict do nothing
      `;
    }
  },
};
