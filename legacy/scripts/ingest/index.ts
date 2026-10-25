// 公開データの取り込み：npm run ingest -- <データ名> [--オプション 値 ...]
// 例：npm run ingest -- reinfolib-transactions --pref 15 --from 2015Q1
import { parseArgs } from "node:util";
import { getSql } from "../../lib/db";
import { estatBoundaries } from "./jobs/estat-boundaries";
import { estatCensus } from "./jobs/estat-census";
import { reinfolibLandPrices } from "./jobs/reinfolib-land-prices";
import { reinfolibTransactions } from "./jobs/reinfolib-transactions";
import { mlitBusStops } from "./jobs/mlit-bus-stops";
import { niigataSchoolZones } from "./jobs/niigata-school-zones";
import { runIngest, type IngestJob } from "./lib/runner";

const jobs: Record<string, IngestJob> = {
  "reinfolib-transactions": reinfolibTransactions,
  "reinfolib-land-prices": reinfolibLandPrices,
  "estat-boundaries": estatBoundaries,
  "estat-census": estatCensus,
  "mlit-bus-stops": mlitBusStops,
  "niigata-school-zones": niigataSchoolZones,
};

async function main() {
  const [name, ...rest] = process.argv.slice(2);
  const job = name ? jobs[name] : undefined;
  if (!job) {
    console.error(`データ名を指定してください：${Object.keys(jobs).join(" / ")}`);
    process.exit(1);
  }

  // 受け取る項目を宣言しないと「--from 2024Q1」の値が捨てられるため、データごとに宣言する
  const { values: args } = parseArgs({
    args: rest,
    options: Object.fromEntries(job.options.map((o) => [o, { type: "string" as const }])),
  }) as { values: Record<string, string | undefined> };

  try {
    await runIngest(job, args, ["ingest", name, ...rest].join(" "));
  } finally {
    await getSql().end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
