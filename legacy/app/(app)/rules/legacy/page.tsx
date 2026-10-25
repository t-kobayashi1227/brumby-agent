import { getSql } from "../../../../lib/db";
import { MEDIA, type AppealDef, type CandidateDef } from "../../../../lib/rules/catalog";
import { KIND_LABEL, describeCondition, describeEffect, type EffectNames } from "../../../../lib/rules/describe";
import type { Condition, Effect, Rule } from "../../../../lib/rules/engine";
import { card } from "../../../_lib/ui";
import RuleForm, { DeleteRuleButton, type RuleFormOptions } from "../RuleForm";

// ルール表：販売戦略（狙う層・訴求・予算配分）を決めている判断基準を見て、その場で直す（設計書 D14）
// 狙う層の候補と訴求の素材は DB の表（D22・D23）。この画面では一覧を表示し、編集は当面 Studio で行う
// DBを毎回読み直す（直した内容がすぐ表示されるように）
export const dynamic = "force-dynamic";

interface RuleRow extends Rule {
  updated_by: string | null;
  updated_at: Date;
}

interface Revision {
  id: number;
  table_name: "rules" | "target_candidates" | "appeal_items";
  rule_id: string;
  operation: "insert" | "update" | "delete";
  snapshot: { condition?: Condition; effect?: Effect; note?: string; label?: string; enabled: boolean; version?: number; updated_by: string | null };
  changed_at: Date;
}

/** 計算の手順の順に並べる */
const KIND_ORDER: Rule["kind"][] = ["target_score", "appeal_score", "total_budget", "media_weight", "min_spend"];

const KIND_HELP: Record<Rule["kind"], string> = {
  target_score: "当てはまったルールの点数を足して、狙う層の順位を決めます。1位の点が基準（初期値2点）に届かなければ「絞り込めない」とします。同点なら併記します。",
  appeal_score: "必要なカードが取れている訴求の素材に、当てはまったルールの点数を足し、上位3つを使います。AIは選ばれた素材を言い換えるだけです。",
  total_budget: "物件の登録で総予算が入力されていれば、それを使います。入力がないときだけ、当てはまったルールの額を提案値にします（複数当てはまれば一番大きい額）。",
  media_weight: "「出発点」の重みに、当てはまったルールの倍率を掛け、その比率で総予算を分けます。",
  min_spend: "固定額・最低額を先に当てはめてから、残りを重みの比率で分けます。最後に千円単位に丸めます。",
};

const OPERATION_LABEL: Record<Revision["operation"], string> = { insert: "追加", update: "変更", delete: "削除" };

const formatDate = (d: Date) => new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function RuleItem({ rule, names, options }: { rule: RuleRow; names: EffectNames; options: RuleFormOptions }) {
  return (
    <div className={`border-t border-line py-3.5 ${rule.enabled ? "" : "opacity-55"}`}>
      <div className="flex gap-3 items-start">
        <div className="w-12 shrink-0 text-xs font-bold text-sub pt-0.5">{rule.id}</div>
        <div className="flex-1 min-w-0">
          <div className="text-[13px] text-ink leading-[1.8]">
            {"always" in rule.condition ? (
              <span className="text-muted">条件なし（いつも） → </span>
            ) : (
              <>
                <span className="text-muted">もし </span>
                {describeCondition(rule.condition)}
                <span className="text-muted"> なら → </span>
              </>
            )}
            <span className="font-bold">{describeEffect(rule.effect, names)}</span>
          </div>
          <div className="text-xs text-body mt-1">理由：{rule.note}</div>
          <div className="text-[11px] text-muted mt-1">
            版 {rule.version}・最終更新 {formatDate(rule.updated_at)}
            {rule.updated_by ? `（${rule.updated_by}）` : ""}
          </div>
        </div>
        <div className="shrink-0">
          {rule.enabled ? (
            <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-[#dcf5df] text-[#157347]">使う</span>
          ) : (
            <span className="inline-block px-2.5 py-1 rounded-full text-[11px] font-bold bg-divider text-muted">使わない</span>
          )}
        </div>
      </div>

      <details className="ml-15 mt-2">
        <summary className="text-xs text-brand font-bold cursor-pointer select-none">このルールを直す・削除する</summary>
        <div className="mt-3 grid gap-3">
          <RuleForm rule={{ id: rule.id, kind: rule.kind, condition: rule.condition, effect: rule.effect, note: rule.note, enabled: rule.enabled }} options={options} />
          <DeleteRuleButton id={rule.id} />
        </div>
      </details>
    </div>
  );
}

export default async function RulesPage() {
  const sql = getSql();
  const rules = await sql<RuleRow[]>`
    select id, kind, condition, effect, note, enabled, version, updated_by, updated_at from rules order by id
  `;
  const revisions = await sql<Revision[]>`
    select id, table_name, rule_id, operation, snapshot, changed_at from rule_revisions order by id desc limit 30
  `;
  const candidates = await sql<CandidateDef[]>`
    select id, label, description, property_types, sort_order, enabled, confidence from target_candidates order by sort_order, id
  `;
  const appeals = await sql<AppealDef[]>`
    select id, label, description, needs_facts, property_types, sort_order, enabled from appeal_items order by sort_order, id
  `;
  const names: EffectNames = {
    candidates: new Map(candidates.map((c) => [c.id, c.label])),
    appeals: new Map(appeals.map((a) => [a.id, a.label])),
  };
  const options: RuleFormOptions = {
    candidates: candidates.map((c) => ({ id: c.id, label: c.label })),
    appeals: appeals.map((a) => ({ id: a.id, label: a.label })),
  };
  const latestRevision = revisions[0]?.id ?? null;

  return (
    <div className="grid gap-4">
      <div className="rounded-md border border-[#f0d9a8] bg-[#fff8e8] px-4 py-3 text-xs text-[#8a5a00]">
        これは前の方式（ルールの点数の足し上げ）のルール表です。2026-10-12 から分析には使っていません（採点ルール表に置き換え。設計書 D35）。前の分析の結果を確かめるために残しています。
      </div>
      <div className={`${card} p-5.5`}>
        <div className="text-base font-extrabold text-ink mb-2">販売戦略の判断基準（旧ルール表）</div>
        <div className="text-[13px] text-body leading-[1.9]">
          物件を分析すると、周りのデータから作った「事実カード」（人口構成・周辺施設・相場など）に、このルールを当てはめて、
          <span className="font-bold">狙う層の順位</span>、<span className="font-bold">訴求ポイント</span>、<span className="font-bold">広告の予算配分</span>を決めます。
          毎回同じルールで計算するので、同じ物件・同じ条件なら同じ結果になります。
        </div>
        <ol className="mt-3 grid gap-1 text-xs text-body">
          <li>1. 狙う層の候補に点数を付けて順位を出す</li>
          <li>2. 訴求の素材に点数を付け、上位3つを選ぶ</li>
          <li>3. 総予算を決める（入力があればそれ、なければルールの提案値）</li>
          <li>4. 媒体の重み → 比率 → 固定額・最低額 → 千円単位に丸める</li>
          <li>5. 効いたルールを記録する（レポートで「なぜこの配分か」を説明するため）</li>
        </ol>
        <div className="mt-3 rounded-md border border-[#f0d9a8] bg-[#fff8e8] px-3.5 py-2 text-xs text-[#8a5a00]">
          今のルールはすべて仮です（プロトタイプの配分表が出発点）。打ち合わせで伺いながら直していきます。
        </div>
        <div className="mt-2 text-[11px] text-muted">
          ルール {rules.length}件・使っているもの {rules.filter((r) => r.enabled).length}件{latestRevision !== null ? `・ルールの版（最新の変更番号）${latestRevision}` : ""}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className={`${card} p-5`}>
          <div className="text-[13px] font-bold text-ink mb-1">狙う層の候補</div>
          <div className="text-[11px] text-muted mb-3">表 target_candidates（当面は Studio で直す）</div>
          <ul className="grid gap-2">
            {candidates.map((c) => (
              <li key={c.id} className={`text-xs text-body leading-[1.7] ${c.enabled ? "" : "opacity-55"}`}>
                <span className="font-bold text-ink">{c.label}</span>
                <span className="text-muted">（{c.id}・{c.property_types?.length ? c.property_types.join("・") : "全種別"}{c.confidence === "low" ? "・仮説" : ""}{c.enabled ? "" : "・使わない"}）</span>
                <br />
                {c.description}
              </li>
            ))}
            {candidates.length === 0 && <li className="text-xs text-muted">まだありません（npm run seed-rules で入れる）</li>}
          </ul>
        </div>
        <div className={`${card} p-5`}>
          <div className="text-[13px] font-bold text-ink mb-1">訴求の素材</div>
          <div className="text-[11px] text-muted mb-3">表 appeal_items（当面は Studio で直す）。必要なカードが取れていない素材は選ばれません</div>
          <ul className="grid gap-2">
            {appeals.map((a) => (
              <li key={a.id} className={`text-xs text-body leading-[1.7] ${a.enabled ? "" : "opacity-55"}`}>
                <span className="font-bold text-ink">{a.label}</span>
                <span className="text-muted">（{a.id}{a.property_types?.length ? `・${a.property_types.join("・")}` : ""}{a.enabled ? "" : "・使わない"}）</span>
                <br />
                必要なカード：{a.needs_facts.length ? a.needs_facts.join("、") : "なし"}
              </li>
            ))}
            {appeals.length === 0 && <li className="text-xs text-muted">まだありません（npm run seed-rules で入れる）</li>}
          </ul>
        </div>
        <div className={`${card} p-5`}>
          <div className="text-[13px] font-bold text-ink mb-3">媒体</div>
          <ul className="grid gap-2">
            {MEDIA.map((m) => (
              <li key={m.id} className="text-xs text-body leading-[1.7]">
                <span className="font-bold text-ink">{m.label}</span>
                <br />
                {m.role}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`${card} p-5`}>
        <details id="add-rule">
          <summary className="text-[13px] font-bold text-brand cursor-pointer select-none">＋ ルールを追加する</summary>
          <div className="text-xs text-muted mt-2 mb-3">
            種類を選び、条件（何を見るか・比べ方）と効果を組み立てます。条件で見る値は、分析で作る事実カードや物件の情報の一覧から選びます。
          </div>
          <RuleForm options={options} />
        </details>
      </div>

      {KIND_ORDER.map((kind, i) => {
        const list = rules.filter((r) => r.kind === kind);
        return (
          <div key={kind} className={`${card} p-5`}>
            <div className="text-[13px] font-bold text-ink">
              {i + 1}. {KIND_LABEL[kind]}（{list.length}件）
            </div>
            <div className="text-xs text-muted mt-1 mb-2">{KIND_HELP[kind]}</div>
            {list.map((r) => (
              <RuleItem key={r.id} rule={r} names={names} options={options} />
            ))}
          </div>
        );
      })}

      <div className={`${card} p-5`}>
        <div className="text-[13px] font-bold text-ink mb-1">変更の履歴（新しい順、30件まで）</div>
        <div className="text-xs text-muted mb-3">ルール・狙う層の候補・訴求の素材を追加・変更・削除すると、自動で残ります。変更後の内容を表示しています。</div>
        <div className="grid gap-2">
          {revisions.map((rev) => (
            <div key={rev.id} className="grid grid-cols-[150px_70px_1fr] gap-3 text-xs border-t border-line pt-2">
              <div className="text-muted">{formatDate(rev.changed_at)}</div>
              <div className="font-bold text-sub">
                {rev.rule_id}・{OPERATION_LABEL[rev.operation]}
              </div>
              <div className="text-body leading-[1.7]">
                {rev.table_name === "rules" && rev.snapshot.condition && rev.snapshot.effect
                  ? `${describeCondition(rev.snapshot.condition)} → ${describeEffect(rev.snapshot.effect, names)}`
                  : `${rev.table_name === "target_candidates" ? "狙う層の候補" : "訴求の素材"}「${rev.snapshot.label ?? rev.rule_id}」`}
                {rev.snapshot.enabled ? "" : "（使わない）"}
                <span className="text-muted">
                  {" "}
                  {rev.snapshot.version !== undefined ? `／ 版 ${rev.snapshot.version}` : ""}
                  {rev.snapshot.updated_by ? `・${rev.snapshot.updated_by}` : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
