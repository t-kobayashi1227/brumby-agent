"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems, isNavActive } from "../_lib/routes";
import { navItemClass } from "../_lib/ui";

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="print:hidden w-52.5 shrink-0 bg-ink text-[#c9d3e3] py-5 flex flex-col">
      <div className="px-4.5 pb-5 border-b border-[#26365a] mb-3">
        <Link href="/dashboard" className="flex items-center justify-center">
          <Image src="/brumby_logo_mark_white.png" alt="BRUMBY AI物件販売戦略" width={132} height={88} className="h-20 w-auto" loading="eager" />
        </Link>
      </div>
      {navItems.map((item) => (
        <Link key={item.label} href={item.href} className={navItemClass(isNavActive(item.href, pathname))}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
