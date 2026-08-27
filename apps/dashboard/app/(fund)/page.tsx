import { getCorpusOverview, getFundOverview } from "@wunderstack/analytics";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@wunderstack/ui";
import { auth } from "@/auth";
import { FundActivityPanels } from "@/components/fund/activity-panels";
import { FundKpiTiles } from "@/components/fund/kpi-tiles";
import { sinceDaysAgo } from "@/lib/window";

/** KPI surface — always fetch. Config tabs are cached separately. */
export const dynamic = "force-dynamic";

const WINDOW_DAYS = 30;
const dateTime = new Intl.DateTimeFormat("nl-NL", { dateStyle: "short", timeStyle: "short" });
const num = (value: number) => value.toLocaleString("nl-NL");

export default async function FundDashboard() {
  const session = await auth();
  const tenantId = session?.user?.tenantId;
  // The (fund) layout already gated this; the guard keeps types honest for the queries below.
  if (!tenantId) return null;

  const win = { fundKey: tenantId, since: sinceDaysAgo(WINDOW_DAYS) };
  const [overview, corpus] = await Promise.all([
    getFundOverview(win),
    getCorpusOverview(tenantId),
  ]);
  const { summary, unanswered, themes, log } = overview;

  return (
    <div className="flex flex-col gap-10">
      <FundKpiTiles summary={summary} windowDays={WINDOW_DAYS} />
      <FundActivityPanels
        themes={themes}
        unanswered={unanswered}
        log={log}
        showOutcomeChip
      />

      <section>
        <h3 className="mb-3 text-sm font-semibold text-text">Corpus (read-only)</h3>
        {corpus.length === 0 ? (
          <p className="text-sm text-text-subtle">Geen corpusdocumenten gevonden voor dit fonds.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Versie</TableHead>
                <TableHead>Passages</TableHead>
                <TableHead>Ingeladen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {corpus.map((doc, index) => (
                <TableRow key={`${doc.title}-${index}`}>
                  <TableCell>{doc.title}</TableCell>
                  <TableCell className="font-mono text-xs">{doc.version}</TableCell>
                  <TableCell>{num(doc.chunkCount)}</TableCell>
                  <TableCell className="whitespace-nowrap text-text-muted">
                    {dateTime.format(doc.ingestedAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}
