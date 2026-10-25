import { z } from "zod/v4";

// AIの文章の出力の形（設計書 6.2）：セクション → 段落（key付き） → 文 → 文の種別 → 引用したカードの番号
// 文中の数字は、引用したカード（cites）の数字と一致していなければならない（6.3で検証する）

export const SECTION_KEYS = ["property_location", "target_persona", "appeal_channels", "budget_plan", "action_plan", "uncertainty"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

/** 2026-10-06より前の文章（prompt v1）のセクション。表示のためだけに残す */
export const LEGACY_SECTION_KEYS = ["appeal_points", "budget_rationale", "competitor_diff"] as const;

export const SECTION_TITLE: Record<SectionKey | (typeof LEGACY_SECTION_KEYS)[number], string> = {
  property_location: "物件の特徴・立地",
  target_persona: "想定ターゲット",
  appeal_channels: "訴求・チャネル",
  budget_plan: "広告予算案",
  action_plan: "アクションプラン",
  uncertainty: "不確実性と根拠",
  appeal_points: "訴求ポイント",
  budget_rationale: "広告予算配分の理由",
  competitor_diff: "競合物件との違い",
};

/** 文の種別（D24）。数値の文は引用必須で数字を照合する。定性の文は引用したカードの範囲の言い換えに限る */
export const SENTENCE_KINDS = ["numeric", "qualitative", "proposal"] as const;
export type SentenceKind = (typeof SENTENCE_KINDS)[number];

export const SENTENCE_KIND_LABEL: Record<SentenceKind, string> = { numeric: "事実（数値）", qualitative: "推定", proposal: "提案" };

const SentenceSchema = z.object({
  kind: z.enum(SENTENCE_KINDS).describe("文の種別。numeric：カードの数字を書く文／qualitative：数字を書かずにカードの内容を言い換える文／proposal：販売の進め方などの提案"),
  text: z.string().min(1).describe("日本語の一文。数字を書く場合は kind を numeric にし、その数字の元になったカードの番号を cites に入れる"),
  cites: z.array(z.number().int().min(1)).describe("この文の根拠にした事実カード・判断カードの番号（seq）の一覧。numeric と qualitative の文では1つ以上必須"),
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
  headline: SentenceSchema.describe("この物件の総合評価を表す一文の見出し（例：子育てファミリー層への訴求が有効と考えられる物件です）。各セクションの内容と矛盾しないようにする"),
  sections: z.array(SectionSchema).length(SECTION_KEYS.length),
});

export type NarrativeContent = z.infer<typeof NarrativeContentSchema>;
export type NarrativeSection = NarrativeContent["sections"][number];
export type NarrativeParagraph = NarrativeSection["paragraphs"][number];
export type NarrativeSentence = NarrativeParagraph["sentences"][number];
