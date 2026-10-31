"use client";

import { useState } from "react";
import type { StrategyResult } from "../../../../lib/agents/run";
import { STRATEGY_TOPICS } from "../../../../lib/agents/schemas";
import type { Fact } from "../../../../lib/facts/types";
import { evidenceText, FIXED_CREDITS, type SourceRow } from "../../../../lib/report";
import FactSheetTable from "../../../_components/FactSheetTable";
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

function EvidenceTab({ facts, sources }: { facts: Fact[]; sources: SourceRow[] }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <Card title="事実シート" className="min-w-0">
        <FactSheetTable facts={facts} />
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
