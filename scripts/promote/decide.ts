/**
 * The promotion verdict, as a pure function (Fase 4 of the ingest recovery plan).
 *
 * Decision D5 revises open decision B4: a nightly `G3-fund` red does NOT block `main` — it stays
 * visibility there — but it DOES block promoting that fund. This module is where that sentence
 * becomes executable. It is kept free of file and git access so every branch is testable without a
 * repository state; `check.ts` does the reading and the printing.
 */

import type { FundGateRecord } from "@wunderstack/agents/evals/fund-ledger";

/** A structure report found on disk for the fund, with the timestamps parsed out of it. */
export interface StructureReportRef {
  path: string;
  /** When the report itself was written. */
  generatedAt: string;
  /**
   * The most recent ingest among the documents the report lists — the moment the corpus last moved.
   * Null when the report lists no stored documents (a dry-run report proves nothing about the corpus).
   */
  lastIngestAt: string | null;
}

export interface PromoteRequest {
  /** Fund as typed by the operator — matched against both the golden-set key and the database fund. */
  fund: string;
  /** What is being promoted, as typed (tag, branch or commit-ish). Shown in the verdict. */
  tag: string;
  /** The tag resolved to a commit sha, or null when it could not be resolved locally. */
  requestedCommit: string | null;
  /** Every record in the ledger; filtering by fund is part of the decision. */
  records: readonly FundGateRecord[];
  /** Structure reports for the fund of the selected record. */
  structureReports: readonly StructureReportRef[];
}

export interface Verdict {
  go: boolean;
  /** Why it is a NO-GO. Empty on GO. All applicable reasons, not just the first. */
  reasons: string[];
  /** The record the verdict is about; absent when the ledger has nothing for this fund. */
  record?: FundGateRecord;
  /** The newest structure report for the fund; absent when there is none. */
  structureReport?: StructureReportRef;
}

/** Shortest sha prefix we accept as an identification — below this, a match means nothing. */
const MIN_SHA_PREFIX = 7;

/**
 * Whether two shas identify the same commit, tolerating abbreviation on either side (the ledger
 * records what the run knew: a full `git rev-parse` sha in CI, possibly an abbreviated one locally).
 */
export function sameCommit(a: string, b: string): boolean {
  const shortest = Math.min(a.length, b.length);
  if (shortest < MIN_SHA_PREFIX) return false;
  return a.slice(0, shortest).toLowerCase() === b.slice(0, shortest).toLowerCase();
}

/** Records for this fund, accepting either the golden-set key or the database fund name. */
function recordsForFund(records: readonly FundGateRecord[], fund: string): FundGateRecord[] {
  const wanted = fund.toLowerCase();
  return records.filter(
    (record) => record.setKey.toLowerCase() === wanted || record.fund.toLowerCase() === wanted,
  );
}

function newestBy<T>(items: readonly T[], timestamp: (item: T) => string): T | undefined {
  return items.reduce<T | undefined>(
    (newest, item) =>
      newest === undefined || Date.parse(timestamp(item)) > Date.parse(timestamp(newest)) ? item : newest,
    undefined,
  );
}

/**
 * GO only when every condition holds. Anything unknown is a NO-GO: this check exists to stop a
 * promotion on missing evidence, so silence must never read as approval.
 */
export function decide(request: PromoteRequest): Verdict {
  const candidates = recordsForFund(request.records, request.fund);
  const record = newestBy(candidates, (item) => item.generatedAt);
  if (record === undefined) {
    return {
      go: false,
      reasons: [
        `Geen G3-fund-resultaat voor "${request.fund}" in de ledger. Draai de nachtelijke eval met DB (EVAL_REQUIRE_DB=1) voordat je promoveert.`,
      ],
    };
  }

  const reasons: string[] = [];

  if (record.status !== "passed") {
    const failed = record.failedChecks.length > 0 ? ` Gefaald: ${record.failedChecks.join("; ")}.` : "";
    reasons.push(`Het laatste G3-fund-resultaat is "${record.status}", niet "passed".${failed}`);
  }

  if (record.commitSha === null) {
    reasons.push(
      "Het resultaat vermeldt geen commit, dus het kan niet aan deze release worden gekoppeld.",
    );
  } else if (request.requestedCommit !== null && !sameCommit(record.commitSha, request.requestedCommit)) {
    reasons.push(
      `Het resultaat hoort bij commit ${record.commitSha.slice(0, 12)}, maar "${request.tag}" is ${request.requestedCommit.slice(0, 12)}.`,
    );
  }

  const structureReport = newestBy(request.structureReports, (item) => item.generatedAt);
  if (structureReport === undefined) {
    reasons.push(
      `Geen ingest-structuurrapport gevonden voor fonds "${record.fund}". Zonder rapport is de kwaliteit van de laatste ingest onzichtbaar.`,
    );
  } else if (structureReport.lastIngestAt === null) {
    reasons.push(
      `Het structuurrapport ${structureReport.path} noemt geen opgeslagen documenten, dus het zegt niets over het corpus waarop de gate scoorde.`,
    );
  } else if (Date.parse(structureReport.lastIngestAt) > Date.parse(record.generatedAt)) {
    // Compared against the last *ingest*, not the report's own timestamp: a read-only measurement of
    // an unchanged corpus is legitimate and must not block, while a re-ingest after the gate ran
    // means the green describes data that is no longer there.
    reasons.push(
      `Het corpus is geïngest ná de gate-run (laatste ingest ${structureReport.lastIngestAt} > run ${record.generatedAt}). Draai G3-fund opnieuw.`,
    );
  }

  const found = structureReport === undefined ? {} : { structureReport };
  return { go: reasons.length === 0, reasons, record, ...found };
}
