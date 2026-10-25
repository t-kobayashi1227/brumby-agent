// エージェントが返す JSON の形（docs/設計まとめ.md「出力の形」「エージェントの指示文」）
// structured outputs（output_config.format）で、この形以外を返せないようにする。kind などの選択肢も指示文のとおりにしぼる

import { z } from "zod/v4";

export const AGENTS = ["物件", "立地", "価格", "買い手", "メイン", "媒体", "確認"] as const;
export type AgentName = (typeof AGENTS)[number];
export type AnalysisAgent = "物件" | "立地" | "価格" | "買い手";

const evidence = z.array(z.string());
const confidence = z.enum(["高", "中", "低"]);

/** 分析エージェントの kind（各指示文の「kind は…のいずれか」） */
export const ANALYSIS_KINDS: Record<AnalysisAgent, readonly [string, ...string[]]> = {
  物件: ["強み", "弱み", "合う暮らし"],
  立地: ["暮らしの良い点", "不便な点", "災害の注意", "向く人"],
  価格: ["価格の位置づけ", "売れやすさ", "注意点"],
  買い手: ["買える見込み", "エリアとの合い方"],
};

export function analysisSchema(agent: AnalysisAgent) {
  return z.object({
    agent: z.literal(agent),
    findings: z.array(z.object({ kind: z.enum(ANALYSIS_KINDS[agent]), text: z.string(), evidence, confidence })),
    unknown: z.array(z.string()),
  });
}
export type AnalysisOutput = z.infer<ReturnType<typeof analysisSchema>>;

const sentence = z.object({ text: z.string(), evidence });

export const mainSchema = z.object({
  summary: sentence,
  targets: z.array(
    z.object({
      rank: z.number().int(),
      name: z.string(),
      source: z.enum(["候補", "エージェント提案"]),
      // エージェント提案の候補だけ説明を書く。候補（6つ）は null
      definition: z.string().nullable(),
      reason: z.string(),
      evidence,
      confidence,
    }),
  ),
  not_fit: z.array(z.object({ name: z.string(), reason: z.string(), evidence })),
  appeals: z.array(z.object({ rank: z.number().int(), text: z.string(), evidence })),
  price_view: z.object({
    position: z.enum(["割安", "相場なみ", "割高"]),
    sellability: z.enum(["売れやすい", "標準", "売れにくい"]),
    text: z.string(),
    evidence,
  }),
  concerns: z.array(z.object({ text: z.string(), action: z.string(), evidence })),
  direction: sentence,
});
export type MainOutput = z.infer<typeof mainSchema>;

export const mediaSchema = z.object({
  media: z.array(
    z.object({ id: z.string(), name: z.string(), purpose: z.string(), target: z.string(), share: z.number().int(), reason: z.string(), evidence }),
  ),
  cautions: z.array(z.object({ text: z.string(), action: z.string(), evidence })),
});
export type MediaOutput = z.infer<typeof mediaSchema>;

export const checkSchema = z.object({
  ok: z.boolean(),
  issues: z.array(z.object({ where: z.string(), check: z.number().int(), problem: z.string() })),
});
export type CheckOutput = z.infer<typeof checkSchema>;
