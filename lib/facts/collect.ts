// ②物件周りの情報の収集（docs/設計まとめ.md「収集の流れ」）
// 物件の位置から、事前に取り込んだ公的データを PostGIS の SQL で引く。外部とは通信しない（位置は物件の登録時に出してある）
// 距離はすべて geography 型の直線距離（m）。組み立ては build.ts で行う

import type { PendingQuery, Row } from "postgres";
import type { Sql } from "../db";
import type {
  AreaInput,
  AssumptionRow,
  BuyersInput,
  Collected,
  CompetitorInput,
  DatasetInfo,
  MarketInput,
  MarketTrade,
  MeshTotals,
  MetricMap,
  NearbyKindInput,
  PropertyInput,
  SchoolInput,
  StatRow,
  TownInfo,
  TransportInput,
  ZoneHit,
} from "./build";
import { ageBandOf, selectMarket } from "./build";
import type { NearbyItem } from "./format";
import { parseAddress, pinAddress, resolveZone, wardFromSourceUrl, type ZoneRow } from "./school-zones";
import type { FactStepKey } from "./steps";

/** 周りの施設（L）の種類。設計まとめ「周りの施設（L）の渡し方」の順 */
export const FACILITY_KINDS = [
  "小学校",
  "中学校",
  "保育園",
  "地域型保育",
  "幼稚園",
  "認定こども園",
  "放課後児童クラブ",
  "公園",
  "図書館",
  "役所",
  "スーパー",
  "ドラッグストア",
  "コンビニ",
  "大規模小売店舗",
  "病院",
  "診療所",
  "歯科",
  "薬局",
] as const;

/** 診療科ごとの最寄り（病院・診療所）。産婦人科は産科・婦人科だけの所も含める */
export const DEPARTMENTS: { label: string; match: string[] }[] = [
  { label: "内科", match: ["内科"] },
  { label: "小児科", match: ["小児科"] },
  { label: "外科", match: ["外科"] },
  { label: "整形外科", match: ["整形外科"] },
  { label: "産婦人科", match: ["産婦人科", "産科", "婦人科"] },
  { label: "眼科", match: ["眼科"] },
  { label: "耳鼻いんこう科", match: ["耳鼻いんこう科"] },
  { label: "皮膚科", match: ["皮膚科"] },
];

const NEAR_M = 1000;
const CAR_M = 3000;
/** 物件を探した方法などで、物件区分に合う区分 */
const SEGMENT = { 中古: "中古戸建を買った世帯", 新築: "分譲戸建を買った世帯" } as const;

/** 日本時間の今日（YYYY-MM-DD） */
export function todayJst(now = new Date()): string {
  return now.toLocaleDateString("sv-SE", { timeZone: "Asia/Tokyo" });
}

const KANJI: Record<string, number> = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

function kanjiNumber(text: string): number | null {
  const m = /^([一二三四五六七八九])?(十)?([一二三四五六七八九])?$/.exec(text);
  if (!m || text === "") return null;
  if (!m[2]) return m[1] && !m[3] ? KANJI[m[1]] : null;
  return (m[1] ? KANJI[m[1]] : 1) * 10 + (m[3] ? KANJI[m[3]] : 0);
}

/** 町の境界（D39）の町名を、町名別5歳階級人口（D10）の書き方にする：「青山七丁目」→「青山７丁目」 */
export function toD10TownName(name: string): string {
  return name.replace(/([一二三四五六七八九十]+)丁目$/, (all, k: string) => {
    const n = kanjiNumber(k);
    return n === null ? all : `${String(n).replace(/\d/g, (d) => String.fromCharCode(d.charCodeAt(0) + 0xfee0))}丁目`;
  });
}

/**
 * クエリを1つずつ順に実行する。Supabase のプーラー（Transaction mode）経由で同時に投げると、postgres.js が最初に読む
 * 型の一覧（pg_type）が statement timeout で止められ、同じ接続の残りのクエリが返らなくなることがあった（2026-10-25）
 */
async function inOrder<T extends unknown[]>(...tasks: { [K in keyof T]: () => PromiseLike<T[K]> }): Promise<T> {
  const out: unknown[] = [];
  for (const task of tasks) out.push(await task());
  return out as T;
}

interface PropertyRow extends Omit<PropertyInput, "building_sqm" | "land_sqm"> {
  building_sqm: string;
  land_sqm: string;
  lon: number | null;
  lat: number | null;
}

/** onStep：段階に入るたびに呼ぶ（画面の進み具合。lib/facts/steps.ts） */
export async function collect(sql: Sql, propertyId: number, today = todayJst(), onStep?: (step: FactStepKey) => void): Promise<Collected> {
  // 段階を知らせてから task を動かす
  const step =
    <T,>(key: FactStepKey, task: () => PromiseLike<T>) =>
    () => {
      onStep?.(key);
      return task();
    };

  onStep?.("property");
  const [p] = await sql<PropertyRow[]>`
    select code, property_class, price_man_yen, address, layout, rooms, storerooms, building_sqm, land_sqm, parking, building_age,
      floors, has_garden, renovated, renovation_year, renovation_parts, features, ad_budget_man_yen,
      extensions.st_x(geog::extensions.geometry) as lon, extensions.st_y(geog::extensions.geometry) as lat
    from properties where id = ${propertyId}
  `;
  if (!p) throw new Error(`物件 ${propertyId} がありません`);
  if (p.lon === null || p.lat === null) throw new Error("物件の位置がありません。物件の画面の地図でピンを置いてください");
  const { lon, lat, ...rest } = p;
  const property: PropertyInput = { ...rest, building_sqm: Number(p.building_sqm), land_sqm: Number(p.land_sqm) };

  // 物件の位置（geography）。各 SQL に埋め込む
  const pt = sql`extensions.st_setsrid(extensions.st_point(${lon}, ${lat}), 4326)::extensions.geography`;
  const ptGeom = sql`extensions.st_setsrid(extensions.st_point(${lon}, ${lat}), 4326)`;

  const [datasets, transports, [town], zones] = await inOrder(
    () => sql<(Omit<DatasetInfo, "row_count"> & { row_count: number | null })[]>`select id, name, provider, as_of, row_count from datasets`,
    () => sql<TransportInput[]>`select mode, line, stop_name, walk_min from property_transports where property_id = ${propertyId} order by position`,
    step("town", () => sql<TownInfo[]>`
      select key_code, name, ward, city_code from towns
      where extensions.st_intersects(geom, ${ptGeom}) and coalesce(hcode, 0) <> 8154 and name is not null
      limit 1
    `),
    step("zones", () => sql<ZoneHit[]>`select dataset_id, kind, label, attrs from zones where extensions.st_intersects(geom, ${ptGeom})`),
  );

  const [market, landPrice, schools, nearby, transportNearby, area, buyers, assumptions, targets, competitors, media] = await inOrder(
    step("market", () => collectMarket(sql, town ?? null, property.building_age)),
    step("land", () => collectLandPrice(sql, pt)),
    step("schools", () => collectSchools(sql, pt, property.address, town ?? null)),
    step("facilities", () => collectNearby(sql, pt, town?.ward ?? null)),
    step("transport", () => collectTransport(sql, pt, town?.ward ?? null)),
    step("area", () => collectArea(sql, pt, town ?? null)),
    step("buyers", () => collectBuyers(sql, property.property_class)),
    step("loan", () => sql<(Omit<AssumptionRow, "id" | "value"> & { id: string; value: string })[]>`
      select distinct on (key) id, key, value, unit, as_of from assumptions
      where effective_from <= ${today}::date order by key, effective_from desc
    `),
    () => sql<{ name: string; representative_age: number; definition: string | null }[]>`select name, representative_age, definition from target_candidates order by id`,
    () => sql<{ position: number; price_man_yen: number | null; address: string | null; building_sqm: string | null; land_sqm: string | null; building_age: number | null; distance_m: number | null }[]>`
      select position, price_man_yen, address, building_sqm, land_sqm, building_age, extensions.st_distance(geog, ${pt}) as distance_m
      from competitors where property_id = ${propertyId} order by position
    `,
    () => sql<{ id: string; name: string; category: string; purpose: string; reach_ages: string }[]>`select id, name, category, purpose, reach_ages from media order by sort`,
  );

  return {
    today,
    property,
    transports: [...transports],
    datasets: Object.fromEntries(datasets.map((d) => [d.id, { ...d, row_count: d.row_count === null ? null : Number(d.row_count) }])),
    town: town ?? null,
    market,
    landPrice,
    zones: [...zones],
    schools,
    facilities: nearby.facilities,
    departments: nearby.departments,
    station: transportNearby.station,
    bus: transportNearby.bus,
    area,
    buyers,
    assumptions: assumptions.map((a) => ({ ...a, id: Number(a.id), value: Number(a.value) })),
    targets: [...targets],
    competitors: competitors.map(
      (c): CompetitorInput => ({
        ...c,
        building_sqm: c.building_sqm === null ? null : Number(c.building_sqm),
        land_sqm: c.land_sqm === null ? null : Number(c.land_sqm),
        distance_m: c.distance_m === null ? null : Number(c.distance_m),
      }),
    ),
    media: [...media],
  };
}

// SQL の部品（物件の位置など）。sql`...` を別の sql`...` に埋め込む
type Point = PendingQuery<Row[]>;

/**
 * 区×築年数の相場（D01）。物件のある区（市区町村コード）の戸建ての取引を引き、帯と年の範囲は selectMarket で決める
 * 戸建ての条件は docs/相場の出し方変更.md 3.3（2026-10-28 小林さんと決定）。用途が空（成約価格情報）なら構造で判断する
 */
async function collectMarket(sql: Sql, town: TownInfo | null, buildingAge: number): Promise<MarketInput | null> {
  if (!town) return null;
  // 「直近5年」は取り込んだ最新の年から数える
  const [latest] = await sql<{ year: number | null }[]>`select max(year) as year from transactions`;
  if (latest?.year == null) return null;
  const rows = await sql<{ year: number; building_year: number; trade_price: string; floor_sqm: string; land_sqm: string | null }[]>`
    select year, building_year, trade_price, floor_sqm, land_sqm from transactions
    where municipality_code = ${town.city_code} and type = '宅地(土地と建物)'
      and (
        (string_to_array(raw->>'Use', '、') @> array['住宅']
          and string_to_array(raw->>'Use', '、') <@ array['住宅', '駐車場', '倉庫', 'その他'])
        or (coalesce(raw->>'Use', '') = '' and structure in ('木造', '軽量鉄骨造', '鉄骨造'))
      )
      and not (coalesce(raw->>'Remarks', '') like any (array['%調停%', '%競売%', '%関係者間%', '%瑕疵%', '%隣地%']))
      and floor_sqm between 50 and 300
      and building_year is not null and trade_price is not null
      and year - building_year >= 0
  `;
  const trades: MarketTrade[] = rows.map((r) => ({
    year: r.year,
    building_year: r.building_year,
    price: Number(r.trade_price),
    floor_sqm: Number(r.floor_sqm),
    land_sqm: r.land_sqm === null ? null : Number(r.land_sqm),
  }));
  return selectMarket(trades, ageBandOf(buildingAge), latest.year);
}

/** 近くの公示地・基準地（D02・D03）。住宅地の地点のうち、3km以内でいちばん近いもの（新しい年） */
async function collectLandPrice(sql: Sql, pt: Point) {
  const [row] = await sql<{ dataset_id: string; address: string | null; price_per_sqm: number | null; change_rate: string | null; year: number; distance_m: number }[]>`
    select dataset_id, address, price_per_sqm, change_rate, year, extensions.st_distance(geog, ${pt}) as distance_m
    from land_prices
    where use_category = '住宅地' and extensions.st_dwithin(geog, ${pt}, ${CAR_M})
      and year = (select max(year) from land_prices)
    order by geog operator(extensions.<->) ${pt}
    limit 1
  `;
  return row ? { ...row, change_rate: row.change_rate === null ? null : Number(row.change_rate), distance_m: Number(row.distance_m) } : null;
}

/**
 * 学区（D14）。物件の位置（ピン）が入る町丁目で通学区域一覧と照らし合わせる。番地は入力の住所から足す（school-zones.ts の pinAddress）
 * 町の境界に町が無い・新潟市の外などで決まらないときは、入力の住所で照らし合わせる。決まった学校までの直線距離も出す
 */
async function collectSchools(sql: Sql, pt: Point, address: string, town: TownInfo | null): Promise<{ elementary: SchoolInput; juniorHigh: SchoolInput }> {
  const none = { elementary: { status: "none" } as SchoolInput, juniorHigh: { status: "none" } as SchoolInput };
  const input = parseAddress(address);
  const pinTown = town && town.city_code.startsWith("151") ? { name: town.name, ward: town.ward } : null;
  if (!input && !pinTown) return none;
  const found = await sql<(ZoneRow & { source_url: string })[]>`
    select ward, town, chome, lot_scope, lot_text, lot_ranges, elementary_school, junior_high_school, source_url
    from school_zone_rules where starts_with(${pinTown?.name ?? ""}, town) or starts_with(${input?.rest ?? ""}, town)
  `;
  // 区の書かれていない行は、読み取った市のページの区の町とする（同じ町名が別の区にもあるため。中央区と秋葉区の「天神」など）
  const rows = found.map(({ source_url, ...r }) => ({ ...r, ward: r.ward ?? wardFromSourceUrl(source_url) }));
  let basis: "位置" | "住所" = "位置";
  let zone = pinTown ? resolveZone(rows, pinAddress(pinTown, input, rows)) : null;
  if ((!zone || zone.elementary.status === "none") && input) {
    basis = "住所";
    zone = resolveZone(rows, input);
  }
  if (!zone) return none;
  const withDistance = async (r: (typeof zone)["elementary"], kind: "小学校" | "中学校"): Promise<SchoolInput> => {
    if (r.status === "none") return { status: "none" };
    if (r.status === "ambiguous") return { status: "ambiguous", candidates: r.candidates, basis };
    // 施設の名前は「新潟市立青山小学校」の形。新潟市の学校（city_code 151xx）から探す。同じ名前の学校が他の市にもあるため
    // 名前がそのまま当たるものを先に、無ければ名前の終わりが一致するもの（「東青山小学校」も当たるので後回し）の近い順
    const [hit] = await sql<{ distance_m: number }[]>`
      select extensions.st_distance(geog, ${pt}) as distance_m from facilities
      where kind = ${kind} and attrs ->> 'city_code' like '151%'
        and (name = ${r.school} or name = ${"新潟市立" + r.school} or name like ${"%" + r.school})
      order by (name = ${r.school} or name = ${"新潟市立" + r.school}) desc, geog operator(extensions.<->) ${pt}
      limit 1
    `;
    return { status: "decided", school: r.school, distance_m: hit ? Number(hit.distance_m) : null, basis };
  };
  const z = zone;
  return { elementary: await withDistance(z.elementary, "小学校"), juniorHigh: await withDistance(z.juniorHigh, "中学校") };
}

/** 周りの施設（L）。3km以内をまとめて取り、種類ごとに1km以内の一覧と3km以内の最寄りに分ける */
async function collectNearby(sql: Sql, pt: Point, ward: string | null): Promise<{ facilities: NearbyKindInput[]; departments: NearbyKindInput[] }> {
  const [rows, averages, kindDatasets] = await inOrder(
    () => sql<{ kind: string; name: string; departments: string[] | null; dataset_id: string; distance_m: number }[]>`
      select kind, name, departments, dataset_id, extensions.st_distance(geog, ${pt}) as distance_m
      from facilities
      where kind <> all (array['駅', 'バス停']) and extensions.st_dwithin(geog, ${pt}, ${CAR_M})
      order by distance_m
    `,
    () => (ward ? sql<{ kind: string; avg_count: string }[]>`select kind, avg_count from ward_facility_averages where ward = ${ward} and radius_m = ${NEAR_M}` : Promise.resolve([])),
    () => sql<{ kind: string; ids: string[] }[]>`select kind, array_agg(distinct dataset_id order by dataset_id) as ids from facilities group by kind`,
  );
  const avg = new Map(averages.map((a) => [a.kind, Number(a.avg_count)]));
  const ids = new Map(kindDatasets.map((k) => [k.kind, k.ids]));
  type FacilityRow = (typeof rows)[number];
  const split = (list: FacilityRow[], label: string, wardAverage: number | null, datasetIds: string[]): NearbyKindInput => {
    const items: NearbyItem[] = list.map((r) => ({ name: r.name, distance_m: Number(r.distance_m) }));
    const within1km = items.filter((i) => i.distance_m <= NEAR_M);
    return { label, within1km, nearest3km: within1km.length ? null : (items[0] ?? null), wardAverage, datasetIds };
  };
  const facilities = FACILITY_KINDS.map((kind) =>
    split(
      rows.filter((r) => r.kind === kind),
      kind,
      avg.get(kind) ?? null,
      ids.get(kind) ?? [],
    ),
  );
  const departments = DEPARTMENTS.map((d) =>
    split(
      rows.filter((r) => (r.kind === "病院" || r.kind === "診療所") && r.departments?.some((x) => d.match.includes(x))),
      `${d.label}のある病院・診療所`,
      null,
      ["D30"],
    ),
  );
  return { facilities, departments };
}

/** 交通（T）。最寄り駅と乗降客数、最寄りバス停、1km以内のバス停 */
async function collectTransport(sql: Sql, pt: Point, ward: string | null) {
  const [[station], buses, [nearestBus], avg] = await inOrder(
    () => sql<{ name: string; attrs: Record<string, unknown> | null; distance_m: number }[]>`
      select name, attrs, extensions.st_distance(geog, ${pt}) as distance_m from facilities
      where kind = '駅' order by geog operator(extensions.<->) ${pt} limit 1
    `,
    () => sql<{ name: string; distance_m: number }[]>`
      select name, extensions.st_distance(geog, ${pt}) as distance_m from facilities
      where kind = 'バス停' and extensions.st_dwithin(geog, ${pt}, ${NEAR_M}) order by distance_m
    `,
    () => sql<{ name: string; attrs: Record<string, unknown> | null; distance_m: number }[]>`
      select name, attrs, extensions.st_distance(geog, ${pt}) as distance_m from facilities
      where kind = 'バス停' order by geog operator(extensions.<->) ${pt} limit 1
    `,
    () => (ward ? sql<{ avg_count: string }[]>`select avg_count from ward_facility_averages where ward = ${ward} and kind = 'バス停' and radius_m = ${NEAR_M}` : Promise.resolve([])),
  );
  const lines = Array.isArray(station?.attrs?.["路線"]) ? (station.attrs["路線"] as { 路線?: string }[]).map((l) => l.路線).filter((l): l is string => !!l) : [];
  // 乗降客数は「乗降客数_2024」のように年の付いたキー
  const passengerKey = station?.attrs ? Object.keys(station.attrs).find((k) => /^乗降客数_\d{4}$/.test(k)) : undefined;
  // 0 は乗降客数が公表されていない駅（「公表なし」）。S12 に駅が無ければ null（「データなし」）
  const raw = passengerKey ? station!.attrs![passengerKey] : null;
  const passengers = raw === null || raw === undefined || !Number.isFinite(Number(raw)) ? null : Number(raw) > 0 ? Number(raw) : ("公表なし" as const);
  const routes = Number(nearestBus?.attrs?.["系統数"]);
  return {
    station: station
      ? { name: station.name, lines: [...new Set(lines)], distance_m: Number(station.distance_m), passengers }
      : null,
    bus: {
      within1km: buses.map((b) => ({ name: b.name, distance_m: Number(b.distance_m) })),
      nearest: nearestBus ? { name: nearestBus.name, distance_m: Number(nearestBus.distance_m), routes: Number.isFinite(routes) ? routes : null } : null,
      wardAverage: avg[0] ? Number(avg[0].avg_count) : null,
    },
  };
}

/** エリア（A）。町と区の統計、将来推計人口のメッシュ */
async function collectArea(sql: Sql, pt: Point, town: TownInfo | null): Promise<AreaInput> {
  const empty: AreaInput = { d10Town: null, d10Ward: null, censusTown: {}, censusWard: {}, meshNear: null, meshWard: null };
  const meshSum = (where: Point) => sql<{ n: number; t25: string | null; t35: string | null; k25: string | null; k35: string | null }[]>`
    select count(*)::int as n,
      sum((population -> '2025' ->> '総数')::numeric) as t25, sum((population -> '2035' ->> '総数')::numeric) as t35,
      sum((population -> '2025' ->> '0〜14歳')::numeric) as k25, sum((population -> '2035' ->> '0〜14歳')::numeric) as k35
    from population_mesh where ${where}
  `;
  const toTotals = (r: { n: number; t25: string | null; t35: string | null; k25: string | null; k35: string | null } | undefined): MeshTotals | null =>
    r && r.n > 0 ? { total2025: Number(r.t25 ?? 0), total2035: Number(r.t35 ?? 0), kids2025: Number(r.k25 ?? 0), kids2035: Number(r.k35 ?? 0) } : null;

  const [near] = await meshSum(sql`extensions.st_dwithin(extensions.st_centroid(geom)::extensions.geography, ${pt}, ${NEAR_M})`);
  if (!town) return { ...empty, meshNear: toTotals(near) };

  const d10Key = `${town.ward}:${toD10TownName(town.name)}`;
  const [stats, [wardMesh]] = await inOrder(
    () => sql<{ dataset_id: string; area_level: string; metric: string; value: string | null }[]>`
      select dataset_id, area_level, metric, value from area_stats
      where (area_level = '町' and area_key in (${town.key_code}, ${d10Key})) or (area_level = '区' and area_key = ${town.ward})
    `,
    () => meshSum(sql`population ->> '市区町村コード' = ${town.city_code}`),
  );
  const pick = (dataset: string, level: string): MetricMap | null => {
    const rows = stats.filter((s) => s.dataset_id === dataset && s.area_level === level);
    return rows.length ? Object.fromEntries(rows.map((r) => [r.metric, r.value === null ? null : Number(r.value)])) : null;
  };
  const census = (level: string) =>
    Object.fromEntries(["D05", "D06", "D07", "D08"].flatMap((ds) => {
      const m = pick(ds, level);
      return m ? [[ds, m]] : [];
    }));
  return {
    d10Town: pick("D10", "町"),
    d10Ward: pick("D10", "区"),
    censusTown: census("町"),
    censusWard: census("区"),
    meshNear: toTotals(near),
    meshWard: toTotals(wardMesh),
  };
}

/** 買い手・媒体の統計（B02・B06）。物件区分に合う区分（中古戸建・分譲戸建）を使う */
async function collectBuyers(sql: Sql, propertyClass: "新築" | "中古"): Promise<BuyersInput> {
  const segment = SEGMENT[propertyClass];
  const rows = await sql<{ dataset_id: string; category: string; segment: string; item: string; value: string | null; source: string | null }[]>`
    select dataset_id, category, segment, item, value, source from reference_stats
    where dataset_id in ('B02', 'B06') order by dataset_id, sort nulls last, id
  `;
  // 出典の場所は分類と区分ごと（中古戸建と分譲戸建でページが違う）。「同上」の行は、同じ分類の最初の行の出典を使う
  const firstSource = (category: string, seg?: string) =>
    rows.find((r) => r.category === category && (seg === undefined || r.segment === seg) && r.source && r.source !== "同上")?.source ?? null;
  const sourceOf = (category: string, seg?: string) => firstSource(category, seg) ?? firstSource(category);
  const stat = (category: string): StatRow[] =>
    rows.filter((r) => r.category === category && r.segment === segment && r.value !== null).map((r) => ({ item: r.item, value: Number(r.value) }));
  const media: BuyersInput["media"] = [];
  for (const r of rows.filter((r) => r.dataset_id === "B06" && r.value !== null)) {
    let m = media.find((x) => x.category === r.category && x.item === r.item);
    if (!m) media.push((m = { category: r.category, item: r.item, byAge: [], source: sourceOf(r.category) }));
    m.byAge.push({ age: r.segment, value: Number(r.value) });
  }
  return {
    segment,
    income: stat("世帯年収の分布"),
    incomeSource: sourceOf("世帯年収の分布", segment),
    ages: stat("世帯主の年齢"),
    agesSource: sourceOf("世帯主の年齢", segment),
    search: stat("物件を探した方法"),
    searchSource: sourceOf("物件を探した方法", segment),
    media,
  };
}
