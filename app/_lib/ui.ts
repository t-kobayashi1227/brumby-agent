// Shared Tailwind class strings for recurring UI patterns.

export const card = "bg-white border border-line rounded-[10px]";

export const btnPrimary = "px-5 py-2.5 bg-brand rounded-md text-white text-[13px] font-bold cursor-pointer";

/** 新しいデザイン（2026-10-26）の青い主ボタン */
export const btnAction = "flex items-center gap-1.5 rounded-lg bg-primary px-5 py-2.5 text-[13px] font-bold text-white shadow-sm cursor-pointer hover:bg-[#2459b0] disabled:opacity-60";

export const btnSecondary = "px-5 py-2.5 bg-white border border-field rounded-md text-body text-[13px] cursor-pointer";

export const tableHead = "grid gap-2 text-base px-1 pb-2 border-b border-canvas";

export const emptyState = `${card} p-10 text-center text-[13px] text-muted`;

// ---- class helpers for stateful UI parts ----

export function navItemClass(active: boolean): string {
  return `flex items-center gap-3 px-3.5 py-3 rounded-lg text-[13px] cursor-pointer text-white ${active ? "bg-white/20 font-bold" : "hover:bg-white/10"}`;
}

export function underlineTabClass(active: boolean): string {
  return `px-4 py-2.5 text-[13px] cursor-pointer ${active ? "text-brand font-bold border-b-2 border-brand" : "text-muted"}`;
}
