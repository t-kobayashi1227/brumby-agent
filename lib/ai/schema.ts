import { z } from "zod/v4";

// AIの文章の出力の形（設計書 6.2）：セクション → 段落（key付き） → 文 → 引用したカードの番号
// 文中の数字は、引用したカード（cites）の数字と一致していなければならない（6.3で検証する）

export const SECTION_KEYS = ["appeal_points", "target_persona", "budget_rationale", "competitor_diff"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

export const SECTION_TITLE: Record<SectionKey, string> = {
  appeal_points: "訴求ポイント",
  target_persona: "狙う層の人物像",
  budget_rationale: "広告予算配分の理由",
  competitor_diff: "競合物件との違い",
};

const SentenceSchema = z.object({
  text: z.string().min(1).describe("日本語の一文。数字を書く場合は、その数字の元になった事実カード／判断カードの番号を必ず cites に入れる"),
  cites: z.array(z.number().int().min(1)).describe("この文の根拠にした事実カード・判断カードの番号（seq）の一覧。数字を書いていない文でも、話の根拠にしたカードがあれば入れる"),
});

const ParagraphSchema = z.object({
  key: z.string().min(1).describe("段落の短い識別子（英語のsnake_case、例：family_fit）"),
  sentences: z.array(SentenceSchema).min(1),
});

const SectionSchema = z.object({
  key: z.enum(SECTION_KEYS),
  paragraphs: z.array(ParagraphSchema).min(1),
});

export const NarrativeContentSchema = z.object({
  headline: SentenceSchema.describe("この物件の総合評価を表す一文の見出し（例：子育てファミリー層への訴求が有効な物件です）。4つのセクションの内容と矛盾しないようにする"),
  sections: z.array(SectionSchema).length(SECTION_KEYS.length),
});

export type NarrativeContent = z.infer<typeof NarrativeContentSchema>;
export type NarrativeSection = NarrativeContent["sections"][number];
export type NarrativeParagraph = NarrativeSection["paragraphs"][number];
export type NarrativeSentence = NarrativeParagraph["sentences"][number];
