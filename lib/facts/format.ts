// 事実の「値」の書き方。距離はすべて直線距離で「直線」と書き、徒歩分には直さない（CLAUDE.md）

/** 直線距離：1km未満は10m単位（直線650m）、1km以上は0.1km単位（直線1.1km） */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `直線${Math.round(meters / 10) * 10}m`;
  return `直線${(Math.round(meters / 100) / 10).toFixed(1)}km`;
}

/** 3桁ごとのカンマ */
export function formatNumber(n: number, digits = 0): string {
  return n.toLocaleString("ja-JP", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** 円 → 「2,480万円」（1万円単位で四捨五入） */
export function formatManYen(yen: number): string {
  return `${formatNumber(Math.round(yen / 10_000))}万円`;
}

/** 円 → 「6.6万円」（0.1万円単位で四捨五入） */
export function formatManYen1(yen: number): string {
  return `${(Math.round(yen / 1000) / 10).toFixed(1)}万円`;
}

/** 割合（%） → 「15.8%」 */
export function formatPct(pct: number, digits = 1): string {
  return `${pct.toFixed(digits)}%`;
}

/** 変化率（%） → 「+2.4%」「-8.2%」 */
export function formatChange(pct: number, digits = 1): string {
  const r = Number(pct.toFixed(digits));
  return `${r > 0 ? "+" : ""}${r.toFixed(digits)}%`;
}

export interface NearbyItem {
  name: string;
  distance_m: number;
}

/** 1km以内の一覧に出す数（近い順） */
export const LIST_LIMIT = 5;

/**
 * 周りの施設の値（設計まとめ「周りの施設（L）の渡し方」）
 * 1km以内にあれば「3件：○○ 直線650m、…」（6件以上は近い順に5件と「ほかN件」）
 * 無ければ「0件。3km以内の最寄り：○○ 直線1.1km」か「0件。3km以内になし」
 */
export function formatNearby(within1km: NearbyItem[], nearest3km: NearbyItem | null): string {
  if (within1km.length === 0) {
    return nearest3km ? `0件。3km以内の最寄り：${nearest3km.name} ${formatDistance(nearest3km.distance_m)}` : "0件。3km以内になし";
  }
  const shown = within1km.slice(0, LIST_LIMIT).map((f) => `${f.name} ${formatDistance(f.distance_m)}`);
  const rest = within1km.length - shown.length;
  return `${within1km.length}件：${shown.join("、")}${rest > 0 ? ` ほか${rest}件` : ""}`;
}

/** 中央値。空なら null */
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}
