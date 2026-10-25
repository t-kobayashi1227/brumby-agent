import { getSql } from "../lib/db";

async function main() {
  const sql = getSql();
  try {
    const columns = await sql<{ column_name: string }[]>`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'bus_stops'
    `;
    const expected = ["dataset_version_id", "source_feature_id", "name", "operator_name", "routes", "note", "geom", "raw"];
    const missing = expected.filter((name) => !columns.some((column) => column.column_name === name));
    if (missing.length) throw new Error(`bus_stops の列が不足しています：${missing.join(", ")}`);

    const versions = await sql<{ id: number; coverage: string; status: string; rows: number }[]>`
      select v.id, v.coverage, v.status, count(b.id)::int as rows
      from public.dataset_versions v
      left join public.bus_stops b on b.dataset_version_id = v.id
      where v.source = 'mlit_ksj' and v.dataset = 'P11'
      group by v.id
      order by v.id desc
    `;
    if (!versions.length) console.log("バス停の取り込みはまだありません");
    for (const version of versions) {
      console.log(`版${version.id} ${version.coverage} ${version.status}: ${version.rows}件`);
    }
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
