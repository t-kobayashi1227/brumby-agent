import { getSql } from "../../../lib/db";
import { listProperties } from "../../../lib/report";
import DashboardClient from "./DashboardClient";
import { photoUrl, photoVersions } from "../../../lib/photos";

// ホーム（設計書7章）：テスト物件の一覧、最後に分析した日時、データ不足の警告の数

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const sql = getSql();
  const [properties, photos] = await Promise.all([listProperties(sql), photoVersions(sql)]);

  return (
    <DashboardClient
      properties={properties.map((p) => ({ id: p.id, name: p.name, priceManYen: p.priceManYen, photoUrl: photoUrl(p.id, photos.get(p.id)), lastAnalyzedAt: p.lastAnalyzedAt?.toISOString() ?? null, insufficientCount: p.insufficientCount }))}
    />
  );
}
