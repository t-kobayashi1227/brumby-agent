// 事実シートを作る：npm run facts -- <物件の番号> [save] [summary]
// save を付けると fact_sheets に保存する。付けなければ作って表示するだけ
// summary を付けると、値を出さずに ID・項目・状態だけを出す（テスト物件は秘密保持契約の対象のため、共有するときはこちら）
import { getSql } from "../lib/db";
import { createFactSheet, makeFactSheet } from "../lib/facts";
import type { Fact } from "../lib/facts/types";

function show(facts: Fact[], summary: boolean) {
  console.table(facts.map((f) => (summary ? { id: f.id, 項目: f.項目, 状態: f.状態 } : { id: f.id, 項目: f.項目, 値: f.値 ?? "", 比較: f.比較 ?? "", 出典: f.出典, 時点: f.時点, 状態: f.状態 })));
  const notFound = facts.filter((f) => f.状態 !== "取得");
  console.log(`事実 ${facts.length}件（取得できず・要確認 ${notFound.length}件：${notFound.map((f) => f.id).join("、") || "なし"}）`);
}

async function main() {
  const [idArg, ...flags] = process.argv.slice(2);
  const propertyId = Number(idArg);
  if (!Number.isInteger(propertyId) || propertyId <= 0) {
    console.error("物件の番号を指定してください（例：npm run facts -- 1）");
    process.exitCode = 1;
    return;
  }
  const sql = getSql();
  const summary = flags.includes("summary");
  if (flags.includes("save")) {
    const { id, sheet } = await createFactSheet(sql, propertyId);
    show(sheet.事実, summary);
    console.log(`fact_sheets に保存しました（id ${id}）`);
  } else {
    show((await makeFactSheet(sql, propertyId)).sheet.事実, summary);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getSql().end());
