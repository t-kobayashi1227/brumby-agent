"use client";

import { useState } from "react";
import type { MediaOutput, StrategyOutput } from "../../../../lib/agents/schemas";
import { STRATEGY_TOPICS } from "../../../../lib/agents/schemas";
import type { simulate } from "../../../../lib/calc/budget";
import type { Fact } from "../../../../lib/facts/types";
import { evidenceText, FIXED_CREDITS, type SourceRow } from "../../../../lib/report";
import UnderlineTabs from "../../../_components/UnderlineTabs";
import { card } from "../../../_lib/ui";
import MediaDonut, { MEDIA_COLORS } from "./MediaDonut";

// ⑤販売戦略レポート（docs/設計まとめ.md「⑤画面の表示」）。「エリア分析・販売戦略・根拠データ」の3タブ
// 画面では AI を動かさず、保存した結果（strategy_runs.result）と事実シートを出すだけ。金額は lib/calc/budget.ts で計算済み

export interface StrategyResult {
  fact_sheet_id: number;
  戦略: StrategyOutput;
  媒体: MediaOutput;
  予算シミュレーション: ReturnType<typeof simulate>;
}

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

/** 文の下に小さく出す根拠。押すと事実ID・出典・時点が見える */
function Evidence({ ids, facts }: { ids: string[]; facts: Map<string, Fact> }) {
  const list = [...new Set(ids.map((i) => i.trim()).filter(Boolean))];
  if (list.length === 0) return null;
  return (
    <details className="mt-1 text-[11px] text-muted group">
      <summary className="cursor-pointer list-none marker:hidden">
        根拠：{list.map((id) => (facts.get(id) ? evidenceText(facts.get(id)!) : `${id}（事実シートにないID）`)).join("／")}
      </summary>
      <div className="mt-1 ml-3 grid gap-0.5">
        {list.map((id) => {
          const f = facts.get(id);
          return (
            <div key={id}>
              <span className="font-mono">{id}</span>
              {f ? `：${f.出典}（${f.時点}）${f.状態 !== "取得" ? `・${f.状態}` : ""}` : "：事実シートにありません"}
            </div>
          );
        })}
      </div>
    </details>
  );
}

function Block({ no, title, children }: { no?: number; title: string; children: React.ReactNode }) {
  return (
    <section className={`${card} p-5 break-inside-avoid`}>
      <div className="flex items-center gap-2 mb-3">
        {no !== undefined && <span className="w-5 h-5 rounded bg-brand text-white text-[11px] font-bold grid place-items-center">{no}</span>}
        <h2 className="text-[14px] font-bold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Text({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-ink leading-relaxed">{children}</p>;
}

function Label({ children, tone = "default" }: { children: React.ReactNode; tone?: "default" | "strong" }) {
  return (
    <span className={`inline-block px-2 py-0.5 rounded text-[12px] font-bold ${tone === "strong" ? "bg-brand text-white" : "bg-primary-soft text-brand"}`}>{children}</span>
  );
}

function StrategyTab({ r, facts, sources, credits, mediaNames }: { r: StrategyResult; facts: Map<string, Fact>; sources: SourceRow[]; credits: string[]; mediaNames: Record<string, string> }) {
  const m = r.戦略;
  const media = r.媒体;
  const targets = [...m.targets].sort((a, b) => a.rank - b.rank);
  const appeals = [...m.appeals].sort((a, b) => a.rank - b.rank).slice(0, 3);
  const sims = r.予算シミュレーション;
  const inputSim = sims.find((s) => s.isInput) ?? null;
  const nameOf = (id: string, fallback: string) => mediaNames[id] ?? fallback;
  return (
    <div className="grid gap-4">
      <Block no={1} title="総合評価">
        <Text>{m.summary.text}</Text>
        <Evidence ids={m.summary.evidence} facts={facts} />
      </Block>

      <Block no={2} title="狙う層">
        <div className="grid gap-3">
          {targets.map((t) => (
            <div key={`${t.rank}-${t.name}`} className="border-l-4 border-brand pl-3">
              <div className="flex flex-wrap items-center gap-2">
                <Label tone={t.rank === 1 ? "strong" : "default"}>第{t.rank}ターゲット</Label>
                <span className="text-[14px] font-bold text-ink">{t.name}</span>
                {t.source === "エージェント提案" && <span className="text-[11px] text-muted">（AIが加えた候補）</span>}
              </div>
              {t.source === "エージェント提案" && t.definition && <div className="text-[12px] text-body mt-1">どんな世帯か：{t.definition}</div>}
              <div className="mt-1">
                <Text>{t.reason}</Text>
              </div>
              <Evidence ids={t.evidence} facts={facts} />
            </div>
          ))}
        </div>
        {m.not_fit.length > 0 && (
          <div className="mt-4 pt-3 border-t border-divider">
            <div className="text-[11px] font-bold text-muted mb-1">合わない層</div>
            {m.not_fit.map((n, i) => (
              <div key={i} className="text-[12px] text-body">
                {n.name}：{n.reason}
                <Evidence ids={n.evidence} facts={facts} />
              </div>
            ))}
          </div>
        )}
      </Block>

      <Block no={3} title="訴求ポイント">
        <ol className="grid gap-3">
          {appeals.map((a, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-[13px] font-bold text-brand">{i + 1}.</span>
              <div>
                <Text>{a.text}</Text>
                <Evidence ids={a.evidence} facts={facts} />
              </div>
            </li>
          ))}
        </ol>
      </Block>

      <Block no={4} title="価格の見方">
        <div className="flex flex-wrap gap-2 mb-2">
          <Label tone="strong">{m.price_view.position}</Label>
          <Label>{m.price_view.sellability}</Label>
        </div>
        <Text>{m.price_view.text}</Text>
        <Evidence ids={m.price_view.evidence} facts={facts} />
        <div className="mt-3 text-[11px] text-muted">周辺の取引と比べた目安であり、価格の査定や保証ではありません。</div>
      </Block>

      <Block no={5} title="懸念点">
        <ul className="grid gap-3">
          {[...m.concerns, ...media.cautions].map((c, i) => (
            <li key={i} className="border-l-4 border-accent pl-3">
              <Text>{c.text}</Text>
              <Evidence ids={c.evidence} facts={facts} />
            </li>
          ))}
        </ul>
      </Block>

      <Block no={6} title="販売の方向性">
        <Text>{m.direction.text}</Text>
        <Evidence ids={m.direction.evidence} facts={facts} />
      </Block>

      <Block no={7} title="媒体と予算">
        <div className="flex flex-wrap gap-6 items-start">
          <MediaDonut items={media.media.map((x) => ({ label: nameOf(x.id, x.name), share: x.share }))} />
          <div className="flex-1 min-w-[320px] overflow-x-auto">
            <table className="w-full text-[12px] text-ink border-collapse">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-2 pr-2 font-normal">媒体</th>
                  <th className="py-2 pr-2 font-normal">目的</th>
                  <th className="py-2 pr-2 font-normal">想定ターゲット</th>
                  <th className="py-2 pr-2 font-normal text-right">配分</th>
                  {inputSim && <th className="py-2 font-normal text-right">金額（総額{inputSim.totalManYen}万円）</th>}
                </tr>
              </thead>
              <tbody>
                {media.media.map((x, i) => (
                  <tr key={x.id} className="align-top border-b border-canvas">
                    <td className="py-2 pr-2">
                      <span className="inline-block w-2.5 h-2.5 rounded-sm mr-1.5 align-middle" style={{ background: MEDIA_COLORS[i % MEDIA_COLORS.length] }} />
                      <span className="font-bold">{nameOf(x.id, x.name)}</span>
                      <div className="text-[12px] text-body mt-1 font-normal">{x.reason}</div>
                      <Evidence ids={x.evidence} facts={facts} />
                    </td>
                    <td className="py-2 pr-2 text-body whitespace-nowrap">{x.purpose}</td>
                    <td className="py-2 pr-2 text-body">{x.target}</td>
                    <td className="py-2 pr-2 text-right font-bold whitespace-nowrap">{x.share}%</td>
                    {inputSim && <td className="py-2 text-right whitespace-nowrap">{manYen(inputSim.rows.find((row) => row.id === x.id)?.amountManYen ?? 0)}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Block>

      <Block no={8} title="予算シミュレーション">
        <div className="text-[12px] text-accent mb-2">参考の配分を示した試算です。正式な費用・見積もりではありません。</div>
        <div className="overflow-x-auto">
          <table className="w-full text-[12px] text-ink border-collapse">
            <thead>
              <tr className="text-muted border-b border-line">
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
      </Block>

      <Block no={9} title="出典の一覧">
        <table className="w-full text-[12px] text-body border-collapse mb-3">
          <tbody>
            {sources.map((s) => (
              <tr key={`${s.出典}|${s.時点}`} className="border-b border-canvas">
                <td className="py-1.5 pr-3">{s.出典}</td>
                <td className="py-1.5 whitespace-nowrap text-muted">{s.時点}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="grid gap-1 text-[11px] text-muted">
          {[...credits, ...FIXED_CREDITS].map((c) => (
            <div key={c}>{c}</div>
          ))}
        </div>
      </Block>
    </div>
  );
}

function AreaTab({ r, facts }: { r: StrategyResult; facts: Map<string, Fact> }) {
  const { analysis, unknown } = r.戦略;
  return (
    <div className="grid gap-4">
      {TOPIC_ORDER.map((topic) => {
        const items = analysis.filter((a) => a.topic === topic);
        if (items.length === 0) return null;
        return (
          <Block key={topic} title={TOPIC_TITLE[topic]}>
            <ul className="grid gap-4">
              {items.map((a, i) => (
                <li key={i} className="grid gap-1">
                  <div className="text-[12px] text-body">{a.fact}</div>
                  <div>
                    <span className="text-[11px] font-bold text-brand mr-1.5">買い手にとって</span>
                    <span className="text-[13px] text-ink leading-relaxed">{a.meaning}</span>
                  </div>
                  <div>
                    <span className="text-[11px] font-bold text-brand mr-1.5">販売での使い方</span>
                    <span className="text-[13px] text-ink leading-relaxed">{a.use}</span>
                  </div>
                  <Evidence ids={a.evidence} facts={facts} />
                </li>
              ))}
            </ul>
          </Block>
        );
      })}
      {unknown.length > 0 && (
        <Block title="事実シートから分からないこと">
          <ul className="grid gap-1 text-[12px] text-body">
            {unknown.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
        </Block>
      )}
    </div>
  );
}

function EvidenceTab({ facts }: { facts: Fact[] }) {
  return (
    <div className={`${card} p-5 overflow-x-auto`}>
      <table className="w-full text-[12px] text-ink border-collapse">
        <thead>
          <tr className="text-left text-muted border-b border-line">
            {["ID", "項目", "値", "比較", "出典", "時点", "状態"].map((h) => (
              <th key={h} className="py-2 pr-2 font-normal whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {facts.map((f) => (
            <tr key={f.id} className="align-top border-b border-canvas">
              <td className="py-2 pr-2 font-mono whitespace-nowrap">{f.id}</td>
              <td className="py-2 pr-2">{f.項目}</td>
              <td className={`py-2 pr-2 ${f.値 === null ? "text-muted" : ""}`}>{f.値 ?? "不明"}</td>
              <td className="py-2 pr-2 text-body">{f.比較 ?? ""}</td>
              <td className="py-2 pr-2 text-body">{f.出典}</td>
              <td className="py-2 pr-2 text-body">{f.時点}</td>
              <td className={`py-2 whitespace-nowrap ${f.状態 === "取得" ? "text-body" : "text-muted"}`}>{f.状態}</td>
            </tr>
          ))}
        </tbody>
      </table>
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
      {tab === "strategy" && <StrategyTab r={result} facts={byId} sources={sources} credits={credits} mediaNames={mediaNames} />}
      {tab === "area" && <AreaTab r={result} facts={byId} />}
      {tab === "evidence" && <EvidenceTab facts={facts} />}
      <div className="mt-6 text-[11px] text-muted">このレポートは公開データと物件情報をもとにAIが作成した販売戦略の参考です。</div>
    </div>
  );
}
