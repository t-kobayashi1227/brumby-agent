// ①物件情報の入力（docs/設計まとめ.md「①物件情報の入力」）で使う選択肢と、入力の読み取り
// 選択肢の値は DB（supabase/migrations/20261025100300_properties.sql）の check 制約と同じにする

export const PROPERTY_CLASSES = ["新築", "中古"] as const;
export const FLOORS = ["平屋", "2階建", "3階建以上"] as const;
export const TRANSPORT_MODES = ["電車", "バス"] as const;
// 「内装一部」は 2026-10-25 に足した（クロスの張り替えだけ、など。小林さんと決定）
export const RENOVATION_PARTS = ["キッチン", "浴室", "トイレ", "洗面", "内装全面", "内装一部", "外壁", "屋根", "その他"] as const;

/**
 * 間取りを、居室と納戸の数に分ける（設計まとめ「間取りとS（納戸）」）
 * 「4LDK+S」→ 居室4・納戸1、「3LDK+2S」→ 3・2、「4SLDK」→ 4・1、「3LDK」→ 3・0。読めない書き方は null
 */
export function parseLayout(layout: string): { rooms: number; storerooms: number } | null {
  const text = layout
    .normalize("NFKC")
    .replace(/\s/g, "")
    .toUpperCase()
    .replace(/[＋]/g, "+");
  const m = /^(\d+)(S?)(?:L?D?K|R)(?:\+(\d*)S)?$/.exec(text);
  if (!m) return null;
  const storerooms = (m[2] ? 1 : 0) + (m[3] !== undefined ? Number(m[3] || 1) : 0);
  return { rooms: Number(m[1]), storerooms };
}
