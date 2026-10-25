// Single source of truth for page URLs, header titles and sidebar navigation.

export interface PageDef {
  href: string;
  title: string;
}

/** 画面の一覧（docs/設計まとめ.md の①入力と⑤レポート） */
export const pages: PageDef[] = [
  { href: "/properties/new", title: "物件情報の入力" },
  { href: "/strategy", title: "販売戦略" },
];

/** Resolves the page definition for a pathname (dynamic `/strategy/[id]` maps to the detail page). */
export function findPage(pathname: string): PageDef | undefined {
  const exact = pages.find((p) => p.href === pathname);
  if (exact) return exact;
  if (/^\/strategy\/[^/]+$/.test(pathname)) return { href: pathname, title: "販売戦略の詳細" };
  return undefined;
}

export const navItems: { label: string; href: string }[] = [
  { label: "物件情報の入力", href: "/properties/new" },
  { label: "販売戦略", href: "/strategy" },
];

/** A nav item is active on its own page and on any page nested under it. */
export function isNavActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
