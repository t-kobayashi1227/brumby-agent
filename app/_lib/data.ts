export type PropertyStatus = "注意" | "要改善" | "順調";

export interface PropertyItem {
  name: string;
  price: string;
  days: number;
  views: number;
  inquiries: number;
  tours: number;
  status: PropertyStatus;
}

export interface CompetitorItem {
  price: string;
  location: string;
  land: string;
  building: string;
  layout: string;
  walk: string;
  parking: string;
  features: string;
}

export type ReportKey = "strategy" | "monitor" | "summary" | "ad";
export type ReportFormat = "pdf" | "ppt";
export type MediaBudget = "10" | "20" | "30";

/** 1,318 → "1,318" */
export function formatNumber(n: number): string {
  return n.toLocaleString("ja-JP");
}

// ---- static mock data ----

/** The mock's "today": every date shown in the prototype is on or before this day. */
export const surveyDate = "2026/09/28";

// Data vintages shown in the "出典" lines of the analysis panels.
export const CENSUS_SOURCE = "国勢調査（2020年）";
export const MLIT_SOURCE = "国土交通省 不動産情報ライブラリ（2026年9月取得）";

export const properties: PropertyItem[] = [
  { name: "中央区上近江 新築戸建", price: "3,780万円", days: 45, views: 386, inquiries: 8, tours: 3, status: "注意" },
  { name: "西区寺尾東 中古戸建", price: "2,480万円", days: 68, views: 210, inquiries: 2, tours: 0, status: "要改善" },
  { name: "江南区亀田 新築戸建", price: "3,280万円", days: 25, views: 420, inquiries: 9, tours: 4, status: "順調" },
  { name: "東区はなみずき 土地", price: "1,980万円", days: 51, views: 168, inquiries: 3, tours: 1, status: "注意" },
  { name: "秋葉区新津 新築戸建", price: "2,980万円", days: 72, views: 134, inquiries: 1, tours: 0, status: "要改善" },
];

/** The sample property used throughout the research / strategy flow (= properties[0]). */
export const targetProperty = {
  ...properties[0],
  type: "新築戸建",
  address: "新潟市中央区上近江1丁目",
  layout: "4LDK",
  land: 180.25,
  building: 105.98,
  parking: 2,
  access: "最寄り駅 徒歩12分",
};

// Competitors are entered by hand (max 3). Blank fields were simply not entered.
export const compData: CompetitorItem[] = [
  { price: "3,580", location: "新潟市中央区○○町", land: "135", building: "102", layout: "4LDK", walk: "12", parking: "2", features: "南向き・太陽光発電付き" },
  { price: "4,180", location: "新潟市中央区△△町", land: "180", building: "110", layout: "4LDK", walk: "10", parking: "", features: "角地・完成済み" },
  { price: "3,880", location: "新潟市中央区□□町", land: "158", building: "104", layout: "3LDK", walk: "18", parking: "", features: "大手ハウスメーカー施工・全館空調" },
];

/** Average land area of the entered competitors, rounded to ㎡. */
export const compAvgLand = Math.round(compData.reduce((n, c) => n + Number(c.land), 0) / compData.length);

/** Listing counts entered on the research input step (the two portals overlap, so they are never summed). */
export const listingCounts = [
  { site: "SUUMO", count: 18 },
  { site: "アットホーム", count: 14 },
];

// Monthly KPIs are the totals of the per-property figures shown on the 販売モニター list.
const total = (key: "views" | "inquiries" | "tours") => properties.reduce((n, p) => n + p[key], 0);

export const kpis = [
  { label: "登録物件数", value: `${properties.length}件`, delta: "", manual: false },
  { label: "今月の閲覧数", value: `${formatNumber(total("views"))}件`, delta: "↑ +18%", manual: true },
  { label: "今月の問合せ数", value: `${total("inquiries")}件`, delta: "↑ +15%", manual: true },
  { label: "今月の見学予約", value: `${total("tours")}件`, delta: "↑ +33%", manual: true },
];

export const regStepDefs = [
  { num: 1, label: "基本情報" },
  { num: 2, label: "立地・設備" },
  { num: 3, label: "写真・間取り" },
  { num: 4, label: "確認" },
];

export const aiResultTabDefs = [
  { key: "summary", label: "診断結果" },
  { key: "area", label: "エリア分析" },
  { key: "price", label: "価格相場" },
  { key: "competitor", label: "競合物件" },
  { key: "deals", label: "取引価格の事例" },
  { key: "surroundings", label: "周辺環境" },
];

/** Center of the market entered on the research input step (万円). */
const marketCenterPrice = 3500;
export const targetPriceMan = 3780;

export const diagnosisSummary = {
  competition: "やや競合が多い",
  centerPrice: marketCenterPrice,
  priceGap: targetPriceMan - marketCenterPrice,
  comment:
    "ポータルサイトの掲載件数が多く、価格競争が強い状況です。対象物件（3,780万円）は競合の中心（約3,500万円）より約280万円高い一方、周辺の取引価格の平均（約3,850万円）の範囲内に収まっています。「駐車場2台」「小学校徒歩8分」「ZEH仕様」などの強みがあり、価格訴求よりも子育て世帯向けの住環境・性能訴求が有効です。",
  actions: [
    "価格よりも付加価値（ZEH・学校・駐車場）を前面に訴求",
    "SNS広告で子育てファミリー層へアプローチ",
    "2週間後に再度競合状況を確認し、戦略を見直す",
  ],
};

/**
 * Sample rows from the MLIT transaction-price data (district + quarter granularity only).
 * None of these are the competitors currently on sale.
 */
export const dealCases = [
  { district: "中央区上近江", period: "2026年第2四半期", price: "3,650万円", land: 165, building: 102 },
  { district: "中央区女池南", period: "2026年第2四半期", price: "3,480万円", land: 140, building: 98 },
  { district: "中央区鳥屋野", period: "2026年第1四半期", price: "3,950万円", land: 172, building: 106 },
  { district: "中央区上所", period: "2026年第1四半期", price: "3,300万円", land: 142, building: 96 },
  { district: "中央区上近江", period: "2026年第1四半期", price: "4,050万円", land: 168, building: 108 },
  { district: "中央区女池南", period: "2026年第1四半期", price: "3,720万円", land: 155, building: 100 },
];

export const surroundingSummary = [
  { icon: "🚉", label: "鉄道", value: "最寄り駅 徒歩12分（約960m）" },
  { icon: "🏫", label: "教育施設", value: "保育園3件 / 小学校2件 / 中学校1件" },
  { icon: "🏥", label: "医療施設", value: "病院2件 / クリニック8件" },
];

/** Nearest facilities, closest first. Walking time = distance ÷ 80m/分. */
export const nearbyFacilities = [
  { name: "保育園", minutes: 3, distance: "240m" },
  { name: "小学校", minutes: 8, distance: "640m" },
  { name: "中学校", minutes: 12, distance: "960m" },
];

export const areaStats = [
  { label: "人口", value: "72,410人", sub: "" },
  { label: "世帯数", value: "31,220世帯", sub: "" },
  { label: "30〜40代の割合", value: "28.6%", sub: "市平均24.1%" },
  { label: "持家率", value: "61.2%", sub: "市平均58.0%" },
];

/** Transaction prices over the last year (万円 bins). The count total is what the page reports. */
const priceHistData = [
  { label: "〜3,400", min: -Infinity, max: 3400, value: 3 },
  { label: "3,400〜3,700", min: 3400, max: 3700, value: 6 },
  { label: "3,700〜4,000", min: 3700, max: 4000, value: 10 },
  { label: "4,000〜4,300", min: 4000, max: 4300, value: 6 },
  { label: "4,300〜", min: 4300, max: Infinity, value: 3 },
];
const maxHist = Math.max(...priceHistData.map((p) => p.value));
export const priceHistogram = priceHistData.map((p) => ({
  label: p.label,
  value: p.value,
  /** Bar height as a share of the tallest bin (0–1); callers scale it to their chart height. */
  ratio: p.value / maxHist,
  height: Math.round((p.value / maxHist) * 120),
  /** True for the bin the sample property's price falls into. */
  hasTarget: targetPriceMan >= p.min && targetPriceMan < p.max,
}));
export const priceHistogramTotal = priceHistData.reduce((n, p) => n + p.value, 0);

export const strategyTabDefs = [
  { key: "overall", label: "総合評価" },
  { key: "media", label: "媒体戦略・予算" },
];

export const targetList = [
  {
    num: 1,
    title: "30〜40代 子育てファミリー（最重点）",
    desc: ["新潟市内または近隣在住、賃貸からの住み替え層", "小学校徒歩圏・駐車場2台・4LDKに関心"],
  },
  {
    num: 2,
    title: "20代後半〜30代前半の共働き夫婦",
    desc: ["利便性の高いエリアでの新築を検討", "駅までの距離・通勤の利便性を重視"],
  },
  {
    num: 3,
    title: "中央区・周辺エリアの住み替え層",
    desc: ["現在の住まいが手狭になったファミリー層", "築10年以上の戸建・マンションからの住み替え"],
  },
];

export const appealList = [
  { text: "小学校徒歩8分・子育て環境の良さ", basis: "30〜40代の割合28.6%（市平均24.1%）" },
  { text: "家族が集まる広い4LDK・駐車場2台", basis: `土地180.25㎡（入力した競合3件の平均 約${compAvgLand}㎡）` },
  { text: "ZEH・省エネ性能で快適な暮らし", basis: "物件情報（ZEH仕様）" },
  { text: "最寄り駅 徒歩12分のアクセス", basis: "最寄り駅まで約960m" },
];

export const directionList = [
  "価格は取引相場の範囲内。競合の中心より高いため、価格ではなく付加価値（ZEH・学校・駐車場）で訴求",
  "子育て・住環境を前面に",
  "Webと周辺販促の組み合わせ",
  "見学会での体験訴求が有効",
];

const mediaDefs = [
  { name: "Instagram・Facebook広告", color: "#3b6fd6" },
  { name: "ポスティング（エリア配布）", color: "#f2a93b" },
  { name: "チラシ制作・印刷", color: "#9b7bd1" },
  { name: "物件専用LP", color: "#4caf7d" },
];

/** BRUMBY's allocation rule table: 万円 per medium (same order as mediaDefs) for each total budget. */
const budgetRules: Record<MediaBudget, { amounts: number[]; notes?: (string | undefined)[] }> = {
  "10": { amounts: [5, 3, 2, 0], notes: [undefined, undefined, undefined, "既存の物件ページを活用"] },
  "20": { amounts: [8, 5, 3, 4] },
  "30": { amounts: [12, 7, 5, 6] },
};

export interface MediaItem {
  name: string;
  color: string;
  amount: number;
  amt: string;
  pct: number;
  note?: string;
}

export function budgetItems(budget: MediaBudget): MediaItem[] {
  const { amounts, notes } = budgetRules[budget];
  const sum = amounts.reduce((n, a) => n + a, 0);
  return mediaDefs.map((m, i) => ({
    ...m,
    amount: amounts[i],
    amt: amounts[i] === 0 ? "0円" : `${amounts[i]}万円`,
    pct: Math.round((amounts[i] / sum) * 100),
    note: notes?.[i],
  }));
}

export function computeDonut(budget: MediaBudget) {
  const items = budgetItems(budget);
  const sum = items.reduce((n, it) => n + it.amount, 0);
  let acc = 0;
  const stops = items
    .map((it) => {
      const start = (acc / sum) * 100;
      acc += it.amount;
      return `${it.color} ${start}% ${(acc / sum) * 100}%`;
    })
    .join(", ");
  return { gradient: `conic-gradient(${stops})`, legend: items };
}

export const mediaRoleTable = [
  { media: "Instagram・Facebook広告", target: "30〜40代ファミリー", effect: "認知拡大・見学予約への誘導" },
  { media: "ポスティング", target: "周辺1〜2kmの住み替え層", effect: "地域での認知・問い合わせ増加" },
  { media: "チラシ制作・印刷", target: "現地周辺・イベント告知", effect: "見学会集客・信頼感の向上" },
  { media: "物件専用LP", target: "検討層全般", effect: "詳細情報の提供・見学予約獲得" },
];

export const monitorFilterDefs = [
  { key: "all", label: "すべて" },
  { key: "順調", label: "順調" },
  { key: "注意", label: "注意" },
  { key: "要改善", label: "要改善" },
];

export const monitorDetailTabDefs = [
  { key: "summary", label: "サマリー" },
  { key: "response", label: "反響推移" },
  { key: "competition", label: "競合の変化" },
  { key: "ai", label: "AI診断" },
  { key: "history", label: "履歴" },
];

/** SUUMO listing counts as recorded by manual entry. */
const trendData = [
  { label: "8/31", value: 22 },
  { label: "9/7", value: 21 },
  { label: "9/14", value: 20 },
  { label: "9/28", value: 18 },
];
const maxTrend = Math.max(...trendData.map((t) => t.value));
export const competitionTrend = trendData.map((t) => ({
  label: t.label,
  date: `2026/${t.label
    .split("/")
    .map((n) => n.padStart(2, "0"))
    .join("/")}`,
  value: t.value,
  height: Math.round((t.value / maxTrend) * 100),
}));
/** Change over the last two weeks (9/14 → 9/28). */
export const competitionTwoWeekDrop = trendData[trendData.length - 2].value - trendData[trendData.length - 1].value;

/** Weeks of the current month used for the per-property response breakdown. */
const responseWeeks = ["9/1〜9/7", "9/8〜9/14", "9/15〜9/21", "9/22〜9/28"];
const responseWeights = [0.21, 0.25, 0.26, 0.28];

/** Splits a monthly total into weeks; the last week takes the remainder so the weeks always add up to the total. */
function splitByWeek(totalValue: number): number[] {
  const parts = responseWeights.slice(0, -1).map((w) => Math.round(totalValue * w));
  return [...parts, totalValue - parts.reduce((n, v) => n + v, 0)];
}

export function weeklyResponse(p: PropertyItem) {
  const views = splitByWeek(p.views);
  const inquiries = splitByWeek(p.inquiries);
  const tours = splitByWeek(p.tours);
  return responseWeeks.map((label, i) => ({ label, views: views[i], inquiries: inquiries[i], tours: tours[i] }));
}

/** "2026/09/28" minus `days` → "2026/08/14" (UTC so server and client agree). */
export function daysBeforeSurvey(days: number): string {
  const [y, m, d] = surveyDate.split("/").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d - days));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${dt.getUTCFullYear()}/${pad(dt.getUTCMonth() + 1)}/${pad(dt.getUTCDate())}`;
}

export const planDefs = [
  { key: "spot", name: "スポットプラン", desc: "1物件から気軽にAI分析", price: "1物件 5,000円（税別）" },
  { key: "strategy", name: "販売戦略プラン", desc: "新規物件の販売戦略をAIで作成", price: "月額 30,000円（税別）" },
  { key: "monitor", name: "販売戦略＋モニタープラン", desc: "売れるまでAIが継続サポート", price: "月額 40,000円（税別）" },
];
