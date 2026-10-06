import { SECTION_KEYS, SECTION_TITLE } from "./schema";
import type { FactRow, PropertySummary } from "./types";

// AIに渡すプロンプト（設計書 6.2）。渡すのは物件の最小限の情報（D28）と、番号を振った事実カード・判断カードだけ
// 狙う層の順位・選んだ訴求・予算配分はルールで決まっている。AIは言い換えと説明だけを書き、判断を変えない（D1・D23）

export const PROMPT_VERSION = "v2";

const STATUS_LABEL: Record<FactRow["status"], string> = {
  ok: "ok",
  insufficient: "データ不足",
  not_available: "対象外",
};

const cardNo = (seq: number) => `F-${String(seq).padStart(2, "0")}`;

function formatCard(f: FactRow): string {
  const kind = f.kind === "decision" ? "判断" : "事実";
  const body = f.valueText ?? (f.value !== null ? `${f.value}${f.unit ?? ""}` : "（値なし）");
  const comparison = f.comparison !== null ? `（比べる値 ${f.comparison}）` : "";
  const attribution = f.attribution ? ` 出典：${f.attribution}` : "";
  return `${cardNo(f.seq)} [${kind}/${STATUS_LABEL[f.status]}] ${f.key} … ${body}${comparison}${attribution}`;
}

function formatProperty(p: PropertySummary): string {
  const lines = [
    `物件：${p.ref}`,
    `種別：${p.propertyType}`,
    `売出価格：${p.priceManYen !== null ? `${p.priceManYen}万円` : "不明"}`,
    `所在地（町丁目まで）：${p.area}`,
  ];
  if (p.layout) lines.push(`間取り：${p.layout}`);
  if (p.landSqm !== null) lines.push(`土地：${p.landSqm}㎡`);
  if (p.buildingSqm !== null) lines.push(`建物：${p.buildingSqm}㎡`);
  if (p.parking !== null) lines.push(`駐車場：${p.parking}台`);
  if (p.access) lines.push(`交通：${p.access}`);
  if (p.features) lines.push(`特徴：${p.features}`);
  lines.push(`競合物件：${p.competitorCount > 0 ? `${p.competitorCount}件入力済み` : "未入力"}`);
  return lines.join("\n");
}

interface RankItem { rank: number; label: string; score: number; max?: number; confidence?: string; available?: boolean }
interface AppealItem { label: string; selected: boolean; needsFacts?: string[] }

/** ルールが決めたこと（狙う層の順位・選んだ訴求・総予算）を、AIが変えないように別に書き出す */
function formatDecisions(facts: FactRow[]): string {
  const bySeqKey = new Map(facts.map((f) => [f.key, f]));
  const lines: string[] = [];

  const rank = bySeqKey.get("decision.target_rank");
  if (rank) {
    const basis = (rank.basis ?? {}) as { ranking?: RankItem[]; unresolved?: boolean; tied?: boolean };
    lines.push(`### 狙う層の順位（${cardNo(rank.seq)}）`);
    if (basis.unresolved) lines.push("- エリアの特徴からは絞り込めない、という判断です。特定の層を断定せず、その旨を書いてください。");
    if (basis.tied) lines.push("- 1位が同点です。同点の層を併記してください。");
    for (const t of basis.ranking ?? []) {
      const score = t.available === false ? "判断できない" : `${t.score}/${t.max ?? "?"}点`;
      lines.push(`- ${t.rank}位 ${t.label}（${score}）${t.confidence === "low" ? " ※公開データでは根拠が弱い仮説。「〜の可能性がある」と書く" : ""}`);
    }
  }

  const appeals = bySeqKey.get("decision.appeals");
  if (appeals) {
    const items = ((appeals.basis ?? {}) as { items?: AppealItem[] }).items ?? [];
    const selected = items.filter((a) => a.selected);
    lines.push("", `### 選ばれた訴求（${cardNo(appeals.seq)}）。この${selected.length}つだけを言い換える。新しい訴求を足さない`);
    for (const a of selected) {
      const evidence = (a.needsFacts ?? []).map((k) => bySeqKey.get(k)).filter((f): f is FactRow => f !== undefined).map((f) => cardNo(f.seq));
      lines.push(`- ${a.label}${evidence.length ? `（根拠：${evidence.join("、")}）` : "（根拠：物件の特徴の入力）"}`);
    }
    if (selected.length === 0) lines.push("- ありません。訴求は「データからは選べなかった」と書いてください。");
  }

  const budget = bySeqKey.get("decision.total_budget");
  if (budget) {
    const source = ((budget.basis ?? {}) as { source?: string }).source;
    lines.push("", `### 総予算（${cardNo(budget.seq)}）`, `- ${source === "input" ? "利用者が入力した額" : source === "rule" ? "ルールによる提案値（入力がなかったため）" : "決まっていない"}。金額は変えない`);
  }
  return lines.join("\n");
}

export const SYSTEM_PROMPT = `あなたは不動産（戸建・土地）の販売戦略レポートを書くライターです。
渡された「事実カード」「判断カード」だけを根拠にして、BRUMBY様（販売会社）向けの説明文を書きます。
狙う層の順位、選ばれた訴求、総予算と媒体ごとの金額は、ルール表ですでに決まっています。あなたの役割は、それを分かりやすく言い換えて説明することです。

cites には、カード番号の数字を入れる（F-07 なら 7）。

文の種別（kind）：
- numeric：カードの数字を書く文。数字の元になったカードの番号を cites に必ず入れる。
- qualitative：数字を書かずに、引用したカードの内容を言い換える文。cites に1つ以上入れる。カードに書かれていないことを足さない。
- proposal：販売の進め方などの提案。数字を書くなら、その数字のカードを cites に入れる。

必ず守ること：
- カードに書かれていない数字を作らない。推測や一般論の数字を書かない。
- 「多い・少ない・高い・低い・広い・上回る・割安」などの比較の言葉は、比べる値があるカード（比べる値の書かれたカード、差・増減・推移のカード、判断カード）を引用したときだけ使う。
- 狙う層の順位、訴求の選択、金額を変えない。選ばれていない訴求や、新しい訴求を足さない。
- 人の属性を断定しない。「〜の世帯が多い可能性がある」「〜と考えられる」と書く。共働き・住み替え元・子育てを終えた世帯は、公開データでは確かめられない仮説として書く。
- 年齢・性別・国籍などで、差別につながる表現は使わない。
- 物件の入力にない設備・仕様（駐車場・太陽光・床暖房など）を書かない。
- 取引価格は「過去の取引価格（約半年遅れ）」、物件の価格は「売出価格」と書き分ける。国勢調査の数字は2020年の調査であることが分かるように書く。
- カードの status が「データ不足」「対象外」の点は、数字を書かず「判断できない」「データが不足している」と書く。相場のカードがデータ不足なら、適正価格を断定しない。
- 競合物件が未入力なら、競合については書かない（不確実性のセクションで「未入力」と触れるのはよい）。
- 「必ず売れる」のような結果の断定をしない。
- 文体はBRUMBY様への報告の文章（丁寧語）。
- 出力は指定されたJSON形式のみ。前置きや後書きの文章は書かない。

書くもの：
- headline：この物件の総合評価を表す一文の見出し（各セクションの内容と矛盾しないようにする）
- ${SECTION_KEYS.length}つのセクション（key固定、この順）：
  - property_location：${SECTION_TITLE.property_location}。周辺の人口構成・施設・相場・防災と、競合物件との違い（入力がある場合）
  - target_persona：${SECTION_TITLE.target_persona}。順位の高い層の人物像と、そう判断した理由（効いたルール）
  - appeal_channels：${SECTION_TITLE.appeal_channels}。選ばれた訴求の言い換えと、どの媒体で届けるか
  - budget_plan：${SECTION_TITLE.budget_plan}。総予算（入力値か提案値か）と媒体ごとの配分の理由。金額は判断カードのまま
  - action_plan：${SECTION_TITLE.action_plan}。1週目／2〜4週目に何をするか、見直しの目安（proposal の文が中心）
  - uncertainty：${SECTION_TITLE.uncertainty}。データが不足・対象外の点、仮説にとどまる点、データの時点（国勢調査2020年、取引価格は約半年遅れ）
`;

export function buildUserPrompt(property: PropertySummary, facts: FactRow[]): string {
  return [
    "## 物件情報",
    formatProperty(property),
    "",
    "## ルールが決めたこと（変えない）",
    formatDecisions(facts),
    "",
    "## 事実カード・判断カード（番号付き）",
    facts.map(formatCard).join("\n"),
  ].join("\n");
}
