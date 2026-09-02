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

/**
 * Placeholder for one streaming section of a page. Each Suspense boundary on the overview shows
 * this until its own reads land, so the chrome and the sections that are ready are not held back
 * by the slowest query on the page.
 */
export function SectionSkeleton({ blocks = 2 }: { blocks?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden="true">
      <div className="motion-pulse h-4 w-32 rounded-[var(--radius-control)] bg-surface-sunk" />
      {Array.from({ length: blocks }, (_, index) => (
        <div
          key={index}
          className="motion-pulse h-20 rounded-[var(--radius-card)] bg-surface-sunk"
        />
      ))}
    </div>
  );
}
