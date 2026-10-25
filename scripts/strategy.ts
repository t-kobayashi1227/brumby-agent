// 戦略を作る（④の7つのエージェント）：npm run strategy -- <物件の番号>
// 最新の事実シートを使う（無ければ作る）。AI を呼ぶので費用がかかる。結果・費用・点検は DB（strategy_runs など）に残る
// 画面には段階・呼び出しの数・トークン数・費用・点検の件数だけを出す（テスト物件は秘密保持契約の対象のため、中身は出さない）
import { getSql } from "../lib/db";
import { runStrategy } from "../lib/agents/run";

async function main() {
  const propertyId = Number(process.argv[2]);
  if (!Number.isInteger(propertyId) || propertyId <= 0) {
    console.error("物件の番号を指定してください（例：npm run strategy -- 1）");
    process.exitCode = 1;
    return;
  }
  const started = Date.now();
  const elapsed = () => `${Math.round((Date.now() - started) / 1000)}秒`;
  console.log(`物件 ${propertyId}：分析（4つ同時）を始めます`);
  const r = await runStrategy(getSql(), propertyId, (stage) => console.log(`  ${elapsed()} ${stage}`));
  console.log(
    [
      `完了（${elapsed()}）：strategy_runs id ${r.runId}（事実シート id ${r.factSheetId}）`,
      `  呼び出し ${r.calls}回・入力 ${r.inputTokens.toLocaleString()}トークン・出力 ${r.outputTokens.toLocaleString()}トークン・費用 $${r.costUsd.toFixed(4)}`,
      `  点検で見つかった問題：1回目 ${r.checks.round1}件${r.checks.round2 === null ? "（作り直しなし）" : `・作り直した後 ${r.checks.round2}件`}`,
    ].join("\n"),
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getSql().end());
