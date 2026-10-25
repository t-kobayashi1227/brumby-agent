import { describe, expect, it } from "vitest";
import { parseSupermarkets } from "./osm";

describe("parseSupermarkets", () => {
  it("node と way の座標を読み、スーパー以外と不正な座標を除く", () => {
    expect(parseSupermarkets({ elements: [
      { type: "node", id: 10, lat: 37.9, lon: 139.0, tags: { shop: "supermarket", name: "A店" } },
      { type: "way", id: 20, center: { lat: 37.91, lon: 139.01 }, tags: { shop: "supermarket", name: "B店" } },
      { type: "node", id: 30, lat: 37.9, lon: 139.0, tags: { shop: "convenience" } },
      { type: "way", id: 40, center: { lat: 100, lon: 139.0 }, tags: { shop: "supermarket" } },
    ] })).toEqual([
      { id: "node/10", lat: 37.9, lon: 139.0, tags: { shop: "supermarket", name: "A店" } },
      { id: "way/20", lat: 37.91, lon: 139.01, tags: { shop: "supermarket", name: "B店" } },
    ]);
  });

  it("壊れた応答を空の結果として扱わない", () => {
    expect(() => parseSupermarkets({ remark: "rate limited" })).toThrow("応答が正しくありません");
  });
});
