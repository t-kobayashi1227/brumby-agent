import { createHash } from "node:crypto";
import { reinfolibGet, sleep } from "../lib/reinfolib";
import { defineJob, insertRows } from "../lib/runner";
import { wardOf } from "./d39-towns";

// D01 取引価格・成約価格（不動産情報ライブラリ XIT001）
// npm run ingest -- d01-transactions [from=2015Q1] [to=2026Q3]
// 新潟県の全種類を四半期ごとに取る。まだ公表されていない四半期は 404 が返るので、0件として進める
// 町×築年数の相場は、段階3で district_name（町名）と築年数（取引の年 − 建築年）から SQL で出す
// town_key_code（町の境界との対応）はここでは付けない。地区名は丁目の無い町名のため、段階3で町名で照らし合わせる

const PREF = "15";

type Row = Record<string, string>;

interface Quarter {
  year: number;
  quarter: number;
}

export function parseQuarter(value: string): Quarter {
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
export function toNumber(value: string | undefined): number | null {
  if (!value) return null;
  const normalized = value.replace(/,/g, "");
  return /^-?\d+(\.\d+)?$/.test(normalized) ? Number(normalized) : null;
}

/** 「1995年」→ 1995。「戦前」などは null */
export function toYear(value: string | undefined): number | null {
  const m = value ? /^(\d{4})年$/.exec(value) : null;
  return m ? Number(m[1]) : null;
}

interface Fetched {
  quarter: Quarter;
  rows: Row[];
}

export const d01Transactions = defineJob<Fetched[]>({
  datasets: ["D01"],
  rawDir: "XIT001",
  table: "transactions",
  options: ["from", "to"],

  async prepare({ sql, args, log, setAsOf, check }) {
    const from = parseQuarter(args.from ?? "2015Q1");
    const to = args.to ? parseQuarter(args.to) : currentQuarter();
    const fetched: Fetched[] = [];
    let latest: Quarter | null = null;
    for (const q of quarters(from, to)) {
      const body = await reinfolibGet<{ data?: Row[] }>(sql, "XIT001", { year: q.year, quarter: q.quarter, area: PREF });
      const rows = body?.data ?? [];
      log(`${label(q)}：${rows.length}件${rows.length === 0 ? "（未公表または該当なし）" : ""}`);
      if (rows.length > 0) {
        fetched.push({ quarter: q, rows });
        latest = q;
      }
      await sleep(300);
    }
    if (latest) setAsOf("D01", `${label(from)}〜${label(latest)}（四半期）`);
    check("取った四半期", fetched.map((f) => `${label(f.quarter)}:${f.rows.length}`));
    return fetched;
  },

  async load({ sql, prepared }) {
    for (const { quarter: q, rows } of prepared) {
      // 同じ内容の取引が複数あり得るので、ハッシュに「同じ内容の何件目か」を付けて区別する
      const seen = new Map<string, number>();
      const records = rows.map((raw) => {
        const hash = createHash("sha256").update(`${label(q)}:${JSON.stringify(raw)}`).digest("hex");
        const n = (seen.get(hash) ?? 0) + 1;
        seen.set(hash, n);
        return {
          dataset_id: "D01",
          row_hash: `${hash}#${n}`,
          price_category: raw.PriceCategory || null,
          type: raw.Type || null,
          municipality_code: raw.MunicipalityCode,
          ward: raw.Municipality ? wardOf(raw.Municipality) : null,
          district_name: raw.DistrictName || null,
          year: q.year,
          quarter: q.quarter,
          trade_price: toNumber(raw.TradePrice),
          land_sqm: toNumber(raw.Area),
          floor_sqm: toNumber(raw.TotalFloorArea),
          building_year: toYear(raw.BuildingYear),
          floor_plan: raw.FloorPlan || null,
          structure: raw.Structure || null,
          raw: sql.json(raw),
        };
      });
      await insertRows(sql, "transactions", records);
    }
  },
});
