// 採点ルール表（設計書 D35）の設定と結果の型。設定は DB の表（personas・scoring_rules など）から読む
// 元は BRUMBY様と作った Excel「採点ルール表」。シート名をコメントに書いておく

/** 適合度の記号。◎+2／〇+1／－0／△−1／×−2 */
export type Mark = "◎" | "〇" | "－" | "△" | "×";

/** 5つの層。物件・生活環境・市場はルール表で、購入可能性と競合は計算で採点する */
export type Layer = "物件" | "購入可能性" | "生活環境" | "市場" | "競合";
export type RuleLayer = "物件" | "生活環境" | "市場";

export type AgeBand = "20代" | "30代" | "40代" | "50代" | "60代" | "70代";

/** ペルソナ（シート：ペルソナ・年収分布・貯蓄分布・ペルソナの年代・買い手の多さ） */
export interface Persona {
  id: string;
  label: string;
  description: string;
  repAge: number;
  downPaymentRate: number;
  purchaseMethod: "loan" | "cash";
  /** 年収の区分（INCOME_BANDS）ごとの割合 */
  incomeDist: number[];
  /** 貯蓄の区分（SAVINGS_BANDS）ごとの割合 */
  savingsDist: number[];
  ageMix: Partial<Record<AgeBand, number>>;
  buyerShareNew: number | null;
  buyerShareUsed: number | null;
  enabled: boolean;
  sortOrder: number;
}

/** 項目と重視度（シート：項目の重視度） */
export interface ScoringItem {
  key: string;
  layer: RuleLayer;
  /** ペルソナID → 0〜3 */
  importance: Record<string, number>;
  note: string;
}

/** 採点ルール（シート：採点ルール） */
export interface ScoringRule {
  id: string;
  layer: RuleLayer;
  itemKey: string;
  lower: number | null;
  upper: number | null;
  reason: string;
  source: string | null;
  fit: Record<string, Mark>;
  basisClass: string | null;
  basisNote: string;
  exclusiveGroup: string | null;
  enabled: boolean;
}

/** 競合と比べる項目（シート：競合重視度） */
export interface CompetitorItem {
  key: string;
  label: string;
  direction: 1 | -1;
  importance: Record<string, number>;
  tieMargin: number;
}

export type AgeClass = "新築" | "築2〜20年" | "築21年以上";

/** 区×築年数区分の取引の中央値（シート：相場・周辺の取引） */
export interface MarketReference {
  ward: string;
  ageClass: AgeClass;
  priceManYen: number;
  buildingSqm: number | null;
  landSqm: number | null;
  ageYears: number | null;
  n: number | null;
}

export interface AreaPopularity {
  ward: string;
  town: string;
  score: number;
}

/** 媒体（シート：媒体） */
export interface MediaChannel {
  id: string;
  label: string;
  statName: string | null;
  flatReach: number | null;
  enabled: boolean;
  formatExample: string;
  sortOrder: number;
}

/** 年代別の利用率（シート：媒体の利用率） */
export interface MediaUsageRate {
  statName: string;
  rates: Partial<Record<AgeBand, number>>;
  allAges: number;
}

/** 反響の記録の1行（シート：反響の記録） */
export interface MediaResult {
  mediaId: string;
  costYen: number;
  inquiries: number;
}

export interface ScoringConfig {
  personas: Persona[];
  items: ScoringItem[];
  rules: ScoringRule[];
  /** scoring_params（層の重み・購入前提・予算の決め方・媒体）。key → 値 */
  params: Record<string, number>;
  competitorItems: CompetitorItem[];
  market: MarketReference[];
  popularity: AreaPopularity[];
  media: MediaChannel[];
  usage: MediaUsageRate[];
  results: MediaResult[];
  /** 設定の版（scoring_revisions の最後の id） */
  version: number | null;
}

/** 採点に使う項目の値と、その出どころ */
export interface InputValue {
  value: number | null;
  /** 例：物件の入力、手入力、F-12（事実カード）、相場表 */
  source: string;
  /** 値の説明（例：○○駅 直線640m） */
  text?: string | null;
  /** 事実カードの key（出典の版を判断カードに残すため） */
  factKey?: string;
}

/** 競合1件分の値（項目キー → 値） */
export type CompetitorValues = Record<string, number | null>;

export interface ScoringInputs {
  values: Record<string, InputValue>;
  ward: string | null;
  town: string | null;
  ageClass: AgeClass | null;
  isNew: boolean | null;
  competitors: CompetitorValues[];
  /** 物件の登録で入力した総予算（万円）。あれば提案値より優先する（D15） */
  inputBudgetManYen: number | null;
}

// ---- 結果 ----

export interface RuleHit {
  id: string;
  itemKey: string;
  reason: string;
  mark: Mark | null;
  points: number;
  basisClass: string | null;
}

export interface LayerResult {
  layer: Layer;
  /** 0〜100。データがなく採点できない層は null（総合の重みから外す） */
  score: number | null;
  raw?: number;
  max?: number;
  hits?: RuleHit[];
  /** データがなく外した項目 */
  missing?: string[];
  /** 購入可能性・競合の計算の説明 */
  detail?: Record<string, unknown>;
}

export interface AffordabilityDetail {
  method: "loan" | "cash";
  loanManYen?: number;
  years?: number;
  annualRepaymentManYen?: number;
  requiredIncomeManYen?: number;
  requiredSavingsManYen?: number;
  share: number;
  targetImage: string;
}

export interface CompetitorComparison {
  key: string;
  label: string;
  /** 勝ち−負け（競合の件数で割った値。周辺の取引と比べたときは ±0.5） */
  net: number;
  against: "競合" | "周辺の取引" | "比べられない";
  own: number | null;
  others: number[];
  median: number | null;
}

export interface PersonaResult {
  rank: number;
  id: string;
  label: string;
  description: string;
  total: number;
  buyerScore: number;
  layers: LayerResult[];
  targetImage: string | null;
}

export interface AppealResult {
  key: string;
  label: string;
  net: number;
  importance: number;
  strength: number;
  judgement: "強く訴求" | "訴求" | "弱み：訴求しない" | "";
  against: CompetitorComparison["against"];
  own: number | null;
  compareTo: number | null;
}

export interface SalabilityResult {
  popularity: { label: string; score: number | null };
  priceRatio: { value: number | null; score: number | null };
  fit: { label: string | null; score: number | null };
  score: number | null;
  class: "売れやすい" | "標準" | "売れにくい" | null;
}

export interface BudgetResult {
  totalManYen: number | null;
  source: "input" | "rule" | null;
  suggestedManYen: number | null;
  multiplier: number | null;
  initialManYen: number | null;
  additionalManYen: number | null;
  addRule: string;
  suggestion: string;
  /** シミュレーションの選択肢（売れやすい／標準／売れにくいの倍率で出した額） */
  options: number[];
}

export interface MediaAllocationItem {
  id: string;
  label: string;
  formatExample: string;
  /** 届きやすさ（反響係数を掛けた後） */
  reach: number;
  /** 届きやすさの順位（1が一番届きやすい） */
  rank: number;
  /** 配分に使ったか（届きやすさの上位N媒体） */
  selected: boolean;
  /** 届きやすさの根拠。統計があれば、第1ターゲットの年代構成で平均した利用率と全年代の利用率（%） */
  basis: { kind: "usage"; statName: string; targetUsage: number; allAges: number } | { kind: "flat"; flatReach: number };
  coefficient: number;
  share: number;
  amountManYen: number;
  initialManYen: number;
}
