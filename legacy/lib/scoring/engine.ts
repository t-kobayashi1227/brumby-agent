import { AGE_BANDS, INCOME_BANDS, MARK_VALUE, SAVINGS_BANDS, param } from "./constants";
import type {
  AffordabilityDetail,
  AppealResult,
  BudgetResult,
  CompetitorComparison,
  LayerResult,
  MediaAllocationItem,
  Persona,
  PersonaResult,
  RuleHit,
  RuleLayer,
  SalabilityResult,
  ScoringConfig,
  ScoringInputs,
} from "./types";

// 採点ルール表（設計書 D35）の計算。Excel「採点ルール表」の試算シートと同じ式で計算する（DBには触らない）
// Excel と違うところ（値がない項目の扱い）：
// - 値が取れない項目は、素点だけでなく満点からも外す（Excel は満点に残すので点が下がる）
// - 層のすべての項目に値がないときは、その層を「データなし」にして総合の重みから外す（競合が未入力のときと同じ扱い）

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
/** Excel の ROUND（0.5 は 0 から遠い方へ） */
export const round = (v: number, digits = 0) => {
  const f = 10 ** digits;
  return (Math.sign(v) * Math.round(Math.abs(v) * f + 1e-9)) / f;
};
const ceilTo = (v: number, step: number) => Math.ceil(v / step - 1e-9) * step;

const importanceOf = (config: ScoringConfig, itemKey: string, personaId: string): number => {
  const item = config.items.find((i) => i.key === itemKey);
  // Excel：項目の重視度にない項目は 1、表にあって空欄なら 0
  if (!item) return 1;
  const v = item.importance[personaId];
  return typeof v === "number" ? v : 0;
};

/** ルールの点＝適合度×重視度×1段階の点数 */
export function rulePoints(config: ScoringConfig, ruleIndex: number, personaId: string): number {
  const rule = config.rules[ruleIndex];
  const mark = rule.fit[personaId];
  if (!mark) return 0;
  return MARK_VALUE[mark] * importanceOf(config, rule.itemKey, personaId) * param(config.params, "1段階の点数");
}

const ruleHits = (lower: number | null, upper: number | null, v: number) => (lower === null || v >= lower) && (upper === null || v <= upper);

/** 物件・生活環境・市場の層：該当したルールの点の合計（素点）÷ 排他グループごとの最大の加点の合計（満点） */
export function scoreRuleLayer(config: ScoringConfig, inputs: ScoringInputs, personaId: string, layer: RuleLayer): LayerResult {
  const hits: RuleHit[] = [];
  const groupMax = new Map<string, number>();
  const missing = new Set<string>();
  let raw = 0;
  config.rules.forEach((rule, index) => {
    if (!rule.enabled || rule.layer !== layer) return;
    const value = inputs.values[rule.itemKey]?.value ?? null;
    if (value === null) {
      missing.add(rule.itemKey);
      return;
    }
    const points = rulePoints(config, index, personaId);
    const group = rule.exclusiveGroup || rule.id;
    if (points > 0) groupMax.set(group, Math.max(groupMax.get(group) ?? 0, points));
    if (ruleHits(rule.lower, rule.upper, value)) {
      raw += points;
      hits.push({ id: rule.id, itemKey: rule.itemKey, reason: rule.reason, mark: rule.fit[personaId] ?? null, points, basisClass: rule.basisClass });
    }
  });
  const max = [...groupMax.values()].reduce((a, b) => a + b, 0);
  const anyData = config.rules.some((r) => r.enabled && r.layer === layer && (inputs.values[r.itemKey]?.value ?? null) !== null);
  const score = !anyData ? null : max <= 0 ? 0 : round(clamp((raw / max) * 100, 0, 100));
  return { layer, score, raw, max, hits, missing: [...missing] };
}

/** 年間返済額（Excel の PMT×12）。金利0なら元金を割るだけ */
function annualPayment(rate: number, years: number, loan: number) {
  const n = years * 12;
  const r = rate / 12;
  if (r === 0) return (loan / n) * 12;
  return ((loan * r) / (1 - (1 + r) ** -n)) * 12;
}

/** 分布のうち、閾値を上回る割合（帯の中は均等に分布していると仮定して按分） */
function shareAbove(dist: number[], bands: [number, number][], threshold: number) {
  return bands.reduce((sum, [lo, hi], i) => sum + (Number(dist[i]) || 0) * clamp((hi - threshold) / (hi - lo), 0, 1), 0);
}

/** 購入可能性：必要年収（ローン）または必要な貯蓄（現金）を上回る世帯の割合で採点 */
export function scoreAffordability(config: ScoringConfig, inputs: ScoringInputs, persona: Persona): LayerResult {
  const price = inputs.values["価格_万円"]?.value ?? null;
  if (price === null) return { layer: "購入可能性", score: null, missing: ["価格_万円"] };
  const p = config.params;
  const step = param(p, "年収の端数");
  const fullShare = param(p, "満点割合");
  let detail: AffordabilityDetail;
  if (persona.purchaseMethod === "cash") {
    const need = Math.max(0, (price - param(p, "自宅売却見込み")) / param(p, "貯蓄の使える割合"));
    const share = shareAbove(persona.savingsDist, SAVINGS_BANDS, need);
    detail = {
      method: "cash",
      requiredSavingsManYen: round(need, 1),
      share: round(share, 4),
      targetImage: need <= 0 ? "今の家の売却資金で購入できる世帯" : `貯蓄${ceilTo(need, step).toLocaleString("ja-JP")}万円以上（今の家の売却と合わせて購入）`,
    };
  } else {
    const loan = price * (1 - persona.downPaymentRate);
    const years = Math.max(1, Math.min(param(p, "最長返済期間"), param(p, "完済年齢上限") - persona.repAge));
    const annual = annualPayment(param(p, "金利"), years, loan);
    const required = annual / param(p, "返済負担率");
    const share = shareAbove(persona.incomeDist, INCOME_BANDS, required);
    detail = {
      method: "loan",
      loanManYen: round(loan, 1),
      years,
      annualRepaymentManYen: round(annual, 1),
      requiredIncomeManYen: round(required, 1),
      share: round(share, 4),
      targetImage: `世帯年収${ceilTo(required, step).toLocaleString("ja-JP")}万円以上`,
    };
  }
  const score = round(Math.min(100, (detail.share / fullShare) * 100));
  return { layer: "購入可能性", score, detail: { ...detail } };
}

/** 競合と比べる：項目ごとの勝ち−負け（物件ごとに1回計算し、ペルソナの重視度で重み付けする） */
export function compareCompetitors(config: ScoringConfig, inputs: ScoringInputs): { hasCompetitors: boolean; items: CompetitorComparison[] } {
  const hasCompetitors = inputs.competitors.some((c) => config.competitorItems.some((i) => c[i.key] !== null && c[i.key] !== undefined));
  const ref = medianReference(config, inputs);
  const items = config.competitorItems.map((item): CompetitorComparison => {
    const own = inputs.values[item.key]?.value ?? null;
    const others = inputs.competitors.map((c) => c[item.key]).filter((v): v is number => typeof v === "number");
    const median = ref[item.key] ?? null;
    const better = (diff: number) => diff * item.direction > item.tieMargin;
    const worse = (diff: number) => diff * item.direction < -item.tieMargin;
    if (own === null) return { key: item.key, label: item.label, net: 0, against: "比べられない", own, others, median };
    if (others.length > 0) {
      const net = (others.filter((o) => better(own - o)).length - others.filter((o) => worse(own - o)).length) / others.length;
      return { key: item.key, label: item.label, net, against: "競合", own, others, median };
    }
    // 競合の値がない項目は、同じ区・同じ築年数区分の取引の中央値と比べる（勝てば0.5点）
    if (median === null || median === 0) return { key: item.key, label: item.label, net: 0, against: "比べられない", own, others, median };
    const net = 0.5 * Number(better(own - median)) - 0.5 * Number(worse(own - median));
    return { key: item.key, label: item.label, net, against: "周辺の取引", own, others, median };
  });
  return { hasCompetitors, items };
}

/** 周辺の取引の中央値（区×築年数区分）。項目キー → 値 */
function medianReference(config: ScoringConfig, inputs: ScoringInputs): Record<string, number | null> {
  const row = config.market.find((m) => m.ward === inputs.ward && m.ageClass === inputs.ageClass);
  if (!row) return {};
  return { 価格_万円: row.priceManYen, 築年数: row.ageYears, "延床_㎡": row.buildingSqm, "土地_㎡": row.landSqm };
}

export function scoreCompetition(config: ScoringConfig, comparison: ReturnType<typeof compareCompetitors>, personaId: string): LayerResult {
  if (!comparison.hasCompetitors) return { layer: "競合", score: null, detail: { reason: "競合物件が入力されていません" } };
  let weighted = 0;
  let sumImportance = 0;
  for (const item of config.competitorItems) {
    const imp = Number(item.importance[personaId]) || 0;
    const c = comparison.items.find((x) => x.key === item.key)!;
    weighted += imp * c.net;
    sumImportance += imp;
  }
  return { layer: "競合", score: round(50 + (50 * weighted) / Math.max(1, sumImportance)), detail: { weighted: round(weighted, 3), sumImportance } };
}

/** 買い手の多さ：新築・中古それぞれで、そのペルソナの割合 ÷ 一番多いペルソナの割合 × 100 */
export function buyerScore(personas: Persona[], persona: Persona, isNew: boolean | null): number {
  const pick = (x: Persona) => (isNew === false ? x.buyerShareUsed : x.buyerShareNew) ?? 0;
  const max = Math.max(0, ...personas.map(pick));
  return max > 0 ? round((pick(persona) / max) * 100) : 0;
}

export interface ScoringResult {
  personas: PersonaResult[];
  comparison: ReturnType<typeof compareCompetitors>;
  appeals: AppealResult[];
  salability: SalabilityResult;
  budget: BudgetResult;
  media: MediaAllocationItem[];
}

export function runScoring(config: ScoringConfig, inputs: ScoringInputs): ScoringResult {
  const personas = config.personas.filter((p) => p.enabled).sort((a, b) => a.sortOrder - b.sortOrder || a.id.localeCompare(b.id));
  const comparison = compareCompetitors(config, inputs);
  const wBuyer = param(config.params, "買い手の多さ");

  const scored = personas.map((persona, order) => {
    const layers: LayerResult[] = [
      scoreRuleLayer(config, inputs, persona.id, "物件"),
      scoreAffordability(config, inputs, persona),
      scoreRuleLayer(config, inputs, persona.id, "生活環境"),
      scoreRuleLayer(config, inputs, persona.id, "市場"),
      scoreCompetition(config, comparison, persona.id),
    ];
    // 総合＝5層の点数×重み（採点できない層は外して重みを配り直す）×(1−買い手の多さ) ＋ 買い手の多さ×その重み
    let sum = 0;
    let weights = 0;
    for (const l of layers) {
      if (l.score === null) continue;
      const w = param(config.params, l.layer);
      sum += l.score * w;
      weights += w;
    }
    const buyer = buyerScore(personas, persona, inputs.isNew);
    const fit = weights > 0 ? sum / weights : 0;
    const total = round((1 - wBuyer) * fit + wBuyer * buyer, 1);
    const afford = layers[1].detail as AffordabilityDetail | undefined;
    return { persona, order, layers, buyer, total, targetImage: afford?.targetImage ?? null };
  });
  scored.sort((a, b) => b.total - a.total || a.order - b.order);
  const results: PersonaResult[] = scored.map((s, i) => ({
    rank: i + 1,
    id: s.persona.id,
    label: s.persona.label,
    description: s.persona.description,
    total: s.total,
    buyerScore: s.buyer,
    layers: s.layers,
    targetImage: s.targetImage,
  }));

  const top = results[0] ?? null;
  const appeals = top ? rankAppeals(config, comparison, top.id) : [];
  const salability = scoreSalability(config, inputs, top);
  const budget = decideBudget(config, inputs, salability);
  const media = top && budget.totalManYen !== null ? allocateMedia(config, personas.find((p) => p.id === top.id)!, budget.totalManYen, budget.initialManYen ?? 0) : [];
  return { personas: results, comparison, appeals, salability, budget, media };
}

/** 訴求ポイント：競合（なければ周辺の取引）と比べた勝ち負け×第1ターゲットの重視度 */
export function rankAppeals(config: ScoringConfig, comparison: ReturnType<typeof compareCompetitors>, personaId: string): AppealResult[] {
  return comparison.items
    .map((c): AppealResult => {
      const item = config.competitorItems.find((i) => i.key === c.key)!;
      const importance = Number(item.importance[personaId]) || 0;
      const strength = c.net * importance;
      const judgement = c.against === "比べられない" ? "" : strength >= 1 ? "強く訴求" : strength > 0 ? "訴求" : strength < 0 ? "弱み：訴求しない" : "";
      const compareTo = c.against === "競合" ? (c.others.length ? c.others.reduce((a, b) => a + b, 0) / c.others.length : null) : c.median;
      return { key: c.key, label: c.label, net: round(c.net, 3), importance, strength: round(strength, 3), judgement, against: c.against, own: c.own, compareTo };
    })
    .sort((a, b) => b.strength - a.strength);
}

/** 売れやすさ：エリア人気・価格の相場比・第1ターゲットの適合度の重み付き平均 */
export function scoreSalability(config: ScoringConfig, inputs: ScoringInputs, top: PersonaResult | null): SalabilityResult {
  const p = config.params;
  // エリア人気：区＋町で引く。なければ区の中央値、それもなければ50点
  let popularity: SalabilityResult["popularity"] = { label: "不明", score: 50 };
  const town = config.popularity.find((a) => a.ward === inputs.ward && a.town === inputs.town);
  if (town) popularity = { label: `${town.ward}${town.town}`, score: town.score };
  else if (inputs.ward) {
    const scores = config.popularity.filter((a) => a.ward === inputs.ward).map((a) => a.score).sort((a, b) => a - b);
    if (scores.length) {
      const mid = scores.length % 2 ? scores[(scores.length - 1) / 2] : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2;
      popularity = { label: `${inputs.ward}（区の中央値）`, score: mid };
    }
  }
  const ratio = inputs.values["価格_相場比"]?.value ?? null;
  const full = param(p, "相場比_満点");
  const zero = param(p, "相場比_0点");
  const priceScore = ratio === null ? null : round(clamp(((zero - ratio) / (zero - full)) * 100, 0, 100));
  const parts: [number | null, number][] = [
    [popularity.score, param(p, "重み_エリア人気")],
    [priceScore, param(p, "重み_相場比")],
    [top?.total ?? null, param(p, "重み_適合度")],
  ];
  const usable = parts.filter((x): x is [number, number] => x[0] !== null);
  const wsum = usable.reduce((a, [, w]) => a + w, 0);
  const score = wsum > 0 ? round(usable.reduce((a, [v, w]) => a + v * w, 0) / wsum) : null;
  const cls = score === null ? null : score >= param(p, "売れやすい") ? "売れやすい" : score < param(p, "売れにくい") ? "売れにくい" : "標準";
  return {
    popularity,
    priceRatio: { value: ratio, score: priceScore },
    fit: { label: top?.label ?? null, score: top?.total ?? null },
    score,
    class: cls,
  };
}

/** 広告予算：物件価格×基準率×売れやすさの倍率（1万円単位）。最初に一部を使い、反響が少なければ追加 */
export function decideBudget(config: ScoringConfig, inputs: ScoringInputs, salability: SalabilityResult): BudgetResult {
  const p = config.params;
  const price = inputs.values["価格_万円"]?.value ?? null;
  const mult = salability.class === "売れやすい" ? param(p, "係数_売れやすい") : salability.class === "売れにくい" ? param(p, "係数_売れにくい") : param(p, "係数_標準");
  const byRule = (m: number) => (price === null ? null : round((price * 10000 * param(p, "基準率") * m) / 10000));
  const suggested = byRule(mult);
  const total = inputs.inputBudgetManYen ?? suggested;
  const initial = total === null ? null : round((total * 10000 * param(p, "初回の割合")) / 1000) / 10;
  const ratio = salability.priceRatio.value;
  const suggestion =
    salability.class === "売れにくい" && ratio !== null && ratio >= param(p, "価格見直しの相場比")
      ? `広告を増やすより、価格の見直しを先に検討（相場の${ratio.toFixed(2)}倍）`
      : salability.class === "売れにくい"
        ? "広告は上限で止め、反響を見て価格や訴求を見直す"
        : salability.class === "売れやすい"
          ? "人気が高く相場並みのため、予算を抑えて反響を見る"
          : "標準の予算で、反響を見て追加を判断";
  const options = [...new Set([param(p, "係数_売れやすい"), param(p, "係数_売れにくい"), param(p, "係数_標準")].map(byRule).filter((x): x is number => x !== null && x > 0))];
  if (total !== null && !options.includes(total)) options.push(total);
  return {
    totalManYen: total,
    source: inputs.inputBudgetManYen !== null ? "input" : suggested !== null ? "rule" : null,
    suggestedManYen: suggested,
    multiplier: mult,
    initialManYen: initial,
    additionalManYen: total === null || initial === null ? null : round((total - initial) * 10) / 10,
    addRule: `掲載から${param(p, "追加の判断日数")}日で問い合わせが${param(p, "追加の問い合わせ数")}件未満なら追加`,
    suggestion,
    options: options.sort((a, b) => a - b),
  };
}

/** 反響係数：全媒体の平均の問い合わせ単価 ÷ その媒体の問い合わせ単価（0.5〜2.0）。問い合わせが少ないうちは1.00 */
export function responseCoefficients(config: ScoringConfig): Record<string, number> {
  const minInquiries = param(config.params, "係数を使い始める問い合わせ数");
  const totals = new Map<string, { cost: number; inq: number }>();
  for (const r of config.results) {
    const t = totals.get(r.mediaId) ?? { cost: 0, inq: 0 };
    t.cost += r.costYen;
    t.inq += r.inquiries;
    totals.set(r.mediaId, t);
  }
  const all = [...totals.values()].reduce((a, t) => ({ cost: a.cost + t.cost, inq: a.inq + t.inq }), { cost: 0, inq: 0 });
  const avg = all.inq > 0 ? all.cost / all.inq : 0;
  const out: Record<string, number> = {};
  for (const m of config.media) {
    const t = totals.get(m.id);
    const cpi = t && t.inq > 0 ? t.cost / t.inq : 0;
    out[m.id] = !t || t.inq < minInquiries || cpi === 0 ? 1 : round(clamp(avg / cpi, 0.5, 2), 2);
  }
  return out;
}

/** 媒体の届きやすさ：(ペルソナの年代構成で平均した利用率)² ÷ 全年代の利用率 × 反響係数。統計がない媒体は一律の値 */
export function mediaReach(config: ScoringConfig, persona: Persona, coefficients = responseCoefficients(config)) {
  return config.media
    .filter((m) => m.enabled)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => {
      const usage = m.statName ? config.usage.find((u) => u.statName === m.statName) : undefined;
      let base: number;
      let basis: MediaAllocationItem["basis"];
      if (usage && usage.allAges > 0) {
        const mean = AGE_BANDS.reduce((s, band) => s + (Number(persona.ageMix[band]) || 0) * (Number(usage.rates[band]) || 0), 0);
        base = (mean * mean) / usage.allAges;
        basis = { kind: "usage", statName: usage.statName, targetUsage: round(mean, 1), allAges: usage.allAges };
      } else {
        base = m.flatReach ?? 0;
        basis = { kind: "flat", flatReach: base };
      }
      const coefficient = coefficients[m.id] ?? 1;
      return { media: m, reach: base * coefficient, coefficient, basis };
    });
}

/** 媒体配分：届きやすさの上位N媒体（同点は含める）の比率。金額は千円単位 */
export function allocateMedia(config: ScoringConfig, persona: Persona, totalManYen: number, initialManYen: number): MediaAllocationItem[] {
  const reach = mediaReach(config, persona);
  const n = param(config.params, "配分に使う媒体の数");
  const sorted = reach.map((r) => r.reach).sort((a, b) => b - a);
  const cut = sorted[Math.min(n, sorted.length) - 1] ?? Infinity;
  const used = reach.filter((r) => r.reach > 0 && r.reach >= cut);
  const sum = used.reduce((a, r) => a + r.reach, 0);
  return reach.map((r) => {
    const share = sum > 0 && used.includes(r) ? r.reach / sum : 0;
    return {
      id: r.media.id,
      label: r.media.label,
      formatExample: r.media.formatExample,
      reach: round(r.reach, 2),
      rank: sorted.indexOf(r.reach) + 1,
      selected: used.includes(r),
      basis: r.basis,
      coefficient: r.coefficient,
      share: round(share, 4),
      amountManYen: round(totalManYen * share * 10) / 10,
      initialManYen: round(initialManYen * share * 10) / 10,
    };
  });
}

