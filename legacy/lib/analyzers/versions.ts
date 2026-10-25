import type { Sql } from "../db";
import type { ActiveVersions, VersionInfo } from "../types";

/** 使用中（active）の版をすべて読む。分析の実行に、どのデータで出した数字かを残すため */
export async function loadActiveVersions(sql: Sql): Promise<ActiveVersions> {
  const rows = await sql<{ id: number; source: string; dataset: string; coverage: string; attribution: string }[]>`
    select id, source, dataset, coverage, attribution from dataset_versions where status = 'active' order by id
  `;
  const versions: ActiveVersions = new Map();
  for (const r of rows) {
    const key = `${r.source}/${r.dataset}`;
    const list = versions.get(key) ?? [];
    list.push({ id: Number(r.id), coverage: r.coverage, attribution: r.attribution });
    versions.set(key, list);
  }
  return versions;
}

/** 1つだけのはずの版を取る（地価のように年ごとに複数あるものには使わない） */
export function singleVersion(versions: ActiveVersions, key: string): VersionInfo | null {
  return versions.get(key)?.[0] ?? null;
}
