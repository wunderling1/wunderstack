/** Content-slot placeholder while a fund or agent tab's RSC payload is in flight. */
export function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="h-24 animate-pulse rounded-[var(--radius-card)] bg-surface-sunk" />
      <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface-sunk" />
      <div className="h-40 animate-pulse rounded-[var(--radius-card)] bg-surface-sunk" />
    </div>
  );
}
