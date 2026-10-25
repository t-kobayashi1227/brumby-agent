// AI（claude-haiku-5-5）を1回呼ぶ。返す形は structured outputs（output_config.format）で決め、SDK が読み取った JSON を返す
// APIキーは ANTHROPIC_API_KEY（.env.local）。サーバー側だけで使い、ログや画面に出さない

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod/v4";
import { costUsd, MODEL, type Usage } from "./cost";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export interface LlmResult<T> {
  output: T | null;
  rawText: string;
  usage: Usage;
  costUsd: number;
  /** 読めなかった・途中で止まったときの説明。成功なら null */
  error: string | null;
}

export async function callModel<S extends z.ZodType>(system: string, messages: Anthropic.MessageParam[], schema: S): Promise<LlmResult<z.infer<S>>> {
  const response = await getClient().messages.parse({
    model: MODEL,
    // 考える分（adaptive thinking）も max_tokens に入るので、余裕を持たせる
    max_tokens: 16000,
    system,
    messages,
    output_config: { format: zodOutputFormat(schema), effort: "medium" },
  });
  const rawText = response.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  const usage: Usage = {
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cache_creation_input_tokens: response.usage.cache_creation_input_tokens,
    cache_read_input_tokens: response.usage.cache_read_input_tokens,
  };
  let error: string | null = null;
  if (response.stop_reason === "refusal") error = `AI が答えを断りました（${response.stop_details?.category ?? "理由不明"}）`;
  else if (response.stop_reason === "max_tokens") error = "答えが長すぎて途中で止まりました（max_tokens）";
  else if (response.parsed_output == null) error = "答えの JSON を読み取れませんでした";
  return { output: error ? null : (response.parsed_output as z.infer<S>), rawText, usage, costUsd: costUsd(usage), error };
}
