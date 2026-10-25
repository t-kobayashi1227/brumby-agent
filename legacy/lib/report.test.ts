import { describe, expect, it } from "vitest";
import { nearbyLists, type ReportFact } from "./report";

const supermarketFact = (status: ReportFact["status"]): ReportFact => ({
  seq: 1,
  key: "facility.supermarket_nearest",
  kind: "fact",
  value: status === "ok" ? 480 : null,
  valueText: null,
  unit: "m",
  comparison: null,
  status,
  scope: { type: "nearest", search_radius_m: 3000 },
  basis: status === "ok" ? { nearby: [{ name: "A店", kind: null, straight_m: 480, walk_min: 8 }] } : {},
  attribution: "© OpenStreetMap contributors",
  datasetVersionIds: [1],
});

describe("nearbyLists", () => {
  it("分析時点のスーパー一覧をエリア分析用に取り出す", () => {
    expect(nearbyLists([supermarketFact("ok")])).toMatchObject({
      supermarketRadiusM: 3000,
      supermarkets: [{ name: "A店", straightM: 480, walkMin: 8 }],
    });
  });

  it("取得に失敗した結果を空の検索結果と扱わない", () => {
    expect(nearbyLists([supermarketFact("not_available")]).supermarketRadiusM).toBeNull();
  });
});
