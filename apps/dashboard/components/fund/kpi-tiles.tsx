import { KpiTile } from "@wunderstack/ui";
import type { KpiSummary } from "@wunderstack/analytics";

const pct = (ratio: number) => `${Math.round(ratio * 100)}%`;
const num = (value: number) => value.toLocaleString("nl-NL");

/** Shared KPI tile grid for fund overview (admin + fund face). */
export function FundKpiTiles({
  summary,
  windowDays,
}: {
  summary: KpiSummary;
  windowDays: number;
}) {
  return (
    <section>
      <h3 className="mb-3 text-sm font-semibold text-text">Laatste {windowDays} dagen</h3>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <KpiTile label="Vragen" value={num(summary.total)} />
        <KpiTile
          label="Beantwoord met geverifieerde citaties"
          value={pct(summary.answeredWithCitationsRate)}
          hint="v1-maat: alleen geverifieerde citaties"
        />
        <KpiTile label="Verduidelijking gevraagd" value={num(summary.clarified)} />
        <KpiTile
          label="Onbeantwoord (geweigerd)"
          value={num(summary.refused)}
          hint="corpus-roadmap-signaal"
        />
      </div>
    </section>
  );
}
