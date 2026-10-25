import { describe, expect, it } from "vitest";
import { addressForSearch, buildRows, classify } from "../scripts/ingest/jobs/d29-large-stores";

describe("classify", () => {
  it("店名か主な小売店舗のチェーン名で、スーパー・ドラッグストアを決める", () => {
    expect(classify("赤道ショッピングセンター", "㈱原信")).toBe("スーパー");
    expect(classify("亀貝3街区東商業開発", "ｳｴﾙｼｱ関東㈱")).toBe("ドラッグストア"); // 半角カナ
    expect(classify("㈲長栄産業貸店舗", "㈱ドラックフジイ")).toBe("ドラッグストア");
  });

  it("ホームセンターや家電の店は対象外", () => {
    expect(classify("コメリホームセンター内野店", "㈱コメリ")).toBeNull();
    expect(classify("イオンモール新潟南", "イオンモール㈱")).toBeNull();
  });
});

describe("addressForSearch", () => {
  it("市町村名が無ければ足し、末尾の「外」を外す", () => {
    expect(addressForSearch("新潟市", "西区善久字川中６９７番地１外")).toBe("新潟市西区善久字川中６９７番地１");
    expect(addressForSearch("新潟市", "新潟市錦町４－３７")).toBe("新潟市錦町４－３７");
  });
});

describe("buildRows", () => {
  it("市町村名の行を基準に、上下に折り返されたセルの文字をつなぐ", () => {
    const rows = buildRows([
      [
        { x: 112.1, y: 667.9, text: " ＩＣＩ石井スポーツ新" },
        { x: 232.1, y: 667.9, text: "堀之内南１丁目１６" },
        { x: 44.3, y: 664.3, text: "新潟市" },
        { x: 374.6, y: 664.1, text: " 1,157" },
        { x: 112.1, y: 660.7, text: "潟とやの店" },
        { x: 232.1, y: 660.7, text: "番５６号" },
      ],
    ]);
    expect(rows).toEqual([{ 店舗名: "ＩＣＩ石井スポーツ新潟とやの店", 所在地: "堀之内南１丁目１６番５６号", 市町村名: "新潟市", 店舗面積: "1,157", ページ: "1" }]);
  });
});
