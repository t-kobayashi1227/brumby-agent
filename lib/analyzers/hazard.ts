import type { Analyzer, AnalyzerContext, FactDraft } from "../types";
import { featuresAtPoint, fetchRecord, notFetched } from "./common";
import { singleVersion } from "./versions";

// ⑤ 防災（設計書 5.3）：物件の地点が、浸水想定・土砂災害・液状化の区域に入っているか
// 断定ではなく「確認を促す」ためのカード。出典と時点を必ず付ける

// 国土数値情報 A31a 浸水深ランクコード（water_depth_code.xlsx）
const FLOOD_RANK: Record<number, string> = {
  1: "0〜0.5m未満（床下程度の浸水）",
  2: "0.5〜3.0m未満（床上から1階が浸水）",
  3: "3.0〜5.0m未満（2階部分が浸水）",
  4: "5.0〜10.0m未満（2階部分が水没）",
  5: "10.0〜20.0m未満",
  6: "20.0m以上",
};

// 国土数値情報 A33 現象種別コード・区域コード
const PHENOMENON: Record<number, string> = { 1: "急傾斜地の崩壊", 2: "土石流", 3: "地滑り" };
const ZONE: Record<number, string> = {
  1: "土砂災害警戒区域",
  2: "土砂災害特別警戒区域",
  3: "土砂災害警戒区域（指定前）",
  4: "土砂災害特別警戒区域（指定前）",
};

async function flood(ctx: AnalyzerContext): Promise<FactDraft> {
  const key = "hazard.flood";
  const version = singleVersion(ctx.versions, "reinfolib/XKT026");
  const record = await fetchRecord(ctx, "XKT026");
  if (!version || !record || record.status === "failed") return notFetched(key, record, { type: "point" });

  const rivers = (await featuresAtPoint(ctx, "XKT026"))
    .map((f) => ({ river: String(f.properties.A31a_202 ?? ""), rank: Number(f.properties.A31a_205) }))
    .sort((a, b) => b.rank - a.rank);
  const maxRank = rivers[0]?.rank ?? 0;
  return {
    key,
    value: maxRank,
    valueText: maxRank > 0 ? `浸水深 ${FLOOD_RANK[maxRank] ?? `ランク${maxRank}`}` : "浸水想定区域の外",
    unit: "rank",
    scope: { type: "point" },
    basis: { scale: "想定最大規模", rivers, fetched_at: record.fetched_at },
    status: "ok",
    datasetVersionIds: [version.id],
    attribution: version.attribution,
  };
}

async function landslide(ctx: AnalyzerContext): Promise<FactDraft> {
  const key = "hazard.landslide";
  const version = singleVersion(ctx.versions, "reinfolib/XKT029");
  const record = await fetchRecord(ctx, "XKT029");
  if (!version || !record || record.status === "failed") return notFetched(key, record, { type: "point" });

  const zones = (await featuresAtPoint(ctx, "XKT029")).map((f) => ({
    phenomenon: PHENOMENON[Number(f.properties.A33_001)] ?? String(f.properties.A33_001),
    zone: ZONE[Number(f.properties.A33_002)] ?? String(f.properties.A33_002),
    name: f.properties.A33_005 ?? null,
  }));
  return {
    key,
    value: zones.length > 0 ? 1 : 0,
    valueText: zones.length > 0 ? zones.map((z) => `${z.zone}（${z.phenomenon}）`).join("、") : "土砂災害警戒区域の外",
    unit: "flag",
    scope: { type: "point" },
    basis: { zones, fetched_at: record.fetched_at },
    status: "ok",
    datasetVersionIds: [version.id],
    attribution: version.attribution,
  };
}

async function liquefaction(ctx: AnalyzerContext): Promise<FactDraft> {
  const key = "hazard.liquefaction";
  const version = singleVersion(ctx.versions, "reinfolib/XKT025");
  const record = await fetchRecord(ctx, "XKT025");
  if (!version || !record || record.status === "failed") return notFetched(key, record, { type: "point" });

  const [f] = await featuresAtPoint(ctx, "XKT025");
  if (!f) {
    return { ...notFetched(key, record, { type: "point" }), basis: { reason: "物件の地点に液状化の発生傾向図のデータがありません" }, datasetVersionIds: [version.id] };
  }
  // 液状化発生傾向の強弱（6段階）。1が最も液状化しやすい
  return {
    key,
    value: Number(f.properties.liquefaction_tendency_level),
    valueText: String(f.properties.note ?? ""),
    unit: "level(1=最も液状化しやすい〜6)",
    scope: { type: "point" },
    basis: { landform: f.properties.topographic_classification_name_ja ?? null, fetched_at: record.fetched_at },
    status: "ok",
    datasetVersionIds: [version.id],
    attribution: version.attribution,
  };
}

export const hazardAnalyzer: Analyzer = {
  name: "防災",
  run: async (ctx) => [await flood(ctx), await landslide(ctx), await liquefaction(ctx)],
};
