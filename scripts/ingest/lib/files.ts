import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { unzipSync } from "fflate";
import * as shapefile from "shapefile";
import type { Feature, Geometry } from "geojson";

// 元データの置き場所は data/raw/<提供元のコード>/（git に入れない。例：data/raw/P29/）
// 自動でダウンロードできるものは、ここに保存してから読む。2回目からは保存したファイルを使う（refresh を付けると取り直す）
// 自動でダウンロードできないものは、利用者がここに置く

export const RAW_ROOT = join(process.cwd(), "data", "raw");

export interface RawFiles {
  dir: string;
  /** url を data/raw/<id>/<fileName> に保存して中身を返す。保存済みならそれを読む */
  download: (url: string, fileName: string) => Promise<Uint8Array>;
  /** 利用者が置いたファイルを、名前の形（例：/^P29-23_15.*\.zip$/）で1つ探して読む。無い・2つ以上あるときは、置く場所を書いたエラーにする */
  find: (pattern: RegExp, hint: string) => { name: string; body: Uint8Array };
  /** 名前の形に合うファイルをすべて読む（1つも無ければエラー） */
  findAll: (pattern: RegExp, hint: string) => { name: string; body: Uint8Array }[];
}

export function rawFiles(rawDir: string, opts: { refresh: boolean; log: (m: string) => void }): RawFiles {
  const dir = join(RAW_ROOT, rawDir);
  return {
    dir,
    async download(url, fileName) {
      const path = join(dir, fileName);
      if (existsSync(path) && !opts.refresh) {
        opts.log(`保存済みのファイルを使います：data/raw/${rawDir}/${fileName}`);
        return new Uint8Array(readFileSync(path));
      }
      const res = await fetch(url);
      if (!res.ok) throw new Error(`ダウンロードに失敗しました（${res.status}）：${url}`);
      const body = new Uint8Array(await res.arrayBuffer());
      mkdirSync(dir, { recursive: true });
      writeFileSync(path, body);
      opts.log(`ダウンロードしました：data/raw/${rawDir}/${fileName}（${(body.length / 1024 / 1024).toFixed(1)}MB）`);
      return body;
    },
    find(pattern, hint) {
      const names = existsSync(dir) ? readdirSync(dir).filter((n) => pattern.test(n)) : [];
      if (names.length === 0) throw new Error(`ファイルがありません。${hint} を data/raw/${rawDir}/ に置いてください`);
      if (names.length > 1) throw new Error(`data/raw/${rawDir}/ に候補が2つ以上あります（${names.join(", ")}）。1つにしてください`);
      return { name: names[0], body: new Uint8Array(readFileSync(join(dir, names[0]))) };
    },
    findAll(pattern, hint) {
      const names = existsSync(dir) ? readdirSync(dir).filter((n) => pattern.test(n)).sort() : [];
      if (names.length === 0) throw new Error(`ファイルがありません。${hint} を data/raw/${rawDir}/ に置いてください`);
      return names.map((name) => ({ name, body: new Uint8Array(readFileSync(join(dir, name))) }));
    },
  };
}

/** zip を展開し、名前の末尾が suffix のファイルを1つ取り出す */
export function pickFromZip(zip: Uint8Array, suffix: string): Uint8Array {
  const files = unzipSync(zip);
  const name = Object.keys(files).find((n) => n.toLowerCase().endsWith(suffix.toLowerCase()));
  if (!name) throw new Error(`zip の中に *${suffix} がありません（中身：${Object.keys(files).join(", ")}）`);
  return files[name];
}

/** zip の中の GeoJSON（UTF-8）を、名前の形で1つ選んで読む */
export function readGeojsonFromZip(zip: Uint8Array, pattern: RegExp): Feature<Geometry, Record<string, unknown>>[] {
  const files = unzipSync(zip, { filter: (f) => pattern.test(f.name) });
  const names = Object.keys(files);
  if (names.length !== 1) throw new Error(`zip の中に ${pattern} に合う GeoJSON が1つではありません（${names.length}個）`);
  const body = JSON.parse(decode(files[names[0]], "utf-8")) as { features: Feature<Geometry, Record<string, unknown>>[] };
  return body.features;
}

/** Shapefile（.shp と .dbf）を読み、Feature を1つずつ返す */
export async function* readShapefile(shp: Uint8Array, dbf: Uint8Array, encoding = "shift_jis"): AsyncGenerator<Feature<Geometry, Record<string, unknown>>> {
  const source = await shapefile.open(shp, dbf, { encoding });
  for (let r = await source.read(); !r.done; r = await source.read()) {
    yield r.value as Feature<Geometry, Record<string, unknown>>;
  }
}

/** 文字のコードを指定して文字列にする（e-Stat・国土数値情報の CSV は Shift_JIS） */
export function decode(bytes: Uint8Array, encoding = "shift_jis"): string {
  return new TextDecoder(encoding).decode(bytes);
}

/** CSV を行の配列にする。"" で囲んだ値（中のカンマ・改行・"" の重ね）に対応する */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

/**
 * 大きな CSV を、1件（1行）ずつの文字列に分けて返す。"" の中の改行では分けない
 * 必要な行だけを parseCsv に渡すと、全部を読み込むより使うメモリが少ない（医療情報ネットの CSV は 100MB を超える）
 */
export function* csvRecords(text: string): Generator<string> {
  let start = 0;
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (c === 34) quoted = !quoted; // "
    else if (c === 10 && !quoted) {
      // \n
      const end = i > start && text.charCodeAt(i - 1) === 13 ? i - 1 : i;
      if (end > start) yield text.slice(start, end);
      start = i + 1;
    }
  }
  if (start < text.length) yield text.slice(start);
}

/** 全角の数字を半角にする（e-Stat の項目名「０〜４歳」→「0〜4歳」） */
export function toHalfWidthDigits(s: string): string {
  return s.replace(/[０-９]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 0xfee0));
}
