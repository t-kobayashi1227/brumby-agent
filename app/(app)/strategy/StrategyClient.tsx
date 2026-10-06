"use client";

import { useState, useTransition } from "react";
import UnderlineTabs from "../../_components/UnderlineTabs";
import { SourceNote } from "../../_components/Notes";
import { SECTION_TITLE, SENTENCE_KIND_LABEL, type SentenceKind } from "../../../lib/ai/schema";
import { MEDIA } from "../../../lib/rules/catalog";
import { card, fieldLabel, tableHead, btnPrimary, btnSecondary, budgetButtonClass, emptyState } from "../../_lib/ui";
import { simulateBudget } from "./actions";

const MEDIA_COLOR: Record<string, string> = { sns: "#3b6fd6", posting: "#f2a93b", flyer: "#9b7bd1", lp: "#4caf7d" };
/** タブごとに出すセクション（旧い文章の key も含める） */
const OVERALL_SECTIONS: SectionKey[] = ["property_location", "target_persona", "appeal_channels", "action_plan", "uncertainty", "appeal_points", "competitor_diff"];
const MEDIA_SECTIONS: SectionKey[] = ["budget_plan", "budget_rationale"];
const strategyTabDefs = [{ key: "overall", label: "総合評価" }, { key: "media", label: "媒体戦略・予算" }];

interface Sentence { kind?: SentenceKind; text: string; cites: number[] }
interface Paragraph { key: string; sentences: Sentence[] }
type SectionKey = keyof typeof SECTION_TITLE;
interface Section { key: SectionKey; paragraphs: Paragraph[] }
interface FactLite { seq: number; valueText: string | null; attribution: string | null }
interface AppliedRule { id: string; version: number; note: string }
interface TargetRankItem { rank: number; id: string; label: string; description: string; score: number; max: number; confidence: "normal" | "low"; available: boolean; rules: AppliedRule[] }
interface MediaRow { id: string; amount: number; rules: AppliedRule[] }

export interface StrategyClientProps {
  hasRun: boolean;
  runCreatedAt: string | null;
  headline: Sentence | null;
  sections: Section[];
  narrativeStatus: "ok" | "needs_review" | "failed" | null;
  facts: FactLite[];
  targets: TargetRankItem[];
  media: MediaRow[];
  totalManYen: number | null;
  budgetOptions: number[];
  propertyId: number;
  censusSource: string;
  mlitSource: string;
}

function factTitle(facts: FactLite[], seq: number): string {
  const f = facts.find((x) => x.seq === seq);
  return f?.valueText ? `F-${String(seq).padStart(2, "0")}：${f.valueText}` : `F-${String(seq).padStart(2, "0")}`;
}

function CiteBadges({ cites, facts }: { cites: number[]; facts: FactLite[] }) {
  if (cites.length === 0) return null;
  return (
    <span className="ml-1.5 inline-flex gap-1 align-middle">
      {cites.map((c) => (
        <span key={c} title={factTitle(facts, c)} className="inline-block px-1.5 rounded bg-subtle text-[10px] font-bold text-muted cursor-help">
          F-{String(c).padStart(2, "0")}
        </span>
      ))}
    </span>
  );
}

function AnswerSection({ section, facts }: { section: Section; facts: FactLite[] }) {
  return (
    <div className={`${card} p-5`}>
      <div className="text-[13px] font-bold text-ink mb-3.5">{SECTION_TITLE[section.key]}</div>
      <div className="grid gap-2.5">
        {section.paragraphs.flatMap((p) => p.sentences).map((s, i) => (
          <div key={i} className={fieldLabel}>
            {s.kind && <span className="mr-1.5 inline-block px-1.5 rounded bg-divider text-[10px] text-muted align-middle">{SENTENCE_KIND_LABEL[s.kind]}</span>}
            {s.text}
            <CiteBadges cites={s.cites} facts={facts} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StrategyClient(props: StrategyClientProps) {
  const { hasRun, headline, sections, narrativeStatus, facts, targets, totalManYen, budgetOptions, propertyId, censusSource, mlitSource } = props;
  const [tab, setTab] = useState("overall");
  const [budget, setBudget] = useState<number>(totalManYen ?? budgetOptions[0] ?? 0);
  const [media, setMedia] = useState<MediaRow[]>(props.media);
  const [pending, startTransition] = useTransition();

  if (!hasRun) {
    return <div className={emptyState}>この物件はまだ分析が実行されていません（上の「分析する」で実行できます）。</div>;
  }

  const byKey = (key: SectionKey) => sections.find((s) => s.key === key);
  const sum = media.reduce((n, m) => n + m.amount, 0);
  const legend = media.reduce<{ id: string; amount: number; rules: AppliedRule[]; label: string; role: string; color: string; share: number; stop: string }[]>((rows, m) => {
    const def = MEDIA.find((d) => d.id === m.id)!;
    const color = MEDIA_COLOR[m.id] ?? "#999";
    const share = sum > 0 ? m.amount / sum : 0;
    const start = rows.reduce((n, r) => n + r.share, 0) * 100;
    const end = start + share * 100;
    rows.push({ ...m, label: def.label, role: def.role, color, share, stop: `${color} ${start}% ${end}%` });
    return rows;
  }, []);
  const gradient = `conic-gradient(${legend.map((l) => l.stop).join(", ")})`;

  function pickBudget(b: number) {
    setBudget(b);
    if (b === totalManYen) {
      setMedia(props.media);
      return;
    }
    startTransition(async () => {
      const result = await simulateBudget(propertyId, b);
      setMedia(result.map((r) => ({ id: r.id, amount: r.amount, rules: r.rules })));
    });
  }

  return (
    <>
      <UnderlineTabs tabs={strategyTabDefs} active={tab} onChange={setTab} />

      {tab === "overall" && (
        <div className="grid gap-4">
          <div className={`${card} p-5.5`}>
            <div className="text-[13px] text-muted mb-3">この物件の総合評価</div>
            {narrativeStatus === "failed" ? (
              <div className="text-[13px] text-muted">AIの文章は生成できませんでした。事実カードと判断カード（ルール表による判断）だけを表示しています。</div>
            ) : headline ? (
              <div className="text-base font-extrabold text-accent mb-2">
                {headline.text}
                <CiteBadges cites={headline.cites} facts={facts} />
              </div>
            ) : (
              <div className="text-[13px] text-muted">AIの文章がまだ生成されていません（上の「分析する」で作れます）。</div>
            )}
            {narrativeStatus === "needs_review" && (
              <div className="mt-2 rounded-md border border-[#f0d9a8] bg-[#fff8e8] px-3 py-2 text-xs text-[#8a5a00]">
                一部の文が検証に通りませんでした（数字・比較の言葉・表現のいずれか。要確認）。打ち合わせの場で見直してください。
              </div>
            )}
            <SourceNote className="mt-3">
              {censusSource}／{mlitSource}
            </SourceNote>
          </div>

          <div className={`${card} p-5`}>
            <div className="text-[13px] font-bold text-ink mb-3.5">ターゲット（ルール表による判断）</div>
            <div className="grid grid-cols-3 gap-3">
              {targets.map((t) => (
                <div key={t.id} className="bg-subtle rounded-lg p-4">
                  <div className="flex gap-2.5 items-center mb-2">
                    <div className="size-7 shrink-0 rounded-full bg-brand text-white font-extrabold text-[13px] flex items-center justify-center">{t.rank}</div>
                    <div className="text-[13px] font-extrabold text-ink">{t.label}</div>
                  </div>
                  <div className="text-xs text-body leading-[1.8] mb-1.5">{t.description}</div>
                  <div className="text-[11px] text-muted">
                    {t.available ? `${t.score}/${t.max}点` : "判断できない（指標が取れない）"}
                    {t.confidence === "low" && <span className="ml-1 font-bold text-[#8a5a00]">仮説</span>}
                    {t.rules.length > 0 && <span> ／ 効いたルール：{t.rules.map((r) => r.id).join("、")}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {OVERALL_SECTIONS.map((k) => byKey(k)).map((sec) => sec && <AnswerSection key={sec.key} section={sec} facts={facts} />)}
        </div>
      )}

      {tab === "media" && (
        <div className="grid gap-4">
          {MEDIA_SECTIONS.map((k) => byKey(k)).map((sec) => sec && <AnswerSection key={sec.key} section={sec} facts={facts} />)}

          <div className={`${card} p-5`}>
            <div className="text-[13px] font-bold text-ink mb-4">
              推奨の媒体戦略（総予算{budget}万円{budget === totalManYen ? "・ルール表が決めた額" : "・シミュレーション中"}）
            </div>
            <div className="flex gap-7 items-center flex-wrap">
              <div className="size-[150px] rounded-full flex items-center justify-center" style={{ background: gradient, opacity: pending ? 0.5 : 1 }}>
                <div className="size-22 rounded-full bg-white flex flex-col items-center justify-center">
                  <div className="text-[11px] text-muted">総予算</div>
                  <div className="text-base font-extrabold text-ink">{budget}万円</div>
                </div>
              </div>
              <div className="grid gap-2.5">
                {legend.map((m) => (
                  <div key={m.id} className={fieldLabel}>
                    <span className="inline-block size-2.5 rounded-full mr-2" style={{ backgroundColor: m.color }} />
                    {m.label}　{m.amount}万円（{Math.round(m.share * 100)}%）
                    {m.rules.length > 0 && <span className="text-xs text-muted">　{m.rules.map((r) => r.id).join("、")}が影響</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className={`${card} p-5`}>
            <div className="flex justify-between items-center mb-3.5">
              <div className="text-[13px] font-bold text-ink">予算別シミュレーション</div>
              <div className="flex gap-2">
                {budgetOptions.map((b) => (
                  <div key={b} onClick={() => pickBudget(b)} className={budgetButtonClass(budget === b)}>
                    {b}万円{b === totalManYen ? "（実際）" : ""}
                  </div>
                ))}
              </div>
            </div>
            <div className={`${tableHead} grid-cols-[2fr_1fr]`}>
              <div>媒体</div>
              <div>予算目安</div>
            </div>
            {legend.map((m) => (
              <div key={m.id} className="grid grid-cols-[2fr_1fr] gap-2 py-2.5 px-1 border-b border-divider">
                <div className={fieldLabel}>{m.label}</div>
                <div className="text-[13px] text-ink font-bold">{m.amount}万円</div>
              </div>
            ))}
            <div className="grid grid-cols-[2fr_1fr] gap-2 py-2.5 px-1">
              <div className="text-[13px] font-extrabold text-ink">合計</div>
              <div className="text-sm font-extrabold text-accent">{budget}万円</div>
            </div>
            <div className="text-[11px] text-muted mt-1">配分はBRUMBYのルール表から自動計算。他の額を選ぶと、ルールエンジンで計算し直します（カードは変えません）</div>
          </div>
          <div className={`${card} p-5`}>
            <div className="text-[13px] font-bold text-ink mb-3.5">媒体ごとの役割と期待効果</div>
            <div className={`${tableHead} grid-cols-[1.2fr_1.3fr_1.8fr]`}>
              <div>媒体</div>
              <div>主なターゲット</div>
              <div>期待できる効果</div>
            </div>
            {MEDIA.map((m) => (
              <div key={m.id} className="grid grid-cols-[1.2fr_1.3fr_1.8fr] gap-2 py-2.5 px-1 border-b border-divider text-[13px] text-body">
                <div>{m.label}</div>
                <div>{targets[0]?.label ?? "—"}</div>
                <div>{m.role}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2.5 mt-5">
        <button className={btnSecondary}>PDFで出力</button>
        <button className={btnPrimary}>このプランで相談する →</button>
      </div>
    </>
  );
}
