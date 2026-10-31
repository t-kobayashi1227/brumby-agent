import { describe, expect, it } from "vitest";
import { kindOf } from "../scripts/ingest/jobs/osm";

describe("OSM の種類（kindOf）", () => {
  it("convenience でもスーパーの名前ならスーパーに直す", () => {
    expect(kindOf("convenience", "イオンスタイル上所")).toEqual({ kind: "スーパー", fixed: true });
    expect(kindOf("convenience", "ウオロク　上新栄町店")).toEqual({ kind: "スーパー", fixed: true });
  });

  it("名前が当たらなければ fclass のまま", () => {
    expect(kindOf("convenience", "セブンイレブン新潟上所店")).toEqual({ kind: "コンビニ", fixed: false });
    expect(kindOf("supermarket", "イオン新潟南店")).toEqual({ kind: "スーパー", fixed: false });
    expect(kindOf("chemist", "ウエルシア薬局")).toEqual({ kind: "ドラッグストア", fixed: false });
  });

  it("使わない fclass は null", () => {
    expect(kindOf("pharmacy", "つき薬局")).toBeNull();
  });
});
