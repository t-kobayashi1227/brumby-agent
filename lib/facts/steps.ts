// 事実シートを作る段階（画面の進み具合に出す）。DB には触れないので、画面（クライアント）からも読める
// collect.ts が各段階の前に onStep で知らせ、最後に組み立てと保存（save）を行う

export const FACT_STEPS = [
  { key: "property", label: "物件の情報を読む" },
  { key: "town", label: "町を判定する（町丁・字の境界）" },
  { key: "zones", label: "区域を判定する（用途地域・洪水・土砂・津波・液状化・盛土）" },
  { key: "market", label: "相場を調べる（区×築年数の取引価格）" },
  { key: "land", label: "近くの公示地・基準地を探す" },
  { key: "schools", label: "学区を調べる（通学区域一覧）" },
  { key: "facilities", label: "周りの施設を探す（1km以内・3km以内）" },
  { key: "transport", label: "駅・バス停を探す" },
  { key: "area", label: "町の人口・世帯と将来人口を調べる" },
  { key: "buyers", label: "買い手・媒体の統計を読む" },
  { key: "loan", label: "前提値を読み、ローンを計算する" },
  { key: "save", label: "事実シートを組み立てて保存する" },
] as const;

export type FactStepKey = (typeof FACT_STEPS)[number]["key"];
