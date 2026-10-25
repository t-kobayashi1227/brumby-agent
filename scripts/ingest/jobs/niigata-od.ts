import { decode, parseCsv } from "../lib/files";
import { insertFacilities, type FacilityRow } from "../lib/facilities";
import { defineJob, insertRows } from "../lib/runner";

// D21・D22・D23 新潟市オープンデータ（GISデータの CSV、UTF-8）
// npm run ingest -- niigata-od
// data/raw/niigata-od/ に、放課後児童クラブ・公園・緑地・図書館の CSV を置く（ファイル名は市のページのまま）
// 列は longitude, latitude, SAUID, SAFIELD000〜。SAFIELD の中身は CSV ごとに違うので、下の表で決める
// 時点は市のページの最終更新日（2026-10-25 に小林さんが確認）：放課後児童クラブ 2017-03-14、公園・緑地 2019-12-09、図書館 2019-01-31

interface Source {
  dataset: string;
  kind: string;
  file: RegExp;
  hint: string;
  /** SAFIELD の何番目が名前・住所か */
  name: number;
  address: number;
  /** attrs に入れる列（SAFIELD の番号 → 項目名） */
  extra: Record<number, string>;
}

const SOURCES: Source[] = [
  { dataset: "D21", kind: "放課後児童クラブ", file: /放課後児童クラブ.*\.csv$/, hint: "放課後児童クラブ.csv", name: 0, address: 2, extra: { 3: "電話" } },
  { dataset: "D22", kind: "公園", file: /公園.*\.csv$/, hint: "公園・緑地.csv", name: 0, address: 1, extra: { 2: "面積_㎡" } },
  { dataset: "D23", kind: "図書館", file: /図書館.*\.csv$/, hint: "図書館.csv", name: 0, address: 1, extra: { 2: "電話", 3: "区", 4: "延床面積_㎡" } },
];

export const niigataOd = defineJob({
  datasets: SOURCES.map((s) => s.dataset),
  rawDir: "niigata-od",
  table: "facilities",
  options: [],

  async load({ sql, raw, log, check }) {
    for (const s of SOURCES) {
      const file = raw.find(s.file, s.hint);
      const [header, ...lines] = parseCsv(decode(file.body, "utf-8").replace(/^﻿/, ""));
      const col = (name: string) => {
        const i = header.indexOf(name);
        if (i < 0) throw new Error(`${file.name} に ${name} の列がありません（${header.join(",")}）`);
        return i;
      };
      const [lon, lat, id] = [col("longitude"), col("latitude"), col("SAUID")];
      const field = (r: string[], n: number) => (r[col(`SAFIELD${String(n).padStart(3, "0")}`)] ?? "").trim() || null;

      const rows: FacilityRow[] = [];
      let skipped = 0;
      for (const r of lines) {
        const [x, y] = [Number(r[lon]), Number(r[lat])];
        const name = field(r, s.name);
        if (!name || !x || !y) {
          skipped++;
          continue;
        }
        const address = field(r, s.address);
        rows.push({
          dataset_id: s.dataset,
          kind: s.kind,
          name,
          // 住所に市の名前が無いものは足す（例：南区新飯田… → 新潟市南区新飯田…）
          address: address && !address.startsWith("新潟市") && !address.startsWith("新潟県") ? `新潟市${address}` : address,
          attrs: Object.fromEntries(Object.entries(s.extra).map(([n, label]) => [label, field(r, Number(n))])),
          source_ref: r[id] || null,
          lon: x,
          lat: y,
        });
      }
      await insertFacilities(sql, rows);
      log(`${file.name}：${rows.length}件を入れました${skipped ? `（名前か位置の無い ${skipped}行は入れない）` : ""}`);
      check(`${s.kind}：入れなかった行`, skipped);
    }
  },
});

/** 「1,079」のような桁区切りの数を数にする。「x」（秘匿）や空欄は null */
export function toCount(text: string | undefined): number | null {
  const t = (text ?? "").replace(/,/g, "").trim();
  return /^\d+$/.test(t) ? Number(t) : null;
}

// D10 町名別・5歳階級別人口（新潟市オープンデータ、住民基本台帳、UTF-8 の CSV）
// npm run ingest -- niigata-population
// data/raw/niigata-od/ に、市のページの CSV（例：町名別5歳階級人口_令和8年9月.csv）を置く
// 列：年[西暦], 年[和暦], 月, 区名, 区役所・出張所名, 町丁名, 世帯数[世帯], 男女別・計, 人口計[人], 0～4歳[人], …, 115歳～[人]
// 町丁ごとに「男」「女」「計」の3行がある。「計」の行だけを使う（世帯数も「計」の行にだけある）
// 1,000 以上の数は「"1,079"」のように桁区切りのカンマ付きで入っている（toCount で数にする）
// 「西区 計」「西出張所 計」などの小計の行は使わない。区の値は、町丁の値を足して出す
// 町丁名は「朝日町１丁目」のように全角の数字で、国勢調査の町名（例：関屋下川原町二丁目）と書き方が違う。照らし合わせは段階3で行う
export const niigataPopulation = defineJob({
  datasets: ["D10"],
  rawDir: "niigata-od",
  table: "area_stats",
  options: [],

  async load({ sql, raw, log, setAsOf, check }) {
    const file = raw.find(/5歳.*\.csv$/, "町名別5歳階級人口の CSV");
    const [header, ...lines] = parseCsv(decode(file.body, "utf-8").replace(/^﻿/, ""));
    const expect = ["年[西暦]", "年[和暦]", "月", "区名", "区役所・出張所名", "町丁名", "世帯数[世帯]", "男女別・計", "人口計[人]"];
    if (expect.some((name, i) => header[i] !== name)) throw new Error(`${file.name} の見出しの並びが想定と違います：${header.slice(0, 9).join(",")}`);
    // 年齢の列（0～4歳[人] など）。項目名は「0〜4歳」の形にそろえる
    const ages = header.slice(9).map((h) => h.replace(/\[人\]$/, "").replace(/～/g, "〜"));
    // 「0〜4歳」…「110〜114歳」と、最後の「115歳〜」
    if (!ages.every((a) => /^(\d+〜\d+歳|\d+歳〜)$/.test(a))) throw new Error(`${file.name} の年齢の列が想定と違います：${ages.join(",")}`);
    const metrics = [{ name: "世帯数", unit: "世帯" }, { name: "人口計", unit: "人" }, ...ages.map((name) => ({ name, unit: "人" }))];

    // 同じ町丁が、区役所と出張所の受け持ちに分かれて2行あることがある（例：東区の岡山）。その場合は足して1つの町丁にする
    const towns = new Map<string, { ward: string; town: string; values: (number | null)[]; offices: string[] }>();
    const months = new Set<string>();
    const secret = new Set<string>();
    let sumMismatch = 0;
    for (const r of lines) {
      const [y, , m, ward, office, town, households, sex, ...numbers] = r;
      // 小計の行（「西区 計」「西出張所 計」「新潟市 計」）と、男・女の行は使わない
      if (!town || / 計$/.test(ward) || / 計$/.test(office ?? "") || sex !== "計") continue;
      months.add(`${y}-${String(m).padStart(2, "0")}`);
      const values = [toCount(households), ...numbers.map(toCount)];
      if (values.length !== metrics.length) throw new Error(`${file.name}：${ward}${town} の欄の数が見出しと違います（${values.length}／${metrics.length}）`);
      // 確かめ：人口計＝年齢別の合計（秘匿の x の町丁は確かめられない）
      const [, total, ...byAge] = values;
      if (total === null) secret.add(`${ward}:${town}`);
      else if (byAge.every((v) => v !== null) && total !== byAge.reduce((s: number, v) => s + (v ?? 0), 0)) sumMismatch++;

      const key = `${ward}:${town}`;
      const cur = towns.get(key) ?? { ward, town, values: metrics.map(() => null), offices: [] };
      values.forEach((v, i) => {
        if (v !== null) cur.values[i] = (cur.values[i] ?? 0) + v;
      });
      cur.offices.push(office);
      towns.set(key, cur);
    }
    if (months.size !== 1) throw new Error(`CSV に複数の時点があります：${[...months].join(", ")}`);
    check("人口計と年齢別の合計が合わない町丁", sumMismatch);
    const rows = [...towns].flatMap(([key, t]) =>
      metrics.map((m, i) => ({
        dataset_id: "D10",
        area_level: "町",
        area_key: key,
        ward: t.ward,
        area_name: t.town,
        metric: m.name,
        value: t.values[i],
        unit: m.unit,
        raw: t.offices.length > 1 ? sql.json({ 受け持ち: t.offices } as never) : null,
      })),
    );
    check("2つの受け持ちに分かれていた町丁", [...towns.values()].filter((t) => t.offices.length > 1).map((t) => `${t.ward}${t.town}`));
    setAsOf("D10", [...months][0]);
    await insertRows(sql, "area_stats", rows, 2000);
    // 区の値（町丁の合計）。秘匿（x）の町丁は数に入らないので、そのことを raw に残す
    const [{ n }] = await sql<{ n: number }[]>`
      with ins as (
        insert into area_stats (dataset_id, area_level, area_key, ward, area_name, metric, value, unit, raw)
        select 'D10', '区', ward, ward, ward, metric, sum(value), min(unit),
          jsonb_build_object('注', '町丁の合計。秘匿（x）の町丁は含まない', '秘匿の町丁の数', count(*) - count(value))
        from area_stats where dataset_id = 'D10' and area_level = '町'
        group by ward, metric
        returning 1
      )
      select count(*)::int as n from ins
    `;
    log(`${file.name}（${[...months][0]}）：町丁 ${towns.size}か所 × ${metrics.length}項目、区の合計 ${n}行を入れました`);
    check("町丁の数", towns.size);
    check("秘匿（x）の町丁の数", secret.size);
  },
});
