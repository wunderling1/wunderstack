const date = new Intl.DateTimeFormat("nl-NL", { dateStyle: "long" });

/** D6: blocks that split on outcome_reason must say when measurement started. */
export function MeasurementNote({ startedAt }: { startedAt: Date | null }) {
  return (
    <p className="text-xs text-text-subtle">
      {startedAt
        ? `Meting gestart op ${date.format(startedAt)}. Rijen zonder uitkomstrede tellen niet mee in deze splitsing.`
        : "Meting nog niet gestart. Historische rijen hebben geen uitkomstrede en tellen niet mee in deze splitsing."}
    </p>
  );
}
