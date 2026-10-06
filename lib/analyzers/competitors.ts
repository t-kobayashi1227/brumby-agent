import type { Analyzer, FactDraft } from "../types";

// ⑥ 競合物件（設計書 5.3）：手入力の競合物件（3件まで）と比べる
// 価格の差、面積あたりの価格の差、面積の差、特徴の一覧（特徴の違いの言葉づくりはAIが行う）

interface Competitor {
  position: number;
  price_man_yen: number | null;
  location: string | null;
  land_sqm: number | null;
  building_sqm: number | null;
  layout: string | null;
  walk_min: number | null;
  parking: number | null;
  features: string | null;
  source_type: "portal" | "seen" | "other" | null;
  source_site: string | null;
  confirmed_on: string | null;
}

/** 出典：手入力で、どこで・いつ確かめたか（D30）。例：競合物件は手入力（1件目 SUUMO・2026-10-05確認 ／ …） */
function attributionOf(rows: Competitor[]) {
  const where = (c: Competitor) => c.source_site ?? (c.source_type === "seen" ? "現地などで見かけた" : c.source_type === "portal" ? "ポータルサイト" : "出どころ未入力");
  return `競合物件は手入力（${rows.map((c) => `${c.position}件目 ${where(c)}${c.confirmed_on ? `・${c.confirmed_on}確認` : ""}`).join(" ／ ")}）`;
}
const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const round3 = (x: number) => Math.round(x * 1000) / 1000;
const signed = (x: number) => `${x >= 0 ? "+" : "−"}${Math.abs(x * 100).toFixed(1)}%`;

export const competitorsAnalyzer: Analyzer = {
  name: "競合物件",
  async run(ctx) {
    const p = ctx.property;
    const scope = { type: "manual", max: 3 };
    const rows = await ctx.sql<Competitor[]>`
      select position, price_man_yen, location, land_sqm::float8 as land_sqm, building_sqm::float8 as building_sqm,
             layout, walk_min, parking, features, source_type, source_site, to_char(confirmed_on, 'YYYY-MM-DD') as confirmed_on
      from competitors where property_id = ${p.id} order by position
    `;
    if (rows.length === 0) {
      return [{ key: "competitor.price_gap", status: "not_available", scope, basis: { reason: "競合物件が入力されていません" }, datasetVersionIds: [] }];
    }
    const facts: FactDraft[] = [];
    const ATTRIBUTION = attributionOf(rows);
    const list = rows.map((c) => ({ ...c, land_sqm: c.land_sqm === null ? null : Number(c.land_sqm), building_sqm: c.building_sqm === null ? null : Number(c.building_sqm) }));

    // 価格の差：物件の価格 ÷ 競合の平均 − 1
    const priced = list.filter((c) => c.price_man_yen !== null);
    if (p.price_man_yen !== null && priced.length > 0) {
      const avg = average(priced.map((c) => c.price_man_yen!));
      const gap = p.price_man_yen / avg - 1;
      facts.push({
        key: "competitor.price_gap",
        value: round3(gap),
        valueText: `物件の価格 ${p.price_man_yen.toLocaleString("ja-JP")}万円は、競合${priced.length}件の平均 ${Math.round(avg).toLocaleString("ja-JP")}万円より${Math.abs(gap * 100).toFixed(1)}%${gap >= 0 ? "高い" : "低い"}`,
        unit: "ratio",
        comparison: Math.round(avg),
        scope,
        basis: {
          property_price_man_yen: p.price_man_yen,
          competitors: priced.map((c) => ({ position: c.position, price_man_yen: c.price_man_yen, gap: signed(p.price_man_yen! / c.price_man_yen! - 1) })),
        },
        status: "ok",
        datasetVersionIds: [],
        attribution: ATTRIBUTION,
      });
    }

    // 面積あたりの価格の差：戸建は建物の面積、土地は土地の面積で割る
    const areaKey = p.property_type === "土地" ? "land_sqm" : "building_sqm";
    const areaLabel = p.property_type === "土地" ? "土地" : "建物";
    const propertyArea = p[areaKey];
    const withArea = priced.filter((c) => c[areaKey] !== null && c[areaKey]! > 0);
    if (p.price_man_yen !== null && propertyArea && withArea.length > 0) {
      const own = (p.price_man_yen * 10000) / propertyArea;
      const avg = average(withArea.map((c) => (c.price_man_yen! * 10000) / c[areaKey]!));
      const gap = own / avg - 1;
      facts.push({
        key: "competitor.unit_price_gap",
        value: round3(gap),
        valueText: `${areaLabel}1㎡あたりの価格 ${Math.round(own).toLocaleString("ja-JP")}円は、競合${withArea.length}件の平均 ${Math.round(avg).toLocaleString("ja-JP")}円より${Math.abs(gap * 100).toFixed(1)}%${gap >= 0 ? "高い" : "低い"}`,
        unit: "ratio",
        comparison: Math.round(avg),
        scope,
        basis: {
          area: areaLabel,
          property_yen_per_sqm: Math.round(own),
          competitors: withArea.map((c) => ({ position: c.position, yen_per_sqm: Math.round((c.price_man_yen! * 10000) / c[areaKey]!) })),
        },
        status: "ok",
        datasetVersionIds: [],
        attribution: ATTRIBUTION,
      });
    }

    // 土地の面積の差
    const withLand = list.filter((c) => c.land_sqm !== null);
    if (p.land_sqm && withLand.length > 0) {
      const avg = average(withLand.map((c) => c.land_sqm!));
      const gap = p.land_sqm / avg - 1;
      facts.push({
        key: "competitor.land_area_gap",
        value: round3(gap),
        valueText: `土地 ${p.land_sqm}㎡は、競合${withLand.length}件の平均 ${avg.toFixed(1)}㎡より${Math.abs(gap * 100).toFixed(1)}%${gap >= 0 ? "広い" : "狭い"}`,
        unit: "ratio",
        comparison: Math.round(avg * 10) / 10,
        scope,
        basis: { property_land_sqm: p.land_sqm, competitors: withLand.map((c) => ({ position: c.position, land_sqm: c.land_sqm })) },
        status: "ok",
        datasetVersionIds: [],
        attribution: ATTRIBUTION,
      });
    }

    // 特徴の一覧（物件と競合を並べる。違いの言葉づくりはAIに任せる）
    facts.push({
      key: "competitor.features",
      value: list.length,
      valueText: `競合${list.length}件の特徴：${list.map((c) => `${c.position}件目 ${[c.layout, c.walk_min !== null ? `駅徒歩${c.walk_min}分` : null, c.parking !== null ? `駐車場${c.parking}台` : null, c.features].filter(Boolean).join("・")}`).join(" ／ ")}`,
      unit: "count",
      scope,
      basis: {
        property: { layout: p.layout, parking: p.parking, access: p.access, features: p.features, land_sqm: p.land_sqm, building_sqm: p.building_sqm },
        competitors: list,
        note: "空欄は入力されていない項目",
      },
      status: "ok",
      datasetVersionIds: [],
      attribution: ATTRIBUTION,
    });
    return facts;
  },
};
