import { getSql } from "../../../../lib/db";
import { listProperties } from "../../../../lib/report";
import { loadCompetitors } from "../../../../lib/competitors";
import PropertyPicker from "../../../_components/PropertyPicker";
import { emptyState } from "../../../_lib/ui";
import CompetitorForm from "./CompetitorForm";

// 競合物件の入力（設計書 7章、D30）。?property=<id> で物件を選ぶ（省略時は最初の物件）
export const dynamic = "force-dynamic";

export default async function ResearchDetailPage({ searchParams }: PageProps<"/research/detail">) {
  const sp = await searchParams;
  const sql = getSql();
  const properties = await listProperties(sql);
  const propertyId = Number(sp.property) > 0 ? Number(sp.property) : properties[0]?.id ?? 0;
  const picker = <PropertyPicker properties={properties} current={propertyId} href={(id) => `/research/detail?property=${id}`} />;
  if (!properties.some((p) => p.id === propertyId)) return <>{picker}<div className={emptyState}>物件を選んでください。</div></>;

  const competitors = await loadCompetitors(sql, propertyId);

  return (
    <>
      {picker}
      <CompetitorForm key={propertyId} propertyId={propertyId} competitors={competitors} />
    </>
  );
}
