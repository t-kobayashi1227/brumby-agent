"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { btnAction, btnSecondary, card } from "../../../_lib/ui";

// 「戦略を作る」→ 進み具合を表示 → 完了したらレポートを読み直す（CLAUDE.md「エージェントの実行」）
// 実行はサーバーで動き続けるので、画面を閉じても止まらない。開き直すと、実行中なら進み具合の表示に戻る
// 物件の見出しカード（children）の右側にボタンを置き、進み具合や失敗はカードの下側に出す（提案資料の画面イメージに合わせる）

const STAGES = [
  { key: "戦略", label: "事実を分析し、販売戦略を決める" },
  { key: "媒体", label: "媒体と配分を決める" },
  { key: "確認", label: "点検する（プログラムと確認）" },
  { key: "金額の計算", label: "配分から金額を計算する" },
] as const;

const POLL_MS = 3000;

export interface RunStatus {
  id: number;
  status: "queued" | "running" | "succeeded" | "failed";
  stage: string | null;
  error: string | null;
  costUsd: number;
  startedAt: string | null;
}

export default function StrategyRunner({
  propertyId,
  initial,
  hasReport,
  hasLocation,
  children,
}: {
  propertyId: number;
  initial: RunStatus | null;
  hasReport: boolean;
  hasLocation: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [run, setRun] = useState<RunStatus | null>(initial);
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const wasRunning = useRef(false);
  const running = starting || run?.status === "running" || run?.status === "queued";

  // 実行中は数秒おきに進み具合を読む。終わったらレポートを読み直す
  useEffect(() => {
    if (!running) return;
    wasRunning.current = true;
    const timer = setInterval(async () => {
      setNow(Date.now());
      try {
        const res = await fetch(`/api/properties/${propertyId}/strategy`, { cache: "no-store" });
        const body = (await res.json()) as { run: RunStatus | null };
        if (body.run) setRun(body.run);
      } catch {
        // 一時的な通信の失敗は、次の読み込みで取り直す
      }
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [running, propertyId]);

  useEffect(() => {
    if (wasRunning.current && run?.status === "succeeded") {
      wasRunning.current = false;
      router.refresh();
    }
  }, [run?.status, router]);

  const start = async () => {
    setError(null);
    setStarting(true);
    try {
      const res = await fetch(`/api/properties/${propertyId}/strategy`, { method: "POST" });
      const body = (await res.json()) as { runId?: number; error?: string };
      if (!res.ok || !body.runId) throw new Error(body.error ?? `始められませんでした（HTTP ${res.status}）`);
      setRun({ id: body.runId, status: "running", stage: "戦略", error: null, costUsd: 0, startedAt: new Date().toISOString() });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStarting(false);
    }
  };

  const currentIndex = run?.status === "running" ? STAGES.findIndex((s) => s.key === run.stage) : -1;
  const seconds = run?.startedAt ? Math.max(0, Math.round((now - new Date(run.startedAt).getTime()) / 1000)) : null;

  return (
    <div className={`${card} p-5 grid gap-3`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="mr-auto min-w-0">{children}</div>
        <div className="flex flex-col items-end gap-1.5 print:hidden">
          <div className="flex gap-2">
            {hasReport && (
              <button type="button" onClick={() => window.print()} className={btnSecondary}>
                PDFで保存
              </button>
            )}
            <button type="button" onClick={start} disabled={running || !hasLocation} className={btnAction}>
              {running ? "作成しています…" : hasReport ? "戦略を作り直す" : "戦略を作る"}
            </button>
          </div>
          {!running && run?.status === "succeeded" && <div className="text-[12px] text-muted">前回の作成：AIの費用 ${run.costUsd.toFixed(4)}</div>}
        </div>
      </div>
      {!hasReport && !running && (
        <div className="text-[12px] text-muted print:hidden">最新の事実シートから、AIエージェントが戦略を作ります。数分かかります。画面を閉じても作成は続きます</div>
      )}
      {!hasLocation && <div className="print:hidden text-xs text-[#b91c1c]">物件の位置がありません。物件の画面の地図でピンを置いてから作ってください。</div>}

      {running && (
        <ol className="grid gap-1.5 text-[15px] border-t border-divider pt-3 print:hidden">
          {STAGES.map((s, i) => {
            const status = starting ? (i === 0 ? "now" : "todo") : i < currentIndex ? "done" : i === currentIndex ? "now" : "todo";
            return (
              <li key={s.key} className={`flex items-center gap-2 ${status === "todo" ? "text-muted" : "text-ink"}`}>
                <span className="w-4 text-center" aria-hidden>
                  {status === "done" ? (
                    <span className="text-[#157347]">✓</span>
                  ) : status === "now" ? (
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-brand border-t-transparent animate-spin align-middle" />
                  ) : (
                    "・"
                  )}
                </span>
                <span className={status === "now" ? "font-bold" : ""}>{s.label}</span>
              </li>
            );
          })}
          {seconds !== null && <li className="text-[12px] text-muted mt-1">経過 {seconds}秒（事実シートがまだ無いときは、先に作ります）</li>}
        </ol>
      )}
      {!running && run?.status === "failed" && (
        <div className="print:hidden rounded-md border border-[#f3c4c4] bg-[#fdecec] px-3 py-2 text-xs text-[#b91c1c]">前回の作成は失敗しました：{run.error ?? "理由不明"}</div>
      )}
      {error && <div className="print:hidden rounded-md border border-[#f3c4c4] bg-[#fdecec] px-3 py-2 text-xs text-[#b91c1c]">{error}</div>}
    </div>
  );
}
