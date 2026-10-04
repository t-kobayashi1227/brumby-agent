import { SECTION_KEYS, SECTION_TITLE } from "./schema";
import type { FactRow, PropertySummary } from "./types";

// AIに渡すプロンプト（設計書 6.2）。渡すのは物件情報と、番号を振った事実カード・判断カードだけ

const STATUS_LABEL: Record<FactRow["status"], string> = {
  ok: "ok",
  insufficient: "データ不足",
  not_available: "対象外",
};

function formatCard(f: FactRow): string {
  const num = `F-${String(f.seq).padStart(2, "0")}`;
  const kind = f.kind === "decision" ? "判断" : "事実";
  const body = f.valueText ?? (f.value !== null ? `${f.value}${f.unit ?? ""}` : "（値なし）");
  const comparison = f.comparison !== null ? `（比べる値 ${f.comparison}）` : "";
  const attribution = f.attribution ? ` 出典：${f.attribution}` : "";
  return `${num} [${kind}/${STATUS_LABEL[f.status]}] ${f.key} … ${body}${comparison}${attribution}`;
}

function formatProperty(p: PropertySummary): string {
  const lines = [
    `種別：${p.propertyType}`,
    `価格：${p.priceManYen !== null ? `${p.priceManYen}万円` : "不明"}`,
    `住所：${p.address}`,
  ];
  if (p.layout) lines.push(`間取り：${p.layout}`);
  if (p.landSqm !== null) lines.push(`土地：${p.landSqm}㎡`);
  if (p.buildingSqm !== null) lines.push(`建物：${p.buildingSqm}㎡`);
  if (p.access) lines.push(`アクセス：${p.access}`);
  if (p.features) lines.push(`特徴：${p.features}`);
  return lines.join("\n");
}

export const SYSTEM_PROMPT = `あなたは不動産（戸建・土地）の販売戦略レポートを書くライターです。
渡された「事実カード」「判断カード」だけを根拠にして、BRUMBY様（販売会社）向けの説明文を書きます。

必ず守ること：
- 文中に数字（%、万円、m、分、件、人、㎡など）を書いたら、その文の cites に、数字の元になったカードの番号（seq）を必ず入れる。
- cites には、実際にその文の根拠にしたカードだけを入れる。関係のないカードの番号を入れない。
- カードに書かれていない数字を作らない。推測や一般論の数字を書かない。
- カードの status が「データ不足」「対象外」のときは、その点について数字を書かず「判断できない」「データが不足している」と正直に書く。
- 判断カード（kind=決定）にある金額・配分（総予算・媒体ごとの額など）は、そのまま説明に使う。数字を変えない・計算し直さない。
- 文体はBRUMBY様への報告の文章（丁寧語）。カードの根拠を超えた誇張・断定はしない。
- 出力は指定されたJSON形式のみ。前置きや後書きの文章は書かない。

書くもの：
- headline：この物件の総合評価を表す一文の見出し（4つのセクションの内容と矛盾しないようにする）
- 4つのセクション（key固定）：
${SECTION_KEYS.map((k) => `  - ${k}：${SECTION_TITLE[k]}`).join("\n")}
`;

export function buildUserPrompt(property: PropertySummary, facts: FactRow[]): string {
  return [
    "## 物件情報",
    formatProperty(property),
    "",
    "## 事実カード・判断カード（番号付き）",
    facts.map(formatCard).join("\n"),
  ].join("\n");
}
