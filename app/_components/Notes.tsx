// Small annotation lines shared across pages (data sources, manual-entry hints, future-feature banner).

/** "出典：…" line shown at the bottom of every analysis panel. */
export function SourceNote({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`text-[11px] text-muted ${className}`}>出典：{children}</div>;
}

/** Marks figures that are entered by hand (or by the BRUMBY support service), not collected automatically. */
export function ManualEntryNote({ className = "" }: { className?: string }) {
  return <span className={`text-[11px] text-muted ${className}`}>手入力／BRUMBY代行で更新</span>;
}

/** Banner for screens that only become available after launch (roadmap Step 3). */
export function FutureFeatureNotice() {
  return (
    <div className="mb-4 rounded-md border border-[#c9d6f0] bg-[#eef3fc] px-3.5 py-2 text-xs text-[#2d4a8a]">
      販売開始後（Step 3）に提供予定の機能のイメージです
    </div>
  );
}

/** "将来提供" pill for options that are not part of the initial release. */
export function FutureBadge() {
  return <span className="ml-1.5 inline-block rounded-full bg-divider border border-line px-2 py-px text-[10px] font-bold text-muted align-middle">将来提供</span>;
}
