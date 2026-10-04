import { requireEnv } from "../lib/env";
import { fetchJson, sleep } from "../lib/http";
import { insertRows, type IngestJob } from "../lib/runner";

// 国勢調査2020 小地域（町丁目）の数字（e-Stat API getStatsData）
// npm run ingest -- estat-census --pref 15 [--tables population,age]
//
// 地域は3つの階層だけを保存する：市区町村（level1、5桁）、丁目のない町（level2、9桁）、丁目（level4、11桁）
// level3（丁目のある町。中身は丁目の合計）は、町丁目の境界（areas）になく、保存すると二重に数えるので捨てる

const ENDPOINT = "https://api.e-stat.go.jp/rest/3.0/app/json/getStatsData";

interface Table {
  /** 都道府県ごとの statsDataId */
  ids: Record<string, string>;
  /** cat01 のコード → stat_key。ここにないコードは取らない */
  keys: Record<string, string>;
}

const TABLES: Record<string, Table> = {
  population: {
    ids: { "15": "8003006731" },
    keys: { "0010": "pop_total", "0020": "pop_male", "0030": "pop_female", "0040": "households" },
  },
  age: {
    ids: { "15": "8003006774" },
    // 総数の分だけ。男女別（0210〜）は取らない
    keys: {
      "0010": "age_total",
      "0020": "age_00_04", "0030": "age_05_09", "0040": "age_10_14", "0050": "age_15_19",
      "0060": "age_20_24", "0070": "age_25_29", "0080": "age_30_34", "0090": "age_35_39",
      "0100": "age_40_44", "0110": "age_45_49", "0120": "age_50_54", "0130": "age_55_59",
      "0140": "age_60_64", "0150": "age_65_69", "0160": "age_70_74",
      "0170": "age_under15", "0180": "age_15_64", "0190": "age_65plus", "0200": "age_75plus",
    },
  },
  family: {
    ids: { "15": "8003006884" },
    keys: {
      "0010": "hh_general", "0020": "hh_kin", "0030": "hh_nuclear", "0040": "hh_couple_only",
      "0050": "hh_couple_children", "0060": "hh_non_nuclear", "0070": "hh_with_under6",
      "0080": "hh_with_under18", "0090": "hh_with_65plus",
    },
  },
  tenure: {
    ids: { "15": "8003006915" },
    // 小地域の表には、持ち家と民営借家しかない（公営借家・給与住宅などはない）
    keys: { "0010": "tenure_total", "0020": "tenure_owned", "0030": "tenure_private_rented" },
  },
  dwelling: {
    ids: { "15": "8003006966" },
    keys: {
      "0010": "dwelling_total", "0020": "dwelling_detached", "0030": "dwelling_row",
      "0040": "dwelling_apartment", "0050": "dwelling_apt_1_2f", "0060": "dwelling_apt_3_5f",
      "0070": "dwelling_apt_6_10f", "0080": "dwelling_apt_11f_plus", "0090": "dwelling_other",
    },
  },
};

const KEEP_LEVELS = new Set(["1", "2", "4"]);

interface StatsData {
  GET_STATS_DATA: {
    RESULT: { STATUS: number; ERROR_MSG: string };
    STATISTICAL_DATA?: {
      RESULT_INF: { TOTAL_NUMBER: number; NEXT_KEY?: number };
      CLASS_INF?: { CLASS_OBJ: ClassObj | ClassObj[] };
      DATA_INF?: { VALUE: Value | Value[] };
    };
  };
}

interface ClassObj {
  "@id": string;
  CLASS: { "@code": string; "@level"?: string } | { "@code": string; "@level"?: string }[];
}

interface Value {
  "@area": string;
  "@cat01": string;
  "@cat02"?: string;
  $: string;
}

const list = <T>(x: T | T[] | undefined): T[] => (x === undefined ? [] : Array.isArray(x) ? x : [x]);

export const estatCensus: IngestJob = {
  source: "estat",
  dataset: "census2020_small_area",
  table: "census_values",
  attribution: "出典：「令和2年国勢調査」（総務省統計局）（政府統計の総合窓口（e-Stat））",
  options: ["pref", "tables"],

  describe(args) {
    const tables = args.tables ? `/tables:${args.tables}` : "";
    return { coverage: `pref:${args.pref ?? "15"}${tables}`, period: "2020" };
  },

  async load({ sql, versionId, args, saveRaw, log }) {
    const appId = requireEnv("ESTAT_APP_ID");
    const pref = args.pref ?? "15";
    const names = args.tables ? args.tables.split(",") : Object.keys(TABLES);

    for (const name of names) {
      const table = TABLES[name];
      if (!table) throw new Error(`表の名前が違います：${name}（${Object.keys(TABLES).join(" / ")}）`);
      const statsDataId = table.ids[pref];
      if (!statsDataId) throw new Error(`都道府県コード ${pref} の ${name} の statsDataId が登録されていません`);

      const pages: StatsData[] = [];
      const levels = new Map<string, string>();
      let start: number | undefined = 1;
      while (start !== undefined) {
        const params: URLSearchParams = new URLSearchParams({
          appId,
          statsDataId,
          cdCat01: Object.keys(table.keys).join(","),
          metaGetFlg: start === 1 ? "Y" : "N",
          cntGetFlg: "N",
          startPosition: String(start),
          limit: "100000",
        });
        const body: StatsData | null = await fetchJson<StatsData>(`${ENDPOINT}?${params}`);
        const result = body?.GET_STATS_DATA.RESULT;
        if (!body || !result || result.STATUS !== 0) throw new Error(`e-Stat のエラー（${name}）：${result?.ERROR_MSG ?? "応答なし"}`);
        pages.push(body);

        const data: NonNullable<StatsData["GET_STATS_DATA"]["STATISTICAL_DATA"]> = body.GET_STATS_DATA.STATISTICAL_DATA!;
        for (const obj of list(data.CLASS_INF?.CLASS_OBJ)) {
          if (obj["@id"] !== "area") continue;
          for (const c of list(obj.CLASS)) levels.set(c["@code"], c["@level"] ?? "");
        }
        start = data.RESULT_INF.NEXT_KEY;
        await sleep(300);
      }
      await saveRaw(`${statsDataId}.json`, JSON.stringify(pages));

      const rows: Record<string, unknown>[] = [];
      const secrecy = new Map<string, string>();
      for (const page of pages) {
        for (const v of list(page.GET_STATS_DATA.STATISTICAL_DATA!.DATA_INF?.VALUE)) {
          if (!KEEP_LEVELS.has(levels.get(v["@area"]) ?? "")) continue;
          const key = table.keys[v["@cat01"]];
          if (!key) continue;
          // 「-」（該当なし）や秘匿の記号は null
          rows.push({
            dataset_version_id: versionId,
            key_code: v["@area"],
            stat_key: key,
            value: /^\d+$/.test(v.$) ? Number(v.$) : null,
          });
          if (name === "population" && v["@cat02"]) secrecy.set(v["@area"], v["@cat02"]);
        }
      }
      // 秘匿・合算の有無（1 無し／2 合算／3 秘匿）。人口総数の表から1地域1行
      for (const [area, flag] of secrecy) {
        rows.push({ dataset_version_id: versionId, key_code: area, stat_key: "secrecy", value: Number(flag) });
      }

      await insertRows(sql, "census_values", rows, 5000);
      const dropped = [...levels.values()].filter((l) => l === "3").length;
      log(`${name}（${statsDataId}）：${rows.length}行（level3の${dropped}地域は保存しない）`);
    }
  },
};
