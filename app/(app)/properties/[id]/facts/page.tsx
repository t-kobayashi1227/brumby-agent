import Link from "next/link";
import { notFound } from "next/navigation";
import { getSql } from "../../../../../lib/db";
import type { FactSheet } from "../../../../../lib/facts/types";
import { card, emptyState } from "../../../../_lib/ui";
import FactSheetRunner from "./FactSheetRunner";

// 事実シートの画面：段階3で、作った事実の値を利用者が確かめるための表（docs/実装の進め方.md「3. 事実シートの作成」）
// 表示するのは保存した最新のシート。エージェントにはこれと同じ JSON を渡す
// 地図で「この位置で確定」を押すと ?auto=1 で開き、周辺情報の取得を自動で始める（FactSheetRunner）

export const dynamic = "force-dynamic";

const STATUS_CLASS: Record<string, string> = {
  取得: "text-[#157347]",
  取得できず: "text-[#b42318] font-bold",
  要確認: "text-[#b54708] font-bold",
};

export default async function FactSheetPage({ params, searchParams }: PageProps<"/properties/[id]/facts">) {
  const { id } = await params;
  const sp = await searchParams;
  const propertyId = Number(id);
  if (!Number.isInteger(propertyId) || propertyId <= 0) notFound();

  const sql = getSql();
  const [property] = await sql<{ code: string }[]>`select code from properties where id = ${propertyId}`;
  if (!property) return <div className={emptyState}>物件 {propertyId} が見つかりません。</div>;
  const [latest] = await sql<{ id: string; content: FactSheet; created_at: Date }[]>`
    select id, content, created_at from fact_sheets where property_id = ${propertyId} order by created_at desc limit 1
  `;
  const facts = latest?.content.事実 ?? [];
  const missing = facts.filter((f) => f.状態 !== "取得");

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link href={`/properties/${propertyId}`} className="text-xs text-brand underline">
          ← 物件の画面に戻る
        </Link>
        <div className="text-sm font-bold text-ink">物件ID {property.code} の事実シート</div>
      </div>
      <FactSheetRunner propertyId={propertyId} autoStart={sp.auto === "1"} hasSheet={!!latest} />
      {!latest ? (
        <div className={emptyState}>まだ事実シートがありません。「取得を始める」を押してください。</div>
      ) : (
        <div className={`${card} p-5 grid gap-3`}>
          <div className="text-xs text-muted">
            作成日時 {latest.content.作成日時}（距離はすべて{latest.content.距離の種類}）・事実 {facts.length}件・取得できず／要確認 {missing.length}件
            {missing.length > 0 && `（${missing.map((f) => f.id).join("、")}）`}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px] text-ink border-collapse">
              <thead>
                <tr className="text-left text-muted border-b border-line">
                  <th className="py-2 pr-2 font-normal whitespace-nowrap">ID</th>
                  <th className="py-2 pr-2 font-normal">項目</th>
                  <th className="py-2 pr-2 font-normal">値</th>
                  <th className="py-2 pr-2 font-normal">比較</th>
                  <th className="py-2 pr-2 font-normal">出典</th>
                  <th className="py-2 pr-2 font-normal whitespace-nowrap">時点</th>
                  <th className="py-2 font-normal whitespace-nowrap">状態</th>
                </tr>
              </thead>
              <tbody>
                {facts.map((f) => (
                  <tr key={f.id} className="align-top border-b border-canvas">
                    <td className="py-2 pr-2 font-mono whitespace-nowrap">{f.id}</td>
                    <td className="py-2 pr-2">{f.項目}</td>
                    <td className="py-2 pr-2">{f.値 ?? "―"}</td>
                    <td className="py-2 pr-2 text-body">{f.比較 ?? ""}</td>
                    <td className="py-2 pr-2 text-body">{f.出典}</td>
                    <td className="py-2 pr-2 text-body">{f.時点}</td>
                    <td className={`py-2 whitespace-nowrap ${STATUS_CLASS[f.状態] ?? ""}`}>{f.状態}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
