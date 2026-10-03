// 外部APIの呼び出し。失敗したら間隔を空けて数回やり直す（設計書 8章）

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

class ClientError extends Error {}

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
        throw res.status < 500 ? new ClientError(message) : new Error(message);
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
