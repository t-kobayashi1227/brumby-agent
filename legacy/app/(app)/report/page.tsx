import Link from "next/link";
import { getSql } from "../../../lib/db";
import { ESTAT_CREDIT, GSI_CREDIT, PROCESSED_NOTE, REINFOLIB_CREDIT, REPORT_DISCLAIMERS } from "../../../lib/credits";
import { SECTION_TITLE, SENTENCE_KIND_LABEL, type SentenceKind } from "../../../lib/ai/schema";
import type { AppealRankItem } from "../../../lib/rules/engine";
import { cardName } from "../../../lib/rules/describe";
import { findFact, listProperties, loadDataSources, loadReport, mediaBreakdown, targetRanking, type ReportFact } from "../../../lib/report";
import { card, emptyState } from "../../_lib/ui";
import PrintButton from "./PrintButton";

// 販売戦略レポート（印刷用の画面。設計書 7章・D27）。ブラウザの印刷で紙・PDFにする
// 引用元（カード番号と出典）・データ取得日・AI生成日・免責を載せる。架空の数値は出さない
// ?property=<id> で物件、?run=<id> で実行を選ぶ（省略時は最新の成功した分析）
export const dynamic = "force-dynamic";

const fmtDateTime = (d: Date) => new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
const fmtDate = (d: Date) => new Date(d).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric" });
const cardNo = (seq: number) => `F-${String(seq).padStart(2, "0")}`;

interface Sentence { kind?: SentenceKind; text: string; cites: number[] }
interface Section { key: keyof typeof SECTION_TITLE; paragraphs: { key: string; sentences: Sentence[] }[] }

function Cites({ cites }: { cites: number[] }) {
  if (cites.length === 0) return null;
  return <span className="ml-1 text-[10px] text-muted">［{cites.map(cardNo).join("・")}］</span>;
}

function H2({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <h2 className="text-[15px] font-extrabold text-ink border-b-2 border-ink pb-1 mb-3 mt-7 break-after-avoid">
      {n}. {children}
    </h2>
  );
}

/** AIの文章の1セクション。検証に通らなかった段落には「要確認」の印を付ける */
function NarrativeSection({ section, reviewKeys }: { section?: Section; reviewKeys: Set<string> }) {
  if (!section) return <p className="text-[12px] text-muted">（AIの文章がありません）</p>;
  return (
    <div className="grid gap-2">
      {section.paragraphs.map((p) => (
        <div key={p.key} className={`text-[12.5px] leading-[1.9] text-body ${reviewKeys.has(`${section.key}/${p.key}`) ? "border-l-4 border-[#e0a400] pl-2" : ""}`}>
          {reviewKeys.has(`${section.key}/${p.key}`) && <span className="mr-1 text-[10px] font-bold text-[#8a5a00]">［要確認］</span>}
          {p.sentences.map((s, i) => (
            <span key={i}>
              {s.kind && <span className="text-[9.5px] text-muted">〔{SENTENCE_KIND_LABEL[s.kind]}〕</span>}
              {s.text}
              <Cites cites={s.cites} />
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function statusLabel(f: ReportFact) {
  return f.status === "ok" ? "" : f.status === "insufficient" ? "（データ不足）" : "（データなし）";
}

export default async function ReportPage({ searchParams }: PageProps<"/report">) {
  const sp = await searchParams;
  const sql = getSql();
  const properties = await listProperties(sql);
  const propertyId = Number(sp.property) > 0 ? Number(sp.property) : properties[0]?.id ?? 0;
  const runId = Number(sp.run) > 0 ? Number(sp.run) : undefined;
  const report = propertyId ? await loadReport(sql, propertyId, runId) : null;

  const picker = (
    <div className={`${card} p-4 mb-4 flex flex-wrap items-center gap-3 print:hidden`}>
      <div className="text-[13px] font-bold text-ink">物件</div>
      {properties.map((p) => (
        <Link key={p.id} href={`/report?property=${p.id}`} className={`text-[13px] px-3 py-1.5 rounded-md border ${p.id === propertyId ? "border-brand text-brand font-bold" : "border-line text-body"}`}>
          {p.id}. {p.name}
        </Link>
      ))}
      <div className="ml-auto">{report && report.run.id !== 0 && <PrintButton />}</div>
    </div>
  );

  if (!report) return <>{picker}<div className={emptyState}>{runId ? `実行 ${runId} は、この物件の成功した分析ではありません。` : "物件がありません。"}</div></>;
  if (report.run.id === 0) return <>{picker}<div className={emptyState}>この物件はまだ分析されていません（販売戦略の画面の「分析する」）。</div></>;

  const { property, run, facts, narrative, competitors } = report;
  const sources = await loadDataSources(sql, facts);
  const ranking = targetRanking(facts);
  const rankFact = findFact(facts, "decision.target_rank");
  const rankBasis = (rankFact?.basis ?? {}) as { unresolved?: boolean; tied?: boolean };
  const appealsFact = findFact(facts, "decision.appeals");
  const appeals = (((appealsFact?.basis ?? {}) as { items?: AppealRankItem[] }).items ?? []).filter((a) => a.selected);
  const budgetFact = findFact(facts, "decision.total_budget");
  const budgetSource = (budgetFact?.basis as { source?: string } | null)?.source;
  const media = mediaBreakdown(facts);
  const sections = (narrative?.status === "failed" ? [] : narrative?.content.sections ?? []) as Section[];
  const section = (k: Section["key"]) => sections.find((s) => s.key === k);
  const reviewKeys = new Set((narrative?.validation?.paragraphs ?? []).filter((p) => !p.ok).map((p) => `${p.sectionKey}/${p.paragraphKey}`));
  const radius = typeof run.params.radius_m === "number" ? run.params.radius_m : null;
  const factCards = facts.filter((f) => f.kind === "fact");
  const usesEstat = sources.some((s) => s.attribution.includes("e-Stat") || s.attribution.includes("国勢調査"));
  const usesReinfolib = sources.some((s) => s.attribution.includes("不動産情報ライブラリ"));
  const legacy = sections.some((s) => ["appeal_points", "budget_rationale", "competitor_diff"].includes(s.key));

  return (
    <>
      {picker}
      <article className="bg-white mx-auto max-w-[820px] p-10 print:p-0 print:max-w-none text-ink border border-line rounded-[10px] print:border-0">
        <header className="border-b border-line pb-4">
          <div className="text-[11px] text-muted">BRUMBY AI物件販売戦略（PoC）</div>
          <h1 className="text-[22px] font-black mt-1">販売戦略レポート</h1>
          <div className="text-[15px] font-bold mt-1">
            物件{property.id}：{property.name}
          </div>
          <dl className="mt-3 grid grid-cols-[110px_1fr] gap-y-1 text-[12px] text-body">
            <dt className="text-muted">種別・売出価格</dt>
            <dd>{property.propertyType}・{property.priceManYen !== null ? `${property.priceManYen.toLocaleString("ja-JP")}万円（売出価格）` : "未入力"}</dd>
            <dt className="text-muted">所在地</dt>
            <dd>{property.address}</dd>
            <dt className="text-muted">分析</dt>
            <dd>
              {fmtDateTime(run.createdAt)}（実行 {run.id}
              {radius !== null ? `、人口構成の半径 ${radius.toLocaleString("ja-JP")}m` : ""}）
            </dd>
            <dt className="text-muted">AIの文章</dt>
            <dd>
              {narrative && narrative.status !== "failed"
                ? `${fmtDateTime(narrative.createdAt)} 生成（${narrative.model}、${narrative.attempts}回、検証：${narrative.status === "ok" ? "すべて合格" : "要確認の段落あり"}）`
                : "生成できませんでした（事実カードとルールの判断だけを載せています）"}
            </dd>
            <dt className="text-muted">作成日</dt>
            <dd>{fmtDate(new Date())}</dd>
          </dl>
        </header>

        {narrative && narrative.status !== "failed" && (
          <p className="mt-5 text-[15px] font-extrabold text-accent leading-relaxed">
            {narrative.content.headline.text}
            <Cites cites={narrative.content.headline.cites} />
          </p>
        )}
        {legacy && <p className="mt-2 text-[11px] text-muted">※ この文章は旧い形式（2026-10-06より前）で作られています。最新の形で見るには、分析し直してください。</p>}

        <H2 n={1}>物件の特徴・立地</H2>
        <NarrativeSection section={section("property_location")} reviewKeys={reviewKeys} />
        {competitors.length === 0 && <p className="mt-2 text-[12px] text-muted">競合物件：未入力</p>}

        <H2 n={2}>想定ターゲット（ルール表による判断）</H2>
        {rankBasis.unresolved && <p className="text-[12.5px] font-bold text-body mb-2">エリアの特徴からは、狙う層を絞り込めませんでした。</p>}
        <table className="w-full text-[12px] border-collapse mb-3">
          <thead>
            <tr className="border-b border-line text-left text-muted">
              <th className="py-1 w-12">順位</th>
              <th className="py-1">狙う層</th>
              <th className="py-1 w-24">点</th>
              <th className="py-1">効いたルール</th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((t) => (
              <tr key={t.id} className="border-b border-divider align-top">
                <td className="py-1">{t.rank}位</td>
                <td className="py-1">
                  {t.label}
                  {t.confidence === "low" && <span className="ml-1 text-[10px] font-bold text-[#8a5a00]">仮説</span>}
                </td>
                <td className="py-1">{t.available ? `${t.score}/${t.max}点` : "判断できない"}</td>
                <td className="py-1 text-muted">{t.rules.map((r) => r.id).join("、") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rankFact && <p className="text-[10px] text-muted mb-2">根拠：{cardNo(rankFact.seq)}</p>}
        <NarrativeSection section={section("target_persona")} reviewKeys={reviewKeys} />

        <H2 n={3}>訴求・チャネル</H2>
        {appeals.length > 0 ? (
          <ol className="text-[12.5px] mb-3 list-decimal pl-5">
            {appeals.map((a) => {
              const evidence = a.needsFacts.map((k) => findFact(facts, k)).filter((f): f is ReportFact => f !== undefined);
              return (
                <li key={a.id}>
                  {a.label}
                  <span className="ml-1 text-[10px] text-muted">［{evidence.length ? evidence.map((f) => cardNo(f.seq)).join("・") : "物件の入力"}］</span>
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="text-[12.5px] text-muted mb-3">ルールに当てはまる訴求の素材がありませんでした。</p>
        )}
        <NarrativeSection section={section("appeal_channels")} reviewKeys={reviewKeys} />

        <H2 n={4}>広告予算案</H2>
        {budgetFact && budgetFact.status === "ok" ? (
          <>
            <p className="text-[12.5px] mb-2">
              総予算 <span className="font-bold">{budgetFact.value}万円</span>（{budgetSource === "input" ? "物件の登録で入力した額" : "ルール表による提案値（入力なし）"}）
              <Cites cites={[budgetFact.seq]} />
            </p>
            <table className="w-full text-[12px] border-collapse mb-3">
              <thead>
                <tr className="border-b border-line text-left text-muted">
                  <th className="py-1">媒体</th>
                  <th className="py-1 w-24">金額</th>
                  <th className="py-1 w-16">割合</th>
                  <th className="py-1">効いたルール</th>
                </tr>
              </thead>
              <tbody>
                {media.map((m) => (
                  <tr key={m.id} className="border-b border-divider">
                    <td className="py-1">{m.label}</td>
                    <td className="py-1">{m.amount}万円</td>
                    <td className="py-1">{Math.round(m.share * 100)}%</td>
                    <td className="py-1 text-muted">{m.rules.map((r) => r.id).join("、") || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : (
          <p className="text-[12.5px] text-muted mb-3">総予算が決まっていません（入力がなく、ルールにも当てはまりませんでした）。</p>
        )}
        <NarrativeSection section={section("budget_plan")} reviewKeys={reviewKeys} />

        <H2 n={5}>アクションプラン</H2>
        <NarrativeSection section={section("action_plan")} reviewKeys={reviewKeys} />

        <H2 n={6}>不確実性と根拠</H2>
        <NarrativeSection section={section("uncertainty")} reviewKeys={reviewKeys} />
        {legacy && sections.filter((s) => ["appeal_points", "budget_rationale", "competitor_diff"].includes(s.key)).map((s) => (
          <div key={s.key} className="mt-3">
            <div className="text-[12px] font-bold">{SECTION_TITLE[s.key]}</div>
            <NarrativeSection section={s} reviewKeys={reviewKeys} />
          </div>
        ))}

        <H2 n={7}>根拠の事実カード</H2>
        <p className="text-[10.5px] text-muted mb-2">本文の［F-xx］は、このカードの番号です。取引価格は過去の取引・成約価格（約半年遅れ）、人口構成は2020年の国勢調査です。</p>
        <table className="w-full text-[11px] border-collapse">
          <tbody>
            {factCards.map((f) => (
              <tr key={f.seq} className="border-b border-divider align-top break-inside-avoid">
                <td className="py-1 pr-2 w-12 text-muted">{cardNo(f.seq)}</td>
                <td className="py-1">
                  {f.valueText ?? (f.value !== null ? `${f.value}${f.unit ?? ""}` : cardName(f.key))}
                  <span className="text-muted">{statusLabel(f)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <H2 n={8}>出典・データの取得日</H2>
        <ul className="text-[11px] text-body grid gap-1">
          {sources.map((s) => (
            <li key={s.versionId}>
              {s.attribution}
              <span className="text-muted">
                （取得 {fmtDate(s.fetchedAt)}
                {s.publishedAt ? `、公開 ${fmtDate(s.publishedAt)}` : ""}
                {s.period ? `、期間 ${s.period}` : ""}）
              </span>
            </li>
          ))}
          <li>{PROCESSED_NOTE}</li>
          <li>{GSI_CREDIT}</li>
        </ul>
        <div className="mt-2 text-[10.5px] text-muted grid gap-1">
          {usesReinfolib && <p>{REINFOLIB_CREDIT}</p>}
          {usesEstat && <p>{ESTAT_CREDIT}</p>}
        </div>

        <H2 n={9}>ご利用にあたって</H2>
        <ul className="text-[11px] text-body list-disc pl-5 grid gap-1">
          {REPORT_DISCLAIMERS.map((d) => <li key={d}>{d}</li>)}
        </ul>
      </article>
    </>
  );
}
