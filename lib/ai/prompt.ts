import { SECTION_KEYS, SECTION_TITLE } from "./schema";
import type { FactRow, PropertySummary } from "./types";

// AIに渡すプロンプト（設計書 6.2）。渡すのは物件の最小限の情報（D28）と、番号を振った事実カード・判断カードだけ
// 狙う層（ペルソナ）の順位・選んだ訴求・予算配分は採点ルール表（D35）で決まっている。AIは言い換えと説明だけを書き、判断を変えない（D1・D23）

export const PROMPT_VERSION = "v3";

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
  if (p.ageYears !== null && p.ageYears !== undefined) lines.push(`築年数：${p.ageYears === 0 ? "新築" : `${p.ageYears}年`}`);
  if (p.isHiraya) lines.push("平屋");
  if (p.hasGarden) lines.push("庭あり");
  if (p.access) lines.push(`交通：${p.access}`);
  if (p.features) lines.push(`特徴：${p.features}`);
  lines.push(`競合物件：${p.competitorCount > 0 ? `${p.competitorCount}件入力済み` : "未入力"}`);
  return lines.join("\n");
}

interface LayerItem { layer: string; score: number | null; hits?: { reason: string; mark: string | null; points: number }[]; missing?: string[]; detail?: { targetImage?: string } }
interface RankItem { rank: number; label: string; score: number; max?: number; confidence?: string; available?: boolean; layers?: LayerItem[]; targetImage?: string | null }
interface AppealItem { label: string; selected: boolean; needsFacts?: string[]; judgement?: string; description?: string }

/** 層ごとの点数と、点を上げた・下げたルール（採点ルール表の「根拠の表示文」） */
function formatLayers(layers: LayerItem[]): string[] {
  return layers.map((l) => {
    if (l.score === null) return `  - ${l.layer}：データなし（総合から外した）`;
    const plus = (l.hits ?? []).filter((h) => h.points > 0).map((h) => `${h.reason}（${h.mark}）`);
    const minus = (l.hits ?? []).filter((h) => h.points < 0).map((h) => `${h.reason}（${h.mark}）`);
    return `  - ${l.layer} ${l.score}点${plus.length ? ` 加点：${plus.join("、")}` : ""}${minus.length ? ` 減点：${minus.join("、")}` : ""}`;
  });
}

/** 採点ルール表が決めたこと（ペルソナの順位・選んだ訴求・総予算）を、AIが変えないように別に書き出す */
function formatDecisions(facts: FactRow[]): string {
  const bySeqKey = new Map(facts.map((f) => [f.key, f]));
  const lines: string[] = [];

  const rank = bySeqKey.get("decision.target_rank");
  const scores = bySeqKey.get("decision.persona_scores");
  if (rank) {
    const basis = (rank.basis ?? {}) as { ranking?: RankItem[]; unresolved?: boolean; tied?: boolean };
    lines.push(`### ターゲット（ペルソナ）の順位（${cardNo(rank.seq)}${scores ? `、全ペルソナの点数は ${cardNo(scores.seq)}` : ""}）。上位3つを第1〜第3ターゲットとする`);
    if (basis.unresolved) lines.push("- ターゲットを決められなかった、という判断です。特定の層を断定せず、その旨を書いてください。");
    for (const t of basis.ranking ?? []) {
      if (t.rank > 3) break;
      lines.push(`- 第${t.rank}ターゲット ${t.label}（総合${t.score}点${t.targetImage ? `・ターゲット像：${t.targetImage}` : ""}）`);
      lines.push(...formatLayers(t.layers ?? []));
    }
  }

  const appeals = bySeqKey.get("decision.appeals");
  if (appeals) {
    const items = ((appeals.basis ?? {}) as { items?: AppealItem[] }).items ?? [];
    const selected = items.filter((a) => a.selected);
    lines.push("", `### 選ばれた訴求（${cardNo(appeals.seq)}）。この${selected.length}つだけを言い換える。新しい訴求を足さない`);
    for (const a of selected) lines.push(`- ${a.label}：${a.judgement ?? ""}（${a.description ?? ""}）`);
    if (selected.length === 0) lines.push("- ありません。訴求は「データからは選べなかった」と書いてください。");
  }

  const budget = bySeqKey.get("decision.total_budget");
  if (budget) {
    const b = (budget.basis ?? {}) as { source?: string; initial_man_yen?: number; add_rule?: string; suggestion?: string };
    lines.push("", `### 総予算（${cardNo(budget.seq)}）`, `- ${b.source === "input" ? "利用者が入力した額" : b.source === "rule" ? "物件価格×基準率×売れやすさの倍率による提案値" : "決まっていない"}。金額は変えない`);
    if (b.suggestion) lines.push(`- 方針：${b.suggestion}`);
  }
  const media = facts.filter((f) => f.key.startsWith("decision.media.") && (f.value ?? 0) > 0);
  if (media.length) {
    lines.push("", "### 媒体と金額（配分に使う媒体だけ。金額は変えない。届きやすさの順位と利用率を理由として説明してよい）");
    for (const m of media) lines.push(`- ${cardNo(m.seq)} ${m.valueText ?? m.key}`);
  }
  const salability = bySeqKey.get("decision.salability");
  if (salability) lines.push(`- 売れやすさ（${cardNo(salability.seq)}）：エリア人気・価格の相場比・第1ターゲットの適合度から判断`);
  return lines.join("\n");
}

export const SYSTEM_PROMPT = `あなたは不動産（戸建・土地）の販売戦略レポートを書くライターです。
渡された「事実カード」「判断カード」だけを根拠にして、BRUMBY様（販売会社）向けの説明文を書きます。
ターゲット（ペルソナ）の順位、選ばれた訴求、総予算と媒体ごとの金額は、採点ルール表ですでに決まっています。あなたの役割は、それを分かりやすく言い換えて説明することです。

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
  - property_location：${SECTION_TITLE.property_location}。周辺の人口構成・施設・相場・防災と、競合物件との違い（入力がある場合）。最寄りスーパーの事実カードが取れていれば、店舗名と距離を施設の説明に含める
  - target_persona：${SECTION_TITLE.target_persona}。第1〜第3ターゲットの人物像（ターゲット像の年収を含む）と、そう判断した理由（層ごとの点数と加点・減点の理由）
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
