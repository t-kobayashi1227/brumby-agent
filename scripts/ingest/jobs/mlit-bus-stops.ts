import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { IngestJob } from "../lib/runner";

type Feature = {
  type: string;
  geometry?: { type: string; coordinates: unknown };
  properties?: Record<string, unknown>;
};

type Collection = { type: string; features?: Feature[] };

export const mlitBusStops: IngestJob = {
  source: "mlit_ksj",
  dataset: "P11",
  table: "bus_stops",
  attribution: "出典：国土交通省「国土数値情報（バス停留所データ）2022年度」(https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-P11-v3_0.html) をもとに作成",
  options: ["file", "pref"],

  describe(args) {
    if (!args.file) throw new Error("--file に GeoJSON ファイルのパスを指定してください");
    const pref = args.pref ?? "15";
    if (!/^\d{2}$/.test(pref)) throw new Error("--pref は2桁の都道府県コードです");
    return { coverage: `pref:${pref}`, period: "2022" };
  },

  async load({ sql, versionId, args, saveRaw, log }) {
    const file = args.file!;
    const body = await readFile(file);
    const data = JSON.parse(body.toString("utf8")) as Collection;
    if (data.type !== "FeatureCollection" || !Array.isArray(data.features)) {
      throw new Error("FeatureCollection 形式の GeoJSON を指定してください");
    }
    if (data.features.length === 0) throw new Error("GeoJSON にバス停がありません");

    const rows = data.features.map((feature, index) => {
      const properties = feature.properties;
      const coordinates = feature.geometry?.coordinates;
      if (feature.type !== "Feature" || feature.geometry?.type !== "Point" ||
          !Array.isArray(coordinates) || coordinates.length !== 2 ||
          !coordinates.every((value) => typeof value === "number" && Number.isFinite(value)) ||
          !properties || typeof properties.P11_001 !== "string" || !properties.P11_001.trim()) {
        throw new Error(`${index + 1}件目の名前または地点が不正です`);
      }
      const [lon, lat] = coordinates as number[];
      if (lon < 122 || lon > 154 || lat < 20 || lat > 46) {
        throw new Error(`${index + 1}件目の座標が日本の範囲外です`);
      }
      const routes = Array.from({ length: 35 }, (_, n) => {
        const suffix = String(n + 1).padStart(2, "0");
        const name = properties[`P11_003_${suffix}`];
        if (name === null || name === undefined || name === "") return null;
        return { name: String(name), category_code: properties[`P11_004_${suffix}`] ?? null };
      }).filter((route) => route !== null);
      return {
        source_feature_id: String(index + 1),
        name: properties.P11_001.trim(),
        operator_name: properties.P11_002 ? String(properties.P11_002) : null,
        routes,
        note: properties.P11_005 ? String(properties.P11_005) : null,
        lon,
        lat,
        raw: properties,
      };
    });

    await saveRaw(basename(file), body, "application/geo+json");
    log(`${rows.length}件を確認しました`);
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200);
      await sql`
        insert into public.bus_stops
          (dataset_version_id, source_feature_id, name, operator_name, routes, note, geom, raw)
        select ${versionId}, x.source_feature_id, x.name, x.operator_name,
          x.routes, x.note,
          extensions.st_setsrid(extensions.st_makepoint(x.lon, x.lat), 4326),
          x.raw
        from jsonb_to_recordset(${JSON.stringify(chunk)}::jsonb) as x(
          source_feature_id text, name text, operator_name text,
          routes jsonb, note text, lon double precision, lat double precision, raw jsonb
        )
        on conflict (dataset_version_id, source_feature_id) do nothing
      `;
    }
  },
};
