import type { PropertyStatus } from "./data";

// Shared Tailwind class strings for recurring UI patterns.

export const card = "bg-white border border-line rounded-[10px]";

export const fieldLabel = "text-[13px] text-body";

export const input = "w-full mt-1 px-3 py-[9px] border border-field rounded-md text-[13px]";

export const checkLabel = "flex gap-1.5 text-[13px] text-body";

export const btnPrimary = "px-5 py-2.5 bg-brand rounded-md text-white text-[13px] font-bold cursor-pointer";

export const btnSecondary = "px-5 py-2.5 bg-white border border-field rounded-md text-body text-[13px] cursor-pointer";

export const tableHead = "grid gap-2 text-base px-1 pb-2 border-b border-canvas";

export const statBox = "bg-subtle rounded-lg";

export const emptyState = `${card} p-10 text-center text-[13px] text-muted`;

export const stripePlaceholder = "bg-stripes flex items-center justify-center font-mono text-muted";

// ---- class helpers for stateful UI parts ----

const statusClasses: Record<PropertyStatus, string> = {
  注意: "bg-[#fef3c2] text-[#92610d]",
  要改善: "bg-[#fde2e1] text-[#b91c1c]",
  順調: "bg-[#dcf5df] text-[#157347]",
};

export function badgeClass(status: PropertyStatus): string {
  return `inline-block px-2.5 py-1 rounded-full text-sm font-bold ${statusClasses[status] ?? ""}`;
}

const statusPillActiveClasses: Record<PropertyStatus, string> = {
  注意: "bg-[#92610d] text-white",
  要改善: "bg-[#b91c1c] text-white",
  順調: "bg-[#157347] text-white",
};

export function monitorFilterPillClass(key: string, active: boolean): string {
  if (key === "all") return pillFilterClass(active);
  const status = key as PropertyStatus;
  const base = "px-4 py-1.5 rounded-full text-xs cursor-pointer font-bold border border-transparent";
  return `${base} ${active ? statusPillActiveClasses[status] : statusClasses[status]}`;
}

export function navItemClass(active: boolean): string {
  return `block px-5 py-3 text-[13px] cursor-pointer ${active ? "bg-brand text-white font-bold" : "text-[#a8b2c8]"}`;
}

export function stepClass(active: boolean): string {
  return `px-4 py-2 rounded-md text-xs font-bold ${active ? "bg-brand text-white" : "bg-white text-muted border border-line"}`;
}

export function compTabClass(active: boolean): string {
  return `px-4.5 py-2 rounded-t-md text-[13px] cursor-pointer ${active ? "bg-brand text-white font-bold" : "bg-divider text-body"}`;
}

export function underlineTabClass(active: boolean): string {
  return `px-4 py-2.5 text-[13px] cursor-pointer ${active ? "text-brand font-bold border-b-2 border-brand" : "text-muted"}`;
}

export function pillFilterClass(active: boolean): string {
  return `px-4 py-1.5 rounded-full text-xs cursor-pointer ${active ? "bg-brand text-white font-bold" : "bg-white text-body border border-field"}`;
}

export function budgetButtonClass(active: boolean): string {
  return `px-4.5 py-[9px] rounded-md text-[13px] cursor-pointer ${active ? "bg-brand text-white font-bold" : "bg-white text-body border border-field"}`;
}

export function planCardClass(selected: boolean): string {
  return `bg-white border-2 rounded-[10px] p-5 ${selected ? "border-brand" : "border-line"}`;
}

export function planButtonClass(selected: boolean): string {
  return `w-full p-2.5 rounded-md text-[13px] font-bold cursor-pointer ${selected ? "bg-brand text-white" : "bg-white text-brand border border-brand"}`;
}
