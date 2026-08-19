/**
 * `pnpm promote-check <fonds> <tag>` — hard GO/NO-GO before promoting a fund (Fase 4 of the ingest
 * recovery plan).
 *
 * Answers one question: may this fund be promoted at this tag? It says yes only when the nightly
 * `G3-fund` gate passed for that fund, the result identifies the commit being promoted, and the
 * corpus has not been re-ingested since the gate scored it. Exit code 0 = GO, 1 = NO-GO, so it works
 * as a step in a script as well as a checklist line.
 *
 * Reads only committed evidence: the promotion ledger written by the eval run, and the ingest
 * structure reports. No database, no network — a promotion check that needs credentials is a
 * promotion check that gets skipped.
 */

import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { LEDGER_PATH, FUND_LEDGER_SCHEMA_VERSION } from "@wunderstack/agents/evals/fund-ledger";
import type { FundGateRecord } from "@wunderstack/agents/evals/fund-ledger";
import { z } from "zod";

import { decide, type StructureReportRef, type Verdict } from "./decide.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INGEST_REPORT_DIR = join(repoRoot, "docs", "eval", "ingest");

/**
 * The ledger is a file written by another process, so it is a boundary: parse it, never trust it.
 * A malformed or future-version line must not be silently treated as evidence.
 */
const recordSchema = z.object({
  schemaVersion: z.number(),
  kind: z.literal("g3-fund"),
  setKey: z.string().min(1),
  fund: z.string().min(1),
  /** Absent on ledger lines written before the second agent; those runs were CAO-only. */
  agentKey: z.string().min(1).default("cao"),
  corpusVersion: z.string(),
  status: z.enum(["passed", "failed", "skipped"]),
  failedChecks: z.array(z.string()),
  commitSha: z.string().nullable(),
  generatedAt: z.string(),
  runArtefact: z.string(),
}) satisfies z.ZodType<FundGateRecord>;

interface LoadedLedger {
  records: FundGateRecord[];
  /** Lines the reader refused, with the reason — reported so a broken ledger is visible, not ignored. */
  rejected: string[];
}

/**
 * Read the ledger. The path is a parameter so the whole read-decide path is testable against a
 * fixture directory; `main` always passes the fixed location, so there is no way to point the command
 * at a friendlier ledger from the outside.
 */
export async function loadLedger(ledgerPath: string = LEDGER_PATH): Promise<LoadedLedger> {
  let raw: string;
  try {
    raw = await readFile(ledgerPath, "utf8");
  } catch {
    return { records: [], rejected: [] };
  }

  const records: FundGateRecord[] = [];
  const rejected: string[] = [];
  for (const [index, line] of raw.split("\n").entries()) {
    if (line.trim() === "") continue;
    const lineNumber = index + 1;
    let json: unknown;
    try {
      json = JSON.parse(line);
    } catch {
      rejected.push(`regel ${String(lineNumber)}: geen geldige JSON`);
      continue;
    }
    const parsed = recordSchema.safeParse(json);
    if (!parsed.success) {
      rejected.push(`regel ${String(lineNumber)}: ${parsed.error.issues[0]?.message ?? "onbekend schema"}`);
      continue;
    }
    if (parsed.data.schemaVersion > FUND_LEDGER_SCHEMA_VERSION) {
      rejected.push(
        `regel ${String(lineNumber)}: schemaVersion ${String(parsed.data.schemaVersion)} is nieuwer dan deze check kent (${String(FUND_LEDGER_SCHEMA_VERSION)})`,
      );
      continue;
    }
    records.push(parsed.data);
  }
  return { records, rejected };
}

/** `**Gegenereerd:** <ISO>` from the report header — a real timestamp, unlike the file's mtime. */
export function parseReportTimestamp(markdown: string): string | null {
  const match = /^>\s*\*\*Gegenereerd:\*\*\s*(\S+)/m.exec(markdown);
  return match?.[1] ?? null;
}

/**
 * The most recent "Laatste ingest" in the report's document table, as an ISO instant.
 *
 * The report renders that column as `toISOString().slice(0, 19).replace("T", " ")` — UTC, but without
 * a zone marker. Parsing it as-is would make Node read it as local time and shift it by the offset,
 * which in the worst case turns "ingested after the gate ran" into "before". The `Z` is put back.
 */
export function parseLastIngest(markdown: string): string | null {
  const stamps = [...markdown.matchAll(/^\|[^|]*\|[^|]*\|\s*(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})\s*\|/gm)].map(
    (match) => `${match[1] ?? ""}T${match[2] ?? ""}Z`,
  );
  if (stamps.length === 0) return null;
  return stamps.reduce((newest, stamp) => (Date.parse(stamp) > Date.parse(newest) ? stamp : newest));
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Structure reports for one fund: `INGEST-<fund>-<date>[-label].md`. The date is required in the
 * pattern so a fund name that is a prefix of another one cannot pick up the wrong reports.
 */
export async function findStructureReports(
  fund: string,
  reportDir: string = INGEST_REPORT_DIR,
): Promise<StructureReportRef[]> {
  let entries: string[];
  try {
    entries = await readdir(reportDir);
  } catch {
    return [];
  }
  const pattern = new RegExp(`^INGEST-${escapeForRegex(fund)}-\\d{4}-\\d{2}-\\d{2}(-.*)?\\.md$`);
  const found: StructureReportRef[] = [];
  for (const entry of entries) {
    if (!pattern.test(entry)) continue;
    const path = join(reportDir, entry);
    const markdown = await readFile(path, "utf8");
    const generatedAt = parseReportTimestamp(markdown);
    if (generatedAt === null) continue;
    found.push({ path: relative(repoRoot, path), generatedAt, lastIngestAt: parseLastIngest(markdown) });
  }
  return found;
}

/** Resolve a tag/branch/commit-ish to a commit sha. Null when git cannot resolve it. */
function resolveCommitish(tag: string): string | null {
  try {
    return execFileSync("git", ["rev-parse", `${tag}^{commit}`], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim() || null;
  } catch {
    return null;
  }
}

function printVerdict(fund: string, tag: string, verdict: Verdict, rejected: readonly string[]): void {
  const header = verdict.go ? "GO" : "NO-GO";
  console.log(`\n${header} — fonds "${fund}" @ ${tag}\n`);

  if (verdict.record !== undefined) {
    const record = verdict.record;
    console.log(
      `  G3-fund   ${record.status} · set "${record.setKey}" · fonds "${record.fund}" · agent "${record.agentKey}"`,
    );
    console.log(`  corpus    ${record.corpusVersion}`);
    console.log(`  run       ${record.generatedAt} · commit ${record.commitSha ?? "(onbekend)"}`);
    console.log(`  artefact  ${record.runArtefact}`);
  }
  if (verdict.structureReport !== undefined) {
    console.log(`  ingest    laatste ingest ${verdict.structureReport.lastIngestAt ?? "(onbekend)"}`);
    console.log(`  rapport   ${verdict.structureReport.path}`);
  }

  if (rejected.length > 0) {
    console.log("\n  Ledger-regels geweigerd:");
    for (const reason of rejected) console.log(`    - ${reason}`);
  }

  if (verdict.go) {
    console.log("\n  Alle promotievoorwaarden gehaald.\n");
    return;
  }
  console.log("\n  Blokkerend:");
  for (const reason of verdict.reasons) console.log(`    - ${reason}`);
  console.log("");
}

async function main(): Promise<void> {
  const { positionals } = parseArgs({ allowPositionals: true, options: {} });
  const [fund, tag] = positionals;
  if (fund === undefined || tag === undefined) {
    console.error("Gebruik: pnpm promote-check <fonds> <tag>");
    console.error('Bijvoorbeeld: pnpm promote-check demo v0.3.0   ·   pnpm promote-check etd-full HEAD');
    process.exitCode = 2;
    return;
  }

  const { records, rejected } = await loadLedger();
  const candidate = records.find(
    (record) => record.setKey.toLowerCase() === fund.toLowerCase() || record.fund.toLowerCase() === fund.toLowerCase(),
  );
  const structureReports = candidate === undefined ? [] : await findStructureReports(candidate.fund);

  const verdict = decide({
    fund,
    tag,
    requestedCommit: resolveCommitish(tag),
    records,
    structureReports,
  });

  printVerdict(fund, tag, verdict, rejected);
  process.exitCode = verdict.go ? 0 : 1;
}

if (import.meta.url === `file://${process.argv[1] ?? ""}`) {
  await main();
}
