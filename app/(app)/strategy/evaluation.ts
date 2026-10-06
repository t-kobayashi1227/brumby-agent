// 評価（確認2、設計書 D18・10章）の観点と答え。画面とサーバーの両方で使う

export const ANSWERS = [
  { key: "target", label: "狙う層" },
  { key: "appeal", label: "訴求" },
  { key: "media_budget", label: "媒体・予算" },
  { key: "action", label: "進め方" },
] as const;

/** 4つの答えごとに付ける観点 */
export const PER_ANSWER = [
  { key: "specificity", label: "具体性" },
  { key: "feasibility", label: "実行可能性" },
] as const;

/** 物件ごとに付ける観点。根拠整合は検証の合格率を使い、人は抜き取りで確かめる */
export const PER_PROPERTY = [
  { key: "readability", label: "UI可読性" },
  { key: "evidence", label: "根拠整合（抜き取り）" },
] as const;

/** 尺度（叩き台。BRUMBY様に確認する） */
export const SCALE = [
  { score: 5, label: "そのまま取引先に出せる" },
  { score: 4, label: "言い回しの修正だけ" },
  { score: 3, label: "一部差し替えれば使える" },
  { score: 2, label: "大半を書き直す" },
  { score: 1, label: "使えない・事実が誤っている" },
] as const;

export interface EvaluationRow {
  answerKey: string | null;
  criterion: string;
  score: number;
  memo: string | null;
  evaluator: string | null;
  createdAt: string;
}

/** 入力欄の名前：score|<answer または -> |<criterion> */
export const fieldName = (kind: "score" | "memo", answerKey: string | null, criterion: string) => `${kind}|${answerKey ?? "-"}|${criterion}`;
