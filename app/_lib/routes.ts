// Single source of truth for page URLs, header titles and sidebar navigation.

export interface PageDef {
  href: string;
  title: string;
  /** 架空のデータのモック。ナビには出さない（画面は残す。設計書 D27） */
  mock?: true;
}

/** Every page in the prototype, in the order shown in the demo screen-jump menu. */
export const pages: PageDef[] = [
  { href: "/", title: "1. ログイン", mock: true },
  { href: "/dashboard", title: "2. ホーム" },
  { href: "/properties/new", title: "3. 新規物件登録" },
  { href: "/research", title: "4. 競合物件リサーチ" },
  { href: "/research/input", title: "5. 競合物件リサーチ（入力）" },
  { href: "/research/detail", title: "6. 競合物件リサーチ（詳細入力）" },
  { href: "/research/result", title: "7. AI分析結果（競合診断）" },
  { href: "/strategy", title: "8. 販売戦略提案" },
  { href: "/monitor", title: "9. 販売モニター", mock: true },
  { href: "/monitor/0", title: "10. 物件別モニター詳細", mock: true },
  { href: "/report", title: "11. レポート出力" },
  { href: "/plan", title: "12. プラン・オプション", mock: true },
  { href: "/notice", title: "お知らせ", mock: true },
  { href: "/rules", title: "ルール表（販売戦略の判断基準）" },
];

/** Resolves the page definition for a pathname (dynamic `/monitor/[id]` maps to the detail page). */
export function findPage(pathname: string): PageDef | undefined {
  const exact = pages.find((p) => p.href === pathname);
  if (exact) return exact;
  if (pathname.startsWith("/monitor/")) return pages.find((p) => p.href === "/monitor/0");
  return undefined;
}

/** サイドバー。モック（販売モニター・お知らせ・プラン・オプション）は出さない（設計書 D27） */
export const navItems: { label: string; href: string }[] = [
  { label: "ホーム", href: "/dashboard" },
  { label: "物件一覧", href: "/dashboard#properties" },
  { label: "新規物件登録", href: "/properties/new" },
  { label: "販売戦略", href: "/strategy" },
  { label: "ルール表", href: "/rules" },
  { label: "競合物件リサーチ", href: "/research" },
  { label: "レポート", href: "/report" },
];

/** A nav item is active on its own page and on any page nested under it. */
export function isNavActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export const researchSteps: { num: number; label: string; hrefs: string[] }[] = [
  { num: 1, label: "検索条件の確認", hrefs: ["/research"] },
  { num: 2, label: "検索・入力", hrefs: ["/research/input"] },
  { num: 3, label: "競合物件", hrefs: ["/research/detail"] },
  { num: 4, label: "AI分析", hrefs: ["/research/result"] },
];
