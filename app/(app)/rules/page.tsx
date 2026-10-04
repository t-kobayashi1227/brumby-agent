import { getSql } from "../../../lib/db";
import { MEDIA, TARGETS } from "../../../lib/rules/catalog";
import { KIND_LABEL, describeCondition, describeEffect } from "../../../lib/rules/describe";
import type { Condition, Effect, Rule } from "../../../lib/rules/engine";
import { card } from "../../_lib/ui";
import RuleForm, { DeleteRuleButton } from "./RuleForm";

// ルール表：販売戦略（狙う層・予算配分）を決めている判断基準を見て、その場で直す（設計書 D14）
// DBを毎回読み直す（直した内容がすぐ表示されるように）
export const dynamic = "force-dynamic";

interface RuleRow extends Rule {
  updated_by: string | null;
  updated_at: Date;
}

interface Revision {
  id: number;
  rule_id: string;
  operation: "insert" | "update" | "delete";
  snapshot: { condition: Condition; effect: Effect; note: string; enabled: boolean; version: number; updated_by: string | null };
  changed_at: Date;
}

/** 計算の手順の順に並べる */
const KIND_ORDER: Rule["kind"][] = ["target_score", "total_budget", "media_weight", "min_spend"];

const KIND_HELP: Record<Rule["kind"], string> = {
  target_score: "当てはまったルールの点数を足して、狙う層の順位を決めます。同点なら下の候補の並び順です。",
  total_budget: "当てはまったルールの額が総予算になります（複数当てはまれば一番大きい額）。",
  media_weight: "「出発点」の重みに、当てはまったルールの倍率を掛け、その比率で総予算を分けます。",
  min_spend: "固定額・最低額を先に当てはめてから、残りを重みの比率で分けます。最後に千円単位に丸めます。",
};

const OPERATION_LABEL: Record<Revision["operation"], string> = { insert: "追加", update: "変更", delete: "削除" };

const formatDate = (d: Date) => new Date(d).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });

function RuleItem({ rule }: { rule: RuleRow }) {
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
            <span className="font-bold">{describeEffect(rule.effect)}</span>
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
          <RuleForm rule={{ id: rule.id, kind: rule.kind, condition: rule.condition, effect: rule.effect, note: rule.note, enabled: rule.enabled }} />
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
    select id, rule_id, operation, snapshot, changed_at from rule_revisions order by id desc limit 30
  `;
  const latestRevision = revisions[0]?.id ?? null;

  return (
    <div className="grid gap-4">
      <div className={`${card} p-5.5`}>
        <div className="text-base font-extrabold text-ink mb-2">販売戦略の判断基準（ルール表）</div>
        <div className="text-[13px] text-body leading-[1.9]">
          物件を分析すると、周りのデータから作った「事実カード」（人口構成・周辺施設・相場など）に、このルールを当てはめて、
          <span className="font-bold">狙う層の順位</span>と<span className="font-bold">広告の予算配分</span>を決めます。
          毎回同じルールで計算するので、同じ物件・同じ条件なら同じ結果になります。
        </div>
        <ol className="mt-3 grid gap-1 text-xs text-body">
          <li>1. 狙う層の候補に点数を付けて順位を出す</li>
          <li>2. 総予算を決める</li>
          <li>3. 媒体の重み → 比率 → 固定額・最低額 → 千円単位に丸める</li>
          <li>4. 効いたルールを記録する（レポートで「なぜこの配分か」を説明するため）</li>
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
          <div className="text-[13px] font-bold text-ink mb-3">狙う層の候補</div>
          <ul className="grid gap-2">
            {TARGETS.map((t, i) => (
              <li key={t.id} className="text-xs text-body leading-[1.7]">
                <span className="font-bold text-ink">{i + 1}. {t.label}</span>
                <br />
                {t.description}
              </li>
            ))}
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
          <RuleForm />
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
              <RuleItem key={r.id} rule={r} />
            ))}
          </div>
        );
      })}

      <div className={`${card} p-5`}>
        <div className="text-[13px] font-bold text-ink mb-1">変更の履歴（新しい順、30件まで）</div>
        <div className="text-xs text-muted mb-3">ルールを追加・変更・削除すると、自動で残ります。変更後の内容を表示しています。</div>
        <div className="grid gap-2">
          {revisions.map((rev) => (
            <div key={rev.id} className="grid grid-cols-[150px_70px_1fr] gap-3 text-xs border-t border-line pt-2">
              <div className="text-muted">{formatDate(rev.changed_at)}</div>
              <div className="font-bold text-sub">
                {rev.rule_id}・{OPERATION_LABEL[rev.operation]}
              </div>
              <div className="text-body leading-[1.7]">
                {describeCondition(rev.snapshot.condition)} → {describeEffect(rev.snapshot.effect)}
                {rev.snapshot.enabled ? "" : "（使わない）"}
                <span className="text-muted">
                  {" "}
                  ／ 版 {rev.snapshot.version}
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
