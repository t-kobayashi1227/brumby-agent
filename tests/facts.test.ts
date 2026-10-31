import { describe, expect, it } from "vitest";
import {
  ageBandOf,
  bandLabel,
  buildFacts,
  depthLower,
  pricePerTsubo,
  resaleDownPayment,
  selectMarket,
  selectSimilarMarket,
  sourceOf,
  type Collected,
  type DatasetInfo,
  type MarketTrade,
  listShares,
} from "../lib/facts/build";
import { sumMismatches } from "../scripts/ingest/jobs/buyers";
import { groupBusStops, toD10TownName } from "../lib/facts/collect";
import { formatChange, formatDistance, formatManYen1, formatNearby, median } from "../lib/facts/format";
import { numberFacts, type Fact } from "../lib/facts/types";

// 物件・施設名・数値は架空（設計まとめ「見本：架空の物件」に合わせた 2,480万円の中古）

function ds(id: string, name: string, provider: string, as_of: string, row_count: number | null = 100): DatasetInfo {
  return { id, name, provider, as_of, row_count };
}

const DATASETS: Record<string, DatasetInfo> = Object.fromEntries(
  [
    ds("D01", "取引価格・成約価格（XIT001）", "不動産情報ライブラリ", "2015Q1〜2026Q1（四半期）"),
    ds("D02", "地価公示（L01）", "国土数値情報", "2026"),
    ds("D03", "都道府県地価調査（L02）", "国土数値情報", "2026"),
    ds("D04", "用途地域（XKT002）", "不動産情報ライブラリ", "2026-07"),
    ds("D05", "年齢別人口（T001082）", "e-Stat 国勢調査", "2020"),
    ds("D06", "家族類型別世帯数（T001084）", "e-Stat 国勢調査", "2020"),
    ds("D07", "持ち家・借家別世帯数（T001085）", "e-Stat 国勢調査", "2020"),
    ds("D08", "住宅の建て方別世帯数（T001086）", "e-Stat 国勢調査", "2020"),
    ds("D10", "町名別5歳階級人口", "新潟市OD", "2026-09"),
    ds("D11", "250mメッシュ将来推計人口（mesh250r6）", "国土数値情報", "R6推計"),
    ds("D14", "通学区域一覧", "新潟市教育委員会", "2026-04-01"),
    ds("D17", "保育園", "国土数値情報 P14", "2023"),
    ds("D20", "認定こども園", "国土数値情報 P29", "2023"),
    ds("D22", "公園・緑地", "新潟市OD", "2019-12"),
    ds("D25", "鉄道・駅（N02）", "国土数値情報", "2025"),
    ds("D26", "駅別乗降客数（S12）", "国土数値情報", "2024"),
    ds("D27", "バス停留所（P11）", "国土数値情報", "2022"),
    ds("D28", "スーパー・ドラッグストア・コンビニ", "OpenStreetMap（Geofabrik 中部地方）", "2026-10-24"),
    ds("D29", "大規模小売店舗一覧", "新潟県", "2026-09"),
    ds("D30", "病院・診療所・歯科・薬局", "医療情報ネット", "2026-10-24（ダウンロード日）"),
    ds("D31", "洪水浸水想定区域（A31a）", "国土数値情報", "2025", null),
    ds("D33", "土砂災害警戒区域（A33）", "国土数値情報", "2025"),
    ds("D34", "津波浸水想定（A40）", "国土数値情報", "2017"),
    ds("D35", "液状化の発生傾向（XKT025）", "不動産情報ライブラリ", "2024-10"),
    ds("D36", "大規模盛土造成地（A54）", "国土数値情報", "2023"),
    ds("D39", "町丁・字等の境界（小地域）", "e-Stat 国勢調査", "2020"),
    ds("B02", "住宅市場動向調査", "国土交通省", "令和7年度（2026-07公表）"),
    ds("B06", "情報通信メディアの利用時間と情報行動に関する調査", "総務省", "令和7年度（2026-06掲載）"),
  ].map((d) => [d.id, d]),
);

function sample(overrides: Partial<Collected> = {}): Collected {
  return {
    today: "2026-10-25",
    property: {
      code: "BR-2026-0099",
      property_class: "中古",
      price_man_yen: 2480,
      address: "新潟県新潟市西区架空町1丁目2番3号",
      layout: "4LDK",
      rooms: 4,
      storerooms: 0,
      building_sqm: 105.5,
      land_sqm: 200,
      parking: 2,
      building_age: 22,
      floors: "2階建",
      has_garden: true,
      renovated: true,
      renovation_year: 2023,
      renovation_parts: ["キッチン", "浴室"],
      features: "シャッター車庫あり",
      ad_budget_man_yen: null,
    },
    transports: [{ mode: "電車", line: "JR越後線", stop_name: "架空", walk_min: 18 }],
    datasets: DATASETS,
    town: { key_code: "15107999001", name: "架空町一丁目", ward: "西区", city_code: "15107" },
    market: {
      band: { from: 20, to: 29 },
      fromYear: 2015,
      toYear: 2026,
      trades: [
        { year: 2015, building_year: 1990, price: 18_000_000, floor_sqm: 100, land_sqm: 180 },
        { year: 2018, building_year: 1995, price: 20_000_000, floor_sqm: 110, land_sqm: 200 },
        { year: 2023, building_year: 2000, price: 21_000_000, floor_sqm: 100, land_sqm: 220 },
        { year: 2026, building_year: 2004, price: 22_000_000, floor_sqm: 120, land_sqm: null },
      ],
    },
    similarMarket: {
      band: { from: 20, to: 29 },
      fromYear: 2015,
      toYear: 2023,
      trades: [
        { year: 2015, building_year: 1990, price: 18_000_000, floor_sqm: 100, land_sqm: 180 },
        { year: 2018, building_year: 1995, price: 20_000_000, floor_sqm: 110, land_sqm: 200 },
        { year: 2023, building_year: 2000, price: 21_000_000, floor_sqm: 100, land_sqm: 220 },
      ],
    },
    landPrice: { dataset_id: "D02", address: "新潟県　新潟市西区架空町２丁目１番", price_per_sqm: 35800, change_rate: 0.6, year: 2026, distance_m: 652 },
    zones: [
      { dataset_id: "D04", kind: "用途地域", label: "第１種低層住居専用地域", attrs: null },
      { dataset_id: "D34", kind: "津波浸水想定", label: "0.01m以上〜0.3m未満", attrs: null },
      { dataset_id: "D34", kind: "津波浸水想定", label: "0.3m以上〜0.5m未満", attrs: null },
      { dataset_id: "D35", kind: "液状化の傾向", label: "やや液状化しやすい（後背湿地）", attrs: null },
    ],
    schools: {
      elementary: { status: "decided", school: "架空小学校", distance_m: 703, basis: "位置" },
      juniorHigh: { status: "ambiguous", candidates: ["架空中学校", "架空西中学校"], basis: "住所" },
    },
    facilities: [
      {
        label: "公園",
        within1km: [150, 380, 500, 600, 700, 900].map((d, i) => ({ name: `公園${i + 1}`, distance_m: d })),
        nearest3km: null,
        wardAverage: 4.18,
        datasetIds: ["D22"],
      },
      { label: "スーパー", within1km: [], nearest3km: { name: "架空スーパー", distance_m: 1140 }, wardAverage: 2.1, datasetIds: ["D28", "D29"] },
      { label: "小学校", within1km: [{ name: "架空小学校", distance_m: 703 }], nearest3km: null, wardAverage: 1.3, datasetIds: ["D15"] },
    ],
    departments: [
      { label: "小児科のある病院・診療所", within1km: [], nearest3km: null, wardAverage: null, datasetIds: ["D30"] },
      { label: "内科のある病院・診療所", within1km: [{ name: "架空内科医院", distance_m: 420 }], nearest3km: null, wardAverage: 3.46, datasetIds: ["D30"] },
    ],
    station: { name: "架空", lines: ["越後線"], distance_m: 1450, passengers: null },
    bus: { within1km: [{ name: "架空停", distance_m: 120 }], nearest: { name: "架空停", distance_m: 120, routes: 3, operators: ["架空交通"] }, wardAverage: 16.5 },
    area: {
      d10Town: { 人口計: 1000, 世帯数: 400, "0〜4歳": 50, "5〜9歳": 50, "10〜14歳": 58, "20〜24歳": 50, "25〜29歳": 50, "30〜34歳": 50, "35〜39歳": 50 },
      d10Ward: { 人口計: 10000, 世帯数: 4000, "0〜4歳": 400, "5〜9歳": 400, "10〜14歳": 390 },
      censusTown: { D06: { 一般世帯総数: 400, "18歳未満世帯員のいる一般世帯総数": 100, 核家族以外の世帯: 30 }, D07: { 住宅に住む一般世帯: 400, 持ち家: 300, 民営借家: null } },
      censusWard: { D06: { 一般世帯総数: 4000, "18歳未満世帯員のいる一般世帯総数": 800, 核家族以外の世帯: 200 } },
      meshNear: { total2025: 10000, total2035: 9180, kids2025: 1200, kids2035: 1000 },
      meshWard: { total2025: 100000, total2035: 94000, kids2025: 11000, kids2035: 9500 },
    },
    buyers: {
      segment: "中古戸建を買った世帯",
      income: [
        { item: "400万円未満", value: 20 },
        { item: "400〜600万円未満", value: 30 },
        { item: "600〜800万円未満", value: 30 },
        { item: "800万円以上", value: 20 },
        { item: "無回答", value: 25 },
      ],
      incomeSource: "住宅市場動向調査 p.450",
      ages: [
        { item: "30代", value: 22.9 },
        { item: "40代", value: 26.5 },
      ],
      agesSource: "住宅市場動向調査 p.39",
      search: [],
      searchSource: null,
      media: [{ category: "SNS・動画の利用率", item: "Instagram", byAge: [{ age: "20代", value: 83 }, { age: "30代", value: 77 }], source: "総務省 問6" }],
    },
    assumptions: [
      { id: 1, key: "変動金利", value: 1.3, unit: "%", as_of: "2026-10" },
      { id: 2, key: "全期間固定金利", value: 3.83, unit: "%", as_of: "2026-10" },
      { id: 3, key: "頭金の割合", value: 10, unit: "%", as_of: "2025年度" },
      { id: 4, key: "返済負担率", value: 25, unit: "%", as_of: "2025年度" },
      { id: 5, key: "返済期間", value: 35, unit: "年", as_of: "2026-10" },
      { id: 6, key: "完済年齢の上限", value: 80, unit: "歳", as_of: "令和7年度" },
      { id: 7, key: "住み替えの頭金の割合（中古）", value: 49.2, unit: "%", as_of: "令和7年度", basis: "住宅市場動向調査 二次取得者の自己資金比率" },
      { id: 8, key: "住み替えの頭金の金額（中古）", value: 1223, unit: "万円", as_of: "令和7年度", basis: "住宅市場動向調査 二次取得者の平均の自己資金（三大都市圏）" },
    ],
    targets: [
      { name: "若い夫婦", representative_age: 30, definition: "世帯主が20〜30代前半の夫婦" },
      { name: "60歳以上", representative_age: 65, definition: null, uses_resale_down_payment: true },
      { name: "単身", representative_age: 35, definition: null },
    ],
    competitors: [{ position: 1, price_man_yen: 2380, address: "新潟市西区架空町", building_sqm: 100, land_sqm: null, building_age: 18, distance_m: 1234 }],
    media: [{ id: "C-01", name: "SUUMO", category: "不動産ポータル", purpose: "問い合わせ", reach_ages: "30〜40代" }],
    ...overrides,
  };
}

function find(facts: Fact[], item: string | RegExp): Fact {
  const f = facts.find((x) => (typeof item === "string" ? x.項目 === item : item.test(x.項目)));
  if (!f) throw new Error(`事実がありません：${item}`);
  return f;
}

describe("書き方", () => {
  it("直線距離は1km未満を10m、1km以上を0.1kmで丸める", () => {
    expect(formatDistance(652)).toBe("直線650m");
    // 1km未満は丸めても1000mにしない（1km以内の一覧で境目の外に見えないように）
    expect(formatDistance(994)).toBe("直線990m");
    expect(formatDistance(995)).toBe("直線990m");
    expect(formatDistance(999)).toBe("直線990m");
    expect(formatDistance(1000)).toBe("直線1.0km");
    expect(formatDistance(1001)).toBe("直線1.0km");
    expect(formatDistance(1049)).toBe("直線1.0km");
    expect(formatDistance(1050)).toBe("直線1.1km");
    expect(formatDistance(1140)).toBe("直線1.1km");
    expect(formatDistance(2000)).toBe("直線2.0km");
  });

  it("1km以内の一覧は近い順に5件まで。無ければ3km以内の最寄り", () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => ({ name: `店${n}`, distance_m: n * 100 }));
    expect(formatNearby(six, null)).toBe("6件：店1 直線100m、店2 直線200m、店3 直線300m、店4 直線400m、店5 直線500m ほか1件");
    expect(formatNearby([], { name: "店A", distance_m: 1140 })).toBe("0件。3km以内の最寄り：店A 直線1.1km");
    expect(formatNearby([], null)).toBe("0件。3km以内になし");
  });

  it("中央値・変化率", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
    expect(formatChange(2.44)).toBe("+2.4%");
    expect(formatChange(-8.2)).toBe("-8.2%");
    expect(formatChange(-0.01)).toBe("0.0%");
  });

  it("築年数帯", () => {
    expect(bandLabel(ageBandOf(0))).toBe("築0〜1年");
    expect(bandLabel(ageBandOf(1))).toBe("築0〜1年");
    expect(bandLabel(ageBandOf(2))).toBe("築2〜9年");
    expect(bandLabel(ageBandOf(9))).toBe("築2〜9年");
    expect(bandLabel(ageBandOf(10))).toBe("築10〜19年");
    expect(bandLabel(ageBandOf(22))).toBe("築20〜29年");
    expect(bandLabel(ageBandOf(39))).toBe("築30〜39年");
    expect(bandLabel(ageBandOf(45))).toBe("築40〜49年");
    expect(bandLabel(ageBandOf(49))).toBe("築40〜49年");
    expect(bandLabel(ageBandOf(50))).toBe("築50年以上");
    expect(bandLabel(ageBandOf(72))).toBe("築50年以上");
  });

  it("延床の坪単価（1坪 = 400/121㎡）", () => {
    expect(formatManYen1(pricePerTsubo(20_000_000, 100))).toBe("66.1万円");
  });
});

describe("相場に使う取引の選び方（selectMarket）", () => {
  // 築年数 age の取引を year に count 件
  const trades = (year: number, age: number, count: number): MarketTrade[] =>
    Array.from({ length: count }, () => ({ year, building_year: year - age, price: 20_000_000, floor_sqm: 100, land_sqm: 200 }));
  const band = ageBandOf(22);

  it("直近5年で20件以上なら直近5年だけを使う", () => {
    const m = selectMarket([...trades(2016, 25, 30), ...trades(2022, 22, 12), ...trades(2026, 20, 8)], band, 2026);
    expect(m).toMatchObject({ fromYear: 2022, toYear: 2026 });
    expect(m!.trades).toHaveLength(20);
  });

  it("直近5年で20件に足りなければ全部の年を使い、20件未満でもそのまま出す", () => {
    const m = selectMarket([...trades(2015, 25, 3), ...trades(2021, 22, 4), ...trades(2022, 22, 5)], band, 2026);
    expect(m).toMatchObject({ fromYear: 2015, toYear: 2022 });
    expect(m!.trades).toHaveLength(12);
  });

  it("帯の外の取引は入らず、帯に無ければ null", () => {
    const rows = [...trades(2024, 19, 5), ...trades(2024, 30, 5), ...trades(2024, 25, 2)];
    expect(selectMarket(rows, band, 2026)!.trades).toHaveLength(2);
    expect(selectMarket(trades(2024, 30, 5), band, 2026)).toBeNull();
  });

  it("新築（築0年）は築0〜1年の帯の取引と比べる", () => {
    const m = selectMarket([...trades(2025, 0, 2), ...trades(2025, 1, 3), ...trades(2025, 2, 4)], ageBandOf(0), 2026);
    expect(m!.trades).toHaveLength(5);
  });
});

describe("広さの近い取引の選び方（selectSimilarMarket）", () => {
  const band = ageBandOf(22);
  const property = { building_sqm: 100, land_sqm: 200 };
  const trade = (floor_sqm: number, land_sqm: number | null, year = 2024): MarketTrade => ({ year, building_year: year - 22, price: 20_000_000, floor_sqm, land_sqm });

  it("延床・土地がどちらも 0.7〜1.3倍（両端を含む）の取引だけを使う", () => {
    const rows = [trade(70, 140), trade(130, 260), trade(69.9, 200), trade(100, 260.1), trade(100, null), trade(100, 200)];
    expect(selectSimilarMarket(rows, band, 2026, property)?.trades.map((t) => [t.floor_sqm, t.land_sqm])).toEqual([
      [70, 140],
      [130, 260],
      [100, 200],
    ]);
  });

  it("年の範囲は selectMarket と同じ決まり（直近5年で20件に足りなければ全部の年）。無ければ null", () => {
    const m = selectSimilarMarket([trade(100, 200, 2016), trade(100, 200, 2024)], band, 2026, property);
    expect(m).toMatchObject({ fromYear: 2016, toYear: 2024 });
    expect(selectSimilarMarket([trade(200, 200)], band, 2026, property)).toBeNull();
  });
});

describe("バス停を停留所の名前でまとめる（groupBusStops）", () => {
  it("同じ名前の点は1件にし、距離は近いほう、系統数は合計、事業者は並べる", () => {
    const stops = groupBusStops([
      { name: "南地区センター前", distance_m: 244, routes: 1, operator: "新潟交通（株）" },
      { name: "ユニゾンプラザ前", distance_m: 290, routes: 1, operator: "新潟交通（株）" },
      { name: "ユニゾンプラザ前", distance_m: 288, routes: 1, operator: "新潟交通観光バス（株）" },
      { name: "近江口", distance_m: 554, routes: null, operator: null },
    ]);
    expect(stops).toEqual([
      { name: "南地区センター前", distance_m: 244, routes: 1, operators: ["新潟交通（株）"] },
      { name: "ユニゾンプラザ前", distance_m: 288, routes: 2, operators: ["新潟交通（株）", "新潟交通観光バス（株）"] },
      { name: "近江口", distance_m: 554, routes: null, operators: [] },
    ]);
  });

  it("系統数の分からない点があっても、分かる点の数を使う", () => {
    const [stop] = groupBusStops([
      { name: "架空停", distance_m: 100, routes: null, operator: "A" },
      { name: "架空停", distance_m: 110, routes: 2, operator: "A" },
    ]);
    expect(stop).toEqual({ name: "架空停", distance_m: 100, routes: 2, operators: ["A"] });
  });
});

describe("割合の内訳（listShares）", () => {
  it("合計が足りなくても、残りを無回答として作らない。要確認にする", () => {
    const ages = [5.5, 22.9, 26.5, 25.7, 14.6].map((value, i) => ({ item: `区分${i + 1}`, value }));
    const r = listShares(ages);
    expect(r.text).not.toContain("無回答");
    expect(r.text).toBe("区分1 5.5%、区分2 22.9%、区分3 26.5%、区分4 25.7%、区分5 14.6%（内訳の合計が95.2%で100%と差があるため要確認）");
    expect(r.needsCheck).toBe(true);
  });

  it("中古戸建の年代（直した値）は合計100.0%で、そのまま並べる", () => {
    const ages = [
      { item: "30歳未満", value: 5.5 },
      { item: "30代", value: 22.9 },
      { item: "40代", value: 26.5 },
      { item: "50代", value: 25.7 },
      { item: "60歳以上", value: 19.4 },
    ];
    expect(listShares(ages)).toEqual({ text: "30歳未満 5.5%、30代 22.9%、40代 26.5%、50代 25.7%、60歳以上 19.4%", needsCheck: false });
  });

  it("原表にある無回答は残し、丸めの誤差（100.2%）は要確認にしない", () => {
    const ages = [15.2, 47.1, 22.3, 8.1, 6.5, 1.0].map((value, i) => ({ item: i === 5 ? "無回答" : `区分${i + 1}`, value }));
    expect(listShares(ages)).toEqual({ text: "区分1 15.2%、区分2 47.1%、区分3 22.3%、区分4 8.1%、区分5 6.5%、無回答 1.0%", needsCheck: false });
    expect(listShares([{ item: "A", value: 33.33 }, { item: "B", value: 33.33 }, { item: "C", value: 33.34 }]).needsCheck).toBe(false);
  });
});

describe("取り込み：単一回答の合計の確かめ（sumMismatches）", () => {
  const row = (category: string, segment: string, value: number) => ({ dataset_id: "B02", category, segment, item: "x", value, unit: "%" });
  it("単一回答で合計が合わない区分だけを挙げ、複数回答は確かめない", () => {
    const rows = [
      ...[5.5, 22.9, 26.5, 25.7, 14.6].map((v) => row("世帯主の年齢", "中古戸建を買った世帯", v)),
      ...[15.2, 47.1, 22.3, 8.1, 6.5, 1.0].map((v) => row("世帯主の年齢", "分譲戸建を買った世帯", v)),
      ...[63.2, 46.6, 22.9].map((v) => row("物件を探した方法", "中古戸建を買った世帯", v)),
    ];
    expect(sumMismatches(rows)).toEqual(["B02／世帯主の年齢／中古戸建を買った世帯：合計95.2%"]);
  });
});

describe("書き方（続き）", () => {

  it("町名の書き方をそろえる", () => {
    expect(toD10TownName("青山七丁目")).toBe("青山７丁目");
    expect(toD10TownName("上新栄町十二丁目")).toBe("上新栄町１２丁目");
    expect(toD10TownName("青山")).toBe("青山");
  });

  it("浸水深の区分の下限", () => {
    expect(depthLower("0.5〜3.0m未満")).toBe(0.5);
    expect(depthLower("0.01m以上〜0.3m未満")).toBe(0.01);
    expect(depthLower("区分なし")).toBe(-1);
  });

  it("出典の文言", () => {
    expect(sourceOf(DATASETS.D31)).toBe("国土数値情報 A31a");
    expect(sourceOf(DATASETS.D17)).toBe("国土数値情報 P14");
    expect(sourceOf(DATASETS.D28)).toBe("OpenStreetMap");
    expect(sourceOf(DATASETS.D29)).toBe("新潟県 大規模小売店舗一覧");
    expect(sourceOf(DATASETS.D05)).toBe("e-Stat 国勢調査 T001082");
  });
});

describe("ID の付け方", () => {
  it("分類ごとに出てきた順で番号を付け、媒体は一覧の ID のまま", () => {
    const facts = numberFacts([
      { category: "L", 項目: "a", 値: "1", 出典: "x", 時点: "y", 状態: "取得" },
      { category: "P", 項目: "b", 値: "1", 出典: "x", 時点: "y", 状態: "取得" },
      { category: "L", 項目: "c", 値: null, 出典: "x", 時点: "y", 状態: "取得できず" },
      { category: "C", 項目: "d", 値: "1", 出典: "x", 時点: "y", 状態: "取得", fixedId: "C-07" },
    ]);
    expect(facts.map((f) => f.id)).toEqual(["P-01", "L-01", "L-02", "C-07"]);
    expect(facts[0]).not.toHaveProperty("比較");
  });
});

describe("事実シートの組み立て", () => {
  const facts = buildFacts(sample());

  it("ID は重ならず、分類の順に並ぶ", () => {
    const ids = facts.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    const order = ids.map((id) => "PMRASLTHBKC".indexOf(id[0]));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("取れなかった事実は値を null・状態を「取得できず」にし、省かない", () => {
    for (const f of facts.filter((x) => x.状態 === "取得できず")) expect(f.値).toBeNull();
    for (const f of facts.filter((x) => x.値 === null)) expect(f.状態).not.toBe("取得");
  });

  it("物件（P）：見本どおりの書き方", () => {
    expect(find(facts, "価格")).toMatchObject({ id: "P-02", 値: "2,480万円", 出典: "入力", 時点: "2026-10", 状態: "取得" });
    expect(find(facts, "間取り").値).toBe("居室4・納戸0（4LDK）");
    expect(find(facts, "リフォーム").値).toBe("2023年：キッチン・浴室");
    expect(find(facts, "建物面積").値).toBe("105.5㎡");
    expect(find(facts, "土地面積").値).toBe("200㎡");
    expect(find(facts, "広告予算の総額").値).toBe("入力なし");
  });

  it("相場（M）：物件の値を「値」、区×築年数の中央値を「比較」に入れ、相場比を出す", () => {
    expect(find(facts, /^延床の坪単価（西区・築20〜29年の戸建の相場と比べる）/)).toMatchObject({
      id: "M-01",
      値: "物件77.7万円/坪",
      比較: "西区・築20〜29年の中央値 60.4万円/坪（4件）",
      時点: "2015〜2026",
      出典: "不動産情報ライブラリ XIT001",
    });
    // 相場比は比べた結果なので、比較は付けない
    const ratio = find(facts, /^相場比（西区/);
    expect(ratio).toMatchObject({ id: "M-02", 項目: "相場比（西区・築20〜29年の延床の坪単価の中央値に対する、物件の坪単価）", 値: "1.29倍" });
    expect(ratio).not.toHaveProperty("比較");
    expect(find(facts, /^延床面積（/)).toMatchObject({ id: "M-03", 値: "物件105.5㎡", 比較: "西区・築20〜29年の中央値 105㎡", 時点: "2015〜2026" });
    // 土地面積の無い取引は除いて中央値を出す
    expect(find(facts, /^土地面積（/)).toMatchObject({ id: "M-04", 値: "物件200㎡", 比較: "西区・築20〜29年の中央値 200㎡" });
    // 広さの近い取引の相場：相場比は出さず、物件の坪単価と並べる。10件未満は「件数が少ない」
    // 18,000,000/100、20,000,000/110、21,000,000/100 の坪単価の中央値 ＝ 20,000,000÷110×3.30578 ≒ 60.1万円
    expect(find(facts, /^延床の坪単価（広さの近い取引/)).toMatchObject({
      id: "M-05",
      項目: "延床の坪単価（広さの近い取引の相場と比べる：西区・築20〜29年・延床74〜137㎡・土地140〜260㎡）",
      値: "物件77.7万円/坪",
      比較: "広さの近い取引の中央値 60.1万円/坪（3件。件数が少ない）",
      時点: "2015〜2023",
      出典: "不動産情報ライブラリ XIT001",
    });
    expect(find(facts, "近くの公示地（住宅地）")).toMatchObject({
      id: "M-06",
      値: "35,800円/㎡（前年比+0.6%）、物件から直線650m、所在地：新潟県新潟市西区架空町２丁目１番",
    });
  });

  it("相場（M）：取引が無ければ5件とも「取得できず」で、IDの並びは変わらない", () => {
    const f = buildFacts(sample({ market: null, similarMarket: null }));
    const unit = find(f, /^延床の坪単価（西区/);
    expect(unit).toMatchObject({ id: "M-01", 項目: "延床の坪単価（西区・築20〜29年の戸建の相場と比べる）", 値: null, 状態: "取得できず" });
    expect(unit).not.toHaveProperty("比較");
    expect(find(f, /^相場比/)).toMatchObject({ id: "M-02", 状態: "取得できず" });
    expect(find(f, /^延床面積（/)).toMatchObject({ id: "M-03", 状態: "取得できず" });
    expect(find(f, /^土地面積（/)).toMatchObject({ id: "M-04", 状態: "取得できず" });
    expect(find(f, /^延床の坪単価（広さの近い取引/)).toMatchObject({ id: "M-05", 状態: "取得できず" });
    expect(find(f, "近くの公示地（住宅地）").id).toBe("M-06");
  });

  it("エリア（A）：町名別人口から割合を計算し、区と並べる", () => {
    expect(find(facts, "0〜14歳の割合")).toMatchObject({ 値: "15.8%", 比較: "西区 11.9%", 出典: "新潟市OD 町名別5歳階級人口" });
    expect(find(facts, "20〜39歳の割合").値).toBe("20.0%");
    // 足す年齢の値が無いときは推測せず「取得できず」
    expect(find(facts, "40〜59歳の割合").状態).toBe("取得できず");
    expect(find(facts, "18歳未満の世帯員のいる世帯の割合")).toMatchObject({ 値: "25.0%", 比較: "西区 20.0%", 出典: "e-Stat 国勢調査 T001084から計算" });
    // 3世代世帯そのものではないので、項目名に「核家族以外の親族世帯」と書く
    expect(find(facts, "核家族以外の親族世帯の割合（3世代世帯などを含む）")).toMatchObject({ 値: "7.5%", 比較: "西区 5.0%" });
    expect(find(facts, "持ち家率").値).toBe("75.0%");
    expect(find(facts, "民営借家の割合").状態).toBe("取得できず");
    expect(find(facts, /^将来の人口/)).toMatchObject({ 値: "10,000人→9,180人（-8.2%）", 比較: "西区 -6.0%" });
  });

  it("エリア（A）：町名別人口に町が無ければ国勢調査で年齢を出す", () => {
    const f = buildFacts(
      sample({
        area: {
          ...sample().area,
          d10Town: null,
          censusTown: { D05: { "総数、年齢「不詳」含む": 200, 総数15歳未満: 30 } },
          censusWard: { D05: { "総数、年齢「不詳」含む": 1000, 総数15歳未満: 100 } },
        },
      }),
    );
    expect(find(f, "0〜14歳の割合")).toMatchObject({ 値: "15.0%", 比較: "西区 10.0%", 出典: "e-Stat 国勢調査 T001082", 時点: "2020" });
    expect(f.some((x) => x.項目 === "町の人口と世帯数")).toBe(false);
  });

  it("学区（S）：決まらないときは候補を出して「要確認」", () => {
    expect(find(facts, "小学校区")).toMatchObject({ 値: "架空小学校（物件から直線700m）", 状態: "取得", 出典: "新潟市教育委員会 通学区域一覧（物件の位置の町丁目で照合）" });
    expect(find(facts, "中学校区")).toMatchObject({ 値: "候補：架空中学校、架空西中学校", 状態: "要確認", 出典: "新潟市教育委員会 通学区域一覧（入力の住所で照合）" });
  });

  it("生活施設（L）：1km以内の件数と一覧、区内の町の平均、3km以内の最寄り", () => {
    expect(find(facts, "公園（1km以内）")).toMatchObject({
      値: "6件：公園1 直線150m、公園2 直線380m、公園3 直線500m、公園4 直線600m、公園5 直線700m ほか1件",
      比較: "西区の町の平均 4.2件",
      出典: "新潟市OD 公園・緑地",
      時点: "2019-12",
    });
    expect(find(facts, "スーパー（1km以内）")).toMatchObject({ 値: "0件。3km以内の最寄り：架空スーパー 直線1.1km", 出典: "OpenStreetMap・新潟県 大規模小売店舗一覧", 時点: "2026-10-24・2026-09" });
    // 診療科にも区の平均を並べる
    expect(find(facts, "内科のある病院・診療所（1km以内）")).toMatchObject({ 値: "1件：架空内科医院 直線420m", 比較: "西区の町の平均 3.5件" });
    const kids = find(facts, "小児科のある病院・診療所（1km以内）");
    expect(kids.値).toBe("0件。3km以内になし");
    expect(kids).not.toHaveProperty("比較");
    // 通うのは1か所の施設（学校など）は、区の平均があっても比べない
    const school = find(facts, "小学校（1km以内）");
    expect(school.値).toBe("1件：架空小学校 直線700m");
    expect(school).not.toHaveProperty("比較");
  });

  it("交通（T）：入力の徒歩分と、直線距離の最寄り", () => {
    expect(find(facts, "交通1（物件資料の徒歩分）")).toMatchObject({ 値: "JR越後線 架空駅 徒歩18分", 出典: "入力" });
    expect(find(facts, "最寄り駅（直線）").値).toBe("架空駅（越後線） 直線1.5km");
    // S12 に無い駅は「取得できず」、0 の駅は「公表なし」（2026-10-25 小林さんと決定、10-30 に「データなし」から変更）
    expect(find(facts, "最寄り駅の乗降客数（1日あたり）")).toMatchObject({ 値: null, 状態: "取得できず", 出典: "国土数値情報 S12" });
    const unpublished = buildFacts(sample({ station: { ...sample().station!, passengers: "公表なし" } }));
    expect(find(unpublished, "最寄り駅の乗降客数（1日あたり）")).toMatchObject({ 値: "公表なし", 状態: "取得" });
    const published = buildFacts(sample({ station: { ...sample().station!, passengers: 1862 } }));
    expect(find(published, "最寄り駅の乗降客数（1日あたり）").値).toBe("1,862人");
    expect(find(facts, "最寄りバス停（直線）").値).toBe("架空停 直線120m（系統数 3：架空交通）");
    expect(find(facts, "バス停（1km以内）")).toMatchObject({ 値: "1件：架空停 直線120m", 比較: "西区の町の平均 16.5件" });
  });

  it("災害（H）：取り込んでいないデータは「取得できず」、区域の外は外と書く", () => {
    expect(find(facts, "洪水の想定浸水深（想定最大規模）")).toMatchObject({ 値: null, 状態: "取得できず", 出典: "国土数値情報 A31a" });
    expect(find(facts, "津波の想定浸水深")).toMatchObject({ 値: "0.3m以上〜0.5m未満", 時点: "2017" });
    expect(find(facts, "土砂災害警戒区域").値).toBe("区域の外");
    expect(find(facts, "液状化の発生傾向").値).toBe("やや液状化しやすい（後背湿地）");
  });

  it("災害（H）：洪水はいちばん深い区分と川の名前", () => {
    const f = buildFacts(
      sample({
        datasets: { ...DATASETS, D31: { ...DATASETS.D31, row_count: 10 } },
        zones: [
          { dataset_id: "D31", kind: "洪水浸水想定", label: "0.5〜3.0m未満", attrs: { 浸水深ランク: 2, 河川名: "信濃川" } },
          { dataset_id: "D31", kind: "洪水浸水想定", label: "3.0〜5.0m未満", attrs: { 浸水深ランク: 3, 河川名: "阿賀野川" } },
        ],
      }),
    );
    expect(find(f, "洪水の想定浸水深（想定最大規模）")).toMatchObject({ 値: "3.0〜5.0m未満（信濃川・阿賀野川の想定）", 状態: "取得" });
    expect(find(buildFacts(sample({ datasets: { ...DATASETS, D31: { ...DATASETS.D31, row_count: 10 } } })), "洪水の想定浸水深（想定最大規模）").値).toBe("浸水想定区域の外");
  });

  it("買い手（B）：見本のローン計算と、必要年収以上の割合", () => {
    expect(find(facts, "月々の返済額（変動1.3%・35年）")).toMatchObject({ id: "B-01", 値: "約6.6万円" });
    expect(find(facts, "必要年収（変動1.3%）")).toMatchObject({ id: "B-02", 値: "約318万円" });
    expect(find(facts, "月々の返済額（固定3.83%・35年）")).toMatchObject({ id: "B-03", 値: "約9.7万円" });
    expect(find(facts, "必要年収（固定3.83%）")).toMatchObject({ id: "B-04", 値: "約464万円" });
    // 318万円：400万円未満の区分の (400-318)/400 ＝ 20.5% × 20 ＝ 4.1 ＋ 80 ＝ 84.1 → 約84%
    // 年収分布は全国の値なので、項目名と出典に「全国」と書く
    const share = find(facts, "必要年収以上の世帯の割合（変動1.3%、全国の中古戸建を買った世帯の年収分布から）");
    expect(share.値).toBe("約84%");
    expect(share.出典).toBe("住宅市場動向調査 p.450（全国、中古戸建を買った世帯の年収分布）から計算");
    // 返済期間が同じ候補（35年）は1行にまとめる。並びは返済期間の長い順
    const terms = facts.filter((f) => f.項目.includes("の返済の目安")).map((f) => f.項目);
    expect(terms).toEqual([
      "【若い夫婦・単身】の返済の目安（返済期間35年）",
      "【60歳以上】の返済の目安（返済期間15年）",
      "【60歳以上】の返済の目安（住み替えで頭金49.2%の場合（平均の自己資金比率）、返済期間15年）",
    ]);
    expect(find(facts, "【若い夫婦・単身】の返済の目安（返済期間35年）").値).toMatch(/^代表年齢30・35歳。変動1.3%：月々約6.6万円・必要年収約318万円/);
    // 頭金49.2%：借入 2,480万円×0.508＝1,259.84万円を15年・1.3% → 月々約7.7万円、必要年収 約370万円
    const resale = find(facts, "【60歳以上】の返済の目安（住み替えで頭金49.2%の場合（平均の自己資金比率）、返済期間15年）");
    expect(resale.値).toMatch(/^代表年齢65歳。変動1.3%：月々約7.7万円・必要年収約370万円/);
    expect(resale).toMatchObject({ 時点: "令和7年度" });
    // 比率の前提値の根拠に「三大都市圏」が無くても、出典には書く
    expect(resale.出典).toMatch(/^ローン計算（頭金49.2%：住宅市場動向調査 二次取得者の自己資金比率（三大都市圏）・完済80歳まで）/);
    // 返済負担率は無理のない目安で、審査の上限ではないと出典に書く
    expect(find(facts, "必要年収（変動1.3%）").出典).toBe("ローン計算（頭金10%・返済負担率25%（無理のない目安。審査の上限ではない）・元利均等）");
    // 前提値が無ければ住み替えの行は出さない
    const noResale = buildFacts(sample({ assumptions: sample().assumptions.filter((a) => !a.key.startsWith("住み替え")) }));
    expect(noResale.some((f) => f.項目.includes("住み替えで頭金"))).toBe(false);
    expect(find(facts, "ターゲット候補「60歳以上」の定義").値).toBe("定義は未設定（代表年齢65歳）");
    expect(find(facts, "Instagramの利用率（年代別）").値).toBe("20代83%、30代77%");
    // 合計が100%に足りなくても無回答は作らず、要確認にする
    expect(find(facts, "買主の年代（中古戸建を買った世帯の世帯主）")).toMatchObject({
      値: "30代 22.9%、40代 26.5%（内訳の合計が49.4%で100%と差があるため要確認）",
      状態: "要確認",
    });
  });

  it("買い手（B）：住み替えの頭金は「価格×比率」と「平均の自己資金の金額」の小さいほう", () => {
    const ratio = sample().assumptions.find((a) => a.key === "住み替えの頭金の割合（中古）")!;
    const amount = sample().assumptions.find((a) => a.key === "住み替えの頭金の金額（中古）")!;
    // 安い物件：2,480万円×49.2%＝1,220万円 < 1,223万円 → 比率
    expect(resaleDownPayment(2480, ratio, amount)).toMatchObject({ pct: 49.2, text: "49.2%", label: "住み替えで頭金49.2%の場合（平均の自己資金比率）" });
    // 高い物件：5,980万円×49.2%＝約2,942万円 > 1,223万円 → 金額
    const high = resaleDownPayment(5980, ratio, amount);
    expect(high).toMatchObject({ text: "1,223万円", label: "住み替えで頭金1,223万円の場合（平均の自己資金）" });
    expect(high.pct).toBeCloseTo((1223 / 5980) * 100, 10);
    // 金額の前提値が無ければ比率
    expect(resaleDownPayment(5980, ratio).text).toBe("49.2%");

    const f = buildFacts(sample({ property: { ...sample().property, price_man_yen: 5980 } }));
    const resale = find(f, "【60歳以上】の返済の目安（住み替えで頭金1,223万円の場合（平均の自己資金）、返済期間15年）");
    // 借入 5,980−1,223＝4,757万円を15年・1.3%
    expect(resale.値).toMatch(/^代表年齢65歳。変動1.3%：月々約29.1万円/);
    expect(resale.出典).toMatch(/^ローン計算（頭金1,223万円：住宅市場動向調査 二次取得者の平均の自己資金（三大都市圏）・完済80歳まで）/);
  });

  it("競合（K）：入力のない値はそう書き、この物件との差を比較に入れる", () => {
    const k = find(facts, "競合物件1");
    expect(k.値).toBe("価格2,380万円・建物面積100㎡・土地面積 入力なし・築18年・物件から直線1.2km");
    expect(k.比較).toBe("この物件との差（この物件−競合）：価格 +100万円、建物面積 +5.5㎡、築年数 +4年");
  });

  it("媒体（C）：一覧の ID をそのまま使う", () => {
    expect(find(facts, "SUUMO")).toMatchObject({ id: "C-01", 値: "分類：不動産ポータル、主な目的：問い合わせ、届きやすい年代（見立て）：30〜40代" });
  });
});
