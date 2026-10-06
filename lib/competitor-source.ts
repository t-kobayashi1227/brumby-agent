// 競合物件の出どころの一文（例：SUUMO・2026/10/5確認）。画面（クライアント）からも使うので、DBを読む処理と分けている（D30）

export interface CompetitorSourceFields {
  sourceType: "portal" | "seen" | "other" | null;
  sourceSite: string | null;
  confirmedOn: string | null;
}

export function competitorSource(c: CompetitorSourceFields): string {
  const where = c.sourceSite ?? (c.sourceType === "seen" ? "現地などで見かけた" : c.sourceType === "portal" ? "ポータルサイト" : c.sourceType === "other" ? "その他" : "出どころ未入力");
  return c.confirmedOn ? `${where}・${c.confirmedOn}確認` : where;
}
