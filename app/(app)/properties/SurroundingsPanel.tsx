"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LAYERS } from "../../../lib/surroundings/layers";
import { btnPrimary, btnSecondary, card } from "../../_lib/ui";
import { fetchSurroundingLayer } from "./actions";

// 物件の周りの公開データ（不動産情報ライブラリ XKT系）を取る（設計書 4.2「物件の登録時に、周りの地物だけを取得して保存」）
// 位置が新しくなったら（登録・地図でのピンの保存・住所からの取り直し）、自動で取りに行く
// 1種類ずつ別の呼び出しで取り、表に進み具合を出す。失敗した種類があっても最後まで進める

export interface FetchRow {
  apiId: string;
  status: "ok" | "empty" | "failed" | "running" | "waiting";
  featuresKept: number | null;
  error: string | null;
  fetchedAt: string | null;
}

const STATUS_LABEL: Record<FetchRow["status"], string> = {
  ok: "取れた",
  empty: "データなし",
  failed: "失敗",
  running: "取得中…",
  waiting: "待ち",
};

const STATUS_TONE: Record<FetchRow["status"], string> = {
  ok: "text-[#157347]",
  empty: "text-muted",
  failed: "text-[#b91c1c] font-bold",
  running: "text-brand font-bold",
  waiting: "text-muted",
};

/** 半径で数える種類と、物件の地点で判定する種類で、保存する範囲が違う（lib/surroundings/layers.ts） */
const rangeOf = (apiId: string) => {
  const l = LAYERS.find((x) => x.apiId === apiId)!;
  return l.mode === "radius" ? "半径3km" : l.keepM ? `${l.keepM}m以内` : "物件を含む区域";
};

export default function SurroundingsPanel({ propertyId, hasLocation, autoStart, initial }: { propertyId: number; hasLocation: boolean; autoStart: boolean; initial: FetchRow[] }) {
  const [rows, setRows] = useState<FetchRow[]>(() =>
    LAYERS.map((l) => initial.find((r) => r.apiId === l.apiId) ?? { apiId: l.apiId, status: "waiting", featuresKept: null, error: null, fetchedAt: null }),
  );
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const started = useRef(false);

  const update = (apiId: string, patch: Partial<FetchRow>) => setRows((rs) => rs.map((r) => (r.apiId === apiId ? { ...r, ...patch } : r)));

  async function run() {
    setRunning(true);
    setDone(null);
    setRows((rs) => rs.map((r) => ({ ...r, status: "waiting", error: null })));
    let failed = 0;
    for (const layer of LAYERS) {
      update(layer.apiId, { status: "running" });
      try {
        const r = await fetchSurroundingLayer(propertyId, layer.apiId);
        update(layer.apiId, { status: r.status, featuresKept: r.featuresKept, error: r.error ?? null, fetchedAt: "いま" });
        if (r.status === "failed") failed++;
        // APIキーがないときは、残りも同じ理由で失敗するので止める
        if (r.error?.includes("REINFOLIB_API_KEY")) {
          setRows((rs) => rs.map((x) => (x.status === "waiting" ? { ...x, status: "failed", error: r.error ?? null } : x)));
          failed = LAYERS.length;
          break;
        }
      } catch (e) {
        failed++;
        update(layer.apiId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
      }
    }
    setRunning(false);
    setDone(
      failed === 0
        ? "周辺の情報を取りました。分析すると、カードに反映されます。"
        : failed >= LAYERS.length
          ? "周辺の情報を取れませんでした（すべて失敗）。表の理由を確かめて、「取り直す」を押してください。"
          : `周辺の情報を取りました（失敗 ${failed}種類）。失敗した種類は「取り直す」でもう一度取れます。`,
    );
  }

  // 位置が新しくなったときは、自動で取りに行く（1回だけ）
  useEffect(() => {
    if (autoStart && hasLocation && !started.current) {
      started.current = true;
      void run();
    }
    // run は描画ごとに作り直されるが、最初の1回だけ呼べばよい
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart, hasLocation]);

  const finished = rows.filter((r) => r.status !== "waiting" && r.status !== "running").length;

  return (
    <div className={`${card} p-5 grid gap-3`}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <div className="text-[15px] font-bold text-ink">周辺の情報（施設・学区・防災・将来人口・用途地域）</div>
          <div className="text-[11px] text-muted mt-0.5">
            {hasLocation
              ? running
                ? `取得中… ${finished}/${LAYERS.length}種類（1種類ずつ取っています。この画面を開いたままにしてください）`
                : "物件の位置のまわりを、不動産情報ライブラリから取ります。位置を直したときは、自動で取り直します"
              : "位置を指定すると、自動で取りに行きます"}
          </div>
        </div>
        <button type="button" onClick={run} disabled={running || !hasLocation} className={`${btnSecondary} disabled:opacity-60`}>
          {running ? "取得中…" : "取り直す"}
        </button>
        <Link href={`/strategy?property=${propertyId}`} className={btnPrimary}>
          分析へ →
        </Link>
      </div>
      <table className="w-full text-[12px] border-collapse">
        <thead>
          <tr className="text-left text-muted border-b border-line">
            <th className="py-1.5">データ</th>
            <th className="py-1.5 w-32">範囲</th>
            <th className="py-1.5 w-24">状態</th>
            <th className="py-1.5 w-20 text-right">保存した件数</th>
            <th className="py-1.5 pl-4">取得日時・理由</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const layer = LAYERS.find((l) => l.apiId === r.apiId)!;
            return (
              <tr key={r.apiId} className="border-b border-divider align-top">
                <td className="py-1.5">
                  {layer.name} <span className="text-muted">（{layer.apiId}）</span>
                </td>
                <td className="py-1.5 text-muted">{rangeOf(r.apiId)}</td>
                <td className={`py-1.5 ${STATUS_TONE[r.status]}`}>{STATUS_LABEL[r.status]}</td>
                <td className="py-1.5 text-right">{r.featuresKept ?? "—"}</td>
                <td className="py-1.5 pl-4 text-muted">{r.error ?? r.fetchedAt ?? "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {done && <div className={`rounded-md border px-3 py-2 text-xs ${done.includes("失敗") ? "border-[#f0d9a8] bg-[#fff8e8] text-[#8a5a00]" : "border-[#bfe5c6] bg-[#e9f8ec] text-[#157347]"}`}>{done}</div>}
      <div className="text-[11px] text-muted">出典：国土交通省 不動産情報ライブラリ。新潟市・長岡市の学区はデータがないため「データなし」になります。商業施設（OpenStreetMap）はまだ取っていません</div>
    </div>
  );
}
