// 物件を分析する：npm run analyze -- --property 1 [--radius 1000] [--no-ai]
// 画面の「分析する」と同じ処理（lib/analyzers/stages.ts）を、段階（集計 → ルール → AI → 検証）の順に最後まで進める
// --no-ai を付けると、ルールの段階で終える（AIの文章は作らない）
import { parseArgs } from "node:util";
import { getSql } from "../lib/db";
import { runAllStages, STAGE_LABEL } from "../lib/analyzers/stages";

async function main() {
  const { values } = parseArgs({ options: { property: { type: "string" }, radius: { type: "string" }, "no-ai": { type: "boolean" } } });
  if (!values.property) throw new Error("--property で物件の番号を指定してください");

  const sql = getSql();
  try {
    const progress = await runAllStages(sql, Number(values.property), values.radius ? { radius_m: Number(values.radius) } : {}, {
      withAi: !values["no-ai"],
      onStage: (p) => console.log(`[物件${values.property}] 実行 ${p.runId}：${p.status === "running" && p.stage ? `次は「${STAGE_LABEL[p.stage]}」` : p.status}`),
    });
    if (progress.error) console.log(`注意：${progress.error}`);
    if (progress.status === "failed") throw new Error(`分析に失敗しました：${progress.error}`);

    const facts = await sql<{ seq: number; key: string; status: string; value: string | null; value_text: string | null; comparison: string | null }[]>`
      select seq, key, status, value, value_text, comparison from facts where run_id = ${progress.runId} order by seq
    `;
    console.log(`カード ${facts.length}枚`);
    for (const f of facts) {
      const value = [f.value ?? "", f.value_text ?? ""].filter((v) => v !== "").join(" ");
      const comparison = f.comparison === null ? "" : `（比べる値 ${f.comparison}）`;
      console.log(`  F-${String(f.seq).padStart(2, "0")} ${f.key} [${f.status}] ${value}${comparison}`);
    }
    const [narrative] = await sql<{ status: string; attempts: number }[]>`select status, attempts from narratives where run_id = ${progress.runId}`;
    if (narrative) console.log(`AIの文章：${narrative.status}（${narrative.attempts}回）。中身は /strategy か npm run generate-narrative で確認`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
