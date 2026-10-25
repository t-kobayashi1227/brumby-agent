import type { Sql } from "../../lib/db";

// データの行を消して、表を詰める：npm run ingest -- clear D31
// 取り込みのジョブは「古い行を消す → 新しい行を入れる」を1つのトランザクションで行うので、入れ直しの間は古い行と新しい行の両方の場所を使う
// 大きなデータ（洪水など）を入れ直すときに DB の容量（Supabase の無料枠 500MB）を超えないよう、先にこれで古い行を消して表を詰める
// VACUUM FULL は表を作り直して、消した行の場所を DB から返す（その間、表は読み書きできない）

export async function clearDataset(sql: Sql, datasetId: string, table: string): Promise<string> {
  const before = await size(sql);
  const deleted = await sql`delete from ${sql(table)} where dataset_id = ${datasetId}`;
  await sql`update datasets set row_count = 0, loaded_at = null where id = ${datasetId}`;
  // VACUUM はトランザクションの中では動かないので、1つの命令として送る
  await sql.unsafe(`vacuum full public."${table.replace(/"/g, "")}"`);
  return `${datasetId}：${table} の ${deleted.count}行を消して表を詰めました（DB ${before} → ${await size(sql)}）。続けてジョブで入れ直してください`;
}

async function size(sql: Sql): Promise<string> {
  const [r] = await sql<{ s: string }[]>`select pg_size_pretty(pg_database_size(current_database())) as s`;
  return r.s;
}
