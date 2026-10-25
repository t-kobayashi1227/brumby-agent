"use client";

import { usePathname } from "next/navigation";
import { researchSteps } from "../_lib/routes";
import { stepClass } from "../_lib/ui";

export default function ResearchSteps() {
  const pathname = usePathname();
  return (
    <div className="flex gap-2 mb-5">
      {researchSteps.map((s) => (
        <div key={s.num} className={stepClass(s.hrefs.includes(pathname))}>
          {s.num}. {s.label}
        </div>
      ))}
    </div>
  );
}
