// エージェントが返す JSON の形（docs/設計まとめ.md「出力の形」「エージェントの指示文」）
// structured outputs（output_config.format）で、この形以外を返せないようにする。topic などの選択肢も指示文のとおりにしぼる

import { z } from "zod/v4";

export const AGENTS = ["戦略", "媒体", "確認"] as const;
export type AgentName = (typeof AGENTS)[number];

const evidence = z.array(z.string());
const confidence = z.enum(["高", "中", "低"]);

const sentence = z.object({ text: z.string(), evidence });

/** 戦略の答えのうち、分析を除いた部分（媒体担当に渡す） */
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

/** 戦略担当の答え。分析（事実 → 買い手にとっての意味 → 販売での使い方）と戦略を1回で作る。分析を先に書かせる */
export const STRATEGY_TOPICS = ["物件", "立地", "価格", "買い手", "組み合わせ", "その他"] as const;
export const strategySchema = z.object({
  analysis: z.array(
    z.object({
      topic: z.enum(STRATEGY_TOPICS),
      // 事実 → 買い手にとっての意味 → 販売での使い方
      fact: z.string(),
      meaning: z.string(),
      use: z.string(),
      evidence,
      confidence,
    }),
  ),
  unknown: z.array(z.string()),
  ...mainSchema.shape,
});
export type StrategyOutput = z.infer<typeof strategySchema>;

/** 戦略の答えから、媒体担当に渡す部分（分析を除いた戦略）だけを取り出す */
export function mainPart(strategy: StrategyOutput): MainOutput {
  return mainSchema.parse(strategy);
}

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
