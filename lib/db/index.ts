import postgres from "postgres";

// Supabase（Postgres＋PostGIS）への接続。Next.jsのサーバー側と scripts/ の両方から使う
// Vercel からはコネクションプーラー（Transaction mode）経由でつなぐ。プーラーはプリペアドステートメントを
// 引き継げないので prepare: false にする

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

/**
 * クエリを1つずつ順に実行し、結果を並びのまま返す。Promise.all で同時に投げない
 * Supabase のプーラー（Transaction mode）経由で同時に投げると、postgres.js が最初に読む型の一覧（pg_type）が
 * statement timeout で止められ、同じ接続の残りのクエリが返らなくなることがあった（2026-10-25）
 */
export async function inOrder<T extends unknown[]>(...tasks: { [K in keyof T]: () => PromiseLike<T[K]> }): Promise<T> {
  const out: unknown[] = [];
  for (const task of tasks) out.push(await task());
  return out as T;
}

/** 別々の場所から呼ばれる書き込みを、呼ばれた順に1つずつ実行する（inOrder と同じ理由。前が失敗しても次は実行する） */
export function serial() {
  let tail: Promise<unknown> = Promise.resolve();
  return <T>(task: () => Promise<T>): Promise<T> => {
    const next = tail.then(task, task);
    tail = next.catch(() => undefined);
    return next;
  };
}
