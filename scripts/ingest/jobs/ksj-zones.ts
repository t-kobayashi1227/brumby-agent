import { unzipSync } from "fflate";
import type { Feature, Geometry, Position } from "geojson";
import mapshaper from "mapshaper";
import type { Sql } from "../../../lib/db";
import { readShapefile } from "../lib/files";
import { defineJob, type PrepareContext } from "../lib/runner";

// 国土数値情報の災害の区域（利用者が data/raw/<コード>/ に置いた zip の中の Shapefile を読む）
//   npm run ingest -- a31a-flood         洪水浸水想定区域・想定最大規模（D31。河川ごとのファイル。新潟県が管理する川の zip 2つと、
//                                        国が管理する川の「北陸地方整備局」の zip を data/raw/A31a/ に置く）
//   npm run ingest -- a33-landslide      土砂災害警戒区域（D33）
//   npm run ingest -- a40-tsunami        津波浸水想定（D34。新潟県は 2017 年版が最新）
//   npm run ingest -- a54-embankment     大規模盛土造成地（D36）
// 座標は JGD2011 の緯度経度（.prj で確認）。WGS84 と同じに扱う
//
// 範囲：DB の容量（Supabase の無料枠 500MB）のため、洪水・土砂・津波は新潟市にかかる区域だけを入れる（PoC の対象）
// 県全体を入れるときは area=pref を付ける。盛土は小さい（県で185区域）ので、いつも県全体を入れる
//
// 洪水と津波は、元のデータが数十mのます目の集まりで、新潟市の範囲だけでも洪水は約39万区域ある（2026-10-25）
// そのまま DB に送ると20分以上かかり、容量も足りない。そこで手元で mapshaper を使い、
// 「同じ河川・同じ浸水深・同じ約1km四方の枠」（津波は「同じ浸水深・同じ枠」）のます目を1つにまとめ、輪郭を10mの精度で単純にしてから送る
// 枠で分けるのは、信濃川・阿賀野川のように浸水の範囲が広い川をまとめると、頂点が十数万の巨大な形になり、
// DB で形を直す処理が10分以上かかったり、形が壊れて扱えなくなったりするため（2026-10-25）
// DB では図形を ST_Subdivide で頂点256以下の切れ端に分けて入れる（点がどの区域に入るかの判定を速くするため）
//
// コードの意味は国土数値情報のコードリストで 2026-10-25 に確かめた

const CITY_PREFIX = "151"; // 新潟市（区の市区町村コード 15101〜15108）
const SIMPLIFY_M = 10; // 輪郭を単純にするときの精度（m）
const TILE_DEG = 0.01; // まとめる枠の大きさ（度）。新潟では約0.9km（東西）×1.1km（南北）

interface ZoneRow {
  label: string;
  attrs: Record<string, unknown>;
  geojson: string;
}

interface Prepared {
  rows: ZoneRow[];
  cityOnly: boolean;
}

type Bbox = [number, number, number, number];

/** 図形の範囲 [西, 南, 東, 北] */
function bboxOf(geometry: Geometry): Bbox {
  let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
  const walk = (c: unknown) => {
    if (typeof (c as Position)[0] === "number") {
      const [x, y] = c as Position;
      w = Math.min(w, x);
      s = Math.min(s, y);
      e = Math.max(e, x);
      n = Math.max(n, y);
    } else (c as unknown[]).forEach(walk);
  };
  if ("coordinates" in geometry) walk(geometry.coordinates);
  return [w, s, e, n];
}

const overlaps = (a: Bbox, b: Bbox) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

/** 新潟市の範囲（町の境界から）。area=pref のときは null（絞らない） */
async function areaBbox({ sql, args }: PrepareContext): Promise<Bbox | null> {
  if (args.area === "pref") return null;
  if (args.area !== undefined && args.area !== "city") throw new Error("area は city（新潟市、既定）か pref（県全体）です");
  const [b] = await sql<{ w: number; s: number; e: number; n: number }[]>`
    select extensions.st_xmin(e) as w, extensions.st_ymin(e) as s, extensions.st_xmax(e) as e, extensions.st_ymax(e) as n
    from (select extensions.st_extent(geom) as e from towns where city_code like ${CITY_PREFIX + "%"}) t
  `;
  if (b?.w == null) throw new Error("町の境界（towns）がありません。先に npm run ingest -- d39-towns を動かしてください");
  return [b.w, b.s, b.e, b.n];
}

/** zip の中の、名前が pattern に合う .shp と .dbf を取り出す（zip 全体は展開しない）。名前はフォルダを除いたもの */
function shapefileParts(zips: Uint8Array[], pattern: RegExp): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const zip of zips) {
    const files = unzipSync(zip, { filter: (f) => pattern.test(f.name) && /\.(shp|dbf)$/i.test(f.name) });
    for (const [name, body] of Object.entries(files)) out[name.split(/[\\/]/).pop()!] = body;
  }
  if (!Object.keys(out).some((n) => /\.shp$/i.test(n))) throw new Error(`zip の中に ${pattern} に合う Shapefile がありません`);
  return out;
}

/**
 * mapshaper で、Shapefile をまとめて読み → 範囲で切り → 同じ値の区域を1つにまとめ → 輪郭を単純にする
 * fields：まとめる単位の項目。copyFields：まとめた区域にそのまま写す項目
 * splitBy：この項目ごとに別々にまとめる（洪水の河川番号）。-dissolve2 は層全体の重なりを1つの区域にだけ残すので、
 *   川をまとめて処理すると、別の川の区域と重なった部分が削られる（新潟駅で小阿賀野川が消えた。2026-10-25 に確認）
 */
async function dissolve(parts: Record<string, Uint8Array>, opts: { encoding: string; bbox: Bbox | null; fields: string[]; copyFields?: string[]; splitBy?: string }) {
  const shps = Object.keys(parts).filter((n) => /\.shp$/i.test(n));
  const cmd = [
    `-i ${shps.join(" ")} combine-files encoding=${opts.encoding}`,
    shps.length > 1 ? "-merge-layers force" : "",
    opts.bbox ? `-clip bbox=${opts.bbox.join(",")}` : "",
    // ます目の中心がどの枠に入るかを、まとめる単位に足す
    `-each 'tile=Math.floor(this.centroidX/${TILE_DEG})+"_"+Math.floor(this.centroidY/${TILE_DEG})'`,
    opts.splitBy ? `-split ${opts.splitBy}` : "",
    `-dissolve2 ${[...opts.fields, "tile"].join(",")}${opts.copyFields?.length ? ` copy-fields=${opts.copyFields.join(",")}` : ""}`,
    `-simplify interval=${SIMPLIFY_M} keep-shapes`,
    // 単純にすると輪郭が自分と交わることがあるので、手元で直す（DB で直すと、信濃川のような大きな形では10分以上かかる。2026-10-25）
    // allow-overlaps：区域どうしの重なりを残す
    "-clean allow-overlaps",
    opts.splitBy ? "-merge-layers force" : "",
    "-o out.json format=geojson precision=0.000001",
  ]
    .filter(Boolean)
    .join(" ");
  const out = await mapshaper.applyCommands(cmd, parts);
  const body = JSON.parse(new TextDecoder().decode(out["out.json"])) as { features: Feature<Geometry, Record<string, unknown>>[] };
  return { features: body.features.filter((f) => f.geometry), files: shps.length };
}

/** zip の中の、名前が pattern に合う Shapefile を1区域ずつ読む（まとめない区域に使う） */
async function* shapefilesInZip(zip: Uint8Array, pattern: RegExp, encoding: string) {
  const parts = shapefileParts([zip], pattern);
  for (const shp of Object.keys(parts).filter((n) => /\.shp$/i.test(n)).sort()) {
    const dbf = parts[shp.replace(/\.shp$/i, ".dbf")];
    if (!dbf) throw new Error(`${shp} に対応する .dbf がありません`);
    for await (const f of readShapefile(parts[shp], dbf, encoding)) yield f;
  }
}

/**
 * 区域を zones に入れる。大きな図形は ST_Subdivide で切れ端に分けて、切れ端ごとに1行にする（ラベルと属性は同じ）
 * cityOnly のときは、新潟市の町に重なる切れ端だけを残す。入れた区域の数と行の数を返す
 */
async function insertZones(sql: Sql, dataset: string, kind: string, rows: ZoneRow[], cityOnly: boolean, log: (m: string) => void, maxVertices: number) {
  // 洪水のようにまとめた区域は1つで数MBあり、全部を1つの命令で処理すると DB の時間制限（10分）を超える（2026-10-25）
  // そこで約1MBずつに分けて送り、命令を分ける。一番大きい形（阿賀野川、約4.6MB）でも1つの命令で約70秒
  const BATCH_BYTES = 1_000_000;
  const areas = new Set<number>();
  let pieces = 0;
  const batches: { n: number; label: string; attrs: Record<string, unknown>; geojson: string }[][] = [[]];
  let size = 0;
  rows.forEach((r, n) => {
    if (size > BATCH_BYTES) {
      batches.push([]);
      size = 0;
    }
    batches[batches.length - 1].push({ n, ...r });
    size += r.geojson.length;
  });
  const started = Date.now();
  for (const [i, batch] of batches.entries()) {
    if (batch.length === 0) continue;
    if (batches.length > 10 && i % 10 === 0) log(`DB に入れています：${i} / ${batches.length}（${Math.round((Date.now() - started) / 1000)}秒）`);
    const inserted = await sql<{ n: number }[]>`
      with x as (
        select r.n, r.label, r.attrs, extensions.st_setsrid(extensions.st_geomfromgeojson(r.geojson), 4326) as g
        from jsonb_to_recordset(${sql.json(batch as never)}) as r(n int, label text, attrs jsonb, geojson text)
      ),
      valid as (
        -- 壊れた図形（自己交差など）だけを直す。直すのは時間がかかるので、正しい図形はそのまま使う
        select n, label, attrs,
          extensions.st_collectionextract(case when extensions.st_isvalid(g) then g else extensions.st_makevalid(g) end, 3) as geom
        from x
      ),
      pieces as (
        select v.n, v.label, v.attrs, extensions.st_multi(p.geom) as geom
        from valid v, lateral extensions.st_subdivide(v.geom, ${maxVertices}::int) as p(geom)
        where not extensions.st_isempty(v.geom)
      )
      insert into zones (dataset_id, kind, label, attrs, geom)
      select ${dataset}, ${kind}, label, attrs || jsonb_build_object('区域の通し番号', n), geom from pieces
      where not ${cityOnly} or exists (
        select 1 from towns t where t.city_code like ${CITY_PREFIX + "%"} and extensions.st_intersects(t.geom, pieces.geom)
      )
      returning (attrs->>'区域の通し番号')::int as n
    `;
    for (const r of inserted) areas.add(r.n);
    pieces += inserted.length;
  }
  return { areas: areas.size, pieces };
}

/**
 * maxVertices：切れ端の頂点の上限。小さいほど点の判定が速いが、行が増えて DB が大きくなる
 * 洪水・津波は 1024（256 だと洪水だけで約15万行・約150MB になり、無料枠 500MB に近づいた。2026-10-25）
 */
async function loadZones(ctx: { sql: Sql; prepared: Prepared; log: (m: string) => void; check: (k: string, v: unknown) => void }, dataset: string, kind: string, maxVertices = 256) {
  const { areas, pieces } = await insertZones(ctx.sql, dataset, kind, ctx.prepared.rows, ctx.prepared.cityOnly, ctx.log, maxVertices);
  ctx.log(`${kind}：${areas}区域を、${pieces}行（切れ端）に分けて入れました`);
  ctx.check("入れた区域", areas);
  ctx.check("行（切れ端）の数", pieces);
}

// ---- A31a 洪水浸水想定区域（2025）・想定最大規模 ----
// zip の中は「10_計画規模」「20_想定最大規模」「30_浸水継続時間」「41・42_家屋倒壊等」のフォルダに分かれ、河川ごとに1ファイル
// ファイル名の「A31a-20-」の 20 が想定最大規模（フォルダ名は Windows の文字コードで、読む側で化けることがあるので使わない）
// 設計まとめの「想定浸水深」は想定最大規模を使う。A31a_205 浸水深ランク（浸水ランクコード）
// 1つの地点が複数の河川の区域に入ることがある（どの河川が氾濫したときの想定かが違う）。段階3で一番深いものを使う
const DEPTH_RANK: Record<string, string> = {
  "1": "0〜0.5m未満",
  "2": "0.5〜3.0m未満",
  "3": "3.0〜5.0m未満",
  "4": "5.0〜10.0m未満",
  "5": "10.0〜20.0m未満",
  "6": "20.0m以上",
};

export const a31aFlood = defineJob<Prepared>({
  datasets: ["D31"],
  rawDir: "A31a",
  table: "zones",
  options: ["area"],

  async prepare(ctx) {
    const { raw, log, check } = ctx;
    const bbox = await areaBbox(ctx);
    const zips = raw.findAll(/\.zip$/i, "国土数値情報 洪水浸水想定区域（A31a、2025、新潟）の zip");
    log(`${zips.map((z) => z.name).join("、")} から想定最大規模の区域をまとめます（数分かかります）`);
    // 15 は新潟県が管理する川、84 は北陸地方整備局（国）が管理する川（信濃川・阿賀野川など。富山県などの川も入っているが、範囲で切る）
    const parts = shapefileParts(
      zips.map((z) => z.body),
      /A31a-20-\d+_(15|84)_\w+\.(shp|dbf)$/i,
    );
    const { features, files } = await dissolve(parts, { encoding: "shift_jis", bbox, fields: ["A31a_201", "A31a_202", "A31a_205"], splitBy: "A31a_201" });
    const rows: ZoneRow[] = features.map((f) => {
      const p = f.properties;
      const label = DEPTH_RANK[String(p.A31a_205)];
      if (!label) throw new Error(`知らない浸水深ランクです：${p.A31a_205}`);
      return {
        label,
        // 行が多いので、属性は事実に使うものだけにする（想定最大規模であること・輪郭の精度は、このファイルの説明と datasets に書く）
        attrs: { 河川名: p.A31a_202, 河川番号: p.A31a_201, 浸水深ランク: Number(p.A31a_205) },
        geojson: JSON.stringify(f.geometry),
      };
    });
    log(`河川のファイル ${files}個から、「河川×浸水深×約1km四方の枠」の区域 ${rows.length}個にまとめました`);
    check("河川のファイルの数", files);
    check("まとめた区域", rows.length);
    return { rows, cityOnly: bbox !== null };
  },

  load: (ctx) => loadZones(ctx, "D31", "洪水浸水想定", 1024),
});

// ---- A33 土砂災害警戒区域（2025） ----
// A33_001 現象：1 急傾斜地の崩壊、2 土石流、3 地滑り
// A33_002 区域：1 警戒区域（指定済）、2 特別警戒区域（指定済）、3 警戒区域（指定前）、4 特別警戒区域（指定前）。指定前は「基礎調査結果の公表」
// A33_008 特別警戒未指定：1 は警戒区域だけを公示し、特別警戒区域の調査・公示をまだしていない区域
// 区域ごとに名前・所在地・告示日があるので、まとめずに1区域ずつ入れる
const PHENOMENON: Record<string, string> = { "1": "急傾斜地の崩壊", "2": "土石流", "3": "地滑り" };
const ZONE: Record<string, string> = {
  "1": "土砂災害警戒区域",
  "2": "土砂災害特別警戒区域",
  "3": "土砂災害警戒区域（指定前・基礎調査の結果）",
  "4": "土砂災害特別警戒区域（指定前・基礎調査の結果）",
};

export const a33Landslide = defineJob<Prepared>({
  datasets: ["D33"],
  rawDir: "A33",
  table: "zones",
  options: ["area"],

  async prepare(ctx) {
    const { raw, check } = ctx;
    const bbox = await areaBbox(ctx);
    const zip = raw.find(/\.zip$/i, "国土数値情報 土砂災害警戒区域（A33、2025、新潟）の zip");
    const rows: ZoneRow[] = [];
    let read = 0;
    for await (const f of shapefilesInZip(zip.body, /Polygon\.(shp|dbf)$/i, "shift_jis")) {
      read++;
      if (bbox && !overlaps(bboxOf(f.geometry), bbox)) continue;
      const p = f.properties;
      const zone = ZONE[String(p.A33_002)];
      const phenomenon = PHENOMENON[String(p.A33_001)];
      if (!zone || !phenomenon) throw new Error(`知らないコードです：現象 ${p.A33_001}、区域 ${p.A33_002}`);
      rows.push({
        // 例：土砂災害特別警戒区域（土石流）、土砂災害警戒区域（急傾斜地の崩壊・指定前・基礎調査の結果）
        label: zone.includes("（") ? zone.replace("（", `（${phenomenon}・`) : `${zone}（${phenomenon}）`,
        attrs: {
          現象: phenomenon,
          区域: zone,
          区域番号: p.A33_004,
          区域名: p.A33_005,
          所在地: p.A33_006,
          告示日: p.A33_007 instanceof Date ? p.A33_007.toISOString().slice(0, 10) : p.A33_007,
          特別警戒区域が未指定: Number(p.A33_008) === 1,
        },
        geojson: JSON.stringify(f.geometry),
      });
    }
    check("読んだ区域", read);
    check("範囲の四角に入った区域", rows.length);
    return { rows, cityOnly: bbox !== null };
  },

  load: (ctx) => loadZones(ctx, "D33", "土砂災害警戒区域"),
});

// ---- A40 津波浸水想定（新潟県は 2017 年版が最新。2024 年度版のページにも新潟県は 2017 年版だけ） ----
// A40_003 津波浸水深の区分（例：0.3m以上 ～ 0.5m未満）。県の報告書の区分の文字のまま
export const a40Tsunami = defineJob<Prepared>({
  datasets: ["D34"],
  rawDir: "A40",
  table: "zones",
  options: ["area"],

  async prepare(ctx) {
    const { raw, log, setAsOf, check } = ctx;
    const bbox = await areaBbox(ctx);
    const zip = raw.find(/\.zip$/i, "国土数値情報 津波浸水想定（A40、新潟）の zip");
    const parts = shapefileParts([zip.body], /A40-\d+_15\.(shp|dbf)$/i);
    const year = /A40-(\d{2})_15/.exec(Object.keys(parts)[0])?.[1];
    if (year) setAsOf("D34", `20${year}`);
    const { features } = await dissolve(parts, { encoding: "shift_jis", bbox, fields: ["A40_003"] });
    const rows: ZoneRow[] = features.map((f) => ({
      // 「0.3m以上 ～ 0.5m未満」→「0.3m以上〜0.5m未満」（区切りの空白と記号だけをそろえる）
      label: String(f.properties.A40_003).replace(/\s*[～〜~]\s*/g, "〜"),
      attrs: { 区分: f.properties.A40_003 },
      geojson: JSON.stringify(f.geometry),
    }));
    log(`「浸水深の区分×約1km四方の枠」ごとに ${rows.length}区域にまとめました`);
    check("まとめた区域", rows.length);
    return { rows, cityOnly: bbox !== null };
  },

  load: (ctx) => loadZones(ctx, "D34", "津波浸水想定", 1024),
});

// ---- A54 大規模盛土造成地（2023） ----
// A54_001 盛土区分：1 谷埋め型、2 腹付け型、9 区分をしていない
// 新潟市には大規模盛土造成地が無い（新潟県のページで小林さんが確認、2026-10-25）。そのため新潟市の物件では「該当なし」になる
const FILL: Record<string, string> = { "1": "谷埋め型", "2": "腹付け型", "9": "区分なし" };

export const a54Embankment = defineJob<Prepared>({
  datasets: ["D36"],
  rawDir: "A54",
  table: "zones",
  options: [],

  async prepare({ raw, check }) {
    const zip = raw.find(/\.zip$/i, "国土数値情報 大規模盛土造成地（A54、2023、新潟）の zip");
    const rows: ZoneRow[] = [];
    for await (const f of shapefilesInZip(zip.body, /A54-\d+_15\.(shp|dbf)$/i, "utf-8")) {
      const p = f.properties;
      const type = FILL[String(p.A54_001)] ?? "区分なし";
      rows.push({
        label: `大規模盛土造成地（${type}）`,
        attrs: { 盛土区分: type, 市区町村: p.A54_005, 市区町村コード: p.A54_004, 盛土番号: p.A54_006 },
        geojson: JSON.stringify(f.geometry),
      });
    }
    check("読んだ区域", rows.length);
    return { rows, cityOnly: false };
  },

  load: (ctx) => loadZones(ctx, "D36", "大規模盛土造成地"),
});
