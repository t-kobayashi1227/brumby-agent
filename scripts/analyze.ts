// 物件を分析して事実カードを作る：npm run analyze -- --property 1 [--radius 1000]
// 本番では画面の「分析する」から同じ処理（lib/analyzers/run.ts）を呼ぶ
import { parseArgs } from "node:util";
import { getSql } from "../lib/db";
import { runAnalysis } from "../lib/analyzers/run";

async function main() {
  const { values } = parseArgs({ options: { property: { type: "string" }, radius: { type: "string" } } });
  if (!values.property) throw new Error("--property で物件の番号を指定してください");

  const sql = getSql();
  try {
    const { runId, facts } = await runAnalysis(sql, Number(values.property), values.radius ? { radius_m: Number(values.radius) } : {});
    console.log(`[物件${values.property}] 実行 ${runId}：カード ${facts.length}枚`);
    for (const [i, f] of facts.entries()) {
      const value = [f.value ?? "", f.valueText ?? ""].filter((v) => v !== "").join(" ");
      const comparison = f.comparison === undefined || f.comparison === null ? "" : `（比べる値 ${f.comparison}）`;
      console.log(`  F-${String(i + 1).padStart(2, "0")} ${f.key} [${f.status}] ${value}${comparison}`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
