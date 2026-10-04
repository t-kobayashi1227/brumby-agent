import { getSql } from "../../../lib/db";
import { listProperties } from "../../../lib/report";
import DashboardClient from "./DashboardClient";

// ホーム（設計書7章）：テスト物件の一覧、最後に分析した日時、データ不足の警告の数

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const sql = getSql();
  const properties = await listProperties(sql);

  return (
    <DashboardClient
      properties={properties.map((p) => ({ id: p.id, name: p.name, priceManYen: p.priceManYen, lastAnalyzedAt: p.lastAnalyzedAt?.toISOString() ?? null, insufficientCount: p.insufficientCount }))}
    />
  );
}
