// AI の呼び出しの費用（CLAUDE.md「各呼び出しのトークン数と費用を記録します」）
// 料金は 2026-10 時点、1M トークンあたりの米ドル。Haiku はプロンプトが 100K トークンを超えると高い料金表になる
// キャッシュの読み込みは入力の0.1倍、5分のキャッシュの書き込みは1.25倍

/** 媒体担当 */
export const MODEL = "claude-haiku-5-5";
/** 戦略担当と確認担当（docs/履歴/戦略の質を上げる修正案.md 4.1） */
export const STRATEGY_MODEL = "claude-sonnet-5-5";

export type Model = typeof MODEL | typeof STRATEGY_MODEL;

interface Rate {
  input: number;
  output: number;
}
const RATES: Record<Model, { short: Rate; long: Rate | null }> = {
  "claude-haiku-5-5": { short: { input: 0.1, output: 0.5 }, long: { input: 0.5, output: 2.5 } },
  "claude-sonnet-5-5": { short: { input: 2, output: 10 }, long: null },
};
const LONG_PROMPT_TOKENS = 100_000;

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function costUsd(u: Usage, model: Model = MODEL): number {
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const prompt = u.input_tokens + cacheWrite + cacheRead;
  const rates = RATES[model];
  const r = prompt > LONG_PROMPT_TOKENS && rates.long ? rates.long : rates.short;
  const usd = (u.input_tokens * r.input + cacheWrite * r.input * 1.25 + cacheRead * r.input * 0.1 + u.output_tokens * r.output) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}
