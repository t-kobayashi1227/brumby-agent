"use client";

import { startTransition, useActionState } from "react";
import Link from "next/link";
import { card, btnPrimary, btnSecondary } from "../../../_lib/ui";
import CompetitorFields, { type CompetitorValues } from "../../../_components/CompetitorFields";
import { saveCompetitors, type CompetitorFormState } from "../actions";

// 競合物件の入力（3件まで。設計書 7章、D30）。3件分を1つのフォームで保存する
// すべて空の枠は保存しない（前に入れた分は消える）。競合は未入力でも分析できる

export default function CompetitorForm({ propertyId, competitors }: { propertyId: number; competitors: CompetitorValues[] }) {
  const [state, formAction, pending] = useActionState<CompetitorFormState, FormData>(saveCompetitors, {});

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
      className={`${card} p-6 max-w-[720px]`}
    >
      <input type="hidden" name="property_id" value={propertyId} />
      <div className="text-sm font-bold text-ink mb-1">気になる競合物件（最大3件）</div>
      <div className="text-[11px] text-muted mb-3.5">
        価格・間取りなどの条件と、自分の言葉で書いた特徴だけを入力します（ポータルサイトの写真や文章は転載しません）。空の枠は保存しません。
      </div>
      <CompetitorFields competitors={competitors} />

      <div className="flex flex-wrap items-center gap-3 mt-5">
        {state.error && <div className="w-full rounded-md border border-[#f3c4c4] bg-[#fdecec] px-3 py-2 text-xs text-[#b91c1c]">{state.error}</div>}
        {state.ok && <div className="w-full rounded-md border border-[#bfe5c6] bg-[#e9f8ec] px-3 py-2 text-xs text-[#157347]">{state.ok}</div>}
        <Link href={`/research?property=${propertyId}`} className={btnSecondary}>
          戻る
        </Link>
        <button type="submit" disabled={pending} className={`${btnPrimary} disabled:opacity-60 ml-auto`}>
          {pending ? "保存中…" : "保存する"}
        </button>
        <Link href={`/strategy?property=${propertyId}`} className={btnSecondary}>
          分析へ進む（競合は未入力でもよい）→
        </Link>
      </div>
    </form>
  );
}
