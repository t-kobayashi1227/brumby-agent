// 戦略を作る：npm run strategy -- <物件の番号> [--model sonnet|haiku] [--effort medium|high]
// 戦略・媒体・確認の3回の呼び出し。--model・--effort は戦略担当だけに効く（比べるとき用。既定は sonnet・medium）
// 最新の事実シートを使う（無ければ作る）。AI を呼ぶので費用がかかる。結果・費用・点検は DB（strategy_runs など）に残る
// 画面には段階・呼び出しの数・トークン数・費用・点検の件数だけを出す（テスト物件は秘密保持契約の対象のため、中身は出さない）
// 答えの JSON は、比べるために data/out/（git に入れない）へ書き出す
import { mkdirSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { getSql } from "../lib/db";
import { MODEL, STRATEGY_MODEL } from "../lib/agents/cost";
import type { Effort } from "../lib/agents/llm";
import { runStrategy, type RunOptions } from "../lib/agents/run";
import { parsePropertyId } from "../lib/property";

const MODEL_NAMES = { sonnet: STRATEGY_MODEL, haiku: MODEL } as const;

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { model: { type: "string", default: "sonnet" }, effort: { type: "string", default: "medium" } },
  });
  const propertyId = parsePropertyId(positionals[0] ?? "");
  const usage = "例：npm run strategy -- 1、npm run strategy -- 1 --model sonnet --effort high";
  if (propertyId === null) throw new Error(`物件の番号を指定してください（${usage}）`);
  if (values.model !== "sonnet" && values.model !== "haiku") throw new Error(`--model は sonnet か haiku です（${usage}）`);
  if (values.effort !== "medium" && values.effort !== "high") throw new Error(`--effort は medium か high です（${usage}）`);
  const options: RunOptions = { strategy: { model: MODEL_NAMES[values.model], effort: values.effort as Effort } };

  const started = Date.now();
  const elapsed = () => `${Math.round((Date.now() - started) / 1000)}秒`;
  console.log(`物件 ${propertyId}：始めます（戦略担当 ${options.strategy.model}・effort ${options.strategy.effort}）`);
  const sql = getSql();
  const r = await runStrategy(sql, propertyId, (stage) => console.log(`  ${elapsed()} ${stage}`), undefined, options);

  const [{ result }] = await sql<{ result: unknown }[]>`select result from strategy_runs where id = ${r.runId}`;
  mkdirSync("data/out", { recursive: true });
  const file = `data/out/strategy-run${r.runId}.json`;
  writeFileSync(file, JSON.stringify({ runId: r.runId, propertyId, ...options, seconds: Math.round((Date.now() - started) / 1000), result }, null, 2));

  console.log(
    [
      `完了（${elapsed()}）：strategy_runs id ${r.runId}（事実シート id ${r.factSheetId}）`,
      `  呼び出し ${r.calls}回・入力 ${r.inputTokens.toLocaleString()}トークン・出力 ${r.outputTokens.toLocaleString()}トークン・費用 $${r.costUsd.toFixed(4)}`,
      `  点検で見つかった問題：${r.checks}件（作り直しなし）`,
      `  答えの JSON：${file}`,
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getSql().end());
