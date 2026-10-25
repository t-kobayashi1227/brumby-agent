// 公開データの取り込み：npm run ingest -- <ジョブ名> [refresh] [オプション=値 ...]
// 例：npm run ingest -- d39-towns
//     npm run ingest -- iryou date=2026-10-24
// refresh を付けると、data/raw/ に保存済みのファイルを使わずにダウンロードし直す
// 「--date 2026-10-24」の形も受け付けるが、PowerShell では npm の前で「--」が消え、npm が --date を自分のオプションとして
// 取ってしまう。どのシェルでも同じに動くよう「date=2026-10-24」の形を使う
// 取り込みの一覧と件数・時点：npm run ingest -- status
// 大規模小売店舗の判定の確認用 CSV：npm run ingest -- d29-review
import { parseArgs } from "node:util";
import { getSql } from "../../lib/db";
import { d01Transactions } from "./jobs/d01-transactions";
import { d05Census } from "./jobs/d05-census";
import { d39Towns } from "./jobs/d39-towns";
import { a31aFlood, a33Landslide, a40Tsunami, a54Embankment } from "./jobs/ksj-zones";
import { iryou } from "./jobs/iryou";
import { niigataOd, niigataPopulation } from "./jobs/niigata-od";
import { n02Stations, p05Offices, p11BusStops, p14Childcare, p29Schools } from "./jobs/ksj-facilities";
import { landPrices, mesh250 } from "./jobs/ksj-prices-mesh";
import { osm } from "./jobs/osm";
import { d29LargeStores, writeReviewCsv } from "./jobs/d29-large-stores";
import { d04Zoning, d35Liquefaction } from "./jobs/xkt-zones";
import { runIngest, type IngestJob } from "./lib/runner";

const jobs: Record<string, IngestJob<unknown>> = {
  "d39-towns": d39Towns,
  "d05-census": d05Census,
  "d04-zoning": d04Zoning,
  "d35-liquefaction": d35Liquefaction,
  "d01-transactions": d01Transactions,
  "p29-schools": p29Schools,
  "p14-childcare": p14Childcare,
  "p05-offices": p05Offices,
  "n02-stations": n02Stations,
  "p11-bus-stops": p11BusStops,
  "niigata-od": niigataOd,
  iryou,
  "a31a-flood": a31aFlood,
  "a33-landslide": a33Landslide,
  "a40-tsunami": a40Tsunami,
  "a54-embankment": a54Embankment,
  "land-prices": landPrices,
  mesh250,
  "niigata-population": niigataPopulation,
  osm,
  "d29-large-stores": d29LargeStores,
};

async function status() {
  const rows = await getSql()<{ id: string; name: string; as_of: string | null; row_count: number | null; loaded_at: Date | null }[]>`
    select id, name, as_of, row_count, loaded_at from datasets order by id
  `;
  console.table(
    rows.map((r) => ({
      id: r.id,
      データ: r.name,
      時点: r.as_of ?? "",
      件数: r.row_count ?? "未取り込み",
      取り込み日時: r.loaded_at ? r.loaded_at.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" }) : "",
    })),
  );
}

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  if (name === "status") return status();
  // 大規模小売店舗の判定の確認用 CSV を書き出す（DB は使わない）
  if (name === "d29-review") return console.log(writeReviewCsv());
  const job = name ? jobs[name] : undefined;
  if (!job) {
    console.error(`ジョブ名を指定してください：status / ${Object.keys(jobs).join(" / ")}`);
    process.exitCode = 1;
    return;
  }

  // 「date=2026-10-24」「refresh」を「--date 2026-10-24」「--refresh」に直してから読む
  const argv = rest.flatMap((a) => {
    const m = /^([a-z]+)=(.*)$/.exec(a);
    if (m) return [`--${m[1]}`, m[2]];
    return a === "refresh" ? ["--refresh"] : [a];
  });
  // 受け取る項目を宣言しないと「--from 2024Q1」の値が捨てられるため、ジョブごとに宣言する
  const { values: args } = parseArgs({
    args: argv,
    options: Object.fromEntries([...job.options, "refresh"].map((o) => [o, { type: o === "refresh" ? ("boolean" as const) : ("string" as const) }])),
  });
  const normalized = Object.fromEntries(Object.entries(args).map(([k, v]) => [k, v === true ? "" : v === false ? undefined : v]));
  await runIngest(name, job, normalized, ["ingest", name, ...rest].join(" "));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => getSql().end());
