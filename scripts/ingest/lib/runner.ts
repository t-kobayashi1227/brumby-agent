import type postgres from "postgres";
import { getSql, type Sql } from "../../../lib/db";
import { saveRaw } from "./raw-store";

// 取り込みの共通の流れ（設計書 4.1）
// 版を作る（loading）→ 取得して読み込む → 件数と空欄の割合を確かめる → 使用中に切り替える（active）
// 失敗したら版は loading のまま残し、使用中のデータには触れない

export type IngestArgs = Record<string, string | undefined>;

export interface IngestContext {
  sql: Sql;
  versionId: number;
  args: IngestArgs;
  /** 生データを Storage の「source/dataset/版のID/name」に保存する */
  saveRaw: (name: string, body: string) => Promise<string>;
  log: (message: string) => void;
}

export interface IngestJob {
  source: string;               // dataset_versions.source
  dataset: string;              // dataset_versions.dataset
  table: string;                // 読み込み先のテーブル。件数と空欄の割合を数える
  attribution: string;          // 画面に出す出典
  options: string[];            // 受け取る引数の名前（--from など）。これ以外はエラーにする
  /** 引数から、この版の範囲（coverage）と期間（period）を決める */
  describe: (args: IngestArgs) => { coverage: string; period?: string };
  /** 取得して、dataset_version_id を付けて読み込む */
  load: (ctx: IngestContext) => Promise<void>;
}

export async function runIngest(job: IngestJob, args: IngestArgs, command: string): Promise<void> {
  const sql = getSql();
  const startedAt = new Date();
  const { coverage, period } = job.describe(args);
  const rawPrefix = `${job.source}/${job.dataset}`;

  const [version] = await sql<{ id: number }[]>`
    insert into dataset_versions (source, dataset, coverage, period, attribution)
    values (${job.source}, ${job.dataset}, ${coverage}, ${period ?? null}, ${job.attribution})
    returning id
  `;
  const versionId = Number(version.id);
  const log = (message: string) => console.log(`[${job.dataset} v${versionId}] ${message}`);
  log(`版を作りました（${coverage}${period ? `、${period}` : ""}）`);

  try {
    await job.load({
      sql,
      versionId,
      args,
      saveRaw: (name, body) => saveRaw(`${rawPrefix}/${versionId}/${name}`, body),
      log,
    });

    const { total, nullRatios } = await measure(sql, job.table, versionId);
    if (total === 0) throw new Error("読み込んだ件数が0件のため、使用中に切り替えません");
    log(`${total}件を読み込みました`);

    await sql.begin(async (tx) => {
      await tx`
        update dataset_versions set status = 'archived'
        where source = ${job.source} and dataset = ${job.dataset}
          and coverage = ${coverage} and status = 'active'
      `;
      await tx`
        update dataset_versions
        set status = 'active', row_count = ${total},
            raw_uri = ${`storage://ingest-raw/${rawPrefix}/${versionId}/`}
        where id = ${versionId}
      `;
      await tx`
        insert into ingest_logs (dataset_version_id, command, status, row_count, null_ratios, started_at)
        values (${versionId}, ${command}, 'succeeded', ${total}, ${tx.json(nullRatios)}, ${startedAt})
      `;
    });
    log("使用中に切り替えました");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await sql`
      insert into ingest_logs (dataset_version_id, command, status, error, started_at)
      values (${versionId}, ${command}, 'failed', ${message}, ${startedAt})
    `;
    log(`失敗しました。版は loading のまま残します：${message}`);
    throw error;
  }
}

/** postgres.js の制限（1回の問い合わせで値は65,534個まで）を超えないよう、分けて insert する */
export async function insertRows(sql: Sql, table: string, rows: Record<string, unknown>[], chunkSize = 1000) {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await sql`insert into ${sql(table)} ${sql(chunk as Record<string, postgres.ParameterOrJSON<never>>[])} on conflict do nothing`;
  }
}

// この版の件数と、列ごとの空欄の割合（確認1の材料）
async function measure(sql: Sql, table: string, versionId: number) {
  const columns = await sql<{ column_name: string }[]>`
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = ${table}
      and column_name not in ('id', 'dataset_version_id', 'row_hash', 'raw')
    order by ordinal_position
  `;
  const quote = (name: string) => `"${name.replace(/"/g, '""')}"`;
  const ratios = columns
    .map((c) => `1 - count(${quote(c.column_name)})::float8 / nullif(count(*), 0) as ${quote(c.column_name)}`)
    .join(", ");

  const [row] = await sql.unsafe<Record<string, number | null>[]>(
    `select count(*)::int as __total, ${ratios} from public.${quote(table)} where dataset_version_id = $1`,
    [versionId],
  );
  const { __total, ...rest } = row;
  const nullRatios = Object.fromEntries(
    Object.entries(rest).map(([k, v]) => [k, v === null ? null : Math.round(v * 1000) / 1000]),
  );
  return { total: Number(__total), nullRatios };
}
