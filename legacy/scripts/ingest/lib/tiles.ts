// 地図タイル（XYZ方式）の計算。不動産情報ライブラリのXPT・XKT系APIはタイル単位で取得する
// https://maps.gsi.go.jp/development/tileCoordCheck.html

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

/** 都道府県のおおよその範囲 [西, 南, 東, 北]。四角なので、海や隣の県も含む */
export const PREF_BBOX: Record<string, number[]> = {
  "15": [137.6, 36.7, 139.95, 38.6], // 新潟県（佐渡を含む）
};
