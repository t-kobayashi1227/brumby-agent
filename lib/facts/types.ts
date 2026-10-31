// 事実シートの形（docs/設計まとめ.md「③事実シート」）
// キーは設計まとめの JSON のとおり日本語にする。エージェントにも DB（fact_sheets.content）にも、この形のまま渡す

export type FactStatus = "取得" | "取得できず" | "要確認";

/** 事実の分類（IDの英字） */
export type FactCategory = "P" | "M" | "R" | "A" | "S" | "L" | "T" | "H" | "B" | "K" | "C";

/** 分類の名前と主な中身（docs/設計まとめ.md「③事実シート」の英字の表）。画面の凡例に使う */
export const FACT_CATEGORIES: Record<FactCategory, { name: string; contents: string }> = {
  P: { name: "物件", contents: "価格、間取り、面積、築年数、駐車、リフォーム、特徴" },
  M: { name: "相場", contents: "区×築年数の坪単価の相場、相場比、広さの近い取引の相場、公示地" },
  R: { name: "規制", contents: "用途地域" },
  A: { name: "エリア", contents: "年齢構成、世帯構成、持ち家率、将来人口" },
  S: { name: "学区", contents: "小学校区、中学校区" },
  L: { name: "生活施設", contents: "学校、保育園、公園、買い物、医療" },
  T: { name: "交通", contents: "最寄り駅・バス停" },
  H: { name: "災害", contents: "浸水深、土砂、液状化、盛土" },
  B: { name: "買い手", contents: "返済額、必要年収、買主の年代、媒体の利用率、ターゲット候補の定義" },
  K: { name: "競合", contents: "競合物件の価格・広さ・築年数・直線距離" },
  C: { name: "媒体", contents: "媒体一覧" },
};

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
