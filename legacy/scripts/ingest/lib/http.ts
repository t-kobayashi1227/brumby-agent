// 外部APIの呼び出し。失敗したら間隔を空けて数回やり直す（設計書 8章）

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** HTTP の応答が失敗だったとき。status で失敗の種類を分ける（ingest_logs.failure_kind、D31） */
export class HttpError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

class ClientError extends HttpError {}

export type FailureKind = "auth" | "rate_limit" | "network" | "other";

/**
 * 失敗の種類（D31。取得成功率と、失敗の内訳を出すため）
 * auth：APIキーがない・認証の失敗（401・403）／rate_limit：回数制限（429）
 * network：通信の失敗・時間切れ・相手のサーバーの障害（5xx）／other：それ以外（データの形が違う など）
 */
export function classifyFailure(error: unknown): FailureKind {
  // instanceof だけに頼らず、status を持つかで見る（読み込みの経路が違うと別のクラスになるため）
  const status = (error as { status?: unknown } | null)?.status;
  if (typeof status === "number") {
    if (status === 401 || status === 403) return "auth";
    if (status === 429) return "rate_limit";
    if (status >= 500 || status === 408) return "network";
    return "other";
  }
  const message = error instanceof Error ? `${error.name} ${error.message} ${String((error as { cause?: unknown }).cause ?? "")}` : String(error);
  if (/が設定されていません|API ?キー|appId|Unauthorized|認証/i.test(message)) return "auth";
  if (/fetch failed|ECONNRESET|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|ECONNREFUSED|socket|TimeoutError|AbortError|network/i.test(message)) return "network";
  return "other";
}

/**
 * JSON を取得する。404 は「該当なし」として null を返す（XIT001 は未公表の四半期で 404 を返す）
 * 400番台はやり直しても結果が変わらないので、すぐに止める。5xx と通信の失敗だけやり直す
 */
export async function fetchJson<T>(url: string, init: RequestInit = {}, retries = 3): Promise<T | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 404) return null;
      if (!res.ok) {
        const message = `${res.status} ${res.statusText}：${(await res.text()).slice(0, 200)}`;
        throw res.status < 500 ? new ClientError(message, res.status) : new HttpError(message, res.status);
      }
      return (await res.json()) as T;
    } catch (error) {
      if (error instanceof ClientError || attempt >= retries) throw error;
      const wait = 2000 * 2 ** attempt;
      console.warn(`  取得に失敗しました。${wait / 1000}秒後にやり直します（${attempt + 1}/${retries}）`);
      await sleep(wait);
    }
  }
}

/** HTML などの文字列を取得する。やり直しの決まりは fetchJson と同じ。404 は null */
export async function fetchText(url: string, init: RequestInit = {}, retries = 3): Promise<string | null> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.status === 404) return null;
      if (!res.ok) {
        const message = `${res.status} ${res.statusText}：${(await res.text()).slice(0, 200)}`;
        throw res.status < 500 ? new ClientError(message, res.status) : new HttpError(message, res.status);
      }
      return await res.text();
    } catch (error) {
      if (error instanceof ClientError || attempt >= retries) throw error;
      const wait = 2000 * 2 ** attempt;
      console.warn(`  取得に失敗しました。${wait / 1000}秒後にやり直します（${attempt + 1}/${retries}）`);
      await sleep(wait);
    }
  }
}
