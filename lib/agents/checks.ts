// 点検のプログラム部分（docs/設計まとめ.md「確認のチェック項目」の「プログラム」の4つと、docs/履歴/戦略の質を上げる修正案.md 5.1 の禁止語）
// 1. 文に付いた事実IDが、事実シートにすべてあるか → 作り直し
// 2. IDのない文がないか → 外す（総合評価・価格の見方・方向性は1つしかないので外せず、作り直し）
// 3. 「取得できず」の事実を根拠にしていないか → 作り直し
// 4. 媒体が C-01〜C-16 の中から3〜6件で、配分の合計が100か → 媒体を作り直し
// 5. 禁止語がないか → 記録だけ（言葉の一致で見るので、問題のない文にも当たる。どのくらい当たるかを数える）
// PoC では作り直さない（docs/設計まとめ.md「処理の流れ」）。action は点検が求める扱いのまま check_results に残す

import type { Fact } from "../facts/types";
import type { MediaOutput, StrategyOutput } from "./schemas";

type CheckTarget = "戦略" | "媒体";
type CheckAction = "作り直し" | "外す" | "記録だけ" | "なし";

export interface CheckIssue {
  target: CheckTarget;
  /** 文の場所（例：appeals[1]）。媒体の件数・合計は media */
  location: string;
  check_name: string;
  problem: string;
  action: CheckAction;
}

interface Sentence {
  target: CheckTarget;
  location: string;
  /** 文の中の言葉（禁止語の点検に使う） */
  text: string;
  evidence: string[];
  /** 配列の中の文なら外せる */
  removable: boolean;
}

/** 項目の中の文字列をつなげる（ID や選択肢の値も入るが、禁止語には当たらない） */
const textOf = (item: object) =>
  Object.values(item)
    .filter((v): v is string => typeof v === "string")
    .join(" ");

/** 画面に出す文の一覧（戦略と媒体） */
function sentences(main: StrategyOutput, media: MediaOutput): Sentence[] {
  const list = (target: CheckTarget, key: string, items: { evidence: string[] }[]) =>
    items.map((it, i) => ({ target, location: `${key}[${i}]`, text: textOf(it), evidence: it.evidence, removable: true }));
  const one = (location: string, it: { evidence: string[] }) => ({ target: "戦略" as const, location, text: textOf(it), evidence: it.evidence, removable: false });
  return [
    ...list("戦略", "analysis", main.analysis),
    one("summary", main.summary),
    ...list("戦略", "targets", main.targets),
    ...list("戦略", "not_fit", main.not_fit),
    ...list("戦略", "appeals", main.appeals),
    one("price_view", main.price_view),
    ...list("戦略", "concerns", main.concerns),
    one("direction", main.direction),
    ...list("媒体", "media", media.media),
    ...list("媒体", "cautions", media.cautions),
  ];
}

const MEDIA_MIN = 3;
const MEDIA_MAX = 6;

const BANNED_WORDS = ["必ず", "最適", "人気の", "査定", "保証", "徒歩"] as const;

/**
 * 文に入っている禁止語。「徒歩○分」は、交通（T）の事実（物件資料の徒歩分）の値に同じ「徒歩○分」があれば通す
 */
export function bannedWords(text: string, facts: Fact[]): string[] {
  const walks = new Set(facts.filter((f) => f.id.startsWith("T-") && f.値).flatMap((f) => [...f.値!.matchAll(/徒歩(\d+)分/g)].map((m) => m[1])));
  const rest = text.replace(/徒歩\s*(\d+)\s*分/g, (all, n: string) => (walks.has(n) ? "" : all));
  return BANNED_WORDS.filter((w) => rest.includes(w));
}

export function checkProgram(main: StrategyOutput, media: MediaOutput, facts: Fact[], mediaIds: string[]): CheckIssue[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const issues: CheckIssue[] = [];
  for (const s of sentences(main, media)) {
    const words = bannedWords(s.text, facts);
    if (words.length) issues.push({ ...pick(s), check_name: "禁止語", problem: `禁止語があります：${words.join("、")}`, action: "記録だけ" });
    const ids = [...new Set(s.evidence.map((e) => e.trim()).filter(Boolean))];
    if (ids.length === 0) {
      issues.push({ ...pick(s), check_name: "IDのない文", problem: "根拠の事実IDがありません", action: s.removable ? "外す" : "作り直し" });
      continue;
    }
    const missing = ids.filter((id) => !byId.has(id));
    if (missing.length) issues.push({ ...pick(s), check_name: "IDが事実シートにない", problem: `事実シートにないIDです：${missing.join("、")}`, action: "作り直し" });
    const notFound = ids.filter((id) => byId.get(id)?.状態 === "取得できず");
    if (notFound.length) issues.push({ ...pick(s), check_name: "取得できずの事実を根拠にしている", problem: `「取得できず」の事実です：${notFound.join("、")}`, action: "作り直し" });
  }

  const ids = media.media.map((m) => m.id);
  const unknownMedia = ids.filter((id) => !mediaIds.includes(id));
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  const total = media.media.reduce((s, m) => s + m.share, 0);
  const mediaProblems = [
    ids.length < MEDIA_MIN || ids.length > MEDIA_MAX ? `媒体が${ids.length}件です（${MEDIA_MIN}〜${MEDIA_MAX}件にする）` : null,
    unknownMedia.length ? `媒体一覧にない媒体です：${unknownMedia.join("、")}` : null,
    dup.length ? `同じ媒体が2回以上あります：${[...new Set(dup)].join("、")}` : null,
    total !== 100 ? `配分の合計が${total}%です（100%にする）` : null,
    media.media.some((m) => m.share <= 0) ? "配分が0%以下の媒体があります" : null,
  ].filter((p): p is string => p !== null);
  for (const problem of mediaProblems) issues.push({ target: "媒体", location: "media", check_name: "媒体の件数と配分", problem, action: "作り直し" });
  return issues;
}

function pick(s: Sentence) {
  return { target: s.target, location: s.location };
}

/** 「外す」の文を取り除いた答えを返す（元の答えは変えない） */
export function removeSentences(main: StrategyOutput, media: MediaOutput, issues: CheckIssue[]): { main: StrategyOutput; media: MediaOutput } {
  const drop = new Set(issues.filter((i) => i.action === "外す").map((i) => `${i.target}:${i.location}`));
  const keep = <T>(target: CheckTarget, key: string, items: T[]) => items.filter((_, i) => !drop.has(`${target}:${key}[${i}]`));
  return {
    main: {
      ...main,
      analysis: keep("戦略", "analysis", main.analysis),
      targets: keep("戦略", "targets", main.targets),
      not_fit: keep("戦略", "not_fit", main.not_fit),
      appeals: keep("戦略", "appeals", main.appeals),
      concerns: keep("戦略", "concerns", main.concerns),
    },
    media: { ...media, media: keep("媒体", "media", media.media), cautions: keep("媒体", "cautions", media.cautions) },
  };
}

/**
 * 確認エージェントの where（例：appeals[1]、戦略.analysis[2]、media[0]）を、戦略か媒体かと場所に分ける
 * 媒体の答えにだけある項目（media・cautions）は媒体、それ以外は戦略
 */
export function splitWhere(where: string): { target: CheckTarget; location: string } {
  const text = where.trim().replace(/^(メイン|戦略|媒体)[.．:：\s]*/, (_, t) => `${t}|`);
  const [prefix, rest] = text.includes("|") ? text.split("|") : [null, text];
  const location = rest.trim();
  const target: CheckTarget = prefix === "媒体" ? "媒体" : prefix ? "戦略" : /^(media|cautions)\b/.test(location) ? "媒体" : "戦略";
  return { target, location };
}
