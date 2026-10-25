import postgres from "postgres";

// Supabase（Postgres＋PostGIS）への接続。Next.jsのサーバー側と scripts/ の両方から使う
// Vercel からはコネクションプーラー（Transaction mode）経由でつなぐ。プーラーはプリペアドステートメントを
// 引き継げないので prepare: false にする（設計書 D5）

export type Sql = postgres.Sql;

// 開発中のホットリロードで接続が増えないよう、クライアントは1つだけ持つ
const globalForDb = globalThis as unknown as { brumbySql?: Sql };

export function getSql(): Sql {
  if (globalForDb.brumbySql) return globalForDb.brumbySql;

  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL が設定されていません（.env.local を確認してください）");
  }

  // onnotice：PostGIS が図形を直すときの知らせ（Self-intersection など）は、エラーではないので画面に出さない
  const sql = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
  globalForDb.brumbySql = sql;
  return sql;
}
