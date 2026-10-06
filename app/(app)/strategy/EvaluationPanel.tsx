"use client";

import { startTransition, useActionState, useState } from "react";
import { btnPrimary, card, fieldLabel, input } from "../../_lib/ui";
import { saveEvaluation, type EvaluationState } from "./actions";
import { ANSWERS, PER_ANSWER, PER_PROPERTY, SCALE, fieldName, type EvaluationRow } from "./evaluation";

// 評価の入力（確認2、設計書 D18・10章）
// 具体性・実行可能性は4つの答えごと、UI可読性と根拠整合（抜き取り）は物件ごとに 1〜5点とメモ
// 根拠整合は検証の合格率（自動）を参考に出す。評価した人の名前を入れると、その人が前に付けた点を読み込む

function ScoreSelect({ name, value }: { name: string; value: number | undefined }) {
  return (
    <select name={name} defaultValue={value ?? ""} key={`${name}-${value ?? ""}`} className="px-2 py-1.5 border border-field rounded-md text-[13px] bg-white">
      <option value="">—</option>
      {SCALE.map((s) => (
        <option key={s.score} value={s.score}>
          {s.score}
        </option>
      ))}
    </select>
  );
}

function MemoInput({ name, value }: { name: string; value: string | null | undefined }) {
  return <input name={name} defaultValue={value ?? ""} key={`${name}-${value ?? ""}`} placeholder="メモ（任意）" className="w-full px-2 py-1.5 border border-field rounded-md text-[12px]" />;
}

export default function EvaluationPanel({ narrativeId, runId, passRate, evaluations }: { narrativeId: number | null; runId: number; passRate: { ok: number; total: number } | null; evaluations: EvaluationRow[] }) {
  const [state, formAction, pending] = useActionState<EvaluationState, FormData>(saveEvaluation, {});
  const [evaluator, setEvaluator] = useState("");

  if (!narrativeId) {
    return <div className={`${card} p-5 mt-4 text-[13px] text-muted`}>評価は、分析（AIの文章まで）が終わってから入力できます。</div>;
  }

  const mine = evaluations.filter((e) => e.evaluator === evaluator.trim());
  const find = (answerKey: string | null, criterion: string) => mine.find((e) => e.answerKey === answerKey && e.criterion === criterion);
  const others = [...new Set(evaluations.map((e) => e.evaluator).filter((n): n is string => !!n && n !== evaluator.trim()))];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className={`${card} p-5 mt-4 grid gap-4 print:hidden`}
    >
      <input type="hidden" name="narrative_id" value={narrativeId} />
      <div className="flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <div className="text-[15px] font-bold text-ink">この戦略の評価（確認2）</div>
          <div className="text-[11px] text-muted mt-0.5">実行 {runId} の結果を評価します。尺度は叩き台です（BRUMBY様に確認する）</div>
        </div>
        <label className={`${fieldLabel} w-56`}>
          評価した人 <span className="text-[#b91c1c]">*</span>
          <input name="evaluator" value={evaluator} onChange={(e) => setEvaluator(e.target.value)} required placeholder="例：BRUMBY 山田" className={input} />
        </label>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-body bg-subtle rounded-md px-3 py-2">
        {SCALE.map((s) => (
          <span key={s.score}>
            <span className="font-bold">{s.score}</span>＝{s.label}
          </span>
        ))}
      </div>

      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-left text-[12px] text-muted border-b border-line">
            <th className="py-1.5 w-28">答え</th>
            {PER_ANSWER.map((c) => (
              <th key={c.key} className="py-1.5">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ANSWERS.map((a) => (
            <tr key={a.key} className="border-b border-divider align-top">
              <td className="py-2 font-bold text-ink">{a.label}</td>
              {PER_ANSWER.map((c) => (
                <td key={c.key} className="py-2 pr-3">
                  <div className="flex gap-2 items-center">
                    <ScoreSelect name={fieldName("score", a.key, c.key)} value={find(a.key, c.key)?.score} />
                    <MemoInput name={fieldName("memo", a.key, c.key)} value={find(a.key, c.key)?.memo} />
                  </div>
                </td>
              ))}
            </tr>
          ))}
          {PER_PROPERTY.map((c) => (
            <tr key={c.key} className="border-b border-divider align-top">
              <td className="py-2 font-bold text-ink">{c.label}</td>
              <td colSpan={PER_ANSWER.length} className="py-2">
                <div className="flex gap-2 items-center">
                  <ScoreSelect name={fieldName("score", null, c.key)} value={find(null, c.key)?.score} />
                  <MemoInput name={fieldName("memo", null, c.key)} value={find(null, c.key)?.memo} />
                </div>
                {c.key === "evidence" && (
                  <div className="text-[11px] text-muted mt-1">
                    自動の検証の合格率：{passRate ? `${passRate.ok}/${passRate.total}段落（${Math.round((passRate.ok / Math.max(passRate.total, 1)) * 100)}%）` : "検証の結果がありません"}。
                    文章の数字や根拠を抜き取りで確かめて点を付けてください
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex items-center gap-3">
        {state.error && <div className="mr-auto rounded-md border border-[#f3c4c4] bg-[#fdecec] px-3 py-2 text-xs text-[#b91c1c]">{state.error}</div>}
        {state.ok && <div className="mr-auto rounded-md border border-[#bfe5c6] bg-[#e9f8ec] px-3 py-2 text-xs text-[#157347]">{state.ok}</div>}
        {!state.error && !state.ok && (
          <div className="mr-auto text-[11px] text-muted">
            {mine.length > 0 ? `${evaluator} さんの評価 ${mine.length}件を読み込みました。直して保存すると上書きします。` : "点を空にした欄は保存しません。"}
            {others.length > 0 && ` ほかに評価した人：${others.join("、")}`}
          </div>
        )}
        <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-60`}>
          {pending ? "保存中…" : "評価を保存する"}
        </button>
      </div>
    </form>
  );
}
