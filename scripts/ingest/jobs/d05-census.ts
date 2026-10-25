import { decode, parseCsv, pickFromZip, toHalfWidthDigits } from "../lib/files";
import { defineJob, insertRows } from "../lib/runner";
import { wardOf } from "./d39-towns";

// D05〜D08 国勢調査2020 小地域集計（e-Stat 統計GIS のダウンロード、Shift_JIS の CSV）
// npm run ingest -- d05-census
// 数（人・世帯）だけを入れる。割合（0〜14歳の割合、持ち家率など）は段階3でプログラムが計算する
// D09（T001090 核家族世帯割合・世帯員年齢別割合）は統計GISに2020年の新潟県分のファイルが無いため、
// 同じ割合を D06（T001084）の数から計算する
//
// 地域の段階（HYOSYO）：1 区・市町村、2 丁目の無い町、3 丁目のある町の合計、4 丁目
// 境界（towns）にあるのは 2 と 4。3 は丁目の値が秘匿のときに町全体の値を使うため、一緒に入れる
// 値の記号：「X」は秘匿 → null、「-」は該当なし → 0（どちらも元の記号を raw に残す）

const PREF = "15";

const TABLES = [
  // 年齢別人口は「総数」の列だけ（男・女の列は使わない）
  { dataset: "D05", statsId: "T001082", unit: "人", keep: (label: string) => label.startsWith("総数") },
  { dataset: "D06", statsId: "T001084", unit: "世帯", keep: () => true },
  { dataset: "D07", statsId: "T001085", unit: "世帯", keep: () => true },
  { dataset: "D08", statsId: "T001086", unit: "世帯", keep: () => true },
];

const LEVELS: Record<string, string> = { "1": "区・市町村", "2": "町", "3": "丁目のある町の合計", "4": "丁目" };

export const d05Census = defineJob({
  datasets: TABLES.map((t) => t.dataset),
  rawDir: "estat-census",
  table: "area_stats",
  options: [],

  async load({ sql, raw, log, check }) {
    let secret = 0;
    for (const t of TABLES) {
      const url = `https://www.e-stat.go.jp/gis/statmap-search/data?statsId=${t.statsId}&code=${PREF}&downloadType=2`;
      const zip = await raw.download(url, `${t.statsId}C${PREF}.zip`);
      const [codes, labels, ...lines] = parseCsv(decode(pickFromZip(zip, ".txt")));
      if (codes[0] !== "KEY_CODE") throw new Error(`${t.statsId} の1行目の形が違います：${codes.slice(0, 3).join(",")}`);

      // 値の列（T001082001 など）のうち、使う列
      const columns = codes
        .map((code, i) => ({ i, code, label: toHalfWidthDigits(labels[i] ?? "") }))
        .filter((c) => c.code.startsWith(t.statsId) && t.keep(c.label));

      const rows: Record<string, unknown>[] = [];
      for (const r of lines) {
        const [keyCode, level, cityName, name, secrecy, mergedInto] = r;
        if (!LEVELS[level]) continue;
        const isCity = level === "1";
        const ward = wardOf(cityName);
        for (const c of columns) {
          const v = r[c.i];
          if (v === "X") secret++;
          rows.push({
            dataset_id: t.dataset,
            area_level: isCity ? (ward.endsWith("区") ? "区" : "市") : "町",
            area_key: isCity ? ward : keyCode,
            ward,
            area_name: isCity ? ward : name,
            metric: c.label,
            value: v === "X" ? null : v === "-" ? 0 : Number(v),
            unit: t.unit,
            raw: { key_code: keyCode, 段階: LEVELS[level], 秘匿処理: secrecy, 合算先: mergedInto || null, 値: v },
          });
        }
      }
      await insertRows(sql, "area_stats", rows, 2000);
      log(`${t.statsId}：${lines.length}地域 × ${columns.length}項目 = ${rows.length}行`);
    }
    check("秘匿（X）の値の数", secret);
  },
});
