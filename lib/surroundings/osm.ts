import type { Sql } from "../db";
import type { FetchResult } from "./fetch";
import { DEFAULT_RADIUS_M, OSM_SUPERMARKET } from "./layers";

const ENDPOINT = "https://overpass-api.de/api/interpreter";
const ATTRIBUTION = "© OpenStreetMap contributors（https://www.openstreetmap.org/copyright）";
// Overpass は名乗らない（汎用の User-Agent の）リクエストを 406 で断るので、アプリ名と連絡先を付ける
const USER_AGENT = "brumby/0.1 (+https://github.com/Cloud-Nature-Inc/brumby)";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Overpass に問い合わせる。混んでいるとき（429・5xx）だけ間隔を空けて1回やり直す
 * 画面から1回の呼び出しで動くので、やり直しは1回まで（35秒×2＋待ち3秒）
 */
async function queryOverpass(query: string): Promise<unknown> {
  for (let attempt = 0; ; attempt++) {
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8", "User-Agent": USER_AGENT },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.timeout(35_000),
      cache: "no-store",
    });
    if (response.ok) return response.json();
    const busy = response.status === 429 || response.status >= 500;
    if (!busy || attempt >= 1) throw new Error(`OpenStreetMap API: HTTP ${response.status}${busy ? "（混んでいます。少し時間をおいて取り直してください）" : ""}`);
    await sleep(3000);
  }
}

interface OsmElement {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: { lat?: unknown; lon?: unknown };
  tags?: Record<string, unknown>;
}

export interface Supermarket {
  id: string;
  lat: number;
  lon: number;
  tags: Record<string, unknown>;
}

export function parseSupermarkets(body: unknown): Supermarket[] {
  const elements = (body as { elements?: unknown } | null)?.elements;
  if (!Array.isArray(elements)) throw new Error("OpenStreetMap の応答が正しくありません");
  return elements.flatMap((element: OsmElement) => {
    const lat = Number(element.lat ?? element.center?.lat);
    const lon = Number(element.lon ?? element.center?.lon);
    if (!(["node", "way", "relation"].includes(String(element.type))) || !Number.isInteger(element.id) ||
        !Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180 ||
        element.tags?.shop !== "supermarket") return [];
    return [{ id: `${element.type}/${element.id}`, lat, lon, tags: element.tags }];
  });
}

/** 確定した物件位置の周りにある OSM のスーパーを保存する。 */
export async function fetchSupermarkets(sql: Sql, propertyId: number, radiusM = DEFAULT_RADIUS_M): Promise<FetchResult> {
  const result: FetchResult = { apiId: OSM_SUPERMARKET, name: "スーパーマーケット（OpenStreetMap）", tiles: 0, featuresInTiles: 0, featuresKept: 0, status: "failed" };
  const [property] = await sql<{ lon: number | null; lat: number | null }[]>`
    select extensions.st_x(geom) as lon, extensions.st_y(geom) as lat from properties where id = ${propertyId}
  `;
  if (!property || property.lon === null || property.lat === null) throw new Error("物件の位置がありません");
  if (!Number.isInteger(radiusM) || radiusM < 1 || radiusM > 10000) throw new Error("検索半径が正しくありません");

  try {
    const query = `[out:json][timeout:25];nwr["shop"="supermarket"](around:${radiusM},${property.lat},${property.lon});out center;`;
    const supermarkets = parseSupermarkets(await queryOverpass(query));
    result.featuresInTiles = supermarkets.length;

    const [version] = await sql<{ id: number }[]>`
      insert into dataset_versions (source, dataset, coverage, attribution, status)
      values ('osm', 'supermarket', 'global', ${ATTRIBUTION}, 'active')
      on conflict (source, dataset, coverage) where status = 'active' do update set attribution = excluded.attribution
      returning id
    `;
    // 物件ごとの取得結果を入れ替え、移転・閉店した店舗が残らないようにする。
    await sql`delete from geo_features where api_id = ${OSM_SUPERMARKET} and feature_id like ${`${propertyId}:%`}`;
    for (const item of supermarkets) {
      await sql`
        insert into geo_features (dataset_version_id, api_id, feature_id, geom, properties)
        values (${version.id}, ${OSM_SUPERMARKET}, ${`${propertyId}:${item.id}`},
          extensions.st_setsrid(extensions.st_makepoint(${item.lon}, ${item.lat}), 4326), ${sql.json(item.tags as never)})
        on conflict (dataset_version_id, api_id, feature_id) do update set
          geom = excluded.geom, properties = excluded.properties, fetched_at = now()
      `;
    }
    result.featuresKept = supermarkets.length;
    result.status = supermarkets.length ? "ok" : "empty";
    result.supermarkets = (await sql<{ name: string; distance_m: number }[]>`
      select coalesce(nullif(g.properties->>'name', ''), nullif(g.properties->>'brand', ''), '名称未登録のスーパー') as name,
        extensions.st_distance(g.geom::extensions.geography, p.geom::extensions.geography) as distance_m
      from geo_features g, properties p
      where p.id = ${propertyId} and g.api_id = ${OSM_SUPERMARKET} and g.feature_id like ${`${propertyId}:%`}
        and extensions.st_dwithin(g.geom::extensions.geography, p.geom::extensions.geography, ${radiusM})
      order by distance_m limit 10
    `).map((r) => ({ name: r.name, distanceM: Math.round(r.distance_m) }));
    await sql`
      insert into property_fetches (property_id, api_id, dataset_version_id, mode, keep_m, zoom, tiles,
        features_in_tiles, features_kept, status, error, fetched_at)
      values (${propertyId}, ${OSM_SUPERMARKET}, ${version.id}, 'radius', ${radiusM}, 0, 0,
        ${result.featuresInTiles}, ${result.featuresKept}, ${result.status}, null, now())
      on conflict (property_id, api_id) do update set
        dataset_version_id = excluded.dataset_version_id, keep_m = excluded.keep_m,
        features_in_tiles = excluded.features_in_tiles, features_kept = excluded.features_kept,
        status = excluded.status, error = null, fetched_at = now()
    `;
  } catch (error) {
    result.status = "failed";
    result.featuresKept = 0;
    result.supermarkets = [];
    result.error = error instanceof Error ? error.message : String(error);
    await sql`
      insert into property_fetches (property_id, api_id, mode, keep_m, zoom, tiles,
        features_in_tiles, features_kept, status, error, fetched_at)
      values (${propertyId}, ${OSM_SUPERMARKET}, 'radius', ${radiusM}, 0, 0, 0, 0, 'failed', ${result.error}, now())
      on conflict (property_id, api_id) do update set
        features_in_tiles = 0, features_kept = 0, status = 'failed', error = excluded.error, fetched_at = now()
    `;
  }
  return result;
}
