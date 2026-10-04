import type { NarrativeContent } from "./schema";
import type { FactRow, ParagraphValidation, SentenceValidation, ValidationResult } from "./types";

// 検証（設計書 6.3）
// 1. 文中の数字（%・万円・m・分・件など、単位付き）を抜き出す
// 2. 引用したカード（cites）の数字と一致するか確かめる（四捨五入の差は許す）
// 3. 一致しなければ、その文を「不一致」として報告する（呼び出し側が1回だけ作り直させる）
// 4. それでも一致しなければ、その段落に「要確認」の印を付ける

const UNIT_PATTERN = "%|万円|円\\/㎡|円|ｍ|m|分|件|人|㎡|歳|ポイント|倍";
const NUMBER_WITH_UNIT = new RegExp(`(-?[0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(?:${UNIT_PATTERN})`, "g");

function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUMBER_WITH_UNIT)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** カード1枚から、文中に出てきてよい数字の一覧を作る（値・比べる値・valueText に含まれる数字すべて） */
function allowedNumbers(fact: FactRow): number[] {
  const out: number[] = [];
  if (fact.valueText) out.push(...extractNumbers(fact.valueText));
  if (fact.value !== null) out.push(fact.value);
  if (fact.comparison !== null) out.push(fact.comparison);
  return out;
}

/** 四捨五入の差は許す：小数1桁 or 整数のどちらかで一致すればOK */
function roughlyEquals(a: number, b: number): boolean {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return round1(a) === round1(b) || Math.round(a) === Math.round(b);
}

function validateSentence(text: string, cites: number[], factsBySeq: Map<number, FactRow>): SentenceValidation {
  const unknownCites = cites.filter((c) => !factsBySeq.has(c));
  const allowed = cites.flatMap((c) => {
    const f = factsBySeq.get(c);
    return f ? allowedNumbers(f) : [];
  });
  const found = extractNumbers(text);
  const mismatches = found.filter((n) => !allowed.some((a) => roughlyEquals(n, a))).map((n) => String(n));
  return { text, cites, mismatches, unknownCites };
}

export function validateNarrative(content: NarrativeContent, facts: FactRow[]): ValidationResult {
  const factsBySeq = new Map(facts.map((f) => [f.seq, f]));
  const paragraphs: ParagraphValidation[] = [];

  const headline = validateSentence(content.headline.text, content.headline.cites, factsBySeq);
  paragraphs.push({ sectionKey: "headline", paragraphKey: "headline", sentences: [headline], ok: headline.mismatches.length === 0 && headline.unknownCites.length === 0 });

  for (const section of content.sections) {
    for (const paragraph of section.paragraphs) {
      const sentences = paragraph.sentences.map((s) => validateSentence(s.text, s.cites, factsBySeq));
      const ok = sentences.every((s) => s.mismatches.length === 0 && s.unknownCites.length === 0);
      paragraphs.push({ sectionKey: section.key, paragraphKey: paragraph.key, sentences, ok });
    }
  }

  return { ok: paragraphs.every((p) => p.ok), paragraphs };
}

/** 作り直させるときに伝える、ずれの内容（設計書 6.3の3） */
export function describeMismatches(result: ValidationResult): string {
  const lines: string[] = [];
  for (const p of result.paragraphs) {
    if (p.ok) continue;
    for (const s of p.sentences) {
      if (s.mismatches.length === 0 && s.unknownCites.length === 0) continue;
      lines.push(`- 「${s.text}」`);
      if (s.mismatches.length > 0) lines.push(`  数字 ${s.mismatches.join("、")} が、引用したカード（${s.cites.join(",")}）の値と一致しません。`);
      if (s.unknownCites.length > 0) lines.push(`  カード番号 ${s.unknownCites.join(",")} は存在しません。`);
    }
  }
  return lines.join("\n");
}
