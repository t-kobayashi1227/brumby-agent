// 住所 → 緯度経度（設計書 4.2「その都度呼ぶ。結果は物件に保存する」）
// 国土地理院の住所検索（AddressSearch）を使う。無料・APIキー不要。利用条件は docs/使用API一覧.md の確認欄で管理する
// 番地まで当たらないこともあるので、保存したら地図のピンで確かめ、ずれていれば地図で直す（設計書 7章）

export const GEOCODER = "gsi-address-search";
const ENDPOINT = "https://msearch.gsi.go.jp/address-search/AddressSearch";

export interface GeocodeHit {
  lon: number;
  lat: number;
  /** 当たった住所の表記（例：新潟県新潟市中央区上近江一丁目） */
  title: string;
}

interface GsiFeature {
  geometry?: { coordinates?: unknown };
  properties?: { title?: unknown };
}

/** 応答（GeoJSON の Feature の配列）から、最初の当たりを取り出す。新潟県の範囲の外は捨てる */
export function parseGsiResponse(body: unknown): GeocodeHit | null {
  if (!Array.isArray(body)) return null;
  for (const f of body as GsiFeature[]) {
    const c = f.geometry?.coordinates;
    if (!Array.isArray(c) || c.length < 2) continue;
    const [lon, lat] = c.map(Number);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
    // PoC の対象は新潟県内だけ（docs/data-notes.md）。県の外に当たったら、住所の書き方が違う可能性が高い
    if (lon < 137.5 || lon > 140.0 || lat < 36.7 || lat > 38.6) continue;
    return { lon, lat, title: typeof f.properties?.title === "string" ? f.properties.title : "" };
  }
  return null;
}

/** 住所を検索する。当たらなければ null。通信の失敗は例外にする（呼び出し側で「取れなかった」と表示する） */
export async function geocodeAddress(address: string): Promise<GeocodeHit | null> {
  const q = address.trim();
  if (!q) return null;
  const res = await fetch(`${ENDPOINT}?q=${encodeURIComponent(q)}`, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
  if (!res.ok) throw new Error(`住所検索に失敗しました（HTTP ${res.status}）`);
  return parseGsiResponse(await res.json());
}
