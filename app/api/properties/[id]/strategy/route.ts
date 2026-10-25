import { after } from "next/server";
import { runStrategy } from "../../../../../lib/agents/run";
import { getSql } from "../../../../../lib/db";

// 戦略を作る（④の7つのエージェント）。1回で1.5〜2.5分かかるので、POST は実行を始めて id だけ返し、残りは after で動かし続ける
// 画面は GET で進み具合（status・stage）を数秒おきに読み、終わったらレポートを読み直す
// Vercel に置くときは、この関数の実行時間の上限（maxDuration）が実行の長さに足りるか確かめる（段階5では課題として残す）

export const maxDuration = 300;

function propertyIdOf(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(_req: Request, ctx: RouteContext<"/api/properties/[id]/strategy">) {
  const propertyId = propertyIdOf((await ctx.params).id);
  if (!propertyId) return Response.json({ error: "物件の番号が正しくありません" }, { status: 400 });

  let started: (runId: number) => void = () => {};
  const runIdReady = new Promise<number>((resolve) => (started = resolve));
  const done = runStrategy(getSql(), propertyId, undefined, (runId) => started(runId));
  // 失敗は strategy_runs に残るので、ここでは握りつぶす（画面は GET で失敗を知る）
  after(() => done.catch(() => undefined));
  try {
    const runId = await Promise.race([runIdReady, done.then((r) => r.runId)]);
    return Response.json({ runId });
  } catch (e) {
    // 実行の行を作る前に失敗した（実行中のものがある・物件の位置がないなど）
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 409 });
  }
}

export async function GET(_req: Request, ctx: RouteContext<"/api/properties/[id]/strategy">) {
  const propertyId = propertyIdOf((await ctx.params).id);
  if (!propertyId) return Response.json({ error: "物件の番号が正しくありません" }, { status: 400 });
  const [run] = await getSql()<{ id: string; status: string; stage: string | null; error: string | null; cost_usd: string; started_at: Date | null }[]>`
    select id, status, stage, error, cost_usd, started_at from strategy_runs where property_id = ${propertyId} order by created_at desc limit 1
  `;
  if (!run) return Response.json({ run: null });
  return Response.json({
    run: { id: Number(run.id), status: run.status, stage: run.stage, error: run.error, costUsd: Number(run.cost_usd), startedAt: run.started_at },
  });
}
