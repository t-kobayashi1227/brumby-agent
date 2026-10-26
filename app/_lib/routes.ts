// Single source of truth for page URLs, header titles and sidebar navigation.

import { GearIcon, ListIcon } from "../_components/icons";

export interface PageDef {
  href: string;
  title: string;
  /** 画面の中に自前の見出しを持つ（ヘッダーには題名を出さない） */
  ownHeading?: boolean;
}

/** 画面の一覧（docs/設計まとめ.md の①入力と⑤レポート、物件一覧、設定） */
export const pages: PageDef[] = [
  { href: "/properties", title: "物件一覧" },
  { href: "/properties/new", title: "物件情報の入力", ownHeading: true },
  { href: "/settings", title: "設定" },
];

/** Resolves the page definition for a pathname (dynamic `/strategy/[id]` maps to the detail page). */
export function findPage(pathname: string): PageDef | undefined {
  const exact = pages.find((p) => p.href === pathname);
  if (exact) return exact;
  if (/^\/strategy\/[^/]+$/.test(pathname)) return { href: pathname, title: "販売戦略の詳細" };
  if (/^\/properties\/\d+$/.test(pathname)) return { href: pathname, title: "物件情報の入力（登録した物件）" };
  if (/^\/properties\/\d+\/facts$/.test(pathname)) return { href: pathname, title: "事実シート" };
  return undefined;
}

export interface NavItem {
  label: string;
  href: string;
  icon: (p: { className?: string }) => React.ReactNode;
  /** href の下の画面のほかに、選択中にする画面（先頭一致） */
  alsoActive?: string[];
}

// 販売戦略のレポート（/strategy/[id]）は物件ごとの画面なので、「物件一覧」を選択中にする
export const navItems: NavItem[] = [
  { label: "物件一覧", href: "/properties", icon: ListIcon, alsoActive: ["/strategy"] },
  { label: "設定", href: "/settings", icon: GearIcon },
];

const underPath = (base: string, pathname: string) => pathname === base || pathname.startsWith(`${base}/`);

/** A nav item is active on its own page and on any page nested under it. */
export function isNavActive(item: Pick<NavItem, "href" | "alsoActive">, pathname: string): boolean {
  return underPath(item.href, pathname) || (item.alsoActive ?? []).some((base) => underPath(base, pathname));
}
