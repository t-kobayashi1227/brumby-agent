import type { Sql } from "../../../lib/db";

// 不動産情報ライブラリ API の呼び出し
// 利用規約により、アクセスログを api_access_logs に保存する。キーはヘッダーで送り、URL・ログ・画面には出さない
// 失敗したら間隔を空けて数回やり直す。400番台はやり直しても結果が変わらないので、すぐに止める

const BASE = "https://www.reinfolib.mlit.go.jp/ex-api/external";

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function apiKey(): string {
  const key = process.env.REINFOLIB_API_KEY;
  if (!key) throw new Error("REINFOLIB_API_KEY が設定されていません（.env.local を確認してください）");
  return key;
}

/**
 * API を呼んで JSON を返す。404 は「該当なし」として null（XIT001 は未公表の四半期で 404 を返す）
 * ログは、渡された接続（取り込みのトランザクションの外の接続）に書く。取り込みが失敗して取り消されても、ログは残す
 */
export async function reinfolibGet<T>(logSql: Sql, api: string, params: Record<string, string | number>, retries = 3): Promise<T | null> {
  const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  const endpoint = `${BASE}/${api}`;
  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    let status: number | null = null;
    let bytes: number | null = null;
    try {
      const res = await fetch(`${endpoint}?${query}`, { headers: { "Ocp-Apim-Subscription-Key": apiKey() } });
      status = res.status;
      const text = await res.text();
      bytes = Buffer.byteLength(text);
      if (res.status === 404) return null;
      if (!res.ok) {
        const error = new Error(`${api} が ${res.status} を返しました：${text.slice(0, 200)}`);
        if (res.status < 500) throw Object.assign(error, { noRetry: true });
        throw error;
      }
      return JSON.parse(text) as T;
    } catch (error) {
      if ((error as { noRetry?: boolean }).noRetry || attempt >= retries) throw error;
      const wait = 2000 * 2 ** attempt;
      console.warn(`  ${api} の取得に失敗しました。${wait / 1000}秒後にやり直します（${attempt + 1}/${retries}）`);
      await sleep(wait);
    } finally {
      await logSql`
        insert into api_access_logs (api, endpoint, params, status_code, response_bytes, duration_ms)
        values (${api}, ${endpoint}, ${logSql.json(params)}, ${status}, ${bytes}, ${Date.now() - started})
      `;
    }
  }
}

// ---- 地図タイル（XYZ方式）。XKT 系の API はタイル単位で取る ----

export interface Tile {
  z: number;
  x: number;
  y: number;
}

export function lonToTileX(lon: number, z: number): number {
  return Math.floor(((lon + 180) / 360) * 2 ** z);
}

export function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z);
}

/** タイルの範囲 [西, 南, 東, 北]（経度・緯度） */
export function tileBbox({ z, x, y }: Tile): [number, number, number, number] {
  const lon = (tx: number) => (tx / 2 ** z) * 360 - 180;
  const lat = (ty: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * ty) / 2 ** z))) * 180) / Math.PI;
  return [lon(x), lat(y + 1), lon(x + 1), lat(y)];
}

/** 経度・緯度の範囲 [西, 南, 東, 北] を覆うタイルの一覧 */
export function tilesInBbox([west, south, east, north]: number[], z: number): Tile[] {
  const tiles: Tile[] = [];
  for (let x = lonToTileX(west, z); x <= lonToTileX(east, z); x++) {
    for (let y = latToTileY(north, z); y <= latToTileY(south, z); y++) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}
