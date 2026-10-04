// 物件の周りで取る公開データ（不動産情報ライブラリ XKT系）の一覧
// zoom は各APIで取れる範囲（マニュアル）の中から、1枚の大きさと件数を見て決めた

export type LayerMode = "radius" | "point";

export interface Layer {
  apiId: string;
  name: string;
  /** radius：半径の中の地物を数える / point：物件の地点で判定する */
  mode: LayerMode;
  zoom: number;
  /** point の場合に、物件から何m以内の地物を保存するか（0＝物件を含む区域だけ） */
  keepM?: number;
}

export const LAYERS: Layer[] = [
  { apiId: "XKT006", name: "学校", mode: "radius", zoom: 13 },
  { apiId: "XKT007", name: "保育園・幼稚園等", mode: "radius", zoom: 13 },
  { apiId: "XKT015", name: "駅別乗降客数", mode: "radius", zoom: 13 },
  { apiId: "XKT013", name: "将来推計人口250mメッシュ", mode: "radius", zoom: 13 },
  { apiId: "XKT004", name: "小学校区", mode: "point", zoom: 13, keepM: 0 },
  { apiId: "XKT005", name: "中学校区", mode: "point", zoom: 13, keepM: 0 },
  { apiId: "XKT002", name: "用途地域", mode: "point", zoom: 15, keepM: 300 },
  { apiId: "XKT025", name: "液状化の発生傾向", mode: "point", zoom: 15, keepM: 300 },
  { apiId: "XKT026", name: "洪水浸水想定区域（想定最大規模）", mode: "point", zoom: 15, keepM: 300 },
  { apiId: "XKT029", name: "土砂災害警戒区域", mode: "point", zoom: 15, keepM: 300 },
];

export const DEFAULT_RADIUS_M = 3000;
