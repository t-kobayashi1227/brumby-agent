"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import UnderlineTabs from "../../_components/UnderlineTabs";
import { SourceNote } from "../../_components/Notes";
import { SECTION_TITLE, SENTENCE_KIND_LABEL, type SentenceKind } from "../../../lib/ai/schema";
import { card, fieldLabel, tableHead, statBox, emptyState } from "../../_lib/ui";
import { simulateBudget } from "./actions";
import type { NearbyLists, NearbyListItem } from "../../../lib/report";
import { MediaEvaluation, SalabilityDetail, ScoringInputsTable, TargetEvaluation, type MediaEvaluationRow, type ScoringView } from "./ScoringPanels";

// 販売戦略（設計書 7章）。「誰に・何を・どこで/いくらで・いつ」を1画面にまとめ、販売会議でそのまま使える形にする

/** 媒体の色（画面の青系に合わせる。媒体の並び順に当てる） */
const MEDIA_COLORS = ["#2a66c8", "#5b93e0", "#9cc0ee", "#d3e3f8", "#1d4a94", "#7aa9e8", "#b9d3f3", "#3f7fd9", "#e7eefa", "#6b8fc4", "#a7b9d6"];
/** 狙う層の順位ごとの色（1位を濃く） */
const RANK_COLOR = ["#2a66c8", "#5b93e0", "#9aa6ba"];
/** 根拠データのタブに出すセクション（旧い文章の key も含める） */
const DETAIL_SECTIONS: SectionKey[] = ["property_location", "target_persona", "appeal_channels", "budget_plan", "action_plan", "uncertainty", "appeal_points", "budget_rationale", "competitor_diff"];
const strategyTabDefs = [{ key: "area", label: "エリア分析" }, { key: "strategy", label: "販売戦略" }, { key: "evidence", label: "根拠データ" }];

interface Sentence { kind?: SentenceKind; text: string; cites: number[] }
interface Paragraph { key: string; sentences: Sentence[] }
type SectionKey = keyof typeof SECTION_TITLE;
interface Section { key: SectionKey; paragraphs: Paragraph[] }
interface FactLite { seq: number; valueText: string | null; attribution: string | null }
interface AppliedRule { id: string; version: number; note: string }
interface TargetRankItem { rank: number; id: string; label: string; description: string; score: number; max: number; confidence: "normal" | "low"; available: boolean; rules: AppliedRule[]; targetImage?: string | null }
interface MediaRow { id: string; label: string; role: string; amount: number; initialManYen: number | null; rules: AppliedRule[] }
interface AppealLite { id: string; label: string; description: string; judgement: string | null; evidence: { seq: number; text: string | null }[] }
interface AppealJudgement { id: string; label: string; judgement: string; description: string; score: number }
interface PropertyLite { name: string; address: string; photoUrl: string; priceManYen: number | null; layout: string | null; landSqm: number | null; buildingSqm: number | null; parking: number | null; access: string | null }

export interface StrategyClientProps {
  hasRun: boolean;
  runCreatedAt: string | null;
  property: PropertyLite;
  headline: Sentence | null;
  sections: Section[];
  narrativeStatus: "ok" | "needs_review" | "failed" | null;
  facts: FactLite[];
  targets: TargetRankItem[];
  appeals: AppealLite[];
  areaStats: { label: string; value: string; sub: string }[];
  nearby: { label: string; name: string; walkMin: number; distanceM: number }[];
  /** 分析時点の周辺施設の一覧。古い分析は空 */
  nearbyLists: NearbyLists;
  media: MediaRow[];
  /** 採点ルール表（D35）の結果。2026-10-12より前の実行は null */
  scoring: ScoringView | null;
  appealJudgements: AppealJudgement[];
  /** 媒体ごとの評価（採点ルール表の実行だけ。Excel：媒体配分・試算シート⑧） */
  mediaEvaluation: MediaEvaluationRow[];
  totalManYen: number | null;
  /** 総予算の出どころ（D15）：input＝物件の登録で入力した額／rule＝ルール表の提案値 */
  budgetSource: "input" | "rule" | null;
  budgetOptions: number[];
  propertyId: number;
  censusSource: string;
  mlitSource: string;
}

const cardNo = (seq: number) => `F-${String(seq).padStart(2, "0")}`;

function factTitle(facts: FactLite[], seq: number): string {
  const f = facts.find((x) => x.seq === seq);
  return f?.valueText ? `${cardNo(seq)}：${f.valueText}` : cardNo(seq);
}

function CiteBadges({ cites, facts }: { cites: number[]; facts: FactLite[] }) {
  if (cites.length === 0) return null;
  return (
    <span className="ml-1.5 inline-flex gap-1 align-middle">
      {cites.map((c) => (
        <span key={c} title={factTitle(facts, c)} className="inline-block px-1.5 rounded bg-subtle text-[10px] font-bold text-muted cursor-help">
          {cardNo(c)}
        </span>
      ))}
    </span>
  );
}

/** カードの見出し：「誰に」などの小さなラベル＋タイトル */
function PanelTitle({ tag, children }: { tag: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 mb-4">
      <span className="px-1.5 py-0.5 rounded bg-primary text-white text-[10px] font-bold">{tag}</span>
      <span className="text-[13px] font-bold text-ink">{children}</span>
    </div>
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

function FacilityRows({ title, items, empty }: { title: string; items: NearbyListItem[]; empty: string }) {
  return (
    <div>
      <div className="text-xs font-bold text-ink mb-1.5">{title}</div>
      {items.length === 0 ? (
        <div className="text-xs text-muted py-1">{empty}</div>
      ) : (
        items.map((n, i) => (
          <div key={`${n.name}-${i}`} className="flex gap-3 text-[13px] text-body border-b border-divider py-1.5">
            <span className="mr-auto">{n.name}</span>
            {n.kind && <span className="text-[11px] text-muted">{n.kind}</span>}
            <span className="font-bold text-ink whitespace-nowrap">徒歩{n.walkMin}分</span>
            <span className="text-muted w-16 text-right whitespace-nowrap">{n.straightM.toLocaleString("ja-JP")}m</span>
          </div>
        ))
      )}
    </div>
  );
}

/** 周辺の学校・保育園の一覧（名前・種類・距離）。距離は直線、徒歩は「直線×1.3、分速80m」の目安 */
function NearbyListsCard({ lists }: { lists: NearbyLists }) {
  if (lists.elementary.length === 0 && lists.juniorHigh.length === 0 && lists.nurseries.length === 0) return null;
  return (
    <div className={`${card} p-5`}>
      <div className="text-[13px] font-bold text-ink">周辺の学校・保育園</div>
      <div className="text-[11px] text-muted mt-1 mb-3.5">
        距離は直線、徒歩は「直線×1.3、分速80m」の目安です。最寄りの学校が通う学校（学区）とは限りません（新潟市・長岡市は学区のデータがありません）。
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <FacilityRows title="小学校（近い順に3校）" items={lists.elementary} empty="周りにありません" />
        <FacilityRows title="中学校（近い順に3校）" items={lists.juniorHigh} empty="周りにありません" />
        <FacilityRows
          title={`保育園・幼稚園等（${lists.nurseryRadiusM ? `${lists.nurseryRadiusM.toLocaleString("ja-JP")}m以内` : "近く"}・${lists.nurseries.length}か所）`}
          items={lists.nurseries}
          empty="この範囲にはありません"
        />
      </div>
      <SourceNote className="mt-3">出典：国土交通省 不動産情報ライブラリ（学校・保育園・幼稚園等）を加工して作成</SourceNote>
    </div>
  );
}

function PropertyHeader({ property, propertyId }: { property: PropertyLite; propertyId: number }) {
  const tags = [
    property.landSqm !== null && `土地 ${property.landSqm}㎡`,
    property.buildingSqm !== null && `建物 ${property.buildingSqm}㎡`,
    property.access,
    property.parking !== null && property.parking > 0 && `駐車場 ${property.parking}台`,
  ].filter((t): t is string => typeof t === "string" && t !== "");
  return (
    <div className={`${card} p-4 mb-4 flex items-center gap-4 flex-wrap`}>
      <div className="relative w-24 h-16 rounded-md overflow-hidden shrink-0 bg-subtle">
        <Image src={property.photoUrl} alt={property.name} fill sizes="96px" style={{ objectFit: "cover" }} />
      </div>
      <div className="min-w-0 mr-auto">
        <div className="flex items-baseline gap-2.5 flex-wrap">
          <div className="text-base font-extrabold text-ink">
            {property.name}
            {property.layout && <span className="ml-1.5">{property.layout}</span>}
          </div>
          {property.priceManYen !== null && <div className="text-lg font-extrabold text-primary">{property.priceManYen.toLocaleString("ja-JP")}万円</div>}
        </div>
        <div className="text-[11px] text-muted mt-0.5">{property.address}</div>
        {tags.length > 0 && (
          <div className="flex gap-1.5 flex-wrap mt-2">
            {tags.map((t) => (
              <span key={t} className="px-2 py-0.5 rounded bg-primary-soft text-[11px] text-primary font-bold">{t}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex gap-2.5 print:hidden">
        <Link href={`/report?property=${propertyId}`} className="px-4 py-2 rounded-md border border-primary text-primary text-xs font-bold bg-white">
          PDFで保存
        </Link>
      </div>
    </div>
  );
}

export default function StrategyClient(props: StrategyClientProps) {
  const { hasRun, property, headline, sections, narrativeStatus, facts, targets, appeals, totalManYen, budgetSource, budgetOptions, propertyId, censusSource, mlitSource } = props;
  const [tab, setTab] = useState("strategy");
  const [budget, setBudget] = useState<number>(totalManYen ?? budgetOptions[0] ?? 0);
  const [media, setMedia] = useState<MediaRow[]>(props.media);
  const [pending, startTransition] = useTransition();

  if (!hasRun) {
    return (
      <>
        <PropertyHeader property={property} propertyId={propertyId} />
        <div className={emptyState}>この物件はまだ分析が実行されていません（上の「分析する」で実行できます）。</div>
      </>
    );
  }

  const byKey = (key: SectionKey) => sections.find((s) => s.key === key);
  const actionSteps = narrativeStatus === "failed" ? [] : (byKey("action_plan")?.paragraphs.flatMap((p) => p.sentences) ?? []);
  const sum = media.reduce((n, m) => n + m.amount, 0);
  const legend = media.reduce<(MediaRow & { color: string; share: number; stop: string })[]>((rows, m, i) => {
    if (m.amount <= 0) return rows;
    const color = MEDIA_COLORS[i % MEDIA_COLORS.length];
    const share = sum > 0 ? m.amount / sum : 0;
    const start = rows.reduce((n, r) => n + r.share, 0) * 100;
    const end = start + share * 100;
    rows.push({ ...m, color, share, stop: `${color} ${start}% ${end}%` });
    return rows;
  }, []);
  const gradient = sum > 0 ? `conic-gradient(${legend.map((l) => l.stop).join(", ")})` : "#e2e6ee";

  function pickBudget(b: number) {
    setBudget(b);
    if (b === totalManYen) {
      setMedia(props.media);
      return;
    }
    startTransition(async () => {
      const result = await simulateBudget(propertyId, b);
      setMedia(props.media.map((m) => ({ ...m, ...(result.find((r) => r.id === m.id) ?? { amount: 0, initialManYen: null }) })));
    });
  }

  return (
    <>
      <PropertyHeader property={property} propertyId={propertyId} />
      <UnderlineTabs tabs={strategyTabDefs} active={tab} onChange={setTab} />

      {tab === "strategy" && (
        <div className="grid gap-4">
          {/* 総合評価（AIの文章の見出し） */}
          {narrativeStatus === "failed" ? (
            <div className="text-xs text-muted">AIの文章は生成できませんでした。ルール表による判断だけを表示しています。</div>
          ) : headline ? (
            <div className="rounded-[10px] bg-primary-soft px-5 py-3.5 text-[14px] font-extrabold text-primary">
              {headline.text}
              <CiteBadges cites={headline.cites} facts={facts} />
            </div>
          ) : null}
          {narrativeStatus === "needs_review" && (
            <div className="rounded-md border border-[#f0d9a8] bg-[#fff8e8] px-3 py-2 text-xs text-[#8a5a00]">
              一部の文が検証に通りませんでした（数字・比較の言葉・表現のいずれか。要確認）。打ち合わせの場で見直してください。
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 誰に */}
            <div className={`${card} p-5`}>
              <PanelTitle tag="誰に">推奨ターゲット</PanelTitle>
              {targets.length === 0 ? (
                <div className="text-xs text-muted">狙う層を判断できませんでした。</div>
              ) : (
                <div className="grid">
                  {(props.scoring ? targets.slice(0, 3) : targets).map((t, i) => (
                    <div key={t.id} className={`flex gap-3 py-3 ${i > 0 ? "border-t border-divider" : "pt-0"}`}>
                      <div className="size-6 shrink-0 rounded-full text-white font-bold text-[11px] flex items-center justify-center" style={{ backgroundColor: RANK_COLOR[Math.min(i, RANK_COLOR.length - 1)] }}>
                        {t.rank}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-bold text-ink">
                          {t.label}
                          {t.confidence === "low" && <span className="ml-1.5 text-[10px] font-bold text-[#8a5a00]">仮説</span>}
                        </div>
                        <div className="text-[11px] text-muted mt-0.5 leading-[1.6]">{t.description}</div>
                        {t.targetImage && <div className="mt-1 inline-block rounded bg-primary-soft px-1.5 py-0.5 text-[10px] font-bold text-primary">{t.targetImage}</div>}
                        {!t.available ? (
                          <div className="mt-1 text-[10px] text-muted">判断できない（指標が取れない）</div>
                        ) : t.max > 0 ? (
                          <div className="mt-2 flex items-center gap-2">
                            <div className="flex-1 h-1.5 rounded-full bg-divider overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${(t.score / t.max) * 100}%`, backgroundColor: RANK_COLOR[Math.min(i, RANK_COLOR.length - 1)] }} />
                            </div>
                            <span className="text-[10px] text-muted whitespace-nowrap">{props.scoring ? `総合${t.score}点` : `${t.score}/${t.max}点`}</span>
                          </div>
                        ) : null /* 2026-10-06より前の分析には満点（max）がない */}
                      </div>
                    </div>
                  ))}
                  {props.scoring && (
                    <a href="#evaluation" className="mt-2 text-[11px] text-primary underline">全ペルソナの点数と評価理由を見る ↓</a>
                  )}
                </div>
              )}
            </div>

            {/* 何を */}
            <div className={`${card} p-5`}>
              <PanelTitle tag="何を">訴求ポイント</PanelTitle>
              {appeals.length === 0 ? (
                <div className="text-xs text-muted">{props.scoring ? "競合・周辺の取引と比べて有利な項目がありませんでした。" : "ルールに当てはまる訴求の素材がありませんでした。"}</div>
              ) : (
                <div className="grid gap-4">
                  {appeals.map((a) => (
                    <div key={a.id}>
                      <div className="flex gap-2 items-start text-[13px] font-bold text-ink">
                        <span className="mt-[5px] size-2 shrink-0 rounded-full bg-primary ring-3 ring-primary-soft" />
                        {a.label}
                        {a.judgement && <span className="ml-auto shrink-0 px-1.5 py-0.5 rounded bg-primary text-white text-[10px]">{a.judgement}</span>}
                      </div>
                      <div className="mt-1.5 ml-4 inline-block rounded bg-primary-soft px-2 py-1 text-[11px] text-primary">
                        根拠：
                        {a.judgement !== null
                          ? a.description
                          : a.evidence.length > 0
                          ? a.evidence.map((e, i) => (
                              <span key={e.seq}>
                                {i > 0 && "／"}
                                {e.text ?? cardNo(e.seq)}
                                <span className="ml-1 opacity-70">{cardNo(e.seq)}</span>
                              </span>
                            ))
                          : "物件情報（入力）"}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* どこで・いくらで */}
            <div className={`${card} p-5`}>
              <PanelTitle tag="どこで・いくらで">媒体と予算</PanelTitle>
              <div className="flex gap-5 items-center flex-wrap">
                <div className="size-[124px] shrink-0 rounded-full flex items-center justify-center transition-opacity" style={{ background: gradient, opacity: pending ? 0.5 : 1 }}>
                  <div className="size-[76px] rounded-full bg-white flex flex-col items-center justify-center">
                    <div className="text-[10px] text-muted">総予算</div>
                    <div className="text-[15px] font-extrabold text-ink">{budget}万円</div>
                  </div>
                </div>
                <div className="grid gap-2 flex-1 min-w-[140px]">
                  {legend.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-[11px] text-body" title={m.rules.length > 0 ? `${m.rules.map((r) => r.id).join("、")}が影響` : m.role || undefined}>
                      <span className="size-2.5 shrink-0 rounded-sm" style={{ backgroundColor: m.color }} />
                      <span className="mr-auto">{m.label}</span>
                      <span className="font-bold text-ink whitespace-nowrap">{m.amount}万円</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 inline-block rounded-full bg-primary-soft px-2.5 py-1 text-[10px] font-bold text-primary">
                配分は{props.scoring ? "第1ターゲットへの届きやすさ" : "ルール"}に基づき自動計算（
                {budget === totalManYen ? (budgetSource === "input" ? "物件の登録で入力した額" : props.scoring ? "物件価格×基準率×売れやすさの倍率" : "ルール表の提案値") : "シミュレーション中"}）
              </div>
              {props.scoring && budget === totalManYen && <SalabilityDetail scoring={props.scoring} />}
              {budgetOptions.length > 1 && (
                <div className="mt-3 flex gap-1.5 flex-wrap items-center">
                  <span className="text-[10px] text-muted mr-1">予算を変えてみる</span>
                  {budgetOptions.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => pickBudget(b)}
                      className={`px-2.5 py-1 rounded-full text-[11px] cursor-pointer ${budget === b ? "bg-primary text-white font-bold" : "bg-white text-body border border-field"}`}
                    >
                      {b}万円{b === totalManYen ? "（実際）" : ""}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {props.scoring && <TargetEvaluation scoring={props.scoring} />}

          {props.scoring && props.appealJudgements.length > 0 && (
            <div className={`${card} p-5`}>
              <div className="text-[13px] font-bold text-ink mb-1">訴求ポイントの判定（第1ターゲットの重視度 × 勝ち負け）</div>
              <div className="text-[11px] text-muted mb-3">1以上は「強く訴求」、0より大きければ「訴求」、マイナスは弱み（訴求しない）。有利な項目の上位4つまでを訴求に使います。</div>
              {props.appealJudgements.map((a) => (
                <div key={a.id} className="grid grid-cols-[1fr_0.6fr_0.9fr_2.4fr] gap-2 py-1.5 px-1 border-b border-divider text-xs text-body">
                  <div className="font-bold text-ink">{a.label}</div>
                  <div>{a.score}</div>
                  <div className={a.judgement.startsWith("弱み") ? "text-[#b91c1c]" : a.judgement ? "text-primary font-bold" : "text-muted"}>{a.judgement || "—"}</div>
                  <div className="text-muted">{a.description}</div>
                </div>
              ))}
            </div>
          )}

          {props.scoring && props.mediaEvaluation.length > 0 && <MediaEvaluation rows={props.mediaEvaluation} scoring={props.scoring} />}

          {/* いつ */}
          <div className={`${card} p-5`}>
            <PanelTitle tag="いつ">販売の進め方</PanelTitle>
            {actionSteps.length === 0 ? (
              <div className="text-xs text-muted">AIの文章（アクションプラン）がまだありません。</div>
            ) : (
              <div className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
                {actionSteps.map((s, i) => (
                  <div key={i} className={`${statBox} p-3.5`}>
                    <div className="text-[10px] font-bold text-primary mb-1">STEP {i + 1}</div>
                    <div className="text-xs text-ink leading-[1.7]">
                      {s.text}
                      <CiteBadges cites={s.cites} facts={facts} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <SourceNote>
            {censusSource}、{mlitSource}（各カードの番号から根拠データを確認できます）
          </SourceNote>
        </div>
      )}

      {tab === "area" && (
        <div className="grid gap-4">
          {props.areaStats.length > 0 && (
            <div className={`${card} p-5`}>
              <div className="text-[13px] font-bold text-ink mb-3.5">エリアの基本データ</div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {props.areaStats.map((s) => (
                  <div key={s.label} className={`${statBox} p-4`}>
                    <div className="text-[11px] text-muted">{s.label}</div>
                    <div className="text-lg font-extrabold text-ink mt-1">{s.value}</div>
                    {s.sub && <div className="text-[11px] text-muted mt-0.5">{s.sub}</div>}
                  </div>
                ))}
              </div>
              <SourceNote className="mt-3">{censusSource}</SourceNote>
            </div>
          )}
          {props.nearby.length > 0 && (
            <div className={`${card} p-5`}>
              <div className="text-[13px] font-bold text-ink mb-3.5">最寄りの施設</div>
              <div className="grid gap-2">
                {props.nearby.map((n) => (
                  <div key={n.label} className="flex gap-3 text-[13px] text-body border-b border-divider pb-2">
                    <span className="w-32 text-muted">{n.label}</span>
                    <span className="mr-auto">{n.name}</span>
                    <span className="font-bold text-ink">徒歩{n.walkMin}分</span>
                    <span className="text-muted w-20 text-right">{n.distanceM.toLocaleString("ja-JP")}m</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <NearbyListsCard lists={props.nearbyLists} />
          {props.nearbyLists.supermarketRadiusM !== null && (
            <div className={`${card} p-5`}>
              <div className="text-[13px] font-bold text-ink">周辺のスーパーマーケット</div>
              <div className="text-[11px] text-muted mt-1 mb-3.5">
                物件から{props.nearbyLists.supermarketRadiusM.toLocaleString("ja-JP")}m以内、直線距離順に最大10件。徒歩は「直線×1.3、分速80m」の目安です。
              </div>
              <FacilityRows title="スーパーマーケット" items={props.nearbyLists.supermarkets} empty="この範囲にはありません" />
              <SourceNote className="mt-3">© OpenStreetMap contributors</SourceNote>
            </div>
          )}
          {props.nearbyLists.medicalRadiusM !== null && (
            <div className={`${card} p-5`}>
              <div className="text-[13px] font-bold text-ink">周辺の医療機関</div>
              <div className="text-[11px] text-muted mt-1 mb-3.5">
                内科のある病院・診療所を、直線距離の近い順に最大10件（採点の「病院」の距離はこの最寄り）。徒歩は「直線×1.3、分速80m」の目安です。データは令和2年度時点のため、閉院・開院が反映されていないことがあります。
              </div>
              {props.nearbyLists.nearestHospital && (
                <div className="mb-3 text-xs text-body">
                  最寄りの病院（20床以上）：<span className="font-bold text-ink">{props.nearbyLists.nearestHospital.name}</span>
                  <span className="ml-1.5 text-muted">
                    徒歩{props.nearbyLists.nearestHospital.walkMin}分・{props.nearbyLists.nearestHospital.straightM.toLocaleString("ja-JP")}m
                  </span>
                </div>
              )}
              <FacilityRows title="内科のある病院・診療所" items={props.nearbyLists.medical} empty="この範囲にはありません" />
              <SourceNote className="mt-3">出典：国土交通省 不動産情報ライブラリ（国土数値情報「医療機関（令和2年度）」）を加工して作成</SourceNote>
            </div>
          )}
          {byKey("property_location") && <AnswerSection section={byKey("property_location")!} facts={facts} />}
          <div className="text-xs">
            <Link href={`/research/result?property=${propertyId}`} className="text-primary underline">競合物件との比較（競合診断）を見る</Link>
          </div>
        </div>
      )}

      {tab === "evidence" && (
        <div className="grid gap-4">
          {narrativeStatus !== "failed" && DETAIL_SECTIONS.map((k) => byKey(k)).map((sec) => sec && <AnswerSection key={sec.key} section={sec} facts={facts} />)}
          {props.scoring && <ScoringInputsTable inputs={props.scoring.inputs} />}
          <div className={`${card} p-5`}>
            <div className="text-[13px] font-bold text-ink mb-3.5">媒体ごとの役割と期待効果</div>
            <div className={`${tableHead} grid-cols-[1.2fr_0.6fr_1.8fr]`}>
              <div>媒体</div>
              <div>予算目安</div>
              <div>期待できる効果</div>
            </div>
            {legend.map((m) => (
              <div key={m.id} className="grid grid-cols-[1.2fr_0.6fr_1.8fr] gap-2 py-2.5 px-1 border-b border-divider text-[13px] text-body">
                <div>{m.label}</div>
                <div className="font-bold text-ink">{m.amount}万円</div>
                <div>
                  {m.role}
                  {m.rules.length > 0 && <span className="text-xs text-muted">（{m.rules.map((r) => r.id).join("、")}が影響）</span>}
                </div>
              </div>
            ))}
          </div>
          <div className={`${card} p-5`}>
            <div className="text-[13px] font-bold text-ink mb-3.5">事実カード・判断カード</div>
            <div className={`${tableHead} grid-cols-[60px_2fr_1.5fr]`}>
              <div>番号</div>
              <div>内容</div>
              <div>出典</div>
            </div>
            {facts.map((f) => (
              <div key={f.seq} className="grid grid-cols-[60px_2fr_1.5fr] gap-2 py-2 px-1 border-b border-divider text-xs text-body">
                <div className="font-bold text-muted">{cardNo(f.seq)}</div>
                <div>{f.valueText ?? "—"}</div>
                <div className="text-muted">{f.attribution ?? "—"}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
