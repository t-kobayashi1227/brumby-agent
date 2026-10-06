"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { card, btnPrimary, fieldLabel } from "../../_lib/ui";
import { advanceAnalysis, startAnalysis } from "./actions";
import { RADIUS_CHOICES } from "./radius";

// 分析を実行する（設計書 D34）：段階（集計 → ルール → AI → 検証）を1つずつ別の呼び出しで進め、進み具合を出す
// 終わったら画面を読み直して、新しい結果を表示する（前の結果は実行として残る）

type Stage = "analyze" | "rules" | "ai" | "verify";
interface Progress {
  runId: number;
  status: "running" | "succeeded" | "failed";
  stage: Stage | null;
  error: string | null;
}

const STAGES: { key: Stage; label: string; note: string }[] = [
  { key: "analyze", label: "集計", note: "人口構成・相場・周辺施設などのカードを作る" },
  { key: "rules", label: "ルール", note: "狙う層・訴求・予算配分を決める" },
  { key: "ai", label: "AI", note: "説明の文章を作る（数十秒）" },
  { key: "verify", label: "検証", note: "数字や表現を確かめ、必要なら1回作り直す" },
];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function AnalysisRunner({ propertyId, lastRadius }: { propertyId: number; lastRadius: number | null }) {
  const router = useRouter();
  const [radius, setRadius] = useState<number | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const running = progress?.status === "running";

  async function run() {
    setError(null);
    try {
      let p: Progress = await startAnalysis(propertyId, radius);
      setProgress(p);
      while (p.status === "running") {
        const before = p.stage;
        p = await advanceAnalysis(p.runId);
        setProgress(p);
        // ほかの画面が同じ実行を進めているときは、少し待ってから見直す
        if (p.status === "running" && p.stage === before) await sleep(2000);
      }
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setProgress(null);
    }
  }

  const currentIndex = progress?.stage ? STAGES.findIndex((s) => s.key === progress.stage) : -1;
  const stateOf = (i: number) => {
    if (!progress) return "pending";
    if (progress.status === "succeeded") return "done";
    if (i < currentIndex) return "done";
    if (i === currentIndex) return progress.status === "failed" ? "failed" : "current";
    return "pending";
  };

  return (
    <div className={`${card} p-5 mb-4`}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="text-[13px] font-bold text-ink mr-auto">
          分析する
          <div className="text-[11px] font-normal text-muted mt-0.5">条件を変えて実行すると、新しい結果として残ります（前の結果は消えません）</div>
        </div>
        <label className={`${fieldLabel} w-48`}>
          人口構成の半径
          <select
            value={radius === null ? "" : String(radius)}
            onChange={(e) => setRadius(e.target.value === "" ? null : Number(e.target.value))}
            disabled={running}
            className="mt-1 w-full px-3 py-[9px] border border-field rounded-md text-[13px] bg-white"
          >
            {RADIUS_CHOICES.map((r) => (
              <option key={String(r)} value={r === null ? "" : String(r)}>
                {r === null ? "初期値（物件の区分による）" : `${r.toLocaleString("ja-JP")}m`}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={run} disabled={running} className={`${btnPrimary} disabled:opacity-60`}>
          {running ? "実行中…" : "分析する"}
        </button>
      </div>
      {lastRadius !== null && <div className="text-[11px] text-muted mt-2">表示中の結果の半径：{lastRadius.toLocaleString("ja-JP")}m</div>}

      {progress && (
        <ol className="mt-4 grid grid-cols-4 gap-2">
          {STAGES.map((s, i) => {
            const state = stateOf(i);
            const tone =
              state === "done" ? "border-[#bfe5c6] bg-[#e9f8ec] text-[#157347]"
              : state === "current" ? "border-brand bg-white text-brand"
              : state === "failed" ? "border-[#f3c4c4] bg-[#fdecec] text-[#b91c1c]"
              : "border-line bg-subtle text-muted";
            return (
              <li key={s.key} className={`rounded-md border px-3 py-2 ${tone}`}>
                <div className="text-xs font-bold">
                  {i + 1}. {s.label}
                  {state === "done" ? "（済）" : state === "current" ? "（実行中）" : state === "failed" ? "（失敗）" : ""}
                </div>
                <div className="text-[11px] mt-0.5 opacity-80">{s.note}</div>
              </li>
            );
          })}
        </ol>
      )}
      {progress?.status === "succeeded" && (
        <div className="mt-3 text-xs text-[#157347]">
          実行 {progress.runId} が終わりました。{progress.error ? `（注意：${progress.error}）` : ""}
        </div>
      )}
      {progress?.status === "failed" && <div className="mt-3 text-xs text-[#b91c1c]">実行 {progress.runId} が失敗しました：{progress.error}</div>}
      {error && <div className="mt-3 text-xs text-[#b91c1c]">{error}</div>}
    </div>
  );
}
