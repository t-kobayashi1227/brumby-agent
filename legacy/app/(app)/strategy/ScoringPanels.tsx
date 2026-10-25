import { ITEM_LABEL } from "../../../lib/scoring/constants";
import type { AffordabilityDetail, CompetitorComparison, InputValue, LayerResult, PersonaResult, SalabilityResult } from "../../../lib/scoring/types";
import { card, statBox, tableHead } from "../../_lib/ui";

// 採点ルール表（設計書 D35）の評価結果と評価理由。/strategy の販売戦略タブ・根拠データタブに出す

export interface ScoringView {
  personas: PersonaResult[];
  inputs: Record<string, InputValue>;
  comparison: { hasCompetitors: boolean; items: CompetitorComparison[] };
  salability: SalabilityResult | null;
  budget: { initialManYen: number | null; additionalManYen: number | null; addRule: string | null; suggestion: string | null; multiplier: number | null };
}

const LAYER_ORDER = ["物件", "購入可能性", "生活環境", "市場", "競合"] as const;

const MARK_CLASS: Record<string, string> = {
  "◎": "bg-[#dcf5df] text-[#157347]",
  "〇": "bg-primary-soft text-primary",
  "－": "bg-divider text-muted",
  "△": "bg-[#fef3c2] text-[#92610d]",
  "×": "bg-[#fde2e1] text-[#b91c1c]",
};

const BASIS_CLASS: Record<string, string> = {
  統計: "border-[#bfe5c6] text-[#157347]",
  BRUMBY実務: "border-[#bfe5c6] text-[#157347]",
  仮説: "border-[#f0d9a8] text-[#8a5a00]",
  BRUMBY確認: "border-[#f0d9a8] text-[#8a5a00]",
};

const itemLabel = (key: string) => ITEM_LABEL[key] ?? key;

function fmtValue(key: string, v: number | null): string {
  if (v === null) return "—";
  if (key === "平屋" || key === "庭") return v ? "はい" : "いいえ";
  if (key.endsWith("_市比") || key.endsWith("_5年変化") || key === "価格_相場比") return `${v.toFixed(2)}`;
  const unit = key.endsWith("_万円") ? "万円" : key.endsWith("_㎡") ? "㎡" : key.endsWith("_m") ? "m" : key.endsWith("_台") ? "台" : key === "築年数" ? "年" : key === "部屋数" ? "室" : key === "保育園_800m内" ? "か所" : "";
  return `${v.toLocaleString("ja-JP")}${unit}`;
}

function ScoreBar({ score, strong }: { score: number | null; strong?: boolean }) {
  if (score === null) return <span className="text-[10px] text-muted">データなし</span>;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 rounded-full bg-divider overflow-hidden min-w-8">
        <div className={`h-full rounded-full ${strong ? "bg-primary" : "bg-[#9cc0ee]"}`} style={{ width: `${Math.max(0, Math.min(100, score))}%` }} />
      </div>
      <span className="text-[11px] font-bold text-ink w-6 text-right">{score}</span>
    </div>
  );
}

function LayerReasons({ layer, inputs }: { layer: LayerResult; inputs: Record<string, InputValue> }) {
  if (layer.layer === "購入可能性") {
    const d = layer.detail as AffordabilityDetail | undefined;
    if (layer.score === null || !d) return <div className="text-xs text-muted">価格が入っていないため、判断できません。</div>;
    return (
      <div className="text-xs text-body leading-[1.8]">
        {d.method === "loan" ? (
          <>
            借入 {d.loanManYen?.toLocaleString("ja-JP")}万円・{d.years}年 → 年間返済 約{d.annualRepaymentManYen}万円 → 必要年収 約{d.requiredIncomeManYen}万円。
            このペルソナの世帯の <b>{((d.share ?? 0) * 100).toFixed(1)}%</b> が上回る（ローン審査ではありません）。
          </>
        ) : (
          <>
            今の家の売却見込みと貯蓄で購入する想定。必要な貯蓄 約{d.requiredSavingsManYen?.toLocaleString("ja-JP")}万円 → 世帯の <b>{((d.share ?? 0) * 100).toFixed(1)}%</b> が上回る。
          </>
        )}
        <div className="mt-1 inline-block rounded bg-primary-soft px-2 py-0.5 text-[11px] font-bold text-primary">ターゲット像：{d.targetImage}</div>
      </div>
    );
  }
  if (layer.layer === "競合") {
    if (layer.score === null) return <div className="text-xs text-muted">競合物件が入力されていないため、この層は総合から外しています。</div>;
    return <div className="text-xs text-body">競合と比べた項目ごとの勝ち負けを、このペルソナの重視度で重み付けしています（下の「競合との比較」）。</div>;
  }
  const hits = (layer.hits ?? []).filter((h) => h.mark !== null);
  return (
    <div className="grid gap-1">
      {hits.length === 0 && <div className="text-xs text-muted">当てはまったルールはありません。</div>}
      {hits.map((h) => (
        <div key={h.id} className="flex gap-2 items-start text-xs text-body">
          <span className={`shrink-0 w-6 text-center rounded font-bold ${MARK_CLASS[h.mark ?? "－"]}`}>{h.mark}</span>
          <span className={`shrink-0 w-9 text-right font-bold ${h.points > 0 ? "text-[#157347]" : h.points < 0 ? "text-[#b91c1c]" : "text-muted"}`}>
            {h.points > 0 ? "+" : ""}
            {h.points}
          </span>
          <span className="flex-1 leading-[1.6]">
            {h.reason}
            {/* 当てはまった値（施設名など）。事実カードの文があればそれ、なければ値 */}
            {inputs[h.itemKey] && (
              <span className="ml-1 text-muted">
                — {inputs[h.itemKey].text ?? fmtValue(h.itemKey, inputs[h.itemKey].value)}
              </span>
            )}
            <span className="ml-1 text-[10px] text-muted">{h.id}</span>
          </span>
          {h.basisClass && <span className={`shrink-0 px-1.5 rounded border text-[10px] ${BASIS_CLASS[h.basisClass] ?? "border-line text-muted"}`}>{h.basisClass}</span>}
        </div>
      ))}
      {layer.max !== undefined && (
        <div className="text-[10px] text-muted mt-1">
          素点 {layer.raw} ÷ 満点 {layer.max} → {layer.score ?? "—"}点
          {layer.missing && layer.missing.length > 0 && <>　データなしで外した項目：{layer.missing.map(itemLabel).join("・")}</>}
        </div>
      )}
    </div>
  );
}

/** 全ペルソナの総合点と5つの層、開くと評価理由 */
export function TargetEvaluation({ scoring }: { scoring: ScoringView }) {
  return (
    <div className={`${card} p-5`} id="evaluation">
      <div className="text-[13px] font-bold text-ink">ターゲットの評価（採点ルール表）</div>
      <div className="text-[11px] text-muted mt-1 mb-4 leading-[1.7]">
        ペルソナごとに5つの層を0〜100点で採点し、層の重みで合わせた点（85%）と、統計上の買い手の多さ（15%）で総合点を出しています。行を開くと評価理由（当てはまったルール）を確認できます。
      </div>
      <div className={`${tableHead} grid-cols-[28px_minmax(140px,1.6fr)_64px_repeat(5,minmax(56px,1fr))_64px] text-[11px] text-muted`}>
        <div>順位</div>
        <div>ペルソナ</div>
        <div>総合</div>
        {LAYER_ORDER.map((l) => (
          <div key={l}>{l}</div>
        ))}
        <div>買い手の多さ</div>
      </div>
      {scoring.personas.map((p) => (
        <details key={p.id} className="border-b border-divider group" open={p.rank === 1}>
          <summary className="grid grid-cols-[28px_minmax(140px,1.6fr)_64px_repeat(5,minmax(56px,1fr))_64px] gap-2 items-center py-2.5 px-1 cursor-pointer list-none">
            <div className={`size-6 rounded-full text-white text-[11px] font-bold flex items-center justify-center ${p.rank <= 3 ? "bg-primary" : "bg-[#9aa6ba]"}`}>{p.rank}</div>
            <div className="min-w-0">
              <div className="text-[13px] font-bold text-ink truncate">
                <span className="text-muted mr-1">{p.id}</span>
                {p.label}
              </div>
              {p.targetImage && <div className="text-[10px] text-muted truncate">{p.targetImage}</div>}
            </div>
            <div className="text-[15px] font-extrabold text-primary">{p.total}</div>
            {LAYER_ORDER.map((l) => (
              <ScoreBar key={l} score={p.layers.find((x) => x.layer === l)?.score ?? null} strong={p.rank === 1} />
            ))}
            <ScoreBar score={p.buyerScore} />
          </summary>
          <div className="grid gap-3 pb-4 pl-9 pr-1 lg:grid-cols-2">
            {LAYER_ORDER.map((l) => {
              const layer = p.layers.find((x) => x.layer === l);
              if (!layer) return null;
              return (
                <div key={l} className={`${statBox} p-3`}>
                  <div className="flex items-baseline gap-2 mb-2">
                    <span className="text-xs font-bold text-ink">{l}</span>
                    <span className="text-xs font-bold text-primary">{layer.score === null ? "データなし" : `${layer.score}点`}</span>
                  </div>
                  <LayerReasons layer={layer} inputs={scoring.inputs} />
                </div>
              );
            })}
          </div>
        </details>
      ))}
      <CompetitorTable comparison={scoring.comparison} />
    </div>
  );
}

function CompetitorTable({ comparison }: { comparison: ScoringView["comparison"] }) {
  if (comparison.items.length === 0) return null;
  return (
    <div className="mt-5">
      <div className="text-xs font-bold text-ink mb-2">競合との比較{comparison.hasCompetitors ? "" : "（競合が未入力のため、同じ区・築年数区分の取引の中央値と比較）"}</div>
      <div className={`${tableHead} grid-cols-[1fr_1fr_1.4fr_0.8fr] text-[11px] text-muted`}>
        <div>項目</div>
        <div>この物件</div>
        <div>比べた相手</div>
        <div>勝ち−負け</div>
      </div>
      {comparison.items.map((c) => (
        <div key={c.key} className="grid grid-cols-[1fr_1fr_1.4fr_0.8fr] gap-2 py-1.5 px-1 border-b border-divider text-xs text-body">
          <div>{c.label}</div>
          <div>{fmtValue(c.key, c.own)}</div>
          <div className="text-muted">
            {c.against === "競合" ? `競合 ${c.others.map((o) => fmtValue(c.key, o)).join("・")}` : c.against === "周辺の取引" ? `周辺の取引 ${fmtValue(c.key, c.median)}` : "比べられない"}
          </div>
          <div className={`font-bold ${c.net > 0 ? "text-[#157347]" : c.net < 0 ? "text-[#b91c1c]" : "text-muted"}`}>
            {c.net > 0 ? "+" : ""}
            {Math.round(c.net * 100) / 100}
          </div>
        </div>
      ))}
    </div>
  );
}

/** 採点に使った値と出どころ（根拠データタブ） */
export function ScoringInputsTable({ inputs }: { inputs: Record<string, InputValue> }) {
  const rows = Object.entries(inputs);
  return (
    <div className={`${card} p-5`}>
      <div className="text-[13px] font-bold text-ink mb-1">採点に使った値</div>
      <div className="text-[11px] text-muted mb-3">「データなし」の項目は採点から外しています。物件の画面で手入力すると、次の分析から使います。</div>
      <div className={`${tableHead} grid-cols-[1.4fr_0.8fr_1fr_1.6fr] text-[11px] text-muted`}>
        <div>項目</div>
        <div>値</div>
        <div>出どころ</div>
        <div>説明</div>
      </div>
      {rows.map(([key, v]) => (
        <div key={key} className={`grid grid-cols-[1.4fr_0.8fr_1fr_1.6fr] gap-2 py-1.5 px-1 border-b border-divider text-xs ${v.value === null ? "text-muted" : "text-body"}`}>
          <div>{itemLabel(key)}</div>
          <div className="font-bold">{fmtValue(key, v.value)}</div>
          <div>{v.source}</div>
          <div className="text-muted">{v.text ?? ""}</div>
        </div>
      ))}
    </div>
  );
}

/** 売れやすさと予算の内訳（「どこで・いくらで」の下に出す） */
export function SalabilityDetail({ scoring }: { scoring: ScoringView }) {
  const s = scoring.salability;
  const b = scoring.budget;
  if (!s) return null;
  return (
    <div className="mt-4 grid gap-2 text-[11px] text-body">
      <div className="flex items-center gap-2">
        <span className="font-bold text-ink">売れやすさ {s.score ?? "—"}点</span>
        {s.class && <span className="px-2 py-0.5 rounded-full bg-primary-soft text-primary font-bold">{s.class}</span>}
      </div>
      <div className="text-muted leading-[1.7]">
        エリア人気 {s.popularity.score ?? "—"}点（{s.popularity.label}）・価格の相場比 {s.priceRatio.value?.toFixed(2) ?? "—"}倍（{s.priceRatio.score ?? "—"}点）・第1ターゲットの適合度 {s.fit.score ?? "—"}点
      </div>
      {b.initialManYen !== null && (
        <div>
          最初に <b>{b.initialManYen}万円</b>、残り {b.additionalManYen}万円は{b.addRule?.replace(/なら追加$/, "ときに追加")}
        </div>
      )}
      {b.suggestion && <div className="rounded bg-subtle px-2 py-1.5">{b.suggestion}</div>}
    </div>
  );
}

export interface MediaEvaluationRow {
  id: string;
  label: string;
  formatExample: string;
  amount: number;
  initialManYen: number | null;
  reach: number;
  rank: number;
  selected: boolean;
  basis: { kind: "usage"; statName: string; targetUsage: number; allAges: number } | { kind: "flat"; flatReach: number } | null;
  coefficient: number;
  targetLabel: string | null;
}

/** 広告媒体の評価（Excel：媒体配分・試算シート⑧）。届きやすさの順に、配分に使った媒体と使わなかった媒体を並べる */
export function MediaEvaluation({ rows, scoring }: { rows: MediaEvaluationRow[]; scoring: ScoringView }) {
  const sorted = [...rows].sort((a, b) => a.rank - b.rank || a.label.localeCompare(b.label));
  const used = sorted.filter((r) => r.selected).length;
  const maxReach = Math.max(0, ...rows.map((r) => r.reach));
  const target = rows.find((r) => r.targetLabel)?.targetLabel ?? scoring.personas[0]?.label ?? "第1ターゲット";
  const cols = "grid-cols-[28px_1.3fr_0.7fr_1.9fr_0.6fr_0.9fr_1.8fr]";
  return (
    <div className={`${card} p-5`}>
      <div className="text-[13px] font-bold text-ink mb-1">広告媒体の評価（第1ターゲット：{target}）</div>
      <div className="text-[11px] text-muted mb-3 leading-[1.7]">
        届きやすさ＝第1ターゲットの年代構成で平均した利用率² ÷ 全年代の利用率 × 反響係数（統計がない媒体は一律の値）。よく使われていて、しかもこのターゲットに多い媒体ほど高くなります。上位{used}媒体に、届きやすさの比率で予算を配分しています。
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className={`${tableHead} ${cols} text-[11px] text-muted`}>
            <div>順位</div>
            <div>媒体</div>
            <div>届きやすさ</div>
            <div>根拠</div>
            <div>反響係数</div>
            <div>配分（最初に使う額）</div>
            <div>形式の例</div>
          </div>
          {sorted.map((r) => (
            <div key={r.id} className={`grid ${cols} gap-2 py-2 px-1 border-b border-divider text-xs items-center ${r.selected ? "text-body" : "text-muted"}`}>
              <div className={`size-5 rounded-full text-[10px] font-bold flex items-center justify-center ${r.selected ? "bg-primary text-white" : "bg-divider text-muted"}`}>{r.rank}</div>
              <div className={r.selected ? "font-bold text-ink" : ""}>{r.label}</div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1.5 rounded-full bg-divider overflow-hidden min-w-8">
                  <div className={`h-full rounded-full ${r.selected ? "bg-primary" : "bg-[#c4ccd8]"}`} style={{ width: `${maxReach > 0 ? (r.reach / maxReach) * 100 : 0}%` }} />
                </div>
                <span className="text-[11px] font-bold text-ink w-9 text-right">{Math.round(r.reach * 10) / 10}</span>
              </div>
              <div className="leading-[1.6]">
                {r.basis?.kind === "usage"
                  ? `${r.basis.statName}の利用率：このターゲット ${r.basis.targetUsage}%／全年代 ${r.basis.allAges}%`
                  : r.basis?.kind === "flat"
                    ? `年代別の統計なし（一律 ${r.basis.flatReach}）`
                    : "—"}
              </div>
              <div className={r.coefficient !== 1 ? "font-bold text-ink" : ""}>{r.coefficient.toFixed(2)}</div>
              <div>
                {r.selected ? (
                  <>
                    <span className="font-bold text-ink">{r.amount}万円</span>
                    {r.initialManYen !== null && <span className="text-muted">（{r.initialManYen}万円）</span>}
                  </>
                ) : (
                  <span>使わない（上位{used}に入らない）</span>
                )}
              </div>
              <div className="leading-[1.6]">{r.selected ? r.formatExample : ""}</div>
            </div>
          ))}
        </div>
      </div>
      <div className="text-[10px] text-muted mt-2">
        利用率：総務省「情報通信メディアの利用時間と情報行動に関する調査」。反響係数は /rules の「媒体・反響」の記録から計算（問い合わせが少ないうちは1.00）。
      </div>
    </div>
  );
}
