// 外部APIの呼び出し。失敗したら間隔を空けて数回やり直す（設計書 8章）

export const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchJson<T>(url: string, init: RequestInit = {}, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, init);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}：${(await res.text()).slice(0, 200)}`);
      return (await res.json()) as T;
    } catch (error) {
      if (attempt >= retries) throw error;
      const wait = 2000 * 2 ** attempt;
      console.warn(`  取得に失敗しました。${wait / 1000}秒後にやり直します（${attempt + 1}/${retries}）`);
      await sleep(wait);
    }
  }
}
