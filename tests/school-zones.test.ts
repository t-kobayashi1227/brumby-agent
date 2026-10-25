import { describe, expect, it } from "vitest";
import { parseAddress, parseAddressDetail, parseLotText, parseTownCell, pinAddress, resolveZone, wardFromSourceUrl, type ZoneRow } from "../lib/facts/school-zones";

// 新潟市の通学区域ページの実際の書き方（2026-10-12に確認）

describe("町名欄の読み取り", () => {
  it("丁目のまとめ書きを1丁目ずつに分ける", () => {
    expect(parseTownCell("青山5・6丁目")).toEqual([
      { town: "青山", chome: 5, ward: null },
      { town: "青山", chome: 6, ward: null },
    ]);
    expect(parseTownCell("浦山2～4丁目").map((t) => t.chome)).toEqual([2, 3, 4]);
    expect(parseTownCell("古田1、2丁目").map((t) => t.chome)).toEqual([1, 2]);
  });

  it("番町・ノ町は丁目と同じに扱い、「五十嵐1の町」は1つの町名にする", () => {
    expect(parseTownCell("本町通1～2番町")).toEqual([
      { town: "本町通", chome: 1, ward: null },
      { town: "本町通", chome: 2, ward: null },
    ]);
    expect(parseTownCell("下大川前通1～7ノ町")).toHaveLength(7);
    expect(parseTownCell("五十嵐3の町西")).toEqual([{ town: "五十嵐3の町西", chome: null, ward: null }]);
  });

  it("区の注記を取り、読み仮名と※は外す。「一部○区」は区を決めない", () => {
    expect(parseTownCell("紫竹2丁目（東区）")).toEqual([{ town: "紫竹", chome: 2, ward: "東区" }]);
    expect(parseTownCell("粟山（一部江南区）")).toEqual([{ town: "粟山", chome: null, ward: null }]);
    expect(parseTownCell("美善（みよし）1・2丁目").map((t) => t.town)).toEqual(["美善", "美善"]);
    expect(parseTownCell("鱸（すずき）※")).toEqual([{ town: "鱸", chome: null, ward: null }]);
  });
});

describe("地番等の読み取り", () => {
  it("全部", () => {
    expect(parseLotText("全部")).toEqual({ scope: "全部", ranges: null });
  });

  it("住居表示の番・号の範囲", () => {
    expect(parseLotText("1番／2番1号～8号")).toEqual({
      scope: "一部",
      ranges: [{ ban: [1, 1] }, { ban: [2, 2], go: [[1, 8]] }],
    });
    expect(parseLotText("3番1号、30号～46号").ranges).toEqual([{ ban: [3, 3], go: [[1, 1], [30, 46]] }]);
    expect(parseLotText("１番～５番").ranges).toEqual([{ ban: [1, 5] }]);
    expect(parseLotText("100番地～200番地").ranges).toEqual([{ ban: [100, 200] }]);
  });

  it("枝番・甲乙のある書き方は読み取らない", () => {
    expect(parseLotText("甲1番地～甲5番地")).toEqual({ scope: "一部", ranges: null });
    expect(parseLotText("12番地3～15番地")).toEqual({ scope: "一部", ranges: null });
    expect(parseLotText("2番1号～3番4号")).toEqual({ scope: "一部", ranges: null });
  });
});

describe("住所の読み取り", () => {
  it("市・区・残りに分ける", () => {
    expect(parseAddress("新潟県新潟市西区青山７丁目２番５号")).toEqual({ cityCode: "15100", ward: "西区", rest: "青山7丁目2番5号" });
    expect(parseAddress("長岡市大手通1丁目")).toEqual({ cityCode: "15202", ward: null, rest: "大手通1丁目" });
    expect(parseAddress("三条市中心部")).toBeNull();
  });

  it("丁目・番・号を取る（漢数字・ハイフンの書き方も）", () => {
    expect(parseAddressDetail("7丁目2番5号", true)).toEqual({ chome: 7, ban: 2, go: 5 });
    expect(parseAddressDetail("七丁目2-5", true)).toEqual({ chome: 7, ban: 2, go: 5 });
    expect(parseAddressDetail("7-2-5", true)).toEqual({ chome: 7, ban: 2, go: 5 });
    expect(parseAddressDetail("", true)).toEqual({ chome: null, ban: null, go: null });
    expect(parseAddressDetail("123番地4", false)).toEqual({ chome: null, ban: 123, go: 4 });
  });
});

describe("学校の決め方", () => {
  const row = (r: Partial<ZoneRow>): ZoneRow => ({
    ward: "西区", town: "青山", chome: 7, lot_scope: "全部", lot_text: "全部", lot_ranges: null,
    elementary_school: "青山小学校", junior_high_school: "関屋中学校", ...r,
  });
  const rows = [
    row({ lot_scope: "一部", lot_text: "1番／2番1号～8号", lot_ranges: [{ ban: [1, 1] }, { ban: [2, 2], go: [[1, 8]] }] }),
    row({ lot_scope: "一部", lot_text: "2番9号～20号／3番～10番", lot_ranges: [{ ban: [2, 2], go: [[9, 20]] }, { ban: [3, 10] }], junior_high_school: "小針中学校" }),
    row({ chome: 5 }),
    row({ town: "青山新町", chome: null, elementary_school: "別の小学校" }),
  ];

  it("番・号まで分かれば1校に決まる", () => {
    const r = resolveZone(rows, parseAddress("新潟市西区青山7丁目2番5号")!);
    expect(r.elementary).toMatchObject({ status: "decided", school: "青山小学校" });
    expect(r.juniorHigh).toMatchObject({ status: "decided", school: "関屋中学校" });
  });

  it("番地がないと、小学校は決まり、中学校は候補を出す", () => {
    const r = resolveZone(rows, parseAddress("新潟市西区青山7丁目")!);
    expect(r.elementary).toMatchObject({ status: "decided", school: "青山小学校" });
    expect(r.juniorHigh).toMatchObject({ status: "ambiguous", candidates: ["関屋中学校", "小針中学校"] });
  });

  it("「青山」が「青山新町」に当たらない。町がなければ none", () => {
    expect(resolveZone(rows, parseAddress("新潟市西区青山新町3")!).elementary).toMatchObject({ status: "decided", school: "別の小学校" });
    expect(resolveZone(rows, parseAddress("新潟市西区寺尾")!).elementary).toEqual({ status: "none" });
  });

  it("同じ町名が別の区にあれば、区が一致する行を使う", () => {
    const twoWards = [
      row({ ward: "西区", town: "大潟", chome: null, elementary_school: "黒埼南小学校" }),
      row({ ward: "西蒲区", town: "大潟", chome: null, elementary_school: "升潟小学校" }),
    ];
    expect(resolveZone(twoWards, parseAddress("新潟市西蒲区大潟100")!).elementary).toMatchObject({ status: "decided", school: "升潟小学校" });
  });
});

describe("区の入っていない町", () => {
  it("学校のある区と町の区が違っても（関屋中のページの西区青山）、区が空の行は使う", () => {
    const rows: ZoneRow[] = [
      { ward: null, town: "青山", chome: 7, lot_scope: "一部", lot_text: "1番／2番1号～8号", lot_ranges: [{ ban: [1, 1] }, { ban: [2, 2], go: [[1, 8]] }], elementary_school: "青山小学校", junior_high_school: "関屋中学校" },
      { ward: null, town: "青山", chome: 7, lot_scope: "一部", lot_text: "複雑な書き方", lot_ranges: null, elementary_school: "青山小学校", junior_high_school: "小針中学校" },
    ];
    const r = resolveZone(rows, parseAddress("新潟市西区青山7丁目2番5号")!);
    expect(r.elementary).toMatchObject({ status: "decided", school: "青山小学校" });
    // 小針中の行は地番を読み取れないので外せず、候補に残る
    expect(r.juniorHigh).toMatchObject({ status: "ambiguous", candidates: ["関屋中学校", "小針中学校"] });
  });
});

describe("丁目の行と丁目のない行がある町（紫竹と紫竹1～7丁目）", () => {
  const rows: ZoneRow[] = [
    { ward: null, town: "紫竹", chome: null, lot_scope: "全部", lot_text: "全部", lot_ranges: null, elementary_school: "竹尾小学校", junior_high_school: "木戸中学校" },
    { ward: "東区", town: "紫竹", chome: 2, lot_scope: "全部", lot_text: "全部", lot_ranges: null, elementary_school: "沼垂小学校", junior_high_school: "東新潟中学校" },
  ];

  it("丁目があれば丁目の行だけ、番地だけなら丁目のない行だけを使う", () => {
    expect(resolveZone(rows, parseAddress("新潟市東区紫竹2丁目1-1")!).elementary).toMatchObject({ status: "decided", school: "沼垂小学校" });
    expect(resolveZone(rows, parseAddress("新潟市東区紫竹2-1-1")!).elementary).toMatchObject({ status: "decided", school: "沼垂小学校" });
    expect(resolveZone(rows, parseAddress("新潟市東区紫竹123-4")!).elementary).toMatchObject({ status: "decided", school: "竹尾小学校" });
  });

  it("町名だけなら両方を候補にする", () => {
    expect(resolveZone(rows, parseAddress("新潟市東区紫竹")!).elementary).toMatchObject({ status: "ambiguous", candidates: ["竹尾小学校", "沼垂小学校"] });
  });
});

describe("同じ町名が別の区にもある町（中央区の天神1・2丁目と秋葉区の天神）", () => {
  const base = "https://www.city.niigata.lg.jp/kosodate/gakko/shugaku/gakukuiki/sub02";

  it("ページの URL から区を出す", () => {
    expect(wardFromSourceUrl(`${base}/03chuo_ku/21chuo_ku.html`)).toBe("中央区");
    expect(wardFromSourceUrl(`${base}/05akiha_ku/07akiha_ku.html`)).toBe("秋葉区");
    expect(wardFromSourceUrl(`${base}/08nishikan_ku/01.html`)).toBe("西蒲区");
    expect(wardFromSourceUrl("https://example.com/other.html")).toBeNull();
  });

  const row = (r: Partial<ZoneRow>): ZoneRow => ({
    ward: null, town: "天神", chome: null, lot_scope: "全部", lot_text: "全部", lot_ranges: null,
    elementary_school: "南万代小学校", junior_high_school: "宮浦中学校", ...r,
  });
  // 区はページの URL から付けた値（collect.ts と同じ）
  const rows = [
    row({ ward: "中央区", chome: 1 }),
    row({ ward: "中央区", chome: 2 }),
    row({ ward: "秋葉区", elementary_school: "新津第三小学校", junior_high_school: "新津第一中学校" }),
  ];

  it("中央区の住所は、秋葉区の丁目のない行に当たらない（「天神1」は1丁目と読む）", () => {
    expect(resolveZone(rows, parseAddress("新潟市中央区天神1")!).elementary).toMatchObject({ status: "decided", school: "南万代小学校" });
    expect(resolveZone(rows, parseAddress("新潟市中央区天神2丁目3番4号")!).juniorHigh).toMatchObject({ status: "decided", school: "宮浦中学校" });
  });

  it("秋葉区の住所は秋葉区の行に当たる", () => {
    expect(resolveZone(rows, parseAddress("新潟市秋葉区天神123")!).elementary).toMatchObject({ status: "decided", school: "新津第三小学校" });
  });
});

describe("物件の位置（ピン）の町丁目で照らし合わせる", () => {
  const row = (r: Partial<ZoneRow>): ZoneRow => ({
    ward: "西区", town: "青山", chome: 7, lot_scope: "全部", lot_text: "全部", lot_ranges: null,
    elementary_school: "青山小学校", junior_high_school: "関屋中学校", ...r,
  });
  const rows = [
    row({ lot_scope: "一部", lot_text: "1番", lot_ranges: [{ ban: [1, 1] }] }),
    row({ lot_scope: "一部", lot_text: "2番～10番", lot_ranges: [{ ban: [2, 10] }], junior_high_school: "小針中学校" }),
    row({ chome: 6, elementary_school: "東青山小学校" }),
  ];

  it("町丁目は位置から、番地は入力の住所から取る", () => {
    const a = pinAddress({ name: "青山七丁目", ward: "西区" }, parseAddress("新潟市西区青山7-3-5"), rows);
    expect(a).toEqual({ cityCode: "15100", ward: "西区", rest: "青山七丁目3番5号" });
    expect(resolveZone(rows, a).juniorHigh).toMatchObject({ status: "decided", school: "小針中学校" });
  });

  it("住所とピンの丁目が違うときは、ピンの丁目を使い、住所の番地は使わない", () => {
    const a = pinAddress({ name: "青山六丁目", ward: "西区" }, parseAddress("新潟市西区青山7丁目1番"), rows);
    expect(a.rest).toBe("青山六丁目");
    expect(resolveZone(rows, a).elementary).toMatchObject({ status: "decided", school: "東青山小学校" });
  });

  it("番地で分かれる町で番地が分からなければ、候補を出す（要確認）", () => {
    const a = pinAddress({ name: "青山七丁目", ward: "西区" }, null, rows);
    expect(resolveZone(rows, a).juniorHigh).toMatchObject({ status: "ambiguous", candidates: ["関屋中学校", "小針中学校"] });
  });
});
