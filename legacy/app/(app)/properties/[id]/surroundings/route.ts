import { getSql } from "../../../../../lib/db";
import { fetchLayer, type FetchResult } from "../../../../../lib/surroundings/fetch";
import { LAYERS, OSM_SUPERMARKET } from "../../../../../lib/surroundings/layers";
import { fetchSupermarkets } from "../../../../../lib/surroundings/osm";

// 物件の周りの公開データを1種類だけ取る（設計書 4.2）。Basic認証（proxy.ts）の中だけで呼べる
// Server Actions は画面から1つずつ順にしか呼ばれないので、画面が種類ごとに同時に呼べるよう Route Handler にしている
// （node_modules/next/dist/docs/01-app/02-guides/server-actions.md「Sequential dispatch on the client」）
// 1回の呼び出しは数秒（タイル数枚）なので、Vercel の実行時間の上限にかからない

export const maxDuration = 60;

export async function POST(request: Request, ctx: RouteContext<"/properties/[id]/surroundings">) {
  const { id } = await ctx.params;
  const propertyId = Number(id);
  const body = (await request.json().catch(() => null)) as { apiId?: unknown } | null;
  const layer = LAYERS.find((l) => l.apiId === body?.apiId);
  if (!Number.isInteger(propertyId) || propertyId <= 0 || !layer) {
    return Response.json({ error: "物件または取るデータの指定が正しくありません" }, { status: 400 });
  }
  try {
    if (layer.apiId === OSM_SUPERMARKET) return Response.json(await fetchSupermarkets(getSql(), propertyId));
    const apiKey = process.env.REINFOLIB_API_KEY;
    if (!apiKey) {
      const result: FetchResult = { apiId: layer.apiId, name: layer.name, tiles: 0, featuresInTiles: 0, featuresKept: 0, status: "failed", error: "REINFOLIB_API_KEY が設定されていません（.env.local・Vercel の環境変数）" };
      return Response.json(result);
    }
    return Response.json(await fetchLayer(getSql(), propertyId, apiKey, layer));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
