// AI の呼び出しの費用（CLAUDE.md「各呼び出しのトークン数と費用を記録します」）
// claude-haiku-5-5 の料金（2026-10 時点、1M トークンあたりの米ドル）。プロンプトが 100K トークンを超えると高い料金表になる
// キャッシュの読み込みは入力の0.1倍、5分のキャッシュの書き込みは1.25倍

export const MODEL = "claude-haiku-5-5";

const RATES = {
  short: { input: 0.1, output: 0.5 },
  long: { input: 0.5, output: 2.5 },
};
const LONG_PROMPT_TOKENS = 100_000;

export interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens?: number | null;
  cache_read_input_tokens?: number | null;
}

export function costUsd(u: Usage): number {
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const prompt = u.input_tokens + cacheWrite + cacheRead;
  const r = prompt > LONG_PROMPT_TOKENS ? RATES.long : RATES.short;
  const usd = (u.input_tokens * r.input + cacheWrite * r.input * 1.25 + cacheRead * r.input * 0.1 + u.output_tokens * r.output) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}
