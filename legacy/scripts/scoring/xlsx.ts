import { readFileSync } from "node:fs";
import { strFromU8, unzipSync } from "fflate";

// .xlsx を読む最小限の読み込み（セルの値だけ。書式・式の再計算はしない）
// 採点ルール表の取り込み（scripts/import-scoring-xlsx.ts）だけで使う。式のセルは、保存されている計算結果があればそれを返す

export type CellValue = string | number | null;
export type Sheet = Map<string, CellValue>;

const decode = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");

/** <t> を全部つなげる（リッチテキストは <r><t> に分かれている） */
const texts = (xml: string) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decode(m[1])).join("");

const attr = (attrs: string, name: string) => attrs.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1] ?? null;

export function readWorkbook(path: string): Map<string, Sheet> {
  const files = unzipSync(readFileSync(path));
  const read = (name: string) => (files[name] ? strFromU8(files[name]) : null);

  const shared: string[] = [];
  const sst = read("xl/sharedStrings.xml");
  if (sst) for (const m of sst.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(texts(m[1]));

  const rels = new Map<string, string>();
  for (const m of (read("xl/_rels/workbook.xml.rels") ?? "").matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], "Id");
    const target = attr(m[1], "Target");
    if (id && target) rels.set(id, target.replace(/^\/?xl\//, "").replace(/^\//, ""));
  }

  const book = new Map<string, Sheet>();
  for (const m of (read("xl/workbook.xml") ?? "").matchAll(/<sheet\b([^>]*)\/>/g)) {
    const name = decode(attr(m[1], "name") ?? "");
    const rid = attr(m[1], "r:id");
    const target = rid ? rels.get(rid) : undefined;
    const xml = target ? read(`xl/${target}`) : null;
    if (!xml) continue;
    const sheet: Sheet = new Map();
    for (const c of xml.matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(c[1], "r");
      if (!ref) continue;
      const type = attr(c[1], "t");
      const body = c[2] ?? "";
      const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let value: CellValue = null;
      if (type === "inlineStr") value = texts(body);
      else if (type === "s" && v !== undefined) value = shared[Number(v)] ?? null;
      else if ((type === "str" || type === "e") && v !== undefined) value = decode(v);
      else if (type === "b" && v !== undefined) value = Number(v);
      else if (v !== undefined) value = Number(v);
      if (value !== null && value !== "") sheet.set(ref, value);
    }
    book.set(name, sheet);
  }
  return book;
}

/** 列の記号（A, B, …, AA）を 0 始まりの番号に、番号を記号に */
export const colIndex = (col: string) => [...col].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
export const colName = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : colName(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));

export const cell = (sheet: Sheet, col: string, row: number): CellValue => sheet.get(`${col}${row}`) ?? null;
export const str = (sheet: Sheet, col: string, row: number): string | null => {
  const v = cell(sheet, col, row);
  return v === null ? null : String(v).trim() || null;
};
export const numCell = (sheet: Sheet, col: string, row: number): number | null => {
  const v = cell(sheet, col, row);
  if (v === null) return null;
  const n = typeof v === "number" ? v : Number(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
};

/** 表の最後の行（その列に値がある最後の行） */
export const lastRow = (sheet: Sheet) => Math.max(0, ...[...sheet.keys()].map((k) => Number(k.replace(/^[A-Z]+/, ""))));
