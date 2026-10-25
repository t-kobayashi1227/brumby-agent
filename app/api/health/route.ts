import { getSql } from "../../../lib/db";

// サーバー側から Supabase につながるかを確かめる（docs/実装の進め方.md 段階0の完了条件）
// DB（DATABASE_URL）と、REST（NEXT_PUBLIC_SUPABASE_URL ＋ service role キー）の両方を見る
// 返すのは ok/ng と短い理由だけ。キー・接続文字列・エラーの全文は出さない

export const dynamic = "force-dynamic";

type Check = { ok: true; version?: string } | { ok: false; reason: string };

async function checkDb(): Promise<{ db: Check; postgis: Check }> {
  try {
    const sql = getSql();
    const [row] = await sql<{ postgres: string }[]>`select current_setting('server_version') as postgres`;
    const db: Check = { ok: true, version: row.postgres };
    try {
      const [gis] = await sql<{ postgis: string }[]>`select extensions.postgis_lib_version() as postgis`;
      return { db, postgis: { ok: true, version: gis.postgis } };
    } catch {
      return { db, postgis: { ok: false, reason: "PostGIS が有効になっていません" } };
    }
  } catch {
    const reason = process.env.DATABASE_URL ? "DBにつながりません（DATABASE_URL を確認）" : "DATABASE_URL が未設定です";
    return { db: { ok: false, reason }, postgis: { ok: false, reason: "DBにつながらないため確認できません" } };
  }
}

async function checkRest(): Promise<Check> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return { ok: false, reason: "NEXT_PUBLIC_SUPABASE_URL か SUPABASE_SERVICE_ROLE_KEY が未設定です" };
  try {
    // 表がまだ無くても、キーが正しければ OpenAPI の一覧が 200 で返る
    const res = await fetch(`${url.replace(/\/$/, "")}/rest/v1/`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
      cache: "no-store",
    });
    return res.ok ? { ok: true } : { ok: false, reason: `REST が ${res.status} を返しました（キーを確認）` };
  } catch {
    return { ok: false, reason: "REST につながりません（URL を確認）" };
  }
}

export async function GET() {
  const [{ db, postgis }, rest] = await Promise.all([checkDb(), checkRest()]);
  const ok = db.ok && postgis.ok && rest.ok;
  return Response.json({ ok, db, postgis, rest }, { status: ok ? 200 : 503 });
}
