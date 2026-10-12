import Link from "next/link";
import { getSql } from "../../../lib/db";
import { ITEM_LABEL } from "../../../lib/scoring/constants";
import { responseCoefficients } from "../../../lib/scoring/engine";
import { loadScoringConfig } from "../../../lib/scoring/load";
import { SCORING_TABLES, type TableDef } from "../../../lib/scoring/tables";
import { scoringSchemaReady } from "../../../lib/scoring/schema-check";
import { card, emptyState } from "../../_lib/ui";
import MediaResultsPanel from "./MediaResultsPanel";
import { ScoringRowForm } from "./ScoringRowForm";

// 採点ルール表（設計書 D35）：物件の評価（ペルソナ×5つの層×重み）を決めている表を見て、その場で直す
// 元は BRUMBY様と作った Excel「採点ルール表」。シートごとにタブを分ける。変更は変更履歴に残る
export const dynamic = "force-dynamic";

const TABS: { key: string; label: string }[] = [
  { key: "overview", label: "計算の考え方" },
  { key: "personas", label: "ペルソナ" },
  { key: "scoring_rules", label: "採点ルール" },
  { key: "scoring_items", label: "項目の重視度" },
  { key: "scoring_params", label: "重み・前提・予算" },
  { key: "competitor_items", label: "競合重視度" },
  { key: "market_reference", label: "相場" },
  { key: "area_popularity", label: "エリア人気" },
  { key: "media", label: "媒体・反響" },
  { key: "history", label: "変更履歴" },
];

const PARAM_CATEGORY: Record<string, string> = { layer_weight: "層の重み", purchase: "購入前提", budget: "予算の決め方", media: "媒体配分" };

type Row = Record<string, unknown>;

const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
const formatDate = (d: Date) => new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

/** 一覧の1行の見出し（開くとフォーム） */
function summaryOf(table: string, r: Row): React.ReactNode {
  switch (table) {
    case "personas":
      return (
        <>
          <b className="mr-2">{fmt(r.id)}</b>
          {fmt(r.label)}
          <span className="ml-2 text-muted">
            {fmt(r.rep_age)}歳・頭金{Math.round(Number(r.down_payment_rate) * 100)}%・{r.purchase_method === "cash" ? "現金" : "ローン"}
          </span>
          {r.enabled === false && <span className="ml-2 text-muted">（使わない）</span>}
        </>
      );
    case "scoring_rules": {
      const fit = (r.fit ?? {}) as Record<string, string>;
      const range = r.lower_bound === null && r.upper_bound === null ? "" : `${fmt(r.lower_bound) === "—" ? "" : r.lower_bound}〜${fmt(r.upper_bound) === "—" ? "" : r.upper_bound}`;
      return (
        <>
          <b className="mr-2">{fmt(r.id)}</b>
          <span className="text-muted mr-2">
            {fmt(r.layer)}・{ITEM_LABEL[String(r.item_key)] ?? fmt(r.item_key)} {range}
          </span>
          {fmt(r.reason)}
          <span className="ml-2 font-mono text-[11px]">
            {Object.entries(fit)
              .sort()
              .map(([k, v]) => `${k}${v}`)
              .join(" ")}
          </span>
          {r.basis_class ? <span className="ml-2 text-[10px] text-muted">［{String(r.basis_class)}］</span> : null}
          {r.enabled === false && <span className="ml-2 text-muted">（使わない）</span>}
        </>
      );
    }
    case "scoring_items":
    case "competitor_items": {
      const imp = (r.importance ?? {}) as Record<string, number>;
      return (
        <>
          <b className="mr-2">{ITEM_LABEL[String(r.key)] ?? fmt(r.label ?? r.key)}</b>
          <span className="text-muted mr-2">{fmt(r.key)}</span>
          <span className="font-mono text-[11px]">
            {Object.entries(imp)
              .sort()
              .map(([k, v]) => `${k}:${v}`)
              .join(" ")}
          </span>
        </>
      );
    }
    case "scoring_params":
      return (
        <>
          <span className="text-muted mr-2">［{PARAM_CATEGORY[String(r.category)] ?? fmt(r.category)}］</span>
          {fmt(r.label)}
          <b className="ml-2">{fmt(r.value)}</b>
        </>
      );
    case "market_reference":
      return (
        <>
          <b className="mr-2">
            {fmt(r.ward)}・{fmt(r.age_class)}
          </b>
          {fmt(r.price_man_yen)}万円<span className="ml-2 text-muted">延床{fmt(r.building_sqm)}㎡・土地{fmt(r.land_sqm)}㎡・{fmt(r.n)}件</span>
        </>
      );
    case "area_popularity":
      return (
        <>
          <b className="mr-2">
            {fmt(r.ward)}
            {fmt(r.town)}
          </b>
          {fmt(r.score)}点
        </>
      );
    case "media_channels":
      return (
        <>
          <b className="mr-2">{fmt(r.label)}</b>
          <span className="text-muted">{r.stat_name ? `統計：${String(r.stat_name)}` : `一律 ${fmt(r.flat_reach)}`}</span>
          {r.enabled === false && <span className="ml-2 text-muted">（使わない）</span>}
        </>
      );
    case "media_usage_rates":
      return (
        <>
          <b className="mr-2">{fmt(r.stat_name)}</b>
          <span className="text-muted">全年代 {fmt(r.all_ages)}%</span>
        </>
      );
    default:
      return fmt(r.id ?? r.key);
  }
}

async function TableEditor({ def, personaIds, where }: { def: TableDef; personaIds: string[]; where?: { ward: string } }) {
  const sql = getSql();
  const rows = await sql<Row[]>`
    select * from ${sql(def.table)} ${where ? sql`where ward = ${where.ward}` : sql``} order by ${sql.unsafe(def.orderBy)}
  `;
  return (
    <div className={`${card} p-5`}>
      <div className="text-[13px] font-bold text-ink">{def.label}</div>
      <div className="text-[11px] text-muted mt-1 mb-3 leading-[1.7]">
        {def.note}（Excel：{def.sheet}）
      </div>
      {rows.length === 0 && <div className="text-xs text-muted py-3">行がありません。npm run import-scoring で Excel を{def.canAdd ? "取り込むか、下の「行を追加」で入れて" : "取り込んで"}ください。</div>}
      {rows.map((r) => (
        <details key={def.fields.filter((f) => f.pk).map((f) => String(r[f.name])).join("/")} className="border-t border-line">
          <summary className="py-2.5 text-[13px] text-body cursor-pointer select-none">{summaryOf(def.table, r)}</summary>
          <div className="pb-4">
            <ScoringRowForm def={def} values={r} personaIds={personaIds} mode="update" />
            {r.updated_at instanceof Date && (
              <div className="text-[10px] text-muted mt-2">
                最終更新 {formatDate(r.updated_at)}
                {r.updated_by ? `（${String(r.updated_by)}）` : ""}
              </div>
            )}
          </div>
        </details>
      ))}
      {def.canAdd && (
        <details className="border-t border-line">
          <summary className="py-2.5 text-xs text-brand font-bold cursor-pointer select-none">＋ 行を追加</summary>
          <div className="pb-4">
            <ScoringRowForm def={def} values={where ? { ward: where.ward } : {}} personaIds={personaIds} mode="insert" />
          </div>
        </details>
      )}
    </div>
  );
}

function Overview() {
  return (
    <div className={`${card} p-5.5 text-[13px] text-body leading-[1.9]`}>
      <div className="text-base font-extrabold text-ink mb-2">物件の評価のしかた（採点ルール表）</div>
      <ol className="grid gap-1.5 list-decimal pl-5">
        <li>ペルソナごとに、5つの層（物件・購入可能性・生活環境・市場・競合）を0〜100点で採点します。</li>
        <li>
          物件・生活環境・市場：当てはまったルールの点（適合度 ◎+2〜×−2 × 項目の重視度 × 1段階の点数）を足した「素点」を、取りうる最大の点「満点」で割ります。
          <span className="text-muted">値が取れない項目は、素点からも満点からも外し、画面に「データなし」と出します。</span>
        </li>
        <li>購入可能性：ローン返済から逆算した必要年収を、そのペルソナの世帯の何%が上回るかで採点します（現金で買うペルソナは、今の家の売却見込み＋貯蓄で判定）。「世帯年収○○万円以上」というターゲット像も出します。</li>
        <li>競合：項目ごとの勝ち負けを、ペルソナの重視度で重み付けします。競合が未入力なら、この層を外して残りで計算します。</li>
        <li>総合＝5つの層×層の重み（85%）＋ 統計上の買い手の多さ（15%）。上位3つが第1〜第3ターゲットです。</li>
        <li>訴求ポイント：競合（なければ同じ区・築年数区分の取引の中央値）と比べて勝つ項目×第1ターゲットの重視度。</li>
        <li>予算：売れやすさ（エリア人気・価格の相場比・第1ターゲットの適合度）で倍率を決め、物件価格×基準率に掛けます。最初に一部を使い、反響が少なければ追加します。</li>
        <li>媒体：第1ターゲットへの届きやすさ（年代別の利用率）× 反響係数（反響の記録）の上位の媒体に配分します。</li>
      </ol>
      <div className="mt-3 text-xs text-muted">
        表を直すと、次の分析から使います（前の分析の結果は変わりません。販売戦略の「前回の結果と比べる」で、版ごとの違いを確かめられます）。前の方式のルール表は
        <Link href="/rules/legacy" className="text-brand underline mx-1">こちら</Link>
        に残しています。
      </div>
    </div>
  );
}

async function History() {
  const rows = await getSql()<{ id: number; table_name: string; row_key: string; operation: string; before: Row | null; after: Row | null; reason: string | null; related_property: string | null; changed_by: string | null; changed_at: Date }[]>`
    select id, table_name, row_key, operation, before, after, reason, related_property, changed_by, changed_at
    from scoring_revisions order by changed_at desc, id desc limit 200
  `;
  const label = (t: string) => SCORING_TABLES[t]?.label ?? (t === "excel" ? "Excel の変更履歴" : t);
  /** 変わった列だけを「前 → 後」で出す */
  const diff = (b: Row | null, a: Row | null) => {
    if (!b || !a) return null;
    return Object.keys(a)
      .filter((k) => !["updated_at", "updated_by"].includes(k) && JSON.stringify(a[k]) !== JSON.stringify(b[k]))
      .map((k) => `${k}：${fmt(b[k])} → ${fmt(a[k])}`)
      .join("　");
  };
  return (
    <div className={`${card} p-5`}>
      <div className="text-[13px] font-bold text-ink mb-3">変更履歴（新しい順・200件まで）</div>
      {rows.length === 0 && <div className="text-xs text-muted">まだ変更はありません。</div>}
      {rows.map((r) => (
        <div key={r.id} className="border-t border-line py-2.5 text-xs text-body">
          <div className="flex flex-wrap gap-x-3">
            <span className="text-muted">{formatDate(r.changed_at)}</span>
            <span className="font-bold">
              {label(r.table_name)}・{r.row_key}
            </span>
            <span>{r.operation === "insert" ? "追加" : r.operation === "delete" ? "削除" : "変更"}</span>
            {r.changed_by && <span className="text-muted">（{r.changed_by}）</span>}
            {r.related_property && <span className="text-muted">関連物件：{r.related_property}</span>}
            <span className="text-muted">版 {r.id}</span>
          </div>
          {r.reason && <div className="mt-0.5">理由：{r.reason}</div>}
          {r.table_name === "excel" ? (
            <div className="mt-0.5 text-muted">
              {fmt((r.before as { value?: unknown } | null)?.value)} → {fmt((r.after as { value?: unknown } | null)?.value)}
            </div>
          ) : (
            r.operation === "update" && <div className="mt-0.5 text-muted break-all">{diff(r.before, r.after)}</div>
          )}
        </div>
      ))}
    </div>
  );
}

export default async function ScoringRulesPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? String(sp.tab) : "overview";
  const sql = getSql();
  if (!(await scoringSchemaReady(sql))) {
    return (
      <div className={emptyState}>
        採点ルール表の表がまだ共有DBにありません（マイグレーション 20261012100000_scoring.sql を反映してください）。それまでの分析は旧ルール表で判断します（
        <Link href="/rules/legacy" className="text-brand underline">旧ルール表</Link>）。
      </div>
    );
  }
  const personas = await sql<{ id: string }[]>`select id from personas order by sort_order, id`;
  const personaIds = personas.length ? personas.map((p) => p.id) : ["A", "B", "C", "D", "E", "F", "G", "H"];
  const [version] = await sql<{ v: string | null }[]>`select max(id) as v from scoring_revisions`;

  let body: React.ReactNode;
  if (tab === "overview") body = <Overview />;
  else if (tab === "history") body = <History />;
  else if (tab === "media") {
    const config = await loadScoringConfig(sql);
    const coefficients = responseCoefficients(config);
    const results = await sql<{ id: number; property_id: number | null; media_id: string; started_on: Date | null; cost_yen: number; inquiries: number }[]>`
      select id, property_id, media_id, started_on, cost_yen, inquiries from media_results order by started_on desc nulls last, id desc
    `;
    const properties = await sql<{ id: number; name: string }[]>`select id, name from properties order by id`;
    body = (
      <div className="grid gap-4">
        <TableEditor def={SCORING_TABLES.media_channels} personaIds={personaIds} />
        <TableEditor def={SCORING_TABLES.media_usage_rates} personaIds={personaIds} />
        <MediaResultsPanel
          media={config.media.map((m) => ({ id: m.id, label: m.label, coefficient: coefficients[m.id] ?? 1 }))}
          results={results.map((r) => ({ ...r, id: Number(r.id), property_id: r.property_id === null ? null : Number(r.property_id), started_on: r.started_on ? new Date(r.started_on).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" }) : null }))}
          properties={properties.map((p) => ({ id: Number(p.id), name: p.name }))}
          minInquiries={config.params["係数を使い始める問い合わせ数"] ?? 10}
        />
      </div>
    );
  } else if (tab === "area_popularity") {
    const wards = await sql<{ ward: string; n: number }[]>`select ward, count(*)::int as n from area_popularity group by ward order by ward`;
    const ward = typeof sp.ward === "string" && wards.some((w) => w.ward === sp.ward) ? sp.ward : wards[0]?.ward;
    body = (
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-1.5">
          {wards.map((w) => (
            <Link key={w.ward} href={`/rules?tab=area_popularity&ward=${encodeURIComponent(w.ward)}`} className={`px-3 py-1 rounded-full text-xs ${w.ward === ward ? "bg-brand text-white font-bold" : "bg-white border border-field text-body"}`}>
              {w.ward}（{w.n}）
            </Link>
          ))}
        </div>
        {ward ? <TableEditor def={SCORING_TABLES.area_popularity} personaIds={personaIds} where={{ ward }} /> : <TableEditor def={SCORING_TABLES.area_popularity} personaIds={personaIds} />}
      </div>
    );
  } else body = <TableEditor def={SCORING_TABLES[tab]} personaIds={personaIds} />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <div className="text-base font-extrabold text-ink">採点ルール表</div>
        <div className="text-xs text-muted">設定の版 {version?.v ?? "—"}（直すたびに増えます）</div>
      </div>
      {personas.length === 0 && <div className={emptyState}>採点ルール表がまだ取り込まれていません。npm run import-scoring -- &quot;採点ルール表.xlsx のパス&quot; で取り込んでください。</div>}
      <div className="flex flex-wrap gap-1 border-b border-line">
        {TABS.map((t) => (
          <Link key={t.key} href={`/rules?tab=${t.key}`} className={`px-3.5 py-2 text-[13px] -mb-px border-b-2 ${t.key === tab ? "border-brand text-brand font-bold" : "border-transparent text-body"}`}>
            {t.label}
          </Link>
        ))}
      </div>
      {body}
    </div>
  );
}
