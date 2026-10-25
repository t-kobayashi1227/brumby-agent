import { getSql } from "../../../../../lib/db";
import { createFactSheet } from "../../../../../lib/facts";

// 事実シートを作って保存する（docs/設計まとめ.md「③事実シート」）。画面に進み具合を出すため、1行1つの JSON で段階を順に返す
//   {"step":"town"} … {"done":true,"id":3,"count":119,"missing":["M-01"]}  失敗したら {"error":"…"}
// 物件の中身は返さない・ログに出さない（テスト物件は秘密保持契約の対象）。表は画面がDBから読み直して出す

// 1物件で十数秒かかる（クエリを順に投げるため）。Vercel に置くときの関数の実行時間の上限
export const maxDuration = 60;

export async function POST(_req: Request, ctx: RouteContext<"/api/properties/[id]/facts">) {
  const propertyId = Number((await ctx.params).id);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return Response.json({ error: "物件の番号が正しくありません" }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
      try {
        const { id, sheet } = await createFactSheet(getSql(), propertyId, (step) => send({ step }));
        const missing = sheet.事実.filter((f) => f.状態 !== "取得").map((f) => f.id);
        send({ done: true, id, count: sheet.事実.length, missing });
      } catch (e) {
        send({ error: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
}
