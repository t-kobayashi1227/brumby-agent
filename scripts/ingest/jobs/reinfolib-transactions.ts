import { createHash } from "node:crypto";
import { requireEnv } from "../lib/env";
import { fetchJson, sleep } from "../lib/http";
import { insertRows, type IngestJob } from "../lib/runner";

// 取引価格・成約価格（不動産情報ライブラリ XIT001）
// npm run ingest -- reinfolib-transactions --pref 15 --from 2015Q1 [--to 2026Q2]
// 四半期ごとに取得する。まだ公表されていない四半期は 404 が返るので、0件として進める

const ENDPOINT = "https://www.reinfolib.mlit.go.jp/ex-api/external/XIT001";

type Xit001Row = Record<string, string>;

interface Quarter {
  year: number;
  quarter: number;
}

function parseQuarter(value: string): Quarter {
  const m = /^(\d{4})Q([1-4])$/.exec(value);
  if (!m) throw new Error(`四半期は 2015Q1 の形で指定してください：${value}`);
  return { year: Number(m[1]), quarter: Number(m[2]) };
}

function currentQuarter(): Quarter {
  const now = new Date();
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 };
}

function* quarters(from: Quarter, to: Quarter): Generator<Quarter> {
  for (let { year, quarter } = from; year * 4 + quarter <= to.year * 4 + to.quarter; ) {
    yield { year, quarter };
    if (++quarter > 4) {
      quarter = 1;
      year++;
    }
  }
}

const label = (q: Quarter) => `${q.year}Q${q.quarter}`;

/** "1,234" → 1234。「2000㎡以上」「戦前」など数字でない表記は null（元の値は raw に残る） */
function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null;
}

function toYear(value: string | undefined): number | null {
  const m = value ? /^(\d{4})年$/.exec(value) : null;
  return m ? Number(m[1]) : null;
}

export const reinfolibTransactions: IngestJob = {
  source: "reinfolib",
  dataset: "XIT001",
  table: "transactions",
  // 利用約款の出典記載例どおり。集計して表示するときは「をもとに作成」を画面側で添える（設計書 D12）
  attribution: "出典：国土交通省 不動産情報ライブラリ（https://www.reinfolib.mlit.go.jp/）「不動産価格（取引価格・成約価格）情報」",
  options: ["pref", "from", "to"],

  describe(args) {
    const pref = args.pref ?? "15";
    const from = parseQuarter(args.from ?? "2015Q1");
    const to = args.to ? parseQuarter(args.to) : currentQuarter();
    return { coverage: `pref:${pref}`, period: `${label(from)}-${label(to)}` };
  },

  async load({ sql, versionId, args, saveRaw, log, setPublishedOn }) {
    const key = requireEnv("REINFOLIB_API_KEY");
    const pref = args.pref ?? "15";
    const from = parseQuarter(args.from ?? "2015Q1");
    const to = args.to ? parseQuarter(args.to) : currentQuarter();

    for (const q of quarters(from, to)) {
      const url = `${ENDPOINT}?year=${q.year}&quarter=${q.quarter}&area=${pref}`;
      const body = await fetchJson<{ status: string; data: Xit001Row[] }>(url, {
        headers: { "Ocp-Apim-Subscription-Key": key },
      });
      const data = body?.data ?? [];
      if (!body || data.length === 0) {
        log(`${label(q)}：0件（未公表または該当なし）`);
        continue;
      }
      await saveRaw(`${label(q)}.json`, JSON.stringify(body));

      // 同じ内容の取引が複数あり得るので、ハッシュに「同じ内容の何件目か」を付けて区別する
      const seen = new Map<string, number>();
      const rows = data.map((raw) => {
        const hash = createHash("sha256").update(`${label(q)}:${JSON.stringify(raw)}`).digest("hex");
        const n = (seen.get(hash) ?? 0) + 1;
        seen.set(hash, n);
        return {
          dataset_version_id: versionId,
          row_hash: `${hash}#${n}`,
          price_category: raw.PriceCategory || null,
          type: raw.Type || null,
          municipality_code: raw.MunicipalityCode,
          municipality: raw.Municipality || null,
          district_name: raw.DistrictName || null,
          district_code: raw.DistrictCode || null,
          year: q.year,
          quarter: q.quarter,
          trade_price: toNumber(raw.TradePrice),
          unit_price: toNumber(raw.UnitPrice),
          area_sqm: toNumber(raw.Area),
          total_floor_area_sqm: toNumber(raw.TotalFloorArea),
          building_year: toYear(raw.BuildingYear),
          floor_plan: raw.FloorPlan || null,
          structure: raw.Structure || null,
          land_shape: raw.LandShape || null,
          frontage_m: toNumber(raw.Frontage),
          city_planning: raw.CityPlanning || null,
          coverage_ratio: toNumber(raw.CoverageRatio),
          floor_area_ratio: toNumber(raw.FloorAreaRatio),
          raw: sql.json(raw),
        };
      });
      await insertRows(sql, "transactions", rows);
      // データの時点：取れた中で最新の四半期の最初の月（D31）
      setPublishedOn(`${q.year}-${String((q.quarter - 1) * 3 + 1).padStart(2, "0")}-01`);
      log(`${label(q)}：${rows.length}件`);
      await sleep(300);
    }
  },
};
