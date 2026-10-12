import { getSql } from "../../../../../lib/db";
import { photosReady } from "../../../../../lib/photos";

// 物件の写真を返す（property_photos）。Basic認証（proxy.ts）の中だけで見える
// URL に版（?v=更新日時）を付けて呼ぶので、ブラウザに長く置いてよい（差し替えると URL が変わる）

export async function GET(_request: Request, ctx: RouteContext<"/properties/[id]/photo">) {
  const { id } = await ctx.params;
  const propertyId = Number(id);
  if (!Number.isInteger(propertyId) || propertyId <= 0) return new Response("Not found", { status: 404 });
  const sql = getSql();
  if (!(await photosReady(sql))) return new Response("Not found", { status: 404 });
  const [row] = await sql<{ content: Buffer; content_type: string }[]>`
    select content, content_type from property_photos where property_id = ${propertyId}
  `;
  if (!row) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(row.content), {
    headers: { "Content-Type": row.content_type, "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
