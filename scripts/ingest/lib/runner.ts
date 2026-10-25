import type postgres from "postgres";
import { getSql, type Sql } from "../../../lib/db";
import { rawFiles, type RawFiles } from "./files";

// 取り込みの共通の流れ（docs/実装の進め方.md 段階2）
// 1. prepare（任意）：API などから集める。時間がかかるので、トランザクションの外で行う
// 2. 1つのトランザクションで「このデータの古い行を消す → load で読み込む → 件数を数える → datasets を更新する」を行う
// 失敗したら全部取り消されるので、使っているデータは壊れない。成功・失敗は ingest_logs に残す

export type IngestArgs = Record<string, string | undefined>;

export interface PrepareContext {
  /** トランザクションの外の接続（API のアクセスログ、読み込み済みの表の参照） */
  sql: Sql;
  args: IngestArgs;
  /** data/raw/ の元データ（ダウンロード・展開・読み込み） */
  raw: RawFiles;
  log: (message: string) => void;
  /** データの時点（datasets.as_of）を、実際のファイルから分かった値に直す */
  setAsOf: (datasetId: string, asOf: string) => void;
  /** 確かめた結果（ingest_logs.checks）に1項目足す */
  check: (name: string, value: unknown) => void;
  /**
   * 件数を、数え方を変えて記録する。表に自分の行を持たないデータに使う
   * （例：D26 駅別乗降客数は、D25 の駅の行に乗降客数を足すので、乗降客数のあった駅の数を件数にする）
   */
  setRowCount: (datasetId: string, n: number) => void;
}

export interface IngestContext<T = void> extends PrepareContext {
  /** トランザクションの中の接続 */
  sql: Sql;
  /** prepare が返したもの */
  prepared: T;
}

export interface IngestJob<T = void> {
  /** このジョブが入れる datasets.id（例：["D39"]） */
  datasets: string[];
  /** 元データを置くフォルダ（data/raw/<rawDir>/）。提供元のコードにする（例：P29） */
  rawDir: string;
  /** 読み込み先の表。古い行の削除と件数の数え上げに使う（dataset_id の列を持つ表） */
  table: string;
  /** 受け取る引数の名前（refresh は共通） */
  options: string[];
  prepare?: (ctx: PrepareContext) => Promise<T>;
  load: (ctx: IngestContext<T>) => Promise<void>;
}

/** prepare の型をジョブの中で決めたまま、ジョブの一覧（index.ts）に並べられるようにする */
export function defineJob<T>(job: IngestJob<T>): IngestJob<unknown> {
  return job as IngestJob<unknown>;
}

export async function runIngest(name: string, job: IngestJob<unknown>, args: IngestArgs, command: string): Promise<void> {
  const sql = getSql();
  const startedAt = new Date();
  const log = (message: string) => console.log(`[${name}] ${message}`);
  const asOf = new Map<string, string>();
  const checks: Record<string, unknown> = {};
  const rowCounts = new Map<string, number>();
  const raw = rawFiles(job.rawDir, { refresh: args.refresh !== undefined, log });
  const base: PrepareContext = {
    sql,
    args,
    raw,
    log,
    setAsOf: (id, value) => asOf.set(id, value),
    check: (key, value) => {
      checks[key] = value;
    },
    setRowCount: (id, n) => rowCounts.set(id, n),
  };

  try {
    const prepared = job.prepare ? await job.prepare(base) : undefined;
    const counts = await sql.begin(async (tx) => {
      // 図形をつなぐ処理などは、DB の既定の時間制限（数分）を超えることがあるので、このトランザクションだけ延ばす
      await tx`set local statement_timeout = '10min'`;
      const deleted = await tx`delete from ${tx(job.table)} where dataset_id in ${tx(job.datasets)}`;
      if (deleted.count > 0) log(`古い行 ${deleted.count}件を消しました`);

      await job.load({ ...base, sql: tx as unknown as Sql, prepared });

      const rows = await tx<{ dataset_id: string; n: number }[]>`
        select dataset_id, count(*)::int as n from ${tx(job.table)}
        where dataset_id in ${tx(job.datasets)} group by dataset_id
      `;
      const byId = new Map(rows.map((r) => [r.dataset_id, r.n]));
      for (const [id, n] of rowCounts) byId.set(id, n);
      if (rows.length === 0) throw new Error("読み込んだ件数が0件です");

      for (const id of job.datasets) {
        const n = byId.get(id) ?? 0;
        await tx`
          update datasets set row_count = ${n}, loaded_at = now(), as_of = coalesce(${asOf.get(id) ?? null}, as_of)
          where id = ${id}
        `;
        await tx`
          insert into ingest_logs (dataset_id, command, status, row_count, checks, started_at)
          values (${id}, ${command}, 'succeeded', ${n}, ${Object.keys(checks).length > 0 ? tx.json(checks as postgres.JSONValue) : null}, ${startedAt})
        `;
      }
      return job.datasets.map((id) => `${id} ${byId.get(id) ?? 0}件`);
    });
    log(`完了：${counts.join("、")}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const id of job.datasets) {
      await sql`
        insert into ingest_logs (dataset_id, command, status, error, started_at)
        values (${id}, ${command}, 'failed', ${message}, ${startedAt})
      `;
    }
    log(`失敗しました。DBは取り込み前のままです：${message}`);
    throw error;
  }
}

/** postgres.js の制限（1回の問い合わせで値は65,534個まで）を超えないよう、分けて insert する */
export async function insertRows(sql: Sql, table: string, rows: Record<string, unknown>[], chunkSize = 1000) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await sql`insert into ${sql(table)} ${sql(chunk as Record<string, postgres.ParameterOrJSON<never>>[])}`;
  }
}
