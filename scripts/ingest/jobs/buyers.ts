import { SHARE_SUM_TOLERANCE } from "../../../lib/facts/build";
import { decode, parseCsv } from "../lib/files";
import { defineJob, insertRows } from "../lib/runner";

// B01〜B06 買い手・媒体の統計（住宅市場動向調査、総務省の情報通信メディア調査など）
// npm run ingest -- buyers
// data/raw/buyers/買い手の統計.csv を reference_stats に入れる。報告書の表から、小林さんが数字を書き写して整える
// 列：データ（B01〜B06）, 分類, 区分, 項目, 値, 単位, 出典の場所, メモ
// 値が空の行（まだ書いていない行）は入れずに、件数を知らせる

const DATASETS = ["B01", "B02", "B03", "B04", "B05", "B06"];

export const buyers = defineJob({
  datasets: DATASETS,
  rawDir: "buyers",
  table: "reference_stats",
  options: [],

  async load({ sql, raw, log, check }) {
    const file = raw.find(/買い手の統計\.csv$/, "買い手の統計.csv");
    const [header, ...lines] = parseCsv(decode(file.body, "utf-8").replace(/^﻿/, ""));
    const col = (name: string) => {
      const i = header.indexOf(name);
      if (i < 0) throw new Error(`${file.name} に「${name}」の列がありません`);
      return i;
    };
    const [ds, category, segment, item, value, unit, source, memo] = ["データ", "分類", "区分", "項目", "値", "単位", "出典の場所", "メモ"].map(col);

    const rows: Record<string, unknown>[] = [];
    const empty: string[] = [];
    for (const [i, r] of lines.entries()) {
      if (!r[ds]) continue;
      if (!DATASETS.includes(r[ds])) throw new Error(`${file.name} の ${i + 2}行目：データは ${DATASETS.join("・")} のどれかにしてください（${r[ds]}）`);
      const text = (r[value] ?? "").replace(/,/g, "").trim();
      if (text === "") {
        empty.push(`${i + 2}行目 ${r[category]}／${r[segment]}／${r[item]}`);
        continue;
      }
      if (!/^-?\d+(\.\d+)?$/.test(text)) throw new Error(`${file.name} の ${i + 2}行目：値が数字ではありません（${r[value]}）`);
      rows.push({
        dataset_id: r[ds],
        category: r[category],
        segment: r[segment],
        item: r[item],
        value: Number(text),
        unit: r[unit] || null,
        sort: i + 1,
        source: r[source] || null,
        note: r[memo] || null,
      });
    }
    await insertRows(sql, "reference_stats", rows);
    log(`${rows.length}行を入れました${empty.length ? `（値が空の ${empty.length}行は入れていません）` : ""}`);
    check("値が空で入れなかった行", empty);
    check("内訳の合計が100%と合わない分類（要確認：抜け・書き写しの誤り）", sumMismatches(rows));
  },
});

// 単一回答の分類。内訳（原表にある無回答を含む）の合計が 100% になるはず。複数回答（物件を探した方法など）は確かめない
const SINGLE_ANSWER = ["世帯年収の分布", "世帯主の年齢"];

/** 単一回答の分類で、区分ごとの合計が 100% から丸めの幅を超えてずれているもの（docs/BRUMBY_根拠データ修正仕様.md F02） */
export function sumMismatches(rows: Record<string, unknown>[]): string[] {
  const sums = new Map<string, number>();
  for (const r of rows) {
    if (r.unit !== "%" || !SINGLE_ANSWER.includes(String(r.category))) continue;
    const key = `${r.dataset_id}／${r.category}／${r.segment}`;
    sums.set(key, (sums.get(key) ?? 0) + Number(r.value));
  }
  return [...sums]
    .map(([key, sum]) => [key, Math.round(sum * 10) / 10] as const)
    .filter(([, sum]) => Math.abs(sum - 100) > SHARE_SUM_TOLERANCE)
    .map(([key, sum]) => `${key}：合計${sum}%`);
}
