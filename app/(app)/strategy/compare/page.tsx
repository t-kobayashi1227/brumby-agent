import Link from "next/link";
import { getSql } from "../../../../lib/db";
import type { AppealRankItem } from "../../../../lib/rules/engine";
import { cardName } from "../../../../lib/rules/describe";
import { findFact, listProperties, loadReport, mediaBreakdown, targetRanking, type ReportData } from "../../../../lib/report";
import PropertyPicker from "../../../_components/PropertyPicker";
import { card, emptyState } from "../../../_lib/ui";
import { scoringSchemaReady } from "../../../../lib/scoring/schema-check";

// 前回の結果と並べて比べる（設計書 5.2・7章）。条件を変えた再実行や、再現性の確認（同じ条件で3回）に使う
// ?property=<id>&a=<実行>&b=<実行>。省略時は最新の成功した2回（a＝前回、b＝今回）
export const dynamic = "force-dynamic";

const fmt = (d: Date) => new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

interface RunRow {
  id: number;
  created_at: Date;
  params: Record<string, unknown>;
  rules_version: number | null;
  scoring_version: number | null;
}

/** 比べる行：左（a）と右（b）の文字。違えば印を付ける */
interface Row {
  label: string;
  a: string;
  b: string;
}

function Table({ title, rows, note }: { title: string; rows: Row[]; note?: string }) {
  const changed = rows.filter((r) => r.a !== r.b).length;
  return (
    <div className={`${card} p-5`}>
      <div className="flex items-baseline gap-3 mb-2">
        <div className="text-[14px] font-bold text-ink">{title}</div>
        <div className={`text-[11px] ${changed ? "text-[#b45309] font-bold" : "text-muted"}`}>{changed ? `違い ${changed}件` : "違いなし"}</div>
      </div>
      {note && <div className="text-[11px] text-muted mb-2">{note}</div>}
      <table className="w-full text-[12px] border-collapse">
        <tbody>
          {rows.map((r) => {
            const diff = r.a !== r.b;
            return (
              <tr key={r.label} className={`border-b border-divider align-top ${diff ? "bg-[#fff8e8]" : ""}`}>
                <td className="py-1.5 pr-2 w-52 text-muted">
                  {diff && <span className="mr-1 text-[#b45309] font-bold">●</span>}
                  {r.label}
                </td>
                <td className="py-1.5 pr-3 w-[38%]">{r.a}</td>
                <td className={`py-1.5 ${diff ? "font-bold text-ink" : ""}`}>{r.b}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function paramsText(run: RunRow) {
  const p = run.params;
  return {
    radius: typeof p.radius_m === "number" ? `${p.radius_m.toLocaleString("ja-JP")}m` : "—",
    price: `直近${p.price_years ?? "?"}年・${p.price_min_n ?? "?"}件以上`,
    age: Array.isArray(p.target_age) ? `${p.target_age[0]}〜${p.target_age[1]}歳` : "—",
    narrow: `1位${p.min_top_score ?? 2}点以上・同点の幅${p.tie_margin ?? 0}`,
  };
}

function decisions(r: ReportData) {
  const ranking = targetRanking(r.facts);
  const appeals = ((((findFact(r.facts, "decision.appeals")?.basis ?? {}) as { items?: AppealRankItem[] }).items) ?? []).filter((a) => a.selected);
  const budget = findFact(r.facts, "decision.total_budget");
  const source = (budget?.basis as { source?: string } | null)?.source;
  const media = mediaBreakdown(r.facts);
  const rank = findFact(r.facts, "decision.target_rank");
  return {
    // 採点ルール表（D35）の実行は総合点（100点満点）、古い実行はルールの点の合計/満点
    rank: (rank?.basis as { unresolved?: boolean } | null)?.unresolved
      ? "絞り込めない"
      : ranking.filter((t) => t.rank === 1).map((t) => `${t.label}（${t.score}/${t.max}点）`).join("・") || "—",
    method: (rank?.basis as { method?: string } | null)?.method === "scoring" ? "採点ルール表" : "旧ルール（点の足し上げ）",
    order: ranking.map((t) => `${t.rank}. ${t.label} ${t.available ? `${t.score}点` : "—"}`).join(" ／ ") || "—",
    appeals: appeals.map((a) => a.label).join("・") || "なし",
    budget: budget && budget.value !== null ? `${budget.value}万円（${source === "input" ? "入力値" : "提案値"}）` : "決まっていない",
    media: Object.fromEntries(media.map((m) => [m.label, `${m.amount}万円（${Math.round(m.share * 100)}%）`])),
  };
}

export default async function ComparePage({ searchParams }: PageProps<"/strategy/compare">) {
  const sp = await searchParams;
  const sql = getSql();
  const properties = await listProperties(sql);
  const propertyId = Number(sp.property) > 0 ? Number(sp.property) : properties[0]?.id ?? 0;
  const picker = <PropertyPicker properties={properties} current={propertyId} href={(id) => `/strategy/compare?property=${id}`} />;

  const runs = await sql<RunRow[]>`
    select id, created_at, params, rules_version, ${(await scoringSchemaReady(sql)) ? sql`scoring_version` : sql`null::bigint as scoring_version`} from analysis_runs
    where property_id = ${propertyId} and status = 'succeeded' order by id desc limit 20
  `;
  if (runs.length < 2) {
    return <>{picker}<div className={emptyState}>比べるには、この物件の成功した分析が2回以上必要です（販売戦略の画面の「分析する」で、条件を変えて実行してください）。</div></>;
  }
  // bigint の id は文字列で返るので、数にしてから比べる
  const pick = (v: unknown, fallback: number) => (runs.some((r) => Number(r.id) === Number(v)) ? Number(v) : fallback);
  const bId = pick(sp.b, Number(runs[0].id));
  const aId = pick(sp.a, Number(runs.find((r) => Number(r.id) !== bId)?.id ?? runs[1].id));
  const [A, B] = await Promise.all([loadReport(sql, propertyId, aId), loadReport(sql, propertyId, bId)]);
  if (!A || !B) return <>{picker}<div className={emptyState}>実行が見つかりません。</div></>;
  const runA = runs.find((r) => Number(r.id) === aId)!;
  const runB = runs.find((r) => Number(r.id) === bId)!;

  const pa = paramsText(runA);
  const pb = paramsText(runB);
  const conditions: Row[] = [
    { label: "人口構成の半径", a: pa.radius, b: pb.radius },
    { label: "相場の期間・件数", a: pa.price, b: pb.price },
    { label: "狙う層の年齢", a: pa.age, b: pb.age },
    { label: "絞り込みの基準", a: pa.narrow, b: pb.narrow },
    { label: "ルールの版", a: String(runA.rules_version ?? "—"), b: String(runB.rules_version ?? "—") },
    { label: "採点ルール表の版", a: String(runA.scoring_version ?? "—"), b: String(runB.scoring_version ?? "—") },
  ];

  const da = decisions(A);
  const db = decisions(B);
  const mediaKeys = [...new Set([...Object.keys(da.media), ...Object.keys(db.media)])];
  const decisionRows: Row[] = [
    { label: "評価の方式", a: da.method, b: db.method },
    { label: "狙う層（1位）", a: da.rank, b: db.rank },
    { label: "狙う層の順位", a: da.order, b: db.order },
    { label: "選んだ訴求", a: da.appeals, b: db.appeals },
    { label: "総予算", a: da.budget, b: db.budget },
    ...mediaKeys.map((k) => ({ label: k, a: da.media[k] ?? "—", b: db.media[k] ?? "—" })),
  ];

  const factText = (r: ReportData, key: string) => {
    const f = findFact(r.facts, key);
    if (!f) return "—";
    if (f.status !== "ok") return f.status === "insufficient" ? "データ不足" : "データなし";
    return f.valueText ?? (f.value !== null ? `${f.value}${f.unit ?? ""}` : "—");
  };
  const factKeys = [...new Set([...A.facts, ...B.facts].filter((f) => f.kind === "fact").map((f) => f.key))];
  const factRows: Row[] = factKeys.map((k) => ({ label: cardName(k), a: factText(A, k), b: factText(B, k) }));
  // 違うものを上にまとめる
  factRows.sort((x, y) => Number(y.a !== y.b) - Number(x.a !== x.b));

  const headline = (r: ReportData) =>
    !r.narrative ? "AIの文章なし" : r.narrative.status === "failed" ? "生成できませんでした" : `${r.narrative.content.headline.text}（${r.narrative.status === "ok" ? "検証合格" : "要確認あり"}）`;

  const runLink = (a: number, b: number) => `/strategy/compare?property=${propertyId}&a=${a}&b=${b}`;

  return (
    <>
      {picker}
      <div className={`${card} p-5 mb-4`}>
        <div className="text-[15px] font-bold text-ink mb-3">前回の結果と比べる</div>
        <div className="grid grid-cols-2 gap-4 text-[12px]">
          {[
            { side: "左（前回）", current: aId, other: bId, make: (id: number) => runLink(id, bId) },
            { side: "右（今回）", current: bId, other: aId, make: (id: number) => runLink(aId, id) },
          ].map((s) => (
            <div key={s.side}>
              <div className="text-muted mb-1">{s.side}</div>
              <div className="flex flex-wrap gap-1.5">
                {runs.map((r) => (
                  <Link
                    key={r.id}
                    href={s.make(Number(r.id))}
                    className={`px-2 py-1 rounded border ${Number(r.id) === s.current ? "border-brand text-brand font-bold" : Number(r.id) === s.other ? "border-line text-muted opacity-50" : "border-line text-body"}`}
                  >
                    実行{r.id}・{fmt(r.created_at)}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="text-[11px] text-muted mt-3">
          違う行には ● を付け、右の値を太字にしています。同じ条件で実行した結果が一致するかの確認（再現性）にも使えます。
          <Link href={`/strategy?property=${propertyId}`} className="text-brand underline ml-2">販売戦略の画面へ</Link>
        </div>
      </div>

      <div className="grid gap-4">
        <Table title={`条件（実行${aId} → 実行${bId}）`} rows={conditions} />
        <Table title="ルール表による判断" rows={decisionRows} />
        <Table title="AIの文章（見出し）" rows={[{ label: "総合評価", a: headline(A), b: headline(B) }]} note="AIの文章は毎回少しずつ違います。数字と判断が同じかを見てください" />
        <Table title="事実カード" rows={factRows} note="取引価格は過去の取引・成約価格（約半年遅れ）、人口構成は2020年の国勢調査です" />
      </div>
    </>
  );
}
