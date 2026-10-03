import { requireEnv } from "./env";

// 生データを Supabase Storage（ingest-raw バケット）にそのまま保存する
// supabase-js は使わず、Storage の REST API を直接呼ぶ

const BUCKET = "ingest-raw";

/** 保存したファイルの場所（storage://ingest-raw/...）を返す */
export async function saveRaw(path: string, body: string, contentType = "application/json"): Promise<string> {
  const url = requireEnv("SUPABASE_URL");
  const key = requireEnv("SUPABASE_SECRET_KEY");

  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
    body,
  });
  if (!res.ok) {
    throw new Error(`生データの保存に失敗しました（${res.status}）：${await res.text()}`);
  }
  return `storage://${BUCKET}/${path}`;
}
