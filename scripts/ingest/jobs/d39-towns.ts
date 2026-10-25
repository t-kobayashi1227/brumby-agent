import type { Geometry, Position } from "geojson";
import { pickFromZip, readShapefile } from "../lib/files";
import { defineJob } from "../lib/runner";

// D39 町丁・字等の境界（e-Stat 国勢調査2020 小地域）
// npm run ingest -- d39-towns
// 統計GISのダウンロード（Shapefile、JGD2011 の緯度経度）を自動で取る。APIキーは要らない
// 1つの町（KEY_CODE）が飛び地で複数の図形に分かれていることがあるので、1つの MultiPolygon にまとめる

const PREF = "15"; // 新潟県
const URL = `https://www.e-stat.go.jp/gis/statmap-search/data?dlserveyId=A002005212020&code=${PREF}&coordSys=1&format=shape&downloadType=5&datum=2011`;

interface Attributes {
  KEY_CODE: string;   // 都道府県2＋市区町村3＋町4（＋丁目2）
  PREF: string;
  CITY: string;
  CITY_NAME: string;  // 例：新潟市西区 / 長岡市
  S_NAME: string;     // 町丁字名。水面は「水面」
  HCODE: number;      // 8101：町丁目、8154：水面
}

interface Town {
  key_code: string;
  city_code: string;
  ward: string;
  name: string | null;
  hcode: number;
  polygons: Position[][][];
}

function polygonsOf(geometry: Geometry): Position[][][] {
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  throw new Error(`想定していない図形の種類です：${geometry.type}`);
}

/** 政令市は区の名前（新潟市西区 → 西区）、それ以外は市町村の名前 */
export function wardOf(cityName: string): string {
  const m = /^.+?市(.+区)$/.exec(cityName);
  return m ? m[1] : cityName;
}

export const d39Towns = defineJob({
  datasets: ["D39"],
  rawDir: "estat-boundary",
  table: "towns",
  options: [],

  async load({ sql, raw, log, check }) {
    const zip = await raw.download(URL, `A002005212020DDSWC${PREF}.zip`);

    const towns = new Map<string, Town>();
    let pieces = 0;
    for await (const f of readShapefile(pickFromZip(zip, ".shp"), pickFromZip(zip, ".dbf"))) {
      pieces++;
      const p = f.properties as unknown as Attributes;
      const town = towns.get(p.KEY_CODE) ?? {
        key_code: p.KEY_CODE,
        city_code: p.PREF + p.CITY,
        ward: wardOf(p.CITY_NAME),
        name: p.S_NAME || null,
        hcode: Number(p.HCODE),
        polygons: [],
      };
      town.polygons.push(...polygonsOf(f.geometry));
      towns.set(p.KEY_CODE, town);
    }
    log(`図形 ${pieces}個を、町 ${towns.size}個にまとめました`);
    check("図形の数", pieces);
    check("町の数", towns.size);

    // 図形は GeoJSON の文字列で渡し、PostGIS で読む。自己交差などがあれば MakeValid で直す
    // 町の中心は ST_PointOnSurface（必ず町の中に入る点。くびれた形でも外に出ない）
    const rows = [...towns.values()].map(({ polygons, ...t }) => ({
      ...t,
      geojson: JSON.stringify({ type: "MultiPolygon", coordinates: polygons }),
    }));
    for (let i = 0; i < rows.length; i += 200) {
      await sql`
        with x as (
          select x.*, extensions.st_multi(extensions.st_collectionextract(extensions.st_makevalid(
            extensions.st_setsrid(extensions.st_geomfromgeojson(x.geojson), 4326)), 3)) as geom
          from jsonb_to_recordset(${sql.json(rows.slice(i, i + 200))}) as x(
            key_code text, city_code text, ward text, name text, hcode smallint, geojson text)
        )
        insert into towns (key_code, dataset_id, city_code, ward, name, hcode, geom, center)
        select key_code, 'D39', city_code, ward, name, hcode, geom, extensions.st_pointonsurface(geom)::extensions.geography
        from x
      `;
    }
  },
});
