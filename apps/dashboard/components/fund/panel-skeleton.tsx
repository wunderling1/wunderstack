/**
 * Content-slot placeholder while a fund or agent tab's RSC payload is in flight.
 *
 * The breathing comes from `.motion-pulse` in @wunderstack/ui, not from Tailwind's `animate-pulse`:
 * motion is a token so reduced-motion is answered once, centrally (check-motion rule 4).
 */
export function PanelSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden="true">
      <div className="motion-pulse h-24 rounded-[var(--radius-card)] bg-surface-sunk" />
      <div className="motion-pulse h-40 rounded-[var(--radius-card)] bg-surface-sunk" />
      <div className="motion-pulse h-40 rounded-[var(--radius-card)] bg-surface-sunk" />
    </div>
  );
}
