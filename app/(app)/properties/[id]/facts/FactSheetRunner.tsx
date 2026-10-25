"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FACT_STEPS, type FactStepKey } from "../../../../../lib/facts/steps";
import { btnPrimary, card } from "../../../../_lib/ui";

// 事実シートを作る（/api/properties/[id]/facts）。段階ごとの知らせを受けて、進み具合を一覧で出す
// 地図で「この位置で確定」を押すと ?auto=1 でこの画面に来て、自動で始まる。終わったあとも、段階の一覧は ✓ を付けたまま残す

type Event = { step: FactStepKey } | { done: true; id: number; count: number; missing: string[] } | { error: string };

type State =
  | { phase: "idle" }
  | { phase: "running"; current: FactStepKey; startedAt: number }
  | { phase: "done"; count: number; missing: string[]; seconds: number }
  | { phase: "error"; message: string; current: FactStepKey | null };

export default function FactSheetRunner({ propertyId, autoStart, hasSheet }: { propertyId: number; autoStart: boolean; hasSheet: boolean }) {
  const router = useRouter();
  const [state, setState] = useState<State>({ phase: "idle" });
  const started = useRef(false);

  const run = async () => {
    if (state.phase === "running") return;
    const startedAt = Date.now();
    setState({ phase: "running", current: "property", startedAt });
    try {
      const res = await fetch(`/api/properties/${propertyId}/facts`, { method: "POST" });
      if (!res.body) throw new Error(`サーバーから返事がありません（HTTP ${res.status}）`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const e = JSON.parse(line) as Event;
          if ("step" in e) setState({ phase: "running", current: e.step, startedAt });
          else if ("error" in e) setState((s) => ({ phase: "error", message: e.error, current: s.phase === "running" ? s.current : null }));
          else setState({ phase: "done", count: e.count, missing: e.missing, seconds: Math.round((Date.now() - startedAt) / 1000) });
        }
      }
      // 保存した最新のシートを表に出す。?auto=1 は外す（読み込み直しで、もう一度作らないため）
      router.replace(`/properties/${propertyId}/facts`);
      router.refresh();
    } catch (e) {
      setState((s) => ({ phase: "error", message: e instanceof Error ? e.message : String(e), current: s.phase === "running" ? s.current : null }));
    }
  };

  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void run();
    }
    // run は毎回作り直されるが、自動で始めるのは最初の1回だけ
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // 今の段階の番号。終わったら全部を ✓ にする。失敗したら止まった段階に ✗ を付ける
  const currentIndex =
    state.phase === "running" || (state.phase === "error" && state.current)
      ? FACT_STEPS.findIndex((s) => s.key === state.current)
      : state.phase === "done"
        ? FACT_STEPS.length
        : -1;

  return (
    <div className={`${card} p-5 grid gap-3`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <div className="text-[15px] font-bold text-ink">周辺情報の取得と事実シートの作成</div>
          <div className="text-[11px] text-muted mt-0.5">物件の位置から、取り込み済みの公的データを調べます。1物件で十数秒かかります。距離はすべて直線距離です</div>
        </div>
        <button type="button" onClick={run} disabled={state.phase === "running"} className={`${btnPrimary} disabled:opacity-60`}>
          {state.phase === "running" ? "取得しています…" : hasSheet || state.phase === "done" ? "取得し直す" : "取得を始める"}
        </button>
      </div>

      {currentIndex >= 0 && (
        <ol className="grid gap-1.5 text-[13px]">
          {FACT_STEPS.map((s, i) => {
            const status = i < currentIndex ? "done" : i === currentIndex ? (state.phase === "error" ? "failed" : "now") : "todo";
            return (
              <li key={s.key} className={`flex items-center gap-2 ${status === "todo" ? "text-muted" : "text-ink"}`}>
                <span className="w-4 text-center" aria-hidden>
                  {status === "done" ? <span className="text-[#157347]">✓</span> : status === "failed" ? <span className="text-[#b91c1c]">✗</span> : status === "now" ? <span className="inline-block w-3 h-3 rounded-full border-2 border-brand border-t-transparent animate-spin align-middle" /> : "・"}
                </span>
                <span className={status === "now" ? "font-bold" : ""}>{s.label}</span>
              </li>
            );
          })}
        </ol>
      )}
      {state.phase === "done" && (
        <div className="rounded-md border border-[#bfe5c6] bg-[#e9f8ec] px-3 py-2 text-xs text-[#157347]">
          事実シートを作りました（{state.seconds}秒）。事実 {state.count}件・取得できず／要確認 {state.missing.length}件
          {state.missing.length > 0 && `（${state.missing.join("、")}）`}
        </div>
      )}
      {state.phase === "error" && <div className="rounded-md border border-[#f3c4c4] bg-[#fdecec] px-3 py-2 text-xs text-[#b91c1c]">作れませんでした：{state.message}</div>}
    </div>
  );
}
