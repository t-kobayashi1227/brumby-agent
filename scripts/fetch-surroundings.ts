// 物件の周りの公開データ（XKT系）を取る：npm run fetch-surroundings -- --property 1 [--radius 3000] [--apis XKT006,XKT026]
// 画面では、物件の画面（/properties/<番号>）が位置の保存の後に自動で同じ処理（lib/surroundings/fetch.ts の fetchLayer）を1種類ずつ呼ぶ
import { parseArgs } from "node:util";
import { getSql } from "../lib/db";
import { fetchSurroundings } from "../lib/surroundings/fetch";
import { requireEnv } from "./ingest/lib/env";

async function main() {
  const { values } = parseArgs({
    options: { property: { type: "string" }, radius: { type: "string" }, apis: { type: "string" } },
  });
  if (!values.property) throw new Error("--property で物件の番号を指定してください");

  const sql = getSql();
  try {
    const started = Date.now();
    const results = await fetchSurroundings(sql, Number(values.property), requireEnv("REINFOLIB_API_KEY"), {
      radiusM: values.radius ? Number(values.radius) : undefined,
      apiIds: values.apis?.split(","),
      log: (message) => console.log(`[物件${values.property}] ${message}`),
    });
    const failed = results.filter((r) => r.status === "failed").length;
    console.log(`[物件${values.property}] 終わりました（${((Date.now() - started) / 1000).toFixed(0)}秒、失敗 ${failed}件）`);
    if (failed > 0) process.exitCode = 1;
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
