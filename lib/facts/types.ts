// 事実シートの形（docs/設計まとめ.md「③事実シート」）
// キーは設計まとめの JSON のとおり日本語にする。エージェントにも DB（fact_sheets.content）にも、この形のまま渡す

export type FactStatus = "取得" | "取得できず" | "要確認";

/** 事実の分類（IDの英字） */
export type FactCategory = "P" | "M" | "R" | "A" | "S" | "L" | "T" | "H" | "B" | "K" | "C";

export interface Fact {
  id: string;
  項目: string;
  /** 取得できなかった事実は null */
  値: string | null;
  比較?: string;
  出典: string;
  時点: string;
  状態: FactStatus;
}

/** ID を付ける前の事実 */
export type FactDraft = Omit<Fact, "id"> & { category: FactCategory };

export interface FactSheet {
  物件ID: string;
  作成日時: string;
  距離の種類: "直線距離";
  事実: Fact[];
}

const ORDER: FactCategory[] = ["P", "M", "R", "A", "S", "L", "T", "H", "B", "K", "C"];

/**
 * 分類ごとに出てきた順で番号を付ける（P-01, P-02, …）。分類は設計まとめの表の順に並べる
 * 媒体（C）は媒体一覧の ID（C-01〜C-16）をそのまま使うので、id があればそれを使う
 */
export function numberFacts(drafts: (FactDraft & { fixedId?: string })[]): Fact[] {
  const counters = new Map<FactCategory, number>();
  const sorted = ORDER.flatMap((c) => drafts.filter((d) => d.category === c));
  return sorted.map(({ category, fixedId, ...rest }) => {
    const n = (counters.get(category) ?? 0) + 1;
    counters.set(category, n);
    const fact: Fact = { id: fixedId ?? `${category}-${String(n).padStart(2, "0")}`, ...rest };
    if (fact.比較 === undefined) delete fact.比較;
    return fact;
  });
}
