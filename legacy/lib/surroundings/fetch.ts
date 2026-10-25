import type { Sql } from "../db";
import { DEFAULT_RADIUS_M, LAYERS, OSM_SUPERMARKET, type Layer } from "./layers";
import { fetchSupermarkets } from "./osm";

// 物件の周りの公開データを取って保存する（設計書 4.2「物件の登録時に、周りの地物だけを取得して保存」）
// 物件の画面（登録・位置の保存の後に自動で）と scripts/ の両方から呼ぶ

const ENDPOINT = "https://www.reinfolib.mlit.go.jp/ex-api/external";
const ATTRIBUTION = "出典：国土交通省 不動産情報ライブラリ（https://www.reinfolib.mlit.go.jp/）";

export interface FetchResult {
  apiId: string;
  name: string;
  tiles: number;
  featuresInTiles: number;
  featuresKept: number;
  status: "ok" | "empty" | "failed";
  error?: string;
  supermarkets?: { name: string; distanceM: number }[];
  /** 学校（XKT006）のうちの小学校・中学校の数。保存した件数には高校・大学なども入るため、画面で内訳を出す */
  schoolCounts?: SchoolCounts;
}

export interface SchoolCounts {
  elementary: number;
  juniorHigh: number;
}

/** 物件から keepM 以内に保存した学校（XKT006）のうち、小学校・中学校の数（休校中も含む） */
export async function countSchools(sql: Sql, propertyId: number, keepM: number): Promise<SchoolCounts> {
  const [row] = await sql<{ elementary: number; junior_high: number }[]>`
    select count(*) filter (where g.properties->>'P29_003_name_ja' = '小学校')::int as elementary,
           count(*) filter (where g.properties->>'P29_003_name_ja' = '中学校')::int as junior_high
    from geo_features g, properties p
    where p.id = ${propertyId} and g.api_id = 'XKT006'
      and extensions.st_dwithin(g.geom::extensions.geography, p.geom::extensions.geography, ${keepM})
  `;
  return { elementary: row?.elementary ?? 0, juniorHigh: row?.junior_high ?? 0 };
}

interface Feature {
  geometry: unknown;
  properties: Record<string, unknown> & { _id?: string };
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function tileX(lon: number, z: number) {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

function tileY(lat: number, z: number) {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

/** 地点から半径 m の円を囲む四角に入るタイル */
function tilesAround(lon: number, lat: number, meters: number, z: number) {
  const dLat = meters / 111320;
  const dLon = meters / (111320 * Math.cos((lat * Math.PI) / 180));
  const tiles: { x: number; y: number }[] = [];
  for (let x = tileX(lon - dLon, z); x <= tileX(lon + dLon, z); x++) {
    for (let y = tileY(lat + dLat, z); y <= tileY(lat - dLat, z); y++) tiles.push({ x, y });
  }
  return tiles;
}

async function fetchTile(apiKey: string, layer: Layer, x: number, y: number): Promise<Feature[]> {
  const url = `${ENDPOINT}/${layer.apiId}?response_format=geojson&z=${layer.zoom}&x=${x}&y=${y}`;
  for (let attempt = 0; ; attempt++) {
    // 応答が止まったまま Route の上限（60秒）に達すると、取得結果の記録も残らないので、1枚ごとに時間を区切る
    const res = await fetch(url, { headers: { "Ocp-Apim-Subscription-Key": apiKey }, signal: AbortSignal.timeout(15_000), cache: "no-store" });
    if (res.status === 404) return [];
    if (res.ok) {
      const body = (await res.json()) as { features?: Feature[] };
      return body.features ?? [];
    }
    // 400番台はやり直しても変わらない。5xx だけ間隔を空けてやり直す
    if (res.status < 500 || attempt >= 2) throw new Error(`${layer.apiId} ${res.status}：${(await res.text()).slice(0, 200)}`);
    await sleep(2000 * 2 ** attempt);
  }
}

/** APIごとに使用中の版を1つ持つ。なければ作る */
async function activeVersion(sql: Sql, layer: Layer): Promise<number> {
  const [found] = await sql<{ id: number }[]>`
    select id from dataset_versions
    where source = 'reinfolib' and dataset = ${layer.apiId} and coverage = 'pref:15' and status = 'active'
  `;
  if (found) return Number(found.id);
  const [created] = await sql<{ id: number }[]>`
    insert into dataset_versions (source, dataset, coverage, attribution, status)
    values ('reinfolib', ${layer.apiId}, 'pref:15', ${`${ATTRIBUTION}「${layer.name}」`}, 'active')
    returning id
  `;
  return Number(created.id);
}

/** 物件の位置。なければ例外 */
async function propertyPoint(sql: Sql, propertyId: number) {
  const [property] = await sql<{ lon: number | null; lat: number | null }[]>`
    select extensions.st_x(geom) as lon, extensions.st_y(geom) as lat from properties where id = ${propertyId}
  `;
  if (!property) throw new Error(`物件 ${propertyId} がありません`);
  if (property.lon === null || property.lat === null) throw new Error(`物件 ${propertyId} に緯度経度がありません`);
  return { lon: Number(property.lon), lat: Number(property.lat) };
}

/**
 * 1種類（1つのAPI）だけ取って保存し、property_fetches に記録する
 * 画面からは、この関数を種類ごとに別の呼び出し（app/(app)/properties/[id]/surroundings/route.ts）で同時に呼ぶ（1回の呼び出しを短くするため。設計書 D34 と同じ考え方）
 */
export async function fetchLayer(sql: Sql, propertyId: number, apiKey: string, layer: Layer, radiusM = DEFAULT_RADIUS_M): Promise<FetchResult> {
  const { lon, lat } = await propertyPoint(sql, propertyId);
  const point = `SRID=4326;POINT(${lon} ${lat})`;
  const keepM = layer.mode === "radius" ? radiusM : layer.keepM ?? 0;
  // point でも、保存する範囲がタイルの境目をまたぐことがあるので、範囲を囲むタイルをすべて取る
  const tiles = tilesAround(lon, lat, Math.max(keepM, 1), layer.zoom);
  const result: FetchResult = { apiId: layer.apiId, name: layer.name, tiles: tiles.length, featuresInTiles: 0, featuresKept: 0, status: "ok" };
  let versionId: number | null = null;

  try {
    versionId = await activeVersion(sql, layer);
    const features = new Map<string, Feature>();
    for (const { x, y } of tiles) {
      for (const f of await fetchTile(apiKey, layer, x, y)) {
        const id = f.properties._id ?? JSON.stringify(f.properties);
        features.set(id, f);
      }
      await sleep(200);
    }
    result.featuresInTiles = features.size;

    // 物件から keepM 以内の地物だけを保存する（keepM = 0 は物件を含むもの）
    const rows = [...features].map(([id, f]) => ({ id, geometry: f.geometry, properties: f.properties }));
    for (let i = 0; i < rows.length; i += 500) {
      await sql`
        insert into geo_features (dataset_version_id, api_id, feature_id, geom, properties)
        select ${versionId}, ${layer.apiId}, f->>'id', g.geom, f->'properties'
        from jsonb_array_elements(${sql.json(rows.slice(i, i + 500) as never)}) f
        cross join lateral (
          select extensions.st_setsrid(extensions.st_geomfromgeojson(f->>'geometry'), 4326) as geom
        ) g
        where extensions.st_dwithin(g.geom::extensions.geography, ${point}::extensions.geography, ${keepM})
        on conflict do nothing
      `;
    }
    const [kept] = await sql<{ n: number }[]>`
      select count(*)::int as n from geo_features
      where dataset_version_id = ${versionId} and api_id = ${layer.apiId}
        and extensions.st_dwithin(geom::extensions.geography, ${point}::extensions.geography, ${keepM})
    `;
    result.featuresKept = kept.n;
    result.status = kept.n > 0 ? "ok" : "empty";
    if (layer.apiId === "XKT006") result.schoolCounts = await countSchools(sql, propertyId, keepM);
  } catch (error) {
    result.status = "failed";
    result.error = error instanceof Error ? error.message : String(error);
  }

  await sql`
    insert into property_fetches (property_id, api_id, dataset_version_id, mode, keep_m, zoom, tiles,
                                  features_in_tiles, features_kept, status, error, fetched_at)
    values (${propertyId}, ${layer.apiId}, ${versionId}, ${layer.mode}, ${keepM}, ${layer.zoom}, ${result.tiles},
            ${result.featuresInTiles}, ${result.featuresKept}, ${result.status}, ${result.error ?? null}, now())
    on conflict (property_id, api_id) do update set
      dataset_version_id = excluded.dataset_version_id, mode = excluded.mode, keep_m = excluded.keep_m,
      zoom = excluded.zoom, tiles = excluded.tiles, features_in_tiles = excluded.features_in_tiles,
      features_kept = excluded.features_kept, status = excluded.status, error = excluded.error,
      fetched_at = excluded.fetched_at
  `;
  return result;
}

/** すべての種類を順に取る（npm run fetch-surroundings 用） */
export async function fetchSurroundings(
  sql: Sql,
  propertyId: number,
  apiKey: string,
  options: { radiusM?: number; apiIds?: string[]; log?: (message: string) => void } = {},
): Promise<FetchResult[]> {
  const log = options.log ?? (() => {});
  await propertyPoint(sql, propertyId);
  const layers = options.apiIds ? LAYERS.filter((l) => options.apiIds!.includes(l.apiId)) : LAYERS;
  const results: FetchResult[] = [];
  for (const layer of layers) {
    const result = layer.apiId === OSM_SUPERMARKET
      ? await fetchSupermarkets(sql, propertyId, options.radiusM)
      : await fetchLayer(sql, propertyId, apiKey, layer, options.radiusM);
    log(`${layer.apiId} ${layer.name}：タイル${result.tiles}枚、地物${result.featuresInTiles}件 → 保存${result.featuresKept}件（${result.status}${result.error ? `：${result.error}` : ""}）`);
    results.push(result);
  }
  return results;
}
