// ⑤レポート画面の組み立て（docs/設計まとめ.md「根拠と出典」）。表示だけを行い、AI は動かさない

import type { MainOutput, MediaOutput } from "./agents/schemas";
import { sourceOf, type DatasetInfo } from "./facts/build";
import type { Fact } from "./facts/types";

/** 地図・ライブラリなど、事実とは別に常に出すクレジット */
export const FIXED_CREDITS = ["地図：国土地理院 淡色地図（地理院タイル）", "住所検索：国土地理院 地理院地図の住所検索"];

/** 画面に出す戦略と媒体の文に付いた事実ID（出た順、重なりなし） */
export function usedFactIds(main: MainOutput, media: MediaOutput): string[] {
  const all = [
    main.summary,
    ...main.targets,
    ...main.not_fit,
    ...main.appeals,
    main.price_view,
    ...main.concerns,
    main.direction,
    ...media.media,
    ...media.cautions,
  ].flatMap((s) => s.evidence);
  return [...new Set(all.map((id) => id.trim()).filter(Boolean))];
}

/** 根拠の1件の書き方：「0〜14歳の割合 15.8%（西区 11.9%）」。取れなかった事実は「不明」 */
export function evidenceText(f: Fact): string {
  return `${f.項目} ${f.値 ?? "不明"}${f.比較 ? `（${f.比較}）` : ""}`;
}

export interface SourceRow {
  出典: string;
  時点: string;
}

/**
 * 出典の一覧：使った事実の出典と時点（重なりなし）と、そのデータの決まったクレジット文言
 * クレジットは datasets.attribution。事実の出典にそのデータの出典の文言（sourceOf）が入っていれば、使ったデータとみなす
 */
export function sourceList(facts: Fact[], usedIds: string[], datasets: (DatasetInfo & { attribution: string | null })[]): { rows: SourceRow[]; credits: string[] } {
  const used = facts.filter((f) => usedIds.includes(f.id));
  const seen = new Set<string>();
  const rows: SourceRow[] = [];
  for (const f of used) {
    const key = `${f.出典}|${f.時点}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({ 出典: f.出典, 時点: f.時点 });
  }
  const credits = datasets
    .filter((d) => d.attribution && used.some((f) => f.出典.includes(sourceOf(d))))
    .map((d) => d.attribution as string);
  return { rows, credits: [...new Set(credits)] };
}
