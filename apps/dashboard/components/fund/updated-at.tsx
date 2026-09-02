const time = new Intl.DateTimeFormat("nl-NL", { timeStyle: "short" });

/**
 * When these numbers were read.
 *
 * The Client Router Cache holds a KPI page for `staleTimes.dynamic` seconds, so a tab you return to
 * can be a little older than the moment you are looking at it. That is worth the instant
 * navigation, but only if the page says so rather than implying "now".
 */
export function UpdatedAt({ at }: { at: Date }) {
  return (
    <p className="text-xs text-text-subtle">
      Bijgewerkt om <time dateTime={at.toISOString()}>{time.format(at)}</time>
    </p>
  );
}
