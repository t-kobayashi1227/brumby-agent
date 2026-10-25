import type { NarrativeContent, NarrativeSentence } from "./schema";
import type { FactRow, ParagraphValidation, SentenceValidation, ValidationResult } from "./types";

// 検証（設計書 6.3、D24）
// 1. 文の種別を確かめる：numeric（数値）と qualitative（定性）は引用が1つ以上必要。定性の文に数字は書かない（提案の文は引用すれば書ける）
// 2. 文中の数字（%・万円・m・分・件など、単位付き）を抜き出し、引用したカード（cites）の数字と照合する（四捨五入の差は許す）
// 3. 比較語（多い・高い・上回る など）は、引用したカードに比べる値（comparison）がある場合だけ許す
// 4. 禁止表現：断定（必ず売れる）、属性の決めつけ（D29）、差別につながる表現、入力にない設備、未入力の競合（D25）
// 5. 不合格なら呼び出し側が1回だけ作り直させ、それでも不合格なら段落に「要確認」の印を付ける

const UNIT_PATTERN = "%|万円|円\\/㎡|円|ｍ|m|分|件|人|㎡|歳|ポイント|倍|か所|世帯|台";
const NUMBER_WITH_UNIT = new RegExp(`(-?[0-9][0-9,]*(?:\\.[0-9]+)?)\\s*(?:${UNIT_PATTERN})`, "g");

/** 比べる値がないと使えない言葉 */
const COMPARATIVE = /多い|少ない|高い|低い|広い|狭い|上回|下回|割安|割高|増加|減少|増えて|減って|伸びて/;
/** 結果を断定する表現 */
const ASSERTIVE = /必ず売れ|確実に売れ|絶対|間違いなく|保証/;
/** 差別につながりやすい属性（D29） */
const SENSITIVE = /国籍|外国人|人種|民族|宗教|障害|女性向け|男性向け|独身女性|独身男性/;
/** 公開データでは確かめられない属性。仮説として書く（D21・D29） */
const HYPOTHESIS_ATTR = /共働き|住み替え|子育てを終え|シニア/;
const HEDGE = /可能性|考えられ|想定|見込|仮説|と思われ|推定/;
/** 物件の入力にないと書いてはいけない設備・仕様 */
const EQUIPMENT = ["駐車場", "太陽光", "ZEH", "床暖房", "食洗機", "食器洗", "オール電化", "南向き", "角地", "吹き抜け", "ウォークインクローゼット", "WIC", "浴室乾燥", "蓄電池", "耐震等級", "長期優良", "庭"];

function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUMBER_WITH_UNIT)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/** カード1枚から、文中に出てきてよい数字の一覧を作る（値・比べる値・valueText に含まれる数字すべて。割合は%でも） */
function allowedNumbers(fact: FactRow): number[] {
  const out: number[] = [];
  if (fact.valueText) out.push(...extractNumbers(fact.valueText));
  for (const v of [fact.value, fact.comparison]) {
    if (v === null) continue;
    out.push(v);
    if (fact.unit === "ratio") out.push(v * 100);
  }
  return out;
}

/** 四捨五入の差は許す：小数1桁 or 整数のどちらかで一致すればOK */
function roughlyEquals(a: number, b: number): boolean {
  const round1 = (n: number) => Math.round(n * 10) / 10;
  return round1(a) === round1(b) || Math.round(a) === Math.round(b);
}

/** 比べる値を持つカードか（comparison がある、または差・増減・推移そのものを表すカード、判断カード） */
function hasComparison(fact: FactRow): boolean {
  return fact.comparison !== null || /_gap$|_change$|trend/.test(fact.key) || fact.kind === "decision";
}

export interface ValidationContext {
  /** 物件の入力（間取り・交通・特徴・駐車場）をつないだ文。設備がここになければ書いてはいけない */
  propertyText: string;
  competitorCount: number;
}

function validateSentence(sentence: NarrativeSentence, factsBySeq: Map<number, FactRow>, ctx: ValidationContext): SentenceValidation {
  const { text, cites, kind } = sentence;
  const cited = cites.map((c) => factsBySeq.get(c)).filter((f): f is FactRow => f !== undefined);
  const unknownCites = cites.filter((c) => !factsBySeq.has(c));
  const issues: string[] = [];

  // 1. 種別と引用
  const found = extractNumbers(text);
  if (found.length > 0 && kind === "qualitative") issues.push("数字を書いた文は、種別を numeric（数値）にしてください");
  if ((kind === "numeric" || kind === "qualitative" || found.length > 0) && cites.length === 0) issues.push("根拠のカードを引用していません（数値・定性の文と、数字を書いた提案の文は引用が必要です）");

  // 2. 数字
  const allowed = cited.flatMap(allowedNumbers);
  const mismatches = found.filter((n) => !allowed.some((a) => roughlyEquals(n, a))).map((n) => String(n));

  // 3. 比較語
  const comparative = COMPARATIVE.exec(text);
  if (comparative && !cited.some(hasComparison)) issues.push(`「${comparative[0]}」は比べる値のあるカードを引用したときだけ使えます`);

  // 4. 禁止表現
  const assertive = ASSERTIVE.exec(text);
  if (assertive) issues.push(`「${assertive[0]}」のような断定はしないでください`);
  const sensitive = SENSITIVE.exec(text);
  if (sensitive) issues.push(`「${sensitive[0]}」のような属性に触れる表現は使わないでください`);
  const attr = HYPOTHESIS_ATTR.exec(text);
  if (attr && kind !== "proposal" && !HEDGE.test(text)) issues.push(`「${attr[0]}」は公開データで確かめられないので、「〜の可能性がある」「〜と考えられる」と仮説として書いてください`);
  const citedText = cited.map((f) => f.valueText ?? "").join(" ");
  for (const word of EQUIPMENT) {
    if (text.includes(word) && !ctx.propertyText.includes(word) && !citedText.includes(word)) issues.push(`「${word}」は物件の入力にもカードにもありません`);
  }
  if (ctx.competitorCount === 0 && text.includes("競合") && !text.includes("未入力")) issues.push("競合物件が未入力なので、競合については書かないでください");

  return { kind, text, cites, mismatches, unknownCites, issues };
}

const sentenceOk = (s: SentenceValidation) => s.mismatches.length === 0 && s.unknownCites.length === 0 && s.issues.length === 0;

export function validateNarrative(content: NarrativeContent, facts: FactRow[], ctx: ValidationContext): ValidationResult {
  const factsBySeq = new Map(facts.map((f) => [f.seq, f]));
  const paragraphs: ParagraphValidation[] = [];

  const headline = validateSentence(content.headline, factsBySeq, ctx);
  paragraphs.push({ sectionKey: "headline", paragraphKey: "headline", sentences: [headline], ok: sentenceOk(headline) });

  for (const section of content.sections) {
    for (const paragraph of section.paragraphs) {
      const sentences = paragraph.sentences.map((s) => validateSentence(s, factsBySeq, ctx));
      paragraphs.push({ sectionKey: section.key, paragraphKey: paragraph.key, sentences, ok: sentences.every(sentenceOk) });
    }
  }

  return { ok: paragraphs.every((p) => p.ok), paragraphs };
}

/** 作り直させるときに伝える、不合格の内容（設計書 6.3の5） */
export function describeMismatches(result: ValidationResult): string {
  const lines: string[] = [];
  for (const p of result.paragraphs) {
    if (p.ok) continue;
    for (const s of p.sentences) {
      if (sentenceOk(s)) continue;
      lines.push(`- 「${s.text}」（${s.kind}）`);
      if (s.mismatches.length > 0) lines.push(`  数字 ${s.mismatches.join("、")} が、引用したカード（${s.cites.join(",") || "なし"}）の値と一致しません。`);
      if (s.unknownCites.length > 0) lines.push(`  カード番号 ${s.unknownCites.join(",")} は存在しません。`);
      for (const issue of s.issues) lines.push(`  ${issue}`);
    }
  }
  return lines.join("\n");
}
