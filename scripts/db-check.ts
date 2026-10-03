// DBにつながるかを確かめる：npm run db:check
import { getSql } from "../lib/db";

async function main() {
  const sql = getSql();
  try {
    const [versions] = await sql<{ postgres: string; postgis: string }[]>`
      select current_setting('server_version') as postgres,
             extensions.postgis_lib_version() as postgis
    `;
    console.log(`Postgres ${versions.postgres} / PostGIS ${versions.postgis}`);

    const tables = await sql<{ table_name: string }[]>`
      select table_name
      from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'
      order by table_name
    `;
    console.log(`public のテーブル（${tables.length}）:`);
    for (const t of tables) console.log(`  ${t.table_name}`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
