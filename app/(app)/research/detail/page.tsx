import { getSql } from "../../../../lib/db";
import { listProperties } from "../../../../lib/report";
import PropertyPicker from "../../../_components/PropertyPicker";
import { emptyState } from "../../../_lib/ui";
import CompetitorForm, { type CompetitorValues } from "./CompetitorForm";
import { scoringSchemaReady } from "../../../../lib/scoring/schema-check";

// 競合物件の入力（設計書 7章、D30）。?property=<id> で物件を選ぶ（省略時は最初の物件）
export const dynamic = "force-dynamic";

const toDateInput = (d: Date) => new Date(d).toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });

export default async function ResearchDetailPage({ searchParams }: PageProps<"/research/detail">) {
  const sp = await searchParams;
  const sql = getSql();
  const properties = await listProperties(sql);
  const propertyId = Number(sp.property) > 0 ? Number(sp.property) : properties[0]?.id ?? 0;
  const picker = <PropertyPicker properties={properties} current={propertyId} href={(id) => `/research/detail?property=${id}`} />;
  if (!properties.some((p) => p.id === propertyId)) return <>{picker}<div className={emptyState}>物件を選んでください。</div></>;

  const rows = await sql<
    { position: number; price_man_yen: number | null; location: string | null; land_sqm: string | null; building_sqm: string | null; layout: string | null; walk_min: number | null; age_years: number | null; parking: number | null; features: string | null; source_type: CompetitorValues["sourceType"]; source_site: string | null; confirmed_on: Date | null; entered_by: string | null }[]
  >`
    select position, price_man_yen, location, land_sqm, building_sqm, layout, walk_min, ${(await scoringSchemaReady(sql)) ? sql`age_years` : sql`null as age_years`}, parking, features, source_type, source_site, confirmed_on, entered_by
    from competitors where property_id = ${propertyId} order by position
  `;
  const competitors: CompetitorValues[] = rows.map((r) => ({
    position: r.position,
    priceManYen: r.price_man_yen,
    location: r.location,
    landSqm: r.land_sqm === null ? null : Number(r.land_sqm),
    buildingSqm: r.building_sqm === null ? null : Number(r.building_sqm),
    layout: r.layout,
    walkMin: r.walk_min,
    ageYears: r.age_years,
    parking: r.parking,
    features: r.features,
    sourceType: r.source_type,
    sourceSite: r.source_site,
    confirmedOn: r.confirmed_on ? toDateInput(r.confirmed_on) : null,
    enteredBy: r.entered_by,
  }));

  return (
    <>
      {picker}
      <CompetitorForm key={propertyId} propertyId={propertyId} competitors={competitors} />
    </>
  );
}
