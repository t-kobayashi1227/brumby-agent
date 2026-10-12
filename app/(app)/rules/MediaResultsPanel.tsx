"use client";

import { startTransition, useActionState, useTransition } from "react";
import { card, fieldLabel, tableHead } from "../../_lib/ui";
import { addMediaResult, deleteMediaResult, type ScoringFormState } from "./scoring-actions";

// 反響の記録と集計（Excel：反響の記録・反響の集計。設計書 D35）
// 反響係数＝全媒体の平均の問い合わせ単価 ÷ その媒体の問い合わせ単価（0.5〜2.0）。問い合わせが少ないうちは1.00

interface ResultRow {
  id: number;
  property_id: number | null;
  media_id: string;
  started_on: string | null;
  cost_yen: number;
  inquiries: number;
}

const small = "w-full mt-1 px-2 py-[6px] border border-field rounded-md text-[12px] bg-white";
const yen = (n: number) => `${n.toLocaleString("ja-JP")}円`;

export default function MediaResultsPanel({ media, results, properties, minInquiries }: { media: { id: string; label: string; coefficient: number }[]; results: ResultRow[]; properties: { id: number; name: string }[]; minInquiries: number }) {
  const [state, action, pending] = useActionState<ScoringFormState, FormData>(addMediaResult, {});
  const [deleting, startDelete] = useTransition();
  const label = (id: string) => media.find((m) => m.id === id)?.label ?? id;
  const totals = media.map((m) => {
    const rows = results.filter((r) => r.media_id === m.id);
    const cost = rows.reduce((a, r) => a + r.cost_yen, 0);
    const inq = rows.reduce((a, r) => a + r.inquiries, 0);
    return { ...m, cost, inq, cpi: inq > 0 ? Math.round(cost / inq) : null };
  });

  return (
    <div className={`${card} p-5 grid gap-5`}>
      <div>
        <div className="text-[13px] font-bold text-ink">反響の集計</div>
        <div className="text-[11px] text-muted mt-1 mb-3">問い合わせが{minInquiries}件に満たない媒体の反響係数は1.00です。係数が大きい媒体ほど、配分が増えます。</div>
        <div className={`${tableHead} grid-cols-[1.4fr_1fr_0.7fr_1fr_0.7fr] text-[11px] text-muted`}>
          <div>媒体</div>
          <div>費用計</div>
          <div>問い合わせ</div>
          <div>1件あたり</div>
          <div>反響係数</div>
        </div>
        {totals.map((t) => (
          <div key={t.id} className="grid grid-cols-[1.4fr_1fr_0.7fr_1fr_0.7fr] gap-2 py-1.5 px-1 border-b border-divider text-xs text-body">
            <div>{t.label}</div>
            <div>{yen(t.cost)}</div>
            <div>{t.inq}</div>
            <div>{t.cpi === null ? "—" : yen(t.cpi)}</div>
            <div className="font-bold">{t.coefficient.toFixed(2)}</div>
          </div>
        ))}
      </div>

      <div>
        <div className="text-[13px] font-bold text-ink mb-3">反響の記録</div>
        {results.length === 0 && <div className="text-xs text-muted mb-3">まだ記録がありません。</div>}
        {results.map((r) => (
          <div key={r.id} className="flex flex-wrap gap-x-3 items-center py-1.5 border-b border-divider text-xs text-body">
            <span className="text-muted">{r.started_on ?? "—"}</span>
            <span className="font-bold">{label(r.media_id)}</span>
            <span>{r.property_id !== null ? `物件${r.property_id}` : ""}</span>
            <span>{yen(r.cost_yen)}</span>
            <span>問い合わせ{r.inquiries}</span>
            <button
              type="button"
              disabled={deleting}
              onClick={() => {
                if (window.confirm("この記録を削除します。よろしいですか？")) startDelete(async () => void (await deleteMediaResult(r.id)));
              }}
              className="ml-auto text-[#b91c1c] cursor-pointer"
            >
              削除
            </button>
          </div>
        ))}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const data = new FormData(e.currentTarget);
            startTransition(() => action(data));
          }}
          className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 mt-4"
        >
          <label className={fieldLabel}>
            媒体 *
            <select name="media_id" className={small} defaultValue="">
              <option value="">選んでください</option>
              {media.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            物件
            <select name="property_id" className={small} defaultValue="">
              <option value="">—</option>
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}：{p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={fieldLabel}>
            掲載開始日
            <input type="date" name="started_on" className={small} />
          </label>
          <label className={fieldLabel}>
            費用（円）
            <input name="cost_yen" inputMode="numeric" className={small} />
          </label>
          <label className={fieldLabel}>
            問い合わせ数
            <input name="inquiries" inputMode="numeric" className={small} />
          </label>
          <div className="col-span-full flex items-center gap-3">
            <button type="submit" disabled={pending} className="px-4 py-2 bg-brand rounded-md text-white text-xs font-bold cursor-pointer disabled:opacity-60">
              {pending ? "保存中…" : "記録を追加する"}
            </button>
            {state.ok && <span className="text-xs text-[#157347]">{state.ok}</span>}
            {state.error && <span className="text-xs text-[#b91c1c]">{state.error}</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
