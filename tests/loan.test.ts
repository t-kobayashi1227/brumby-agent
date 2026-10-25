import { describe, expect, it } from "vitest";
import { calcLoan, loanTerm, monthlyPayment, parseIncomeBin, shareAboveIncome, type LoanAssumptions } from "../lib/calc/loan";

// 前提は docs/設計まとめ.md「買い手・ローンの前提」の最初の値
const A: LoanAssumptions = { downPaymentPct: 10, repaymentRatioPct: 25, termYears: 35, maxAgeAtPayoff: 80 };

describe("ローン計算（設計まとめの見本：2,480万円）", () => {
  it("変動1.3%：月約6.6万円、必要年収約318万円", () => {
    const r = calcLoan(2480, 1.3, A);
    expect(r.principalYen).toBe(22_320_000);
    expect(r.termYears).toBe(35);
    expect(Math.round(r.monthlyYen / 1000) / 10).toBe(6.6);
    expect(Math.round(r.requiredIncomeYen / 10_000)).toBe(318);
  });

  it("固定3.83%：月約9.7万円、必要年収約463.5万円", () => {
    const r = calcLoan(2480, 3.83, A);
    expect(Math.round(r.monthlyYen / 1000) / 10).toBe(9.7);
    // 設計まとめの見本は「約463万円」。計算は 4,635,087円で、四捨五入すると 464万円になる（見本は切り捨て）
    expect(r.requiredIncomeYen).toBeGreaterThan(4_630_000);
    expect(r.requiredIncomeYen).toBeLessThan(4_640_000);
  });

  it("年利0%は元金を回数で割る", () => {
    expect(monthlyPayment(4_200_000, 0, 35)).toBe(10_000);
  });
});

describe("返済期間", () => {
  it("完済が80歳を超えるときは短くする（候補の代表年齢）", () => {
    expect(loanTerm(A, 30)).toBe(35);
    expect(loanTerm(A, 45)).toBe(35);
    expect(loanTerm(A, 55)).toBe(25);
    expect(loanTerm(A, 65)).toBe(15);
    expect(loanTerm(A)).toBe(35);
  });

  it("短くした期間で月々の返済額を出す", () => {
    const r = calcLoan(2480, 1.3, A, 65);
    expect(r.termYears).toBe(15);
    expect(r.monthlyYen).toBeCloseTo(monthlyPayment(22_320_000, 1.3, 15), 6);
  });
});

describe("必要年収以上の割合", () => {
  it("年収の区分を読む", () => {
    expect(parseIncomeBin("400万円未満")).toEqual({ lo: 0, hi: 400 });
    expect(parseIncomeBin("400〜600万円未満")).toEqual({ lo: 400, hi: 600 });
    expect(parseIncomeBin("2000万円以上")).toEqual({ lo: 2000, hi: null });
    expect(parseIncomeBin("無回答")).toBeNull();
  });

  const bins = [
    { item: "400万円未満", pct: 20 },
    { item: "400〜600万円未満", pct: 30 },
    { item: "600〜800万円未満", pct: 30 },
    { item: "800万円以上", pct: 20 },
    { item: "無回答", pct: 25 },
  ];

  it("無回答を除いて割り直し、区分の中は均等とみなす", () => {
    // 500万円：400〜600 の半分（15）＋ 600〜800（30）＋ 800以上（20）＝ 65
    expect(shareAboveIncome(bins, 500)).toBeCloseTo(65, 6);
    // 区分の境目
    expect(shareAboveIncome(bins, 400)).toBeCloseTo(80, 6);
    expect(shareAboveIncome(bins, 0)).toBeCloseTo(100, 6);
    // 上限のない区分の下限を超えたら、その区分は数えない
    expect(shareAboveIncome(bins, 900)).toBeCloseTo(0, 6);
  });

  it("読める区分が無ければ null", () => {
    expect(shareAboveIncome([{ item: "無回答", pct: 100 }], 300)).toBeNull();
  });
});
