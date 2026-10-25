// 媒体の配分（%）から金額を出す（docs/設計まとめ.md「予算シミュレーション」）
// 0.1万円単位で四捨五入し、合計がずれたときは配分の最も大きい媒体で合わせる。AI は配分だけを出し、金額はここで計算する

export const SIMULATION_TOTALS_MAN_YEN = [10, 20, 30] as const;

export interface Allocation {
  id: string;
  share: number;
  /** 万円（0.1万円単位） */
  amountManYen: number;
}

export function allocate(shares: { id: string; share: number }[], totalManYen: number): Allocation[] {
  // 0.1万円を1として整数で計算する（小数の誤差を出さないため）
  const totalUnits = Math.round(totalManYen * 10);
  const units = shares.map((s) => Math.round((totalUnits * s.share) / 100));
  const diff = totalUnits - units.reduce((a, b) => a + b, 0);
  if (shares.length > 0 && diff !== 0) {
    const largest = shares.reduce((best, s, i) => (s.share > shares[best].share ? i : best), 0);
    units[largest] += diff;
  }
  return shares.map((s, i) => ({ id: s.id, share: s.share, amountManYen: units[i] / 10 }));
}

/** 試算の列：①の総額（入力があれば一番左）と 10万・20万・30万円 */
export function simulate(shares: { id: string; share: number }[], inputTotalManYen: number | null) {
  const totals = [...(inputTotalManYen ? [inputTotalManYen] : []), ...SIMULATION_TOTALS_MAN_YEN];
  return totals.map((total, i) => ({ totalManYen: total, isInput: inputTotalManYen !== null && i === 0, rows: allocate(shares, total) }));
}
