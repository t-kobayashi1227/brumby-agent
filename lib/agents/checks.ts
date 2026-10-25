// 点検のプログラム部分（docs/設計まとめ.md「確認のチェック項目」の「プログラム」の4つ）
// 1. 文に付いた事実IDが、事実シートにすべてあるか → 作り直し
// 2. IDのない文がないか → 外す（総合評価・価格の見方・方向性は1つしかないので外せず、作り直し）
// 3. 「取得できず」の事実を根拠にしていないか → 作り直し
// 4. 媒体が C-01〜C-16 の中から3〜6件で、配分の合計が100か → 媒体を作り直し

import type { Fact } from "../facts/types";
import type { MainOutput, MediaOutput } from "./schemas";

export type CheckTarget = "メイン" | "媒体";
export type CheckAction = "作り直し" | "外す" | "なし";

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
  evidence: string[];
  /** 配列の中の文なら外せる */
  removable: boolean;
}

/** 画面に出す文の一覧（メインと媒体） */
export function sentences(main: MainOutput, media: MediaOutput): Sentence[] {
  const list = (target: CheckTarget, key: string, items: { evidence: string[] }[]) =>
    items.map((it, i) => ({ target, location: `${key}[${i}]`, evidence: it.evidence, removable: true }));
  return [
    { target: "メイン", location: "summary", evidence: main.summary.evidence, removable: false },
    ...list("メイン", "targets", main.targets),
    ...list("メイン", "not_fit", main.not_fit),
    ...list("メイン", "appeals", main.appeals),
    { target: "メイン", location: "price_view", evidence: main.price_view.evidence, removable: false },
    ...list("メイン", "concerns", main.concerns),
    { target: "メイン", location: "direction", evidence: main.direction.evidence, removable: false },
    ...list("媒体", "media", media.media),
    ...list("媒体", "cautions", media.cautions),
  ];
}

const MEDIA_MIN = 3;
const MEDIA_MAX = 6;

export function checkProgram(main: MainOutput, media: MediaOutput, facts: Fact[], mediaIds: string[]): CheckIssue[] {
  const byId = new Map(facts.map((f) => [f.id, f]));
  const issues: CheckIssue[] = [];
  for (const s of sentences(main, media)) {
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
export function removeSentences(main: MainOutput, media: MediaOutput, issues: CheckIssue[]): { main: MainOutput; media: MediaOutput } {
  const drop = new Set(issues.filter((i) => i.action === "外す").map((i) => `${i.target}:${i.location}`));
  const keep = <T>(target: CheckTarget, key: string, items: T[]) => items.filter((_, i) => !drop.has(`${target}:${key}[${i}]`));
  return {
    main: {
      ...main,
      targets: keep("メイン", "targets", main.targets),
      not_fit: keep("メイン", "not_fit", main.not_fit),
      appeals: keep("メイン", "appeals", main.appeals),
      concerns: keep("メイン", "concerns", main.concerns),
    },
    media: { ...media, media: keep("媒体", "media", media.media), cautions: keep("媒体", "cautions", media.cautions) },
  };
}

/**
 * 確認エージェントの where（例：appeals[1]、メイン.appeals[1]、media[0]）を、メインか媒体かと場所に分ける
 * 媒体の答えにだけある項目（media・cautions）は媒体、それ以外はメイン
 */
export function splitWhere(where: string): { target: CheckTarget; location: string } {
  const text = where.trim().replace(/^(メイン|媒体)[.．:：\s]*/, (_, t) => `${t}|`);
  const [prefix, rest] = text.includes("|") ? text.split("|") : [null, text];
  const location = rest.trim();
  const target: CheckTarget = prefix === "媒体" || prefix === "メイン" ? prefix : /^(media|cautions)\b/.test(location) ? "媒体" : "メイン";
  return { target, location };
}
