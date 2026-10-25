import { unzipSync } from "fflate";
import { geocodeAddress } from "../../../lib/geocode";
import { csvRecords, decode, parseCsv } from "../lib/files";
import { insertFacilities, type FacilityRow } from "../lib/facilities";
import { sleep } from "../lib/reinfolib";
import { defineJob } from "../lib/runner";

// D30 病院・診療所・歯科・薬局（医療情報ネットのオープンデータ、厚生労働省）
// npm run ingest -- iryou date=2026-10-24
// data/raw/iryou/ に、ダウンロードした zip（施設票・診療科票・薬局の CSV が入ったもの）を置く。date はダウンロードした日（データの時点）
// 新潟県（都道府県コード 15）だけを入れる
// 緯度経度が 0 の行は、住所から国土地理院の住所検索で位置を出す（設計まとめ「DBを作るときに確かめること」）。出せなかった行は入れない
// 診療科は、同じ施設・同じ科が診療時間帯ごとに複数行あるので、施設ごとにまとめて departments に入れる

const PREF = "15";

interface Source {
  kind: string;
  facility: RegExp;
  departments?: RegExp;
  name: string;
}

const SOURCES: Source[] = [
  { kind: "病院", facility: /病院 \(施設票\)\.csv$/, departments: /病院 \(診療科・診療時間票）\.csv$/, name: "正式名称" },
  { kind: "診療所", facility: /\/診療所 \(施設票\)\.csv$/, departments: /\/診療所 \(診療科・診療時間票）\.csv$/, name: "正式名称" },
  { kind: "歯科", facility: /歯科診療所 \(施設票\)\.csv$/, name: "正式名称" },
  { kind: "薬局", facility: /薬局\.csv$/, name: "名称" },
];

interface Facility {
  id: string;
  kind: string;
  name: string;
  address: string;
  cityCode: string;
  lon: number;
  lat: number;
  geocoded: string | null;
}

interface Prepared {
  rows: FacilityRow[];
}

export const iryou = defineJob<Prepared>({
  datasets: ["D30"],
  rawDir: "iryou",
  table: "facilities",
  options: ["date"],

  async prepare({ args, raw, log, setAsOf, check }) {
    if (!args.date || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) throw new Error("ダウンロードした日を入れてください（例：npm run ingest -- iryou date=2026-10-24）");
    setAsOf("D30", `${args.date}（ダウンロード日）`);

    const zip = raw.find(/\.zip$/i, "医療情報ネットのオープンデータの zip");
    const files = unzipSync(zip.body);
    const text = (pattern: RegExp) => {
      const name = Object.keys(files).find((n) => pattern.test(`/${n}`));
      if (!name) throw new Error(`zip の中に ${pattern} がありません（中身：${Object.keys(files).join(", ")}）`);
      return decode(files[name], "utf-8").replace(/^﻿/, "");
    };

    const facilities: Facility[] = [];
    const departments = new Map<string, Set<string>>();
    for (const s of SOURCES) {
      const records = csvRecords(text(s.facility));
      const header = parseCsv(records.next().value ?? "")[0];
      const col = (name: string) => {
        const i = header.indexOf(name);
        if (i < 0) throw new Error(`${s.kind} の CSV に ${name} の列がありません`);
        return i;
      };
      const [id, name, pref, city, address, lat, lon] = ["ID", s.name, "都道府県コード", "市区町村コード", "所在地", "所在地座標（緯度）", "所在地座標（経度）"].map(col);
      const ids = new Set<string>();
      for (const rec of records) {
        // 都道府県コードを見る前に全部の列を分けると遅いので、"15" を含む行だけを分ける
        if (!rec.includes(`"${PREF}"`)) continue;
        const r = parseCsv(rec)[0];
        if (r[pref] !== PREF) continue;
        ids.add(r[id]);
        facilities.push({ id: r[id], kind: s.kind, name: r[name], address: r[address], cityCode: PREF + r[city], lon: Number(r[lon]), lat: Number(r[lat]), geocoded: null });
      }

      if (s.departments) {
        const deptRecords = csvRecords(text(s.departments));
        const dh = parseCsv(deptRecords.next().value ?? "")[0];
        const [di, dn] = [dh.indexOf("ID"), dh.indexOf("診療科目名")];
        for (const rec of deptRecords) {
          // ID は1列目。新潟県の施設の行だけを分ける
          const firstId = rec.slice(1, rec.indexOf('"', 1));
          if (!ids.has(firstId)) continue;
          const r = parseCsv(rec)[0];
          const set = departments.get(r[di]) ?? new Set<string>();
          if (r[dn]) set.add(r[dn]);
          departments.set(r[di], set);
        }
      }
      log(`${s.kind}：新潟県 ${ids.size}件`);
    }

    // 緯度経度が 0 の行は、住所から位置を出す
    const missing = facilities.filter((f) => !f.lon || !f.lat);
    log(`緯度経度が 0 の ${missing.length}件を、住所から探します`);
    let found = 0;
    for (const f of missing) {
      const hit = await geocodeAddress(f.address);
      if (hit) {
        Object.assign(f, { lon: hit.lon, lat: hit.lat, geocoded: hit.title });
        found++;
      }
      await sleep(200);
    }
    check("緯度経度が0の行", Object.fromEntries(SOURCES.map((s) => [s.kind, missing.filter((f) => f.kind === s.kind).length])));
    check("住所から位置を出せた行", found);
    check("位置を出せず入れなかった行", missing.length - found);
    log(`住所から ${found}件の位置を出しました（出せなかった ${missing.length - found}件は入れません）`);

    const rows: FacilityRow[] = facilities
      .filter((f) => f.lon && f.lat)
      .map((f) => ({
        dataset_id: "D30",
        kind: f.kind,
        name: f.name,
        address: f.address,
        departments: departments.has(f.id) ? [...departments.get(f.id)!] : null,
        attrs: { city_code: f.cityCode, ...(f.geocoded ? { 位置: "住所から推定（国土地理院 住所検索）", 当たった住所: f.geocoded } : {}) },
        source_ref: f.id,
        lon: f.lon,
        lat: f.lat,
      }));
    return { rows };
  },

  async load({ sql, prepared, log }) {
    await insertFacilities(sql, prepared.rows);
    log(`${prepared.rows.length}件を入れました`);
  },
});
