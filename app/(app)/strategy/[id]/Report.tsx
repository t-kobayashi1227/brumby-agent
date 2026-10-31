"use client";

import { useState } from "react";
import type { StrategyResult } from "../../../../lib/agents/run";
import { STRATEGY_TOPICS } from "../../../../lib/agents/schemas";
import { FACT_CATEGORIES, type Fact, type FactCategory } from "../../../../lib/facts/types";
import { evidenceText, FIXED_CREDITS, type SourceRow } from "../../../../lib/report";
import UnderlineTabs from "../../../_components/UnderlineTabs";
import { card } from "../../../_lib/ui";
import MediaDonut, { MEDIA_COLORS } from "./MediaDonut";

// ⑤販売戦略レポート（docs/設計まとめ.md「⑤画面の表示」）。「エリア分析・販売戦略・根拠データ」の3タブ
// 画面では AI を動かさず、保存した結果（strategy_runs.result）と事実シートを出すだけ。金額は lib/calc/budget.ts で計算済み
// 販売戦略タブの並び（2026-10-31 提案資料の画面イメージに合わせて変更）：
//   総合評価 → 3列（誰に・何を・どこで/いくらで）→ 販売の方向性 → 予算シミュレーション（初めは閉じる）
//   価格の見方・懸念点はエリア分析タブの先頭に出す（2026-10-31 決定。販売戦略タブを結論と打ち手だけにする）
//   合わない層（not_fit）は画面に出さない（2026-10-31 決定。AIの答えとDBには残す）
//   出典の一覧は根拠データタブへ移し、ライセンス表示が要るクレジットは全タブ共通の下部に残す

const TABS = [
  { key: "area", label: "エリア分析" },
  { key: "strategy", label: "販売戦略" },
  { key: "evidence", label: "根拠データ" },
];

/** 分析の見出しの順。組み合わせた見立てを先に出す */
const TOPIC_ORDER: (typeof STRATEGY_TOPICS)[number][] = ["組み合わせ", "物件", "立地", "価格", "買い手", "その他"];
const TOPIC_TITLE: Record<(typeof STRATEGY_TOPICS)[number], string> = {
  組み合わせ: "組み合わせた見立て",
  物件: "物件",
  立地: "立地と暮らし",
  価格: "価格",
  買い手: "買い手",
  その他: "その他の気づき",
};

const manYen = (n: number) => `${n.toFixed(1)}万円`;

/** 文の下に小さく出す根拠のチップ。初めは件数だけを出し、押すと各事実の値・出典・時点が開く */
function Evidence({ ids, facts }: { ids: string[]; facts: Map<string, Fact> }) {
  const list = [...new Set(ids.map((i) => i.trim()).filter(Boolean))];
  if (list.length === 0) return null;
  return (
    <details className="group/ev mt-1.5 text-[12px]">
      <summary className="inline-flex cursor-pointer list-none items-center gap-1 rounded bg-subtle border border-line px-2 py-0.5 text-sub hover:border-primary hover:text-primary [&::-webkit-details-marker]:hidden">
        根拠 {list.length}件<span className="group-open/ev:rotate-90 transition-transform">▸</span>
      </summary>
      <ul className="mt-1.5 grid gap-1.5 rounded bg-subtle px-3 py-2 text-body leading-relaxed">
        {list.map((id) => {
          const f = facts.get(id);
          return (
            <li key={id}>
              {f ? evidenceText(f) : `${id}（事実シートにないID）`}
              <div className="text-sub">
                <span className="font-mono">{id}</span>
                {f && `・${f.出典}（${f.時点}）${f.状態 !== "取得" ? `・${f.状態}` : ""}`}
              </div>
            </li>
          );
        })}
      </ul>
    </details>
  );
}

/** カードの見出し。tag は「誰に」「何を」のような短い問い */
function Heading({ tag, title }: { tag?: string; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {tag && <span className="rounded bg-primary px-1.5 py-0.5 text-[11px] font-bold text-white whitespace-nowrap">{tag}</span>}
      <h2 className="text-[16px] font-bold text-ink">{title}</h2>
    </div>
  );
}

function Card({ tag, title, children, className = "" }: { tag?: string; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`${card} p-5 break-inside-avoid ${className}`}>
      <Heading tag={tag} title={title} />
      {children}
    </section>
  );
}

function Text({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] text-ink leading-relaxed">{children}</p>;
}

function Label({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "strong" }) {
  return <span className={`inline-block px-2 py-0.5 rounded text-[14px] font-bold ${tone === "strong" ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>{children}</span>;
}

function RankBadge({ rank }: { rank: number }) {
  return <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full grid place-items-center text-[12px] font-bold ${rank === 1 ? "bg-primary text-white" : "bg-primary-soft text-primary"}`}>{rank}</span>;
}

function StrategyTab({ r, facts, mediaNames }: { r: StrategyResult; facts: Map<string, Fact>; mediaNames: Record<string, string> }) {
  const m = r.戦略;
  const media = r.媒体;
  const targets = [...m.targets].sort((a, b) => a.rank - b.rank);
  const appeals = [...m.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const sims = r.予算シミュレーション;
  const inputSim = sims.find((s) => s.isInput) ?? null;
  const nameOf = (id: string, fallback: string) => mediaNames[id] ?? fallback;
  const amountOf = (id: string) => inputSim?.rows.find((row) => row.id === id)?.amountManYen ?? null;

  return (
    <div className="grid gap-4">
      <Card title="総合評価">
        <Text>{m.summary.text}</Text>
        <Evidence ids={m.summary.evidence} facts={facts} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card tag="誰に" title="狙う層">
          <ol className="grid gap-4">
            {targets.map((t) => (
              <li key={`${t.rank}-${t.name}`} className="flex gap-2.5">
                <RankBadge rank={t.rank} />
                <div className="min-w-0">
                  <div className="text-[15px] font-bold text-ink">
                    {t.name}
                    {t.source === "エージェント提案" && <span className="ml-1 text-[12px] font-normal text-sub">（AIが加えた候補）</span>}
                  </div>
                  {t.source === "エージェント提案" && t.definition && <div className="text-[14px] text-sub mt-0.5">どんな世帯か：{t.definition}</div>}
                  <p className="text-[14px] text-body leading-relaxed mt-0.5">{t.reason}</p>
                  <Evidence ids={t.evidence} facts={facts} />
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card tag="何を" title="訴求ポイント">
          <ol className="grid gap-4">
            {appeals.map((a, i) => (
              <li key={i} className="flex gap-2.5">
                <span className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-primary" aria-hidden />
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-ink leading-relaxed">{a.text}</p>
                  <Evidence ids={a.evidence} facts={facts} />
                </div>
              </li>
            ))}
          </ol>
        </Card>

        <Card tag="どこで・いくらで" title="媒体と予算">
          <div className="flex items-center gap-4">
            <div className="shrink-0">
              <MediaDonut
                items={media.media.map((x) => ({
                  label: nameOf(x.id, x.name),
                  share: x.share,
                }))}
                totalManYen={inputSim?.totalManYen ?? null}
              />
            </div>
            <ul className="grid gap-2 min-w-0 flex-1">
              {media.media.map((x, i) => {
                const amount = amountOf(x.id);
                return (
                  <li key={x.id} className="text-[14px]">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 shrink-0 rounded-sm"
                        style={{
                          background: MEDIA_COLORS[i % MEDIA_COLORS.length],
                        }}
                      />
                      <span className="text-ink mr-auto">{nameOf(x.id, x.name)}</span>
                      <span className="font-bold text-ink whitespace-nowrap">{amount !== null ? manYen(amount) : `${x.share}%`}</span>
                    </div>
                    <div className="pl-4 text-[12px] text-sub">
                      {amount !== null && `${x.share}%・`}
                      {x.purpose}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="mt-3">
            <span className="inline-block rounded bg-primary-soft px-2 py-0.5 text-[12px] text-primary">配分はルールに基づき自動計算</span>
          </div>
        </Card>
      </div>

      <Card title="販売の方向性">
        <Text>{m.direction.text}</Text>
        <Evidence ids={m.direction.evidence} facts={facts} />
      </Card>

      <details className={`${card} group break-inside-avoid`}>
        <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 [&::-webkit-details-marker]:hidden">
          <span className="text-[16px] font-bold text-ink">媒体の内訳と予算シミュレーション</span>
          <span className="text-[12px] text-sub">10万・20万・30万円での金額の試算</span>
          <span className="ml-auto text-[14px] text-primary">
            <span className="group-open:hidden">開く ▾</span>
            <span className="hidden group-open:inline">閉じる ▴</span>
          </span>
        </summary>
        <div className="grid gap-6 px-5 pb-5">
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] text-ink border-collapse">
              <thead>
                <tr className="text-left text-sub border-b border-line">
                  <th className="py-2 pr-3 font-normal">媒体</th>
                  <th className="py-2 pr-3 font-normal">目的</th>
                  <th className="py-2 pr-3 font-normal">想定ターゲット</th>
                  <th className="py-2 font-normal">理由</th>
                </tr>
              </thead>
              <tbody>
                {media.media.map((x) => (
                  <tr key={x.id} className="align-top border-b border-canvas">
                    <td className="py-2 pr-3 font-bold whitespace-nowrap">{nameOf(x.id, x.name)}</td>
                    <td className="py-2 pr-3 text-body whitespace-nowrap">{x.purpose}</td>
                    <td className="py-2 pr-3 text-body">{x.target}</td>
                    <td className="py-2 text-body">
                      {x.reason}
                      <Evidence ids={x.evidence} facts={facts} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <div className="text-[14px] text-accent mb-2">参考の配分を示した試算です。正式な費用・見積もりではありません。</div>
            <div className="overflow-x-auto">
              <table className="w-full text-[14px] text-ink border-collapse">
                <thead>
                  <tr className="text-sub border-b border-line">
                    <th className="py-2 pr-2 font-normal text-left">媒体</th>
                    <th className="py-2 pr-2 font-normal text-right">配分</th>
                    {sims.map((s) => (
                      <th key={`${s.totalManYen}-${s.isInput}`} className="py-2 pr-2 font-normal text-right whitespace-nowrap">
                        {s.totalManYen}万円{s.isInput ? "（入力の総額）" : ""}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {media.media.map((x) => (
                    <tr key={x.id} className="border-b border-canvas">
                      <td className="py-2 pr-2">{nameOf(x.id, x.name)}</td>
                      <td className="py-2 pr-2 text-right">{x.share}%</td>
                      {sims.map((s) => (
                        <td key={`${s.totalManYen}-${s.isInput}`} className="py-2 pr-2 text-right whitespace-nowrap">
                          {manYen(s.rows.find((row) => row.id === x.id)?.amountManYen ?? 0)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}

function AreaTab({ r, facts }: { r: StrategyResult; facts: Map<string, Fact> }) {
  const { analysis, unknown } = r.戦略;
  return (
    <div className="grid gap-4">
      <Card title="価格の見方">
        <div className="flex flex-wrap gap-2 mb-2">
          <Label tone="strong">{r.戦略.price_view.position}</Label>
          <Label>{r.戦略.price_view.sellability}</Label>
        </div>
        <Text>{r.戦略.price_view.text}</Text>
        <Evidence ids={r.戦略.price_view.evidence} facts={facts} />
        <div className="mt-3 text-[12px] text-sub">周辺の取引と比べた目安であり、価格の査定や保証ではありません。</div>
      </Card>

      <Card title="懸念点">
        <ul className="grid gap-3">
          {[...r.戦略.concerns, ...r.媒体.cautions].map((c, i) => (
            <li key={i} className="flex gap-2.5">
              <span className="mt-1.5 w-2 h-2 shrink-0 rounded-full bg-accent" aria-hidden />
              <div className="min-w-0">
                <Text>{c.text}</Text>
                <Evidence ids={c.evidence} facts={facts} />
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {TOPIC_ORDER.map((topic) => {
        const items = analysis.filter((a) => a.topic === topic);
        if (items.length === 0) return null;
        return (
          <Card key={topic} title={TOPIC_TITLE[topic]}>
            <ul className="grid gap-4">
              {items.map((a, i) => (
                <li key={i} className="grid gap-1">
                  <div className="text-[14px] text-body">{a.fact}</div>
                  <div>
                    <span className="text-[12px] font-bold text-primary mr-1.5">買い手にとって</span>
                    <span className="text-[15px] text-ink leading-relaxed">{a.meaning}</span>
                  </div>
                  <div>
                    <span className="text-[12px] font-bold text-primary mr-1.5">販売での使い方</span>
                    <span className="text-[15px] text-ink leading-relaxed">{a.use}</span>
                  </div>
                  <Evidence ids={a.evidence} facts={facts} />
                </li>
              ))}
            </ul>
          </Card>
        );
      })}
      {unknown.length > 0 && (
        <Card title="事実シートから分からないこと">
          <ul className="grid gap-1 text-[14px] text-body">
            {unknown.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** 事実シートの列と幅（合計1110pxが表の最小幅。1440px幅の画面で横スクロールなしに収まる。広い画面では比率のまま広がり、狭い画面では横スクロール） */
const FACT_COLUMNS = [
  { label: "ID", width: 64 },
  { label: "項目", width: 180 },
  { label: "値", width: 250 },
  { label: "比較", width: 170 },
  { label: "出典", width: 189 },
  { label: "時点", width: 165 },
  { label: "状態", width: 92 },
];

/** 時点の表示。「2026-10-24（ダウンロード日）」のような補足は、日付の下に小さく分けて出す（日付の途中で折り返さない） */
function TimePoint({ value }: { value: string }) {
  const i = value.indexOf("（");
  if (i <= 0) return <span className="whitespace-nowrap">{value}</span>;
  return (
    <>
      <span className="whitespace-nowrap">{value.slice(0, i)}</span>
      <span className="block text-[12px] text-sub">{value.slice(i)}</span>
    </>
  );
}

/** ID の英字の凡例。この事実シートに出てくる分類だけを、設計まとめの表の順で出す */
/** 表の行の要素 id（凡例から飛ぶ先） */
const factRowId = (id: string) => `fact-row-${id}`;

/** ID の英字の凡例。この事実シートに出てくる分類だけを、設計まとめの表の順で出す。押すとその分類の1番目の行へ移る */
function FactLegend({ facts, onJump }: { facts: Fact[]; onJump: (id: string) => void }) {
  const items = (Object.keys(FACT_CATEGORIES) as FactCategory[])
    .map((c) => ({ c, first: facts.find((f) => f.id.startsWith(`${c}-`)) }))
    .filter((x): x is { c: FactCategory; first: Fact } => x.first !== undefined);
  return (
    <div className="mb-4">
      <div className="text-[13px] text-sub mb-2">ID の英字は事実の分類です（例：P-01 は「物件」の1番目）。押すと、その分類の最初の行へ移ります。</div>
      <div className="grid gap-x-6 gap-y-1 text-[13px] sm:grid-cols-2 xl:grid-cols-3">
        {items.map(({ c, first }) => (
          <div key={c} className="min-w-0">
            <button
              type="button"
              onClick={() => onJump(first.id)}
              className="flex w-full gap-2 rounded px-1.5 py-1 -mx-1.5 text-left cursor-pointer hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-primary"
            >
              <span className="shrink-0 font-mono font-bold text-primary w-4">{c}</span>
              <span className="min-w-0">
                <span className="font-bold text-ink underline decoration-line underline-offset-2">{FACT_CATEGORIES[c].name}</span>
                <span className="text-sub">：{FACT_CATEGORIES[c].contents}</span>
              </span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvidenceTab({ facts, sources }: { facts: Fact[]; sources: SourceRow[] }) {
  // 凡例から移った行を少しの間だけ、ホバーと同じ色にして、どこに移ったか分かるようにする
  const [jumped, setJumped] = useState<string | null>(null);
  const jump = (id: string) => {
    document.getElementById(factRowId(id))?.scrollIntoView({ behavior: "smooth", block: "start" });
    setJumped(id);
    window.setTimeout(() => setJumped((cur) => (cur === id ? null : cur)), 2000);
  };
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Card title="事実シート" className="min-w-0">
        <FactLegend facts={facts} onJump={jump} />
        {/* 列の幅を決めて横スクロールにする（狭い画面で値や出典が細く折り返されないように）。ID の列は横に動かしても見えるよう固定する */}
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full min-w-[1110px] table-fixed text-[14px] text-ink border-collapse">
            <colgroup>
              {FACT_COLUMNS.map((c) => (
                <col key={c.label} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="text-left text-sub bg-subtle">
                {FACT_COLUMNS.map((c, i) => (
                  <th key={c.label} className={`px-3 py-2.5 font-bold text-[13px] whitespace-nowrap border-b border-line ${i === 0 ? "sticky left-0 z-10 bg-subtle" : ""}`}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facts.map((f) => (
                <tr
                  key={f.id}
                  id={factRowId(f.id)}
                  className={`group/row scroll-mt-4 align-top border-b border-line transition-colors duration-700 ${jumped === f.id ? "bg-primary-soft/40" : "hover:bg-primary-soft/40"}`}
                >
                  <td className={`sticky left-0 px-3 transition-colors duration-700 ${jumped === f.id ? "bg-[#f4f8fd]" : "bg-white group-hover/row:bg-[#f4f8fd]"} py-3 font-mono text-[13px] text-sub whitespace-nowrap`}>{f.id}</td>
                  <td className="px-3 py-3 font-bold leading-relaxed">{f.項目}</td>
                  <td className={`px-3 py-3 leading-relaxed ${f.値 === null ? "text-sub" : ""}`}>{f.値 ?? "不明"}</td>
                  <td className="px-3 py-3 leading-relaxed text-body">{f.比較 ?? ""}</td>
                  <td className="px-3 py-3 leading-relaxed text-body">{f.出典}</td>
                  <td className="px-3 py-3 text-body leading-relaxed">
                    <TimePoint value={f.時点} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className={`inline-block rounded px-2 py-0.5 text-[12px] ${f.状態 === "取得" ? "bg-primary-soft text-primary" : "bg-divider text-sub"}`}>{f.状態}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="このレポートで使った出典">
        <table className="w-full text-[14px] text-body border-collapse">
          <thead>
            <tr className="text-left text-sub border-b border-line">
              <th className="py-1.5 pr-3 font-normal">出典</th>
              <th className="py-1.5 font-normal">時点</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={`${s.出典}|${s.時点}`} className="border-b border-canvas">
                <td className="py-1.5 pr-3">{s.出典}</td>
                <td className="py-1.5 whitespace-nowrap text-sub">{s.時点}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

export default function Report({
  result,
  facts,
  sources,
  credits,
  mediaNames,
}: {
  result: StrategyResult;
  facts: Fact[];
  sources: SourceRow[];
  credits: string[];
  mediaNames: Record<string, string>;
}) {
  const [tab, setTab] = useState("strategy");
  const byId = new Map(facts.map((f) => [f.id, f]));
  return (
    <div>
      <div className="print:hidden">
        <UnderlineTabs tabs={TABS} active={tab} onChange={setTab} />
      </div>
      {tab === "strategy" && <StrategyTab r={result} facts={byId} mediaNames={mediaNames} />}
      {tab === "area" && <AreaTab r={result} facts={byId} />}
      {tab === "evidence" && <EvidenceTab facts={facts} sources={sources} />}
      {/* ライセンス・利用規約で表示が要る文言だけを、短い段落にまとめて出す。地図のクレジットは地図を出す物件の画面に出しているので、ここでは出さない（2026-10-31） */}
      <footer className="mt-6 grid gap-1.5 text-[12px] text-sub leading-relaxed">
        <p>{[...credits, ...FIXED_CREDITS.filter((c) => !c.startsWith("地図："))].join("／")}</p>
        <p>このレポートは公開データと物件情報をもとにAIが作成した販売戦略の参考です。</p>
      </footer>
    </div>
  );
}
