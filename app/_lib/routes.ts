// Single source of truth for page URLs, header titles and sidebar navigation.

import { ChartIcon, DocIcon } from "../_components/icons";

export interface PageDef {
  href: string;
  title: string;
  /** 画面の中に自前の見出しを持つ（ヘッダーには題名を出さない） */
  ownHeading?: boolean;
}

/** 画面の一覧（docs/設計まとめ.md の①入力と⑤レポート） */
export const pages: PageDef[] = [
  { href: "/properties/new", title: "物件情報の入力", ownHeading: true },
  { href: "/strategy", title: "販売戦略" },
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

export const navItems: { label: string; href: string; icon: (p: { className?: string }) => React.ReactNode }[] = [
  { label: "物件情報の入力", href: "/properties/new", icon: DocIcon },
  { label: "販売戦略", href: "/strategy", icon: ChartIcon },
];

/** A nav item is active on its own page and on any page nested under it. */
export function isNavActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
