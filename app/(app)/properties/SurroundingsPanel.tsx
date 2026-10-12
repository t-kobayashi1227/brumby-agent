"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LAYERS, OSM_SUPERMARKET } from "../../../lib/surroundings/layers";
import type { SchoolCounts } from "../../../lib/surroundings/fetch";
import { btnPrimary, btnSecondary, card } from "../../_lib/ui";
import { fetchSurroundingLayer } from "./actions";

// 物件の周りの公開データ（不動産情報ライブラリ XKT系・OpenStreetMap）を取る
// 位置が新しくなったら（登録・地図でのピンの保存・住所からの取り直し）、自動で取りに行く
// 1種類ずつ別の呼び出しで取り、表に進み具合を出す。失敗した種類があっても最後まで進める
// 取り直すときは、失敗した種類（と、まだ取っていない種類）だけを取り直せる。「すべて取り直す」で全部をもう一度取る

export interface FetchRow {
  apiId: string;
  status: "ok" | "empty" | "failed" | "running" | "waiting";
  featuresKept: number | null;
  error: string | null;
  fetchedAt: string | null;
  /** 学校（XKT006）だけ：小学校・中学校の数。保存した件数には高校・大学なども入る */
  schoolCounts?: SchoolCounts | null;
}

/** 市の通学区域から住所で引いた学校。キーは小学校区・中学校区の apiId（国のデータがない新潟市で、表の行に添える） */
export type CityDistricts = Record<"XKT004" | "XKT005", string>;

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

export default function SurroundingsPanel({ propertyId, hasLocation, autoStart, initial, initialSupermarkets, analyzed, cityDistricts }: { propertyId: number; hasLocation: boolean; autoStart: boolean; initial: FetchRow[]; initialSupermarkets: { name: string; distanceM: number }[]; analyzed: boolean; cityDistricts: CityDistricts | null }) {
  const [rows, setRows] = useState<FetchRow[]>(() =>
    LAYERS.map((l) => initial.find((r) => r.apiId === l.apiId) ?? { apiId: l.apiId, status: "waiting", featuresKept: null, error: null, fetchedAt: null }),
  );
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: LAYERS.length });
  const [done, setDone] = useState<string | null>(null);
  const [supermarkets, setSupermarkets] = useState(initialSupermarkets);
  const started = useRef(false);

  const update = (apiId: string, patch: Partial<FetchRow>) => setRows((rs) => rs.map((r) => (r.apiId === apiId ? { ...r, ...patch } : r)));

  /** 取り直しの対象：失敗した種類と、まだ取っていない種類 */
  const retryIds = rows.filter((r) => r.status === "failed" || r.status === "waiting").map((r) => r.apiId);

  /** only を渡すと、その種類だけを取る（ほかの種類の結果はそのまま残す） */
  async function run(only?: string[]) {
    const targets = only ? LAYERS.filter((l) => only.includes(l.apiId)) : LAYERS;
    const targetIds = new Set(targets.map((l) => l.apiId));
    setRunning(true);
    setProgress({ done: 0, total: targets.length });
    setDone(null);
    setRows((rs) => rs.map((r) => (targetIds.has(r.apiId) ? { ...r, status: "waiting", error: null } : r)));
    let failed = 0;
    for (const layer of targets) {
      update(layer.apiId, { status: "running" });
      try {
        const r = await fetchSurroundingLayer(propertyId, layer.apiId);
        if (layer.apiId === OSM_SUPERMARKET) setSupermarkets(r.status === "failed" ? [] : r.supermarkets ?? []);
        update(layer.apiId, { status: r.status, featuresKept: r.featuresKept, error: r.error ?? null, fetchedAt: "いま", schoolCounts: r.schoolCounts ?? null });
        if (r.status === "failed") failed++;
        setProgress((p) => ({ ...p, done: p.done + 1 }));
        // APIキーがないときは、残りの XKT 系も同じ理由で失敗する
        if (r.error?.includes("REINFOLIB_API_KEY")) {
          const rest = targets.slice(targets.indexOf(layer) + 1).filter((x) => x.apiId.startsWith("XKT")).map((x) => x.apiId);
          setRows((rs) => rs.map((x) => (rest.includes(x.apiId) ? { ...x, status: "failed", error: r.error ?? null } : x)));
          failed += rest.length;
          break;
        }
      } catch (e) {
        failed++;
        update(layer.apiId, { status: "failed", error: e instanceof Error ? e.message : String(e) });
        setProgress((p) => ({ ...p, done: p.done + 1 }));
      }
    }
    setRunning(false);
    const scope = only ? `${targets.length}種類を取り直しました` : "周辺の情報を取りました";
    setDone(
      failed === 0
        ? `${scope}。分析すると、カードに反映されます。`
        : failed >= targets.length
          ? `${only ? "取り直した種類はすべて失敗しました" : "周辺の情報を取れませんでした（すべて失敗）"}。表の理由を確かめて、「失敗した分を取り直す」を押してください。`
          : `${scope}（失敗 ${failed}種類）。失敗した種類は「失敗した分を取り直す」でもう一度取れます。`,
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

  return (
    <div className={`${card} p-5 grid gap-3`}>
      <div className="flex flex-wrap items-end gap-2">
        <div className="mr-auto">
          <div className="text-[15px] font-bold text-ink">周辺の情報（スーパー・施設・学区・防災・将来人口・用途地域）</div>
          <div className="text-[11px] text-muted mt-0.5">
            {hasLocation
              ? running
                ? `取得中… ${progress.done}/${progress.total}種類（1種類ずつ取っています。この画面を開いたままにしてください）`
                : "地図の位置を確定すると、周辺のスーパーと公開データを自動で取得します"
              : "位置を指定すると、自動で取りに行きます"}
          </div>
        </div>
        {retryIds.length > 0 && !running && hasLocation && (
          <button type="button" onClick={() => run(retryIds)} className={btnSecondary}>
            失敗した分を取り直す（{retryIds.length}種類）
          </button>
        )}
        <button type="button" onClick={() => run()} disabled={running || !hasLocation} className={`${btnSecondary} disabled:opacity-60`}>
          {running ? "取得中…" : "すべて取り直す"}
        </button>
        {hasLocation ? (
          <Link href={`/strategy?property=${propertyId}`} className={btnPrimary}>
            {analyzed ? "分析画面へ →" : "分析へ →"}
          </Link>
        ) : (
          <span aria-disabled="true" className={`${btnPrimary} opacity-50 cursor-not-allowed`}>
            分析へ →
          </span>
        )}
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
                <td className="py-1.5 text-right whitespace-nowrap">
                  {r.featuresKept ?? "—"}
                  {r.schoolCounts && r.featuresKept !== null && (
                    <div className="text-[10.5px] text-muted">
                      小{r.schoolCounts.elementary}・中{r.schoolCounts.juniorHigh}・ほか{r.featuresKept - r.schoolCounts.elementary - r.schoolCounts.juniorHigh}
                    </div>
                  )}
                </td>
                <td className="py-1.5 pl-4 text-muted">
                  {r.error ?? r.fetchedAt ?? "—"}
                  {cityDistricts && (r.apiId === "XKT004" || r.apiId === "XKT005") && r.status === "empty" && (
                    <div className="text-body">市の通学区域（住所から）：<span className="font-bold text-ink">{cityDistricts[r.apiId]}</span></div>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {supermarkets.length > 0 && (
        <div className="text-xs">
          <div className="font-bold text-ink mb-1">近くのスーパー（直線距離順・最大10件）</div>
          <ul className="grid gap-1 sm:grid-cols-2">
            {supermarkets.map((s, i) => <li key={`${s.name}-${i}`} className="text-body">{s.name} <span className="text-muted">約{s.distanceM.toLocaleString("ja-JP")}m</span></li>)}
          </ul>
        </div>
      )}
      {done && <div className={`rounded-md border px-3 py-2 text-xs ${done.includes("失敗") ? "border-[#f0d9a8] bg-[#fff8e8] text-[#8a5a00]" : "border-[#bfe5c6] bg-[#e9f8ec] text-[#157347]"}`}>{done}</div>}
      <div className="text-[11px] text-muted">出典：国土交通省 不動産情報ライブラリ、© OpenStreetMap contributors。スーパーの距離は直線距離です。新潟市・長岡市は国の学区データがないため「データなし」になります。新潟市は、市の通学区域から住所で引いた学校を添えています（出典：新潟市「小・中学校の通学区域」）。</div>
    </div>
  );
}
