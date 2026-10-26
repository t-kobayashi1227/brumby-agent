"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { navItems, isNavActive } from "../_lib/routes";
import { navItemClass } from "../_lib/ui";

export default function Sidebar() {
  const pathname = usePathname();
  return (
    <nav className="print:hidden w-52.5 shrink-0 bg-linear-to-b from-[#2d6fe6] via-[#3f84f0] to-[#6aa6f7] text-white py-5 px-2.5 flex flex-col">
      <div className="px-2 pb-6 mb-2">
        <Link href="/strategy" className="flex items-center justify-center">
          <Image src="/brumby_logo_mark_white.png" alt="BRUMBY AI物件販売戦略" width={132} height={88} className="h-16 w-auto" loading="eager" />
        </Link>
      </div>
      <div className="grid gap-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link key={item.label} href={item.href} className={navItemClass(isNavActive(item.href, pathname))}>
              <Icon className="size-5 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
