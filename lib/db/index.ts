import postgres from "postgres";

// Supabase（Postgres＋PostGIS）への接続。Next.jsのサーバー側と scripts/ の両方から使う
// Cloudflare Workers（Hyperdrive）でも動かすため、Node.js専用の機能は使わない

export type Sql = postgres.Sql;

// 開発中のホットリロードで接続が増えないよう、クライアントは1つだけ持つ
const globalForDb = globalThis as unknown as { brumbySql?: Sql };

export function getSql(): Sql {
  if (globalForDb.brumbySql) return globalForDb.brumbySql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL が設定されていません（.env.local を確認してください）");
  }

  const sql = postgres(url, { max: 5 });
  globalForDb.brumbySql = sql;
  return sql;
}
