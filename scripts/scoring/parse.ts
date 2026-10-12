import { AGE_BANDS, MARKS } from "../../lib/scoring/constants";
import type { AgeClass, CompetitorItem, Mark, MediaChannel, MediaUsageRate, Persona, RuleLayer, ScoringConfig, ScoringItem, ScoringRule } from "../../lib/scoring/types";
import { cell, colName, colIndex, lastRow, numCell, readWorkbook, str, type Sheet } from "./xlsx";

// Excel「採点ルール表」（初版 v0.26 の形）を読み、採点の設定にする（設計書 D35）
// 黄色のセル（BRUMBY様が編集する値）だけを読む。計算式のセルは読まない（計算は lib/scoring でする）

export interface ParamRow {
  key: string;
  category: "layer_weight" | "purchase" | "budget" | "media";
  label: string;
  value: number;
  note: string;
  sortOrder: number;
}

export interface PersonaNotes {
  stat_category: string | null;
  households: string | null;
  recent_buyers: string | null;
  buyer_share_basis: string | null;
}

export interface MediaResultRow {
  propertyRef: string | null;
  mediaLabel: string;
  startedOn: string | null;
  costYen: number;
  inquiries: number;
  visits: number;
  contracts: number;
  memo: string | null;
}

export interface HistoryRow {
  date: string | null;
  changedBy: string | null;
  sheet: string | null;
  target: string | null;
  before: string | null;
  after: string | null;
  reason: string | null;
  relatedProperty: string | null;
}

export interface ParsedWorkbook {
  config: ScoringConfig;
  personaNotes: Record<string, PersonaNotes>;
  itemNotes: Record<string, string>;
  ruleExtras: Record<string, { source: string | null; basisNote: string; sortOrder: number }>;
  params: ParamRow[];
  competitorNotes: Record<string, string>;
  areaRanks: Record<string, number | null>;
  mediaExtras: Record<string, { source: string }>;
  usageMetric: Record<string, string>;
  mediaResults: MediaResultRow[];
  history: HistoryRow[];
  warnings: string[];
}

const PERSONA_IDS = ["A", "B", "C", "D", "E", "F", "G", "H"];

/** 媒体の ID（媒体名から決める。知らない媒体は行番号から作る） */
const MEDIA_IDS: Record<string, string> = {
  Instagram広告: "instagram",
  TikTok広告: "tiktok",
  YouTube広告: "youtube",
  LINE広告: "line",
  Facebook広告: "facebook",
  ポータル掲載: "portal",
  Google検索広告: "google_search",
  新聞折込: "newspaper",
  ポスティング: "posting",
  "現地看板・見学会": "onsite",
  "店頭・紹介": "referral",
};

const isExample = (v: string | null) => !!v && /^例[）)]/.test(v);

/** Excel の日付（シリアル値）か文字列を YYYY-MM-DD に */
function toDate(v: string | number | null): string | null {
  if (v === null) return null;
  if (typeof v === "number") {
    const d = new Date(Date.UTC(1899, 11, 30) + v * 86400000);
    return d.toISOString().slice(0, 10);
  }
  const m = String(v).match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null;
}

function need(book: Map<string, Sheet>, name: string): Sheet {
  const s = book.get(name);
  if (!s) throw new Error(`シート「${name}」がありません`);
  return s;
}

/** 行の範囲（2行目〜最後の行） */
const rows = (sheet: Sheet) => Array.from({ length: Math.max(0, lastRow(sheet) - 1) }, (_, i) => i + 2);

/** A〜H の列（startCol から8列）をペルソナごとの値に */
function perPersona<T>(startCol: string, read: (col: string) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  PERSONA_IDS.forEach((id, i) => {
    const v = read(colName(colIndex(startCol) + i));
    if (v !== null) out[id] = v;
  });
  return out;
}

export function parseScoringWorkbook(path: string): ParsedWorkbook {
  const book = readWorkbook(path);
  const warnings: string[] = [];

  // ペルソナ
  const ps = need(book, "ペルソナ");
  const income = need(book, "年収分布");
  const savings = need(book, "貯蓄分布");
  const ages = need(book, "ペルソナの年代");
  const buyers = need(book, "買い手の多さ");
  const rowOf = (sheet: Sheet, id: string) => rows(sheet).find((r) => str(sheet, "A", r) === id) ?? null;
  const personas: Persona[] = [];
  const personaNotes: Record<string, PersonaNotes> = {};
  PERSONA_IDS.forEach((id, order) => {
    const r = rowOf(ps, id);
    const label = r ? str(ps, "B", r) : null;
    if (!r || !label) return;
    const ir = rowOf(income, id);
    const sr = rowOf(savings, id);
    const ar = rowOf(ages, id);
    const br = rowOf(buyers, id);
    const method = str(ps, "I", r) === "現金" ? "cash" : "loan";
    personas.push({
      id,
      label,
      description: str(ps, "C", r) ?? "",
      repAge: numCell(ps, "D", r) ?? 40,
      downPaymentRate: numCell(ps, "E", r) ?? 0,
      purchaseMethod: method,
      incomeDist: ir ? Array.from({ length: 10 }, (_, i) => numCell(income, colName(2 + i), ir) ?? 0) : [],
      savingsDist: sr ? Array.from({ length: 19 }, (_, i) => numCell(savings, colName(2 + i), sr) ?? 0) : [],
      ageMix: ar ? Object.fromEntries(AGE_BANDS.map((b, i) => [b, numCell(ages, colName(2 + i), ar) ?? 0])) : {},
      buyerShareNew: br ? numCell(buyers, "C", br) : null,
      buyerShareUsed: br ? numCell(buyers, "D", br) : null,
      enabled: true,
      sortOrder: order + 1,
    });
    personaNotes[id] = { stat_category: str(ps, "F", r), households: str(ps, "G", r), recent_buyers: str(ps, "H", r), buyer_share_basis: br ? str(buyers, "E", br) : null };
    if (method === "cash" && !(sr && personas.at(-1)!.savingsDist.some((x) => x > 0))) warnings.push(`ペルソナ${id}は現金で買う設定ですが、貯蓄分布が空です`);
  });

  // 項目の重視度
  const imp = need(book, "項目の重視度");
  const items: ScoringItem[] = [];
  const itemNotes: Record<string, string> = {};
  for (const r of rows(imp)) {
    const key = str(imp, "A", r);
    const layer = str(imp, "B", r);
    if (!key || !(layer === "物件" || layer === "生活環境" || layer === "市場")) continue;
    items.push({ key, layer, importance: perPersona("C", (c) => numCell(imp, c, r)), note: str(imp, "K", r) ?? "" });
    itemNotes[key] = str(imp, "K", r) ?? "";
  }

  // 採点ルール
  const rs = need(book, "採点ルール");
  const rules: ScoringRule[] = [];
  const ruleExtras: ParsedWorkbook["ruleExtras"] = {};
  for (const r of rows(rs)) {
    const id = str(rs, "A", r);
    const itemKey = str(rs, "C", r);
    const layer = str(rs, "B", r) as RuleLayer | null;
    if (!id || !itemKey || !layer) continue;
    if (!items.some((i) => i.key === itemKey)) warnings.push(`採点ルール ${id}：項目キー「${itemKey}」が項目の重視度にありません（重視度1で計算）`);
    const fit = perPersona("H", (c) => {
      const v = str(rs, c, r);
      if (v === null) return null;
      const mark = v.replace("○", "〇").replace("-", "－") as Mark;
      if (!MARKS.includes(mark)) {
        warnings.push(`採点ルール ${id}：適合度「${v}」は ◎〇－△× のどれでもありません（0点扱い）`);
        return null;
      }
      return mark;
    });
    rules.push({
      id,
      layer,
      itemKey,
      lower: numCell(rs, "D", r),
      upper: numCell(rs, "E", r),
      reason: str(rs, "F", r) ?? "",
      source: str(rs, "G", r),
      fit,
      basisClass: str(rs, "P", r),
      basisNote: str(rs, "Q", r) ?? "",
      exclusiveGroup: str(rs, "R", r),
      enabled: true,
    });
    ruleExtras[id] = { source: str(rs, "G", r), basisNote: str(rs, "Q", r) ?? "", sortOrder: r - 1 };
  }

  // 数値の設定
  const params: ParamRow[] = [];
  const lw = need(book, "層の重み");
  for (const r of rows(lw)) {
    const key = str(lw, "A", r);
    const v = numCell(lw, "B", r);
    if (key && v !== null) params.push({ key, category: "layer_weight", label: key, value: v, note: str(lw, "C", r) ?? "", sortOrder: r });
  }
  for (const [sheetName, category] of [["購入前提", "purchase"], ["予算の決め方", "budget"]] as const) {
    const s = need(book, sheetName);
    for (const r of rows(s)) {
      const key = str(s, "A", r);
      const v = numCell(s, "C", r);
      if (key && v !== null) params.push({ key, category, label: str(s, "B", r) ?? key, value: v, note: str(s, "D", r) ?? "", sortOrder: r });
    }
  }
  const topN = numCell(need(book, "媒体配分"), "C", 1);
  if (topN !== null) params.push({ key: "配分に使う媒体の数", category: "media", label: "配分に使う媒体の数（上位）", value: topN, note: "届きやすさの上位この数の媒体に配分する", sortOrder: 1 });
  const minInq = numCell(need(book, "反響の集計"), "K", 1);
  if (minInq !== null) params.push({ key: "係数を使い始める問い合わせ数", category: "media", label: "反響係数を使い始める問い合わせ数", value: minInq, note: "問い合わせがこの件数未満の媒体は反響係数1.00", sortOrder: 2 });

  // 競合重視度
  const cs = need(book, "競合重視度");
  const competitorItems: CompetitorItem[] = [];
  const competitorNotes: Record<string, string> = {};
  for (const r of rows(cs)) {
    const key = str(cs, "A", r);
    const dir = numCell(cs, "C", r);
    if (!key || (dir !== 1 && dir !== -1)) continue;
    competitorItems.push({ key, label: str(cs, "B", r) ?? key, direction: dir, importance: perPersona("D", (c) => numCell(cs, c, r)), tieMargin: numCell(cs, "L", r) ?? 0 });
    competitorNotes[key] = str(cs, "M", r) ?? "";
  }

  // 周辺の取引（相場シートと同じ中央値に、延床・土地・築年数・件数が付いたもの）
  const ms = need(book, "周辺の取引");
  const market: ScoringConfig["market"] = [];
  for (const r of rows(ms)) {
    const ward = str(ms, "A", r);
    const ageClass = str(ms, "B", r) as AgeClass | null;
    const price = numCell(ms, "C", r);
    if (!ward || !ageClass || price === null || !["新築", "築2〜20年", "築21年以上"].includes(ageClass)) continue;
    market.push({ ward, ageClass, priceManYen: price, buildingSqm: numCell(ms, "D", r), landSqm: numCell(ms, "E", r), ageYears: numCell(ms, "F", r), n: numCell(ms, "G", r) });
  }

  // エリア人気
  const ap = need(book, "エリア人気");
  const popularity: ScoringConfig["popularity"] = [];
  const areaRanks: Record<string, number | null> = {};
  for (const r of rows(ap)) {
    const ward = str(ap, "A", r);
    const town = str(ap, "B", r);
    const score = numCell(ap, "D", r);
    if (!ward || !town || score === null) continue;
    popularity.push({ ward, town, score });
    areaRanks[`${ward}/${town}`] = numCell(ap, "E", r);
  }

  // 媒体・利用率
  const md = need(book, "媒体");
  const media: MediaChannel[] = [];
  const mediaExtras: Record<string, { source: string }> = {};
  for (const r of rows(md)) {
    const label = str(md, "A", r);
    if (!label || cell(md, "E", r) === null) continue;
    const id = MEDIA_IDS[label] ?? `media_${r}`;
    media.push({ id, label, statName: str(md, "B", r), flatReach: numCell(md, "C", r), enabled: str(md, "E", r) === "〇", formatExample: str(md, "F", r) ?? "", sortOrder: r - 1 });
    mediaExtras[id] = { source: str(md, "G", r) ?? "" };
  }
  const us = need(book, "媒体の利用率");
  const usage: MediaUsageRate[] = [];
  const usageMetric: Record<string, string> = {};
  for (const r of rows(us)) {
    const name = str(us, "A", r);
    const all = numCell(us, "H", r);
    if (!name || all === null) continue;
    usage.push({ statName: name, rates: Object.fromEntries(AGE_BANDS.map((b, i) => [b, numCell(us, colName(1 + i), r) ?? 0])), allAges: all });
    usageMetric[name] = str(us, "I", r) ?? "利用率";
  }

  // 反響の記録（記入例の行は読まない）
  const rr = need(book, "反響の記録");
  const mediaResults: MediaResultRow[] = [];
  for (const r of rows(rr)) {
    const ref = str(rr, "A", r);
    const mediaLabel = str(rr, "B", r);
    if (isExample(ref) || !mediaLabel) continue;
    mediaResults.push({
      propertyRef: ref,
      mediaLabel,
      startedOn: toDate(cell(rr, "C", r)),
      costYen: numCell(rr, "D", r) ?? 0,
      inquiries: numCell(rr, "E", r) ?? 0,
      visits: numCell(rr, "F", r) ?? 0,
      contracts: numCell(rr, "G", r) ?? 0,
      memo: str(rr, "H", r),
    });
  }

  // 変更履歴
  const hs = need(book, "変更履歴");
  const history: HistoryRow[] = rows(hs)
    .filter((r) => str(hs, "D", r) || str(hs, "G", r))
    .map((r) => ({
      date: toDate(cell(hs, "A", r)),
      changedBy: str(hs, "B", r),
      sheet: str(hs, "C", r),
      target: str(hs, "D", r),
      before: str(hs, "E", r),
      after: str(hs, "F", r),
      reason: str(hs, "G", r),
      relatedProperty: str(hs, "H", r),
    }));

  const config: ScoringConfig = {
    personas,
    items,
    rules,
    params: Object.fromEntries(params.map((p) => [p.key, p.value])),
    competitorItems,
    market,
    popularity,
    media,
    usage,
    results: mediaResults
      .map((m) => ({ mediaId: media.find((x) => x.label === m.mediaLabel)?.id ?? "", costYen: m.costYen, inquiries: m.inquiries }))
      .filter((m) => m.mediaId !== ""),
    version: null,
  };
  return { config, personaNotes, itemNotes, ruleExtras, params, competitorNotes, areaRanks, mediaExtras, usageMetric, mediaResults, history, warnings };
}
