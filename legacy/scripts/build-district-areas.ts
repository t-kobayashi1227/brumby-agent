// 取引価格（XIT001）の地区と、町丁目（国勢調査2020 小地域）の対応表を作る：npm run build:district-areas [-- --pref 15]
// 使用中（active）の取引の版と町丁目の版の組み合わせについて、district_areas を作り直す
// 取引価格を取り直したときと、町丁目の境界を新しい版に切り替えたときに動かす（docs/data-notes.md 4章）
//
// 地区コードは国勢調査の KEY_CODE と別の体系なので使わず、同じ市区町村の中で名前で結びつける
// 当てはめる順番：district_manual（手で直したもの）→ exact（ならした名前が一致）→ prefix（町丁目の名前が地区名で始まる）
// prefix は、manual・exact でほかの地区に取られた町丁目を使わない（「横越」が「横越中央一丁目」を取らないように）
// exact は「大字」「字」を外して比べるが、外さずに一致するほかの地区がある町丁目は、その地区に渡す
// （地区「大字茨目」→ 町丁目「大字茨目」、地区「茨目」→ 町丁目「茨目一〜三丁目」）
import { parseArgs } from "node:util";
import { getSql } from "../lib/db";
import { insertRows } from "./ingest/lib/runner";

// 相場に使う種類（設計書 D11）。一致率はこの件数で数える
const HOUSING_TYPES = ["宅地(土地と建物)", "宅地(土地)"];

/** 地区名と町丁目の名前を、比べられる形にならす。strict のときは先頭の「大字」「字」を外さない */
export function normalizeName(name: string, strict = false): string {
  const base = name
    .normalize("NFKC")
    .replace(/\(.*?\)/g, "");                      // 「栄町(さかえちょう)」→「栄町」（NFKCで全角かっこは半角になる）
  return (strict ? base : base.replace(/^(大字|字)/, ""))
    .replace(/[一二三四五六七八九十〇0-9]+丁目$/, "")
    .replace(/[ヶヵ]/g, "ケ")
    .replace(/之/g, "ノ")
    .replace(/\s/g, "");
}

type Match = "exact" | "prefix" | "manual";

interface District {
  municipality_code: string;
  district_name: string;
  housing: number;
}

async function main() {
  const { values } = parseArgs({ options: { pref: { type: "string" } } });
  const coverage = `pref:${values.pref ?? "15"}`;
  const sql = getSql();

  const versionOf = async (source: string, dataset: string) => {
    const [v] = await sql<{ id: string }[]>`
      select id from dataset_versions
      where source = ${source} and dataset = ${dataset} and coverage = ${coverage} and status = 'active'
    `;
    if (!v) throw new Error(`使用中の版がありません：${source}/${dataset}（${coverage}）`);
    return Number(v.id);
  };
  const transactionsVersion = await versionOf("reinfolib", "XIT001");
  const areasVersion = await versionOf("estat", "census2020_boundary");
  console.log(`取引の版 ${transactionsVersion} × 町丁目の版 ${areasVersion}（${coverage}）`);

  const districts = await sql<District[]>`
    select municipality_code, district_name,
      count(*) filter (where type in ${sql(HOUSING_TYPES)})::int as housing
    from transactions
    where dataset_version_id = ${transactionsVersion} and district_name is not null
    group by 1, 2
  `;
  const areas = await sql<{ key_code: string; city_code: string; name: string }[]>`
    select key_code, city_code, name from areas
    where dataset_version_id = ${areasVersion} and hcode = 8101 and name is not null
  `;
  const manual = await sql<{ municipality_code: string; district_name: string; key_code: string }[]>`
    select municipality_code, district_name, key_code from district_manual
  `;

  // 市区町村ごとに、町丁目を「ならした名前」と一緒に持つ
  const areasByCity = new Map<string, { key_code: string; name: string; strict: string }[]>();
  for (const a of areas) {
    const list = areasByCity.get(a.city_code) ?? [];
    list.push({ key_code: a.key_code, name: normalizeName(a.name), strict: normalizeName(a.name, true) });
    areasByCity.set(a.city_code, list);
  }
  const knownKeys = new Set(areas.map((a) => a.key_code));
  const manualByDistrict = new Map<string, string[]>();
  for (const m of manual) {
    if (!knownKeys.has(m.key_code)) {
      console.warn(`  district_manual の町丁目が、町丁目の版 ${areasVersion} にありません：${m.district_name} → ${m.key_code}`);
      continue;
    }
    const k = `${m.municipality_code}|${m.district_name}`;
    manualByDistrict.set(k, [...(manualByDistrict.get(k) ?? []), m.key_code]);
  }

  const rows: Record<string, unknown>[] = [];
  const summary: Record<Match | "none", { districts: number; housing: number }> = {
    manual: { districts: 0, housing: 0 },
    exact: { districts: 0, housing: 0 },
    prefix: { districts: 0, housing: 0 },
    none: { districts: 0, housing: 0 },
  };
  const unmatched: District[] = [];
  const districtKey = (d: District) => `${d.municipality_code}|${d.district_name}`;
  const assigned = new Map<string, { match: Match; keys: string[] }>();
  const claimed = new Set<string>(); // 1周目（manual・exact）で取られた町丁目。KEY_CODEは市区町村コードを含むので県内で一意

  // 「大字」「字」を外さずに名前が一致する地区（町丁目ごと）。exact で、ほかの地区がこれに当たる町丁目は取らない
  const strictOwners = new Map<string, Set<string>>();
  for (const d of districts) {
    const strict = normalizeName(d.district_name, true);
    for (const a of areasByCity.get(d.municipality_code) ?? []) {
      if (!strict || a.strict !== strict) continue;
      strictOwners.set(a.key_code, (strictOwners.get(a.key_code) ?? new Set<string>()).add(districtKey(d)));
    }
  }

  // 1周目：manual → exact
  // ほかの地区に渡したために exact で何も取れなかった地区は、3周目で同じ町丁目を分け合う（「大字蓮台寺」と「蓮台寺」）
  const sharedExact = new Map<string, string[]>();
  for (const d of districts) {
    const manualKeys = manualByDistrict.get(districtKey(d)) ?? [];
    const name = normalizeName(d.district_name);
    const looseKeys = name
      ? (areasByCity.get(d.municipality_code) ?? []).filter((a) => a.name === name).map((a) => a.key_code)
      : [];
    const exactKeys = looseKeys.filter(
      (k) => !strictOwners.has(k) || strictOwners.get(k)!.has(districtKey(d)),
    );
    if (exactKeys.length === 0 && looseKeys.length > 0) sharedExact.set(districtKey(d), looseKeys);
    const hit: { match: Match; keys: string[] } | null =
      manualKeys.length > 0 ? { match: "manual", keys: manualKeys }
      : exactKeys.length > 0 ? { match: "exact", keys: exactKeys }
      : null;
    if (!hit) continue;
    assigned.set(districtKey(d), hit);
    hit.keys.forEach((k) => claimed.add(k));
  }

  // 2周目：prefix。1周目で取れなかった地区だけが対象。ほかの地区に取られた町丁目は使わない
  // 町丁目の名前の先頭と一致する地区が複数あれば、いちばん長い名前の地区に渡す（「礎町通上一ノ町」→「礎町通上」）
  const prefixDistricts = districts
    .filter((d) => !assigned.has(districtKey(d)))
    .map((d) => ({ d, name: normalizeName(d.district_name) }))
    .filter((x) => x.name);
  let skippedClaimed = 0;
  for (const [city, cityAreas] of areasByCity) {
    const inCity = prefixDistricts.filter((x) => x.d.municipality_code === city);
    if (inCity.length === 0) continue;
    for (const a of cityAreas) {
      const owners = inCity.filter((x) => a.name.startsWith(x.name));
      if (owners.length === 0) continue;
      if (claimed.has(a.key_code)) {
        skippedClaimed++;
        continue;
      }
      // 同じ長さなら（「大字X」と「X」など同じ場所の別の書き方）どちらにも渡す
      const longest = Math.max(...owners.map((x) => x.name.length));
      for (const { d } of owners.filter((x) => x.name.length === longest)) {
        const entry = assigned.get(districtKey(d)) ?? { match: "prefix" as const, keys: [] };
        entry.keys.push(a.key_code);
        assigned.set(districtKey(d), entry);
      }
    }
  }

  // 3周目：exact でも prefix でも取れなかった地区は、ほかの地区に渡した町丁目を分け合う
  for (const [key, keys] of sharedExact) {
    if (!assigned.has(key)) assigned.set(key, { match: "exact", keys });
  }

  for (const d of districts) {
    const hit = assigned.get(districtKey(d));
    const match: Match | "none" = hit?.match ?? "none";
    const keys = hit?.keys ?? [];

    summary[match].districts++;
    summary[match].housing += d.housing;
    if (match === "none") {
      unmatched.push(d);
      continue;
    }
    for (const key_code of keys) {
      rows.push({
        transactions_version_id: transactionsVersion,
        areas_version_id: areasVersion,
        municipality_code: d.municipality_code,
        district_name: d.district_name,
        key_code,
        match,
      });
    }
  }

  // 同じ版の組み合わせの対応は、消してから入れ直す（何度動かしても二重にならない）
  await sql.begin(async (tx) => {
    await tx`
      delete from district_areas
      where transactions_version_id = ${transactionsVersion} and areas_version_id = ${areasVersion}
    `;
    await insertRows(tx as unknown as typeof sql, "district_areas", rows);
  });

  const totalHousing = districts.reduce((s, d) => s + d.housing, 0);
  console.log(`対応表に ${rows.length}行を書きました（地区 ${districts.length}個）`);
  console.log(`prefixで、ほかの地区（manual・exact）に取られていて使わなかった町丁目：${skippedClaimed}個`);
  console.log("結びつけ方 | 地区 | 宅地の取引");
  for (const m of ["manual", "exact", "prefix", "none"] as const) {
    const s = summary[m];
    console.log(`${m} | ${s.districts} | ${s.housing}件（${((s.housing / totalHousing) * 100).toFixed(1)}%）`);
  }
  unmatched.sort((a, b) => b.housing - a.housing);
  console.log("結びつかない地区（宅地の取引の多い順、上位20）");
  for (const d of unmatched.slice(0, 20)) {
    console.log(`  ${d.municipality_code} ${d.district_name}：${d.housing}件`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getSql().end());
