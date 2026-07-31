/**
 * `pnpm --filter @wunderstack/promote record <eval-report.json>` — turn a stored run artefact into
 * promotion ledger lines (Fase 4 of the ingest recovery plan).
 *
 * The eval already appends its own records when it finishes, so this exists for the run that happens
 * somewhere else: the nightly CI job uploads `eval-report.json` as an artefact and cannot commit to
 * the repository, so the ledger line has to be derived afterwards from the downloaded artefact. Same
 * derivation function as the eval uses, so a replayed line is identical to a live one — and appending
 * is idempotent, so replaying a run the ledger already holds changes nothing.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { appendFundRecords, fundRecordsFromReport } from "@wunderstack/agents/evals/fund-ledger";
import type { LedgerSource } from "@wunderstack/agents/evals/fund-ledger";
import { z } from "zod";

/** Only the fields the ledger derives from — an artefact is a file, so it is a boundary to validate. */
const sourceSchema = z.object({
  generatedAt: z.string().min(1),
  commitSha: z.string().nullable(),
  gates: z.array(
    z.object({
      id: z.string(),
      layer: z.string(),
      title: z.string(),
      status: z.enum(["passed", "failed", "skipped"]),
      checks: z.array(z.object({ name: z.string(), ok: z.boolean(), detail: z.string().optional() })),
    }),
  ),
  funds: z.array(
    z.object({
      key: z.string(),
      fund: z.string(),
      corpusVersion: z.string(),
    }),
  ),
}) satisfies z.ZodType<unknown>;

async function main(): Promise<void> {
  const { positionals } = parseArgs({ allowPositionals: true, options: {} });
  const [artefact] = positionals;
  if (artefact === undefined) {
    console.error("Gebruik: pnpm --filter @wunderstack/promote record <pad naar eval-report.json>");
    process.exitCode = 2;
    return;
  }

  const parsed = sourceSchema.safeParse(JSON.parse(await readFile(resolve(artefact), "utf8")));
  if (!parsed.success) {
    console.error(`Artefact ${artefact} heeft niet de verwachte vorm: ${z.prettifyError(parsed.error)}`);
    process.exitCode = 2;
    return;
  }

  // The schema validates the fields the ledger reads; the fund layers carry more fields than these,
  // which is why the parsed object is widened back to the source type rather than replacing it.
  const records = fundRecordsFromReport(parsed.data as unknown as LedgerSource);
  if (records.length === 0) {
    console.log("Geen fondslagen in dit artefact — niets toe te voegen.");
    return;
  }

  const { path, appended } = appendFundRecords(records);
  console.log(`${String(appended)} van ${String(records.length)} fondsregel(s) toegevoegd aan ${path}`);
  for (const record of records) {
    console.log(`  ${record.setKey} · ${record.status} · corpus ${record.corpusVersion} · ${record.generatedAt}`);
  }
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  await main();
}
