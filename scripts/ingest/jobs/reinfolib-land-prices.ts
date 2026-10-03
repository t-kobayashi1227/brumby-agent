import { requireEnv } from "../lib/env";
import { fetchJson, sleep } from "../lib/http";
import { insertRows, type IngestJob } from "../lib/runner";
import { latToTileY, lonToTileX, PREF_BBOX, tilesInBbox, type Tile } from "../lib/tiles";

// 地価公示・地価調査（不動産情報ライブラリ XPT002）
// npm run ingest -- reinfolib-land-prices --pref 15 --year 2026 --tiles all
//
// 都道府県では指定できず、地図タイル単位でしか取れない（ズーム13、1枚 約3.5km四方）
//   --tiles all    都道府県の範囲のタイルをすべて取る（新潟県で約3,000枚、30分ほど）
//   --tiles known  使用中の他の年の版で地点があったタイルだけを取る（過去の年を取るとき）
//   --bbox 西,南,東,北  範囲を絞って試すとき（例：139.0,37.88,139.1,37.95）
// 公表済みの価格は書き換わらないので、版は年ごとに分ける（coverage に年を含める）

const ENDPOINT = "https://www.reinfolib.mlit.go.jp/ex-api/external/XPT002";
const ZOOM = 13;

interface Feature {
  geometry: { type: string; coordinates: [number, number] };
  properties: Record<string, unknown>;
}

const SURVEY_TYPE: Record<number, string> = { 0: "公示", 1: "調査" };

/** "91,500(円/㎡)" → 91500 */
function toNumber(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const m = /^-?[\d,]+(\.\d+)?/.exec(value.trim());
  return m ? Number(m[0].replace(/,/g, "")) : null;
}

function coverageOf(args: Record<string, string | undefined>) {
  const year = args.year;
  if (!year || !/^\d{4}$/.test(year)) throw new Error("--year 2026 の形で年を指定してください");
  const area = args.bbox ? `bbox:${args.bbox}` : `pref:${args.pref ?? "15"}`;
  return `${area}/year:${year}`;
}

export const reinfolibLandPrices: IngestJob = {
  source: "reinfolib",
  dataset: "XPT002",
  table: "land_prices",
  // 利用約款の出典記載例どおり。集計して表示するときは「をもとに作成」を画面側で添える（設計書 D12）
  attribution: "出典：国土交通省 不動産情報ライブラリ（https://www.reinfolib.mlit.go.jp/）「地価公示・都道府県地価調査」",
  options: ["pref", "year", "tiles", "bbox"],

  describe(args) {
    return { coverage: coverageOf(args), period: args.year };
  },

  async load({ sql, versionId, args, saveRaw, log }) {
    const key = requireEnv("REINFOLIB_API_KEY");
    const pref = args.pref ?? "15";
    const year = Number(args.year);

    let tiles: Tile[];
    if (args.bbox) {
      tiles = tilesInBbox(args.bbox.split(",").map(Number), ZOOM);
    } else if (args.tiles === "all") {
      const bbox = PREF_BBOX[pref];
      if (!bbox) throw new Error(`都道府県コード ${pref} の範囲が登録されていません（lib/tiles.ts）`);
      tiles = tilesInBbox(bbox, ZOOM);
    } else if (args.tiles === "known") {
      // 使用中の他の年の版にある地点から、タイルを割り出す
      const points = await sql<{ lon: number; lat: number }[]>`
        select distinct extensions.st_x(lp.geom) as lon, extensions.st_y(lp.geom) as lat
        from land_prices lp join dataset_versions v on v.id = lp.dataset_version_id
        where v.source = 'reinfolib' and v.dataset = 'XPT002' and v.status = 'active'
          and v.coverage like ${`pref:${pref}/year:%`}
      `;
      const keys = new Set(points.map((p) => `${lonToTileX(p.lon, ZOOM)}/${latToTileY(p.lat, ZOOM)}`));
      tiles = [...keys].map((k) => {
        const [x, y] = k.split("/").map(Number);
        return { z: ZOOM, x, y };
      });
      if (tiles.length === 0) throw new Error("使用中の地価の版がありません。先に --tiles all で取り込んでください");
    } else {
      throw new Error("--tiles all / --tiles known / --bbox のどれかを指定してください");
    }
    log(`${year}年：${tiles.length}枚のタイルを取得します`);

    const raw: { tile: Tile; features: Feature[] }[] = [];
    const rows: Record<string, unknown>[] = [];
    for (const [i, tile] of tiles.entries()) {
      const url = `${ENDPOINT}?response_format=geojson&z=${tile.z}&x=${tile.x}&y=${tile.y}&year=${year}`;
      const body = await fetchJson<{ features?: Feature[] }>(url, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      });
      const features = body?.features ?? [];
      if (features.length > 0) raw.push({ tile, features });

      for (const f of features) {
        const p = f.properties;
        if (p.prefecture_code !== pref) continue; // タイルには隣の県の地点も入る
        const [lon, lat] = f.geometry.coordinates;
        rows.push({
          dataset_version_id: versionId,
          survey_type: SURVEY_TYPE[Number(p.land_price_type)],
          point_id: String(p.point_id),
          year,
          // 林地は「53,000(円/10a)」のように単位が違うので、円/㎡ のものだけを数字にする（元の値は raw に残る）
          price_per_sqm: String(p.u_current_years_price_ja ?? "").endsWith("(円/㎡)") ? toNumber(p.u_current_years_price_ja) : null,
          change_rate: toNumber(p.year_on_year_change_rate),
          use_category: typeof p.use_category_name_ja === "string" ? p.use_category_name_ja.replace(/^\d+,/, "") : null,
          city_code: (p.city_code as string) || null,
          address: (p.location as string) || null,
          geom: `SRID=4326;POINT(${lon} ${lat})`,
          raw: sql.json(p as never),
        });
      }
      if ((i + 1) % 200 === 0) log(`  ${i + 1}/${tiles.length}枚（${rows.length}地点）`);
      await sleep(200);
    }

    await saveRaw(`${year}.json`, JSON.stringify(raw));
    await insertRows(sql, "land_prices", rows);
    log(`${year}年：地点のあったタイル ${raw.length}枚、${pref === "15" ? "新潟県" : pref}の地点 ${rows.length}件`);
  },
};
