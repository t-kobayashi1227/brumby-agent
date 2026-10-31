// ローン計算（docs/設計まとめ.md「買い手・ローンの前提」）
// 借入額＝価格×（1−頭金の割合）。月々の返済額＝借入額×r÷（1−（1＋r）の−n乗）、r＝年利÷12、n＝返済期間×12
// 必要年収＝月々の返済額×12÷返済負担率。返済期間は、完済が上限の年齢を超えるときは短くする

export interface LoanAssumptions {
  /** 頭金の割合（%）。例：10 */
  downPaymentPct: number;
  /** 返済負担率（%）。例：25 */
  repaymentRatioPct: number;
  /** 返済期間（年）。例：35 */
  termYears: number;
  /** 完済年齢の上限（歳）。例：80 */
  maxAgeAtPayoff: number;
}

interface LoanResult {
  /** 借入額（円） */
  principalYen: number;
  /** 返済期間（年） */
  termYears: number;
  /** 月々の返済額（円） */
  monthlyYen: number;
  /** 必要年収（円） */
  requiredIncomeYen: number;
}

/** 元利均等返済の月々の返済額（円）。年利0%なら元金を回数で割る */
export function monthlyPayment(principalYen: number, annualRatePct: number, termYears: number): number {
  const n = termYears * 12;
  const r = annualRatePct / 100 / 12;
  if (r === 0) return principalYen / n;
  return (principalYen * r) / (1 - (1 + r) ** -n);
}

/** 返済期間（年）。代表年齢から完済年齢の上限までに収める。年齢が無ければ前提の期間のまま */
export function loanTerm(a: LoanAssumptions, age?: number): number {
  if (age === undefined) return a.termYears;
  return Math.max(1, Math.min(a.termYears, a.maxAgeAtPayoff - age));
}

/** 価格（万円）と年利（%）から、借入額・月々の返済額・必要年収を出す */
export function calcLoan(priceManYen: number, annualRatePct: number, a: LoanAssumptions, age?: number): LoanResult {
  const principalYen = priceManYen * 10_000 * (1 - a.downPaymentPct / 100);
  const termYears = loanTerm(a, age);
  const monthlyYen = monthlyPayment(principalYen, annualRatePct, termYears);
  const requiredIncomeYen = (monthlyYen * 12) / (a.repaymentRatioPct / 100);
  return { principalYen, termYears, monthlyYen, requiredIncomeYen };
}

/** 年収の区分（万円）。上限なしは hi が null。読めない区分（無回答など）は null */
export function parseIncomeBin(item: string): { lo: number; hi: number | null } | null {
  const text = item.normalize("NFKC").replace(/\s/g, "");
  let m = /^(\d+)万円未満$/.exec(text);
  if (m) return { lo: 0, hi: Number(m[1]) };
  m = /^(\d+)[〜~～-](\d+)万円未満$/.exec(text);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  m = /^(\d+)万円以上$/.exec(text);
  if (m) return { lo: Number(m[1]), hi: null };
  return null;
}

/**
 * 年収の分布から、必要年収以上の世帯の割合（%）を出す（設計まとめ「必要年収以上の割合」）
 * 無回答など読めない区分は除き、残りで割り直す。区分の中は年収が均等に散らばるとみなす
 * 上限のない区分（2000万円以上など）は、必要年収がその下限以下なら全部を数え、超えるなら数えない
 */
export function shareAboveIncome(bins: { item: string; pct: number }[], requiredIncomeManYen: number): number | null {
  const parsed = bins.flatMap((b) => {
    const bin = parseIncomeBin(b.item);
    return bin ? [{ ...bin, pct: b.pct }] : [];
  });
  const total = parsed.reduce((s, b) => s + b.pct, 0);
  if (total <= 0) return null;
  let above = 0;
  for (const b of parsed) {
    if (b.hi === null) {
      if (requiredIncomeManYen <= b.lo) above += b.pct;
      continue;
    }
    const fraction = Math.min(1, Math.max(0, (b.hi - requiredIncomeManYen) / (b.hi - b.lo)));
    above += b.pct * fraction;
  }
  return (above / total) * 100;
}
