import { getSql, inOrder } from "../../../lib/db";
import { todayJst } from "../../../lib/facts/format";
import { card } from "../../_lib/ui";

// 設定：計算に使っている前提値・ターゲット候補・媒体の一覧を見る画面（変更はできない）
// 前提値は「適用開始日が今日（日本時間）以前で一番新しい行」を出す（事実シートの作成 lib/facts/collect.ts と同じ選び方）

export const dynamic = "force-dynamic";

const th = "px-3 py-2 text-left text-xs font-bold text-sub bg-subtle";
const td = "px-3 py-2.5 text-[13px] text-ink border-t border-line align-top";

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className={`${card} p-5 grid gap-3`}>
      <div>
        <h2 className="text-[15px] font-bold text-ink">{title}</h2>
        <p className="mt-0.5 text-xs text-muted">{note}</p>
      </div>
      <div className="overflow-x-auto">{children}</div>
    </section>
  );
}

function EmptyRow({ cols }: { cols: number }) {
  return (
    <tr>
      <td colSpan={cols} className={`${td} text-center text-muted`}>
        登録されていません
      </td>
    </tr>
  );
}

export default async function SettingsPage() {
  const sql = getSql();
  const today = todayJst();
  const [assumptions, targets, media] = await inOrder(
    () => sql<{ key: string; value: string; unit: string; basis: string; as_of: string; effective_from: Date }[]>`
      select key, value, unit, basis, as_of, effective_from from (
        select distinct on (key) id, key, value, unit, basis, as_of, effective_from from assumptions
        where effective_from <= ${today}::date order by key, effective_from desc
      ) latest
      order by id
    `,
    () => sql<{ id: number; name: string; representative_age: number; definition: string | null }[]>`
      select id, name, representative_age, definition from target_candidates order by id
    `,
    () => sql<{ id: string; name: string; category: string; purpose: string; reach_ages: string }[]>`
      select id, name, category, purpose, reach_ages from media order by sort
    `,
  );

  return (
    <div className="grid gap-4">
      <Section title="ローンの前提" note="必要年収や返済額の計算に使う値です。金利は毎月、頭金と返済負担率は毎年見直します。">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className={th}>項目</th>
              <th className={th}>値</th>
              <th className={th}>根拠</th>
              <th className={th}>時点</th>
              <th className={th}>適用開始日</th>
            </tr>
          </thead>
          <tbody>
            {assumptions.length === 0 && <EmptyRow cols={5} />}
            {assumptions.map((a) => (
              <tr key={a.key}>
                <td className={`${td} font-medium`}>{a.key}</td>
                <td className={`${td} tabular-nums`}>
                  {/* 丸めずに、計算に使う値のまま出す（numeric は文字で返る。末尾の0だけ落とす） */}
                  {String(Number(a.value))}
                  {a.unit}
                </td>
                <td className={`${td} text-body`}>{a.basis}</td>
                <td className={`${td} text-body`}>{a.as_of}</td>
                <td className={`${td} text-body tabular-nums`}>{a.effective_from.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="ターゲット候補" note="販売戦略で選ぶ買い手の層です。代表年齢は返済期間と必要年収の計算に使います。">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className={th}>名前</th>
              <th className={th}>代表年齢</th>
              <th className={th}>定義</th>
            </tr>
          </thead>
          <tbody>
            {targets.length === 0 && <EmptyRow cols={3} />}
            {targets.map((t) => (
              <tr key={t.id}>
                <td className={`${td} font-medium whitespace-nowrap`}>{t.name}</td>
                <td className={`${td} tabular-nums whitespace-nowrap`}>{t.representative_age}歳</td>
                <td className={`${td} text-body`}>{t.definition ?? "―"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Section title="媒体" note="広告の配分を考えるときの候補です。">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr>
              <th className={th}>媒体</th>
              <th className={th}>種類</th>
              <th className={th}>目的</th>
              <th className={th}>届きやすい年代（目安）</th>
            </tr>
          </thead>
          <tbody>
            {media.length === 0 && <EmptyRow cols={4} />}
            {media.map((m) => (
              <tr key={m.id}>
                <td className={`${td} font-medium`}>{m.name}</td>
                <td className={`${td} text-body`}>{m.category}</td>
                <td className={`${td} text-body`}>{m.purpose}</td>
                <td className={`${td} text-body`}>{m.reach_ages}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>
    </div>
  );
}
