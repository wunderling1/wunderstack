/**
 * Promotion ledger (Fase 4 of the ingest recovery plan). A nightly `G3-fund` result lived only in the
 * console and in `eval-report.json` — and that artefact is gitignored and overwritten by the next
 * run, so nothing could answer "is fund X allowed to be promoted?" an hour later. This module appends
 * one durable line per fund per run to a fixed location; `scripts/promote/check.ts` reads it back and
 * turns it into a GO/NO-GO.
 *
 * Deliberately an append-only JSONL in the repo, not a service or a database table (decision D2): it
 * is the cheapest thing that makes the answer auditable, and it needs no infrastructure to read. The
 * review moment is when several funds start re-ingesting often (decision D1).
 *
 * CI is the writer of the committed ledger (nightly/push bot-commit). Locally and on PR runs the
 * append still updates the workspace copy for promote-check, but PR runs must not leave git diffs
 * on `docs/eval/gate-results/` — see `shouldPersistFundLedger` in `cao.eval.ts`.
 *
 * Fail-closed: after append, `verifyFundRecordsRecorded` ensures every passed G3-fund outcome is
 * readable back from disk. A green fund gate without a ledger line fails the run.
 */

import { execFileSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import type { EvalReport, GateStatus } from "./report-writer";

/**
 * The part of a run artefact the ledger needs. Narrower than `EvalReport` on purpose: a stored
 * artefact can be replayed into the ledger by validating only these four fields, instead of having to
 * reconstruct the whole report shape.
 */
export type LedgerSource = Pick<EvalReport, "gates" | "funds" | "commitSha" | "generatedAt">;

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");

/** Fixed location. Committed, so the promotion answer survives the next run and a fresh clone. */
export const LEDGER_DIR = join(repoRoot, "docs", "eval", "gate-results");
export const LEDGER_PATH = join(LEDGER_DIR, "g3-fund.jsonl");

/** Bump when the record shape changes in a breaking way; the reader refuses versions it knows nothing about. */
export const FUND_LEDGER_SCHEMA_VERSION = 1;

/**
 * One `G3-fund` outcome for one fund, from one run. `commitSha` is what ties a green to something
 * promotable — a record that cannot identify itself is treated as NO-GO by the reader.
 */
export interface FundGateRecord {
  schemaVersion: number;
  kind: "g3-fund";
  /** Golden-set key, e.g. "etd-full". */
  setKey: string;
  /** Database fund key the set was scored against, e.g. "elektronische-detailhandel". */
  fund: string;
  /** Catalog agent key for this fund set, e.g. "cao" | "arbo". */
  agentKey: string;
  corpusVersion: string;
  status: GateStatus;
  /** Names of the checks that did not pass — the reason a NO-GO can be explained without the artefact. */
  failedChecks: string[];
  commitSha: string | null;
  /** ISO timestamp of the run that produced this record. */
  generatedAt: string;
  /** Where the full artefact for this run was written, for traceability. */
  runArtefact: string;
}

/**
 * The commit this run measured. `GITHUB_SHA` in CI, local `HEAD` otherwise. The artefact used to
 * record `null` locally, which made a local green unusable as promotion evidence: it could not say
 * what it was green *about*.
 */
export function resolveCommitSha(githubSha?: string | null): string | null {
  if (githubSha !== undefined && githubSha !== null && githubSha !== "") return githubSha;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim() || null;
  } catch {
    return null;
  }
}

/**
 * Derive the ledger records from a finished run. Pure, so the mapping is testable without an eval
 * run and a stored artefact can be replayed into the ledger.
 *
 * Each per-fund gate is matched to its fund by id prefix (`G3-fund [<setKey> `), never by parsing the
 * fund out of the human-readable title. The trailing space keeps a key from matching a longer key
 * that starts with it ("etd" vs "etd-full").
 */
export function fundRecordsFromReport(report: LedgerSource): FundGateRecord[] {
  return report.funds.map((fund) => {
    const gate = report.gates.find((candidate) => candidate.id.startsWith(`G3-fund [${fund.key} `));
    const failedChecks = gate?.checks.filter((check) => !check.ok).map((check) => check.name) ?? [];
    return {
      schemaVersion: FUND_LEDGER_SCHEMA_VERSION,
      kind: "g3-fund" as const,
      setKey: fund.key,
      fund: fund.fund,
      agentKey: fund.agentKey,
      corpusVersion: fund.corpusVersion,
      // A fund layer without a gate cannot be called passed; it is recorded as unrun so the reader
      // refuses it instead of silently dropping the fund from the ledger.
      status: gate?.status ?? "skipped",
      failedChecks: gate === undefined ? ["gate result missing from run artefact"] : failedChecks,
      commitSha: report.commitSha,
      generatedAt: report.generatedAt,
      runArtefact: relative(repoRoot, join(repoRoot, "packages", "agents", "eval-report.json")),
    };
  });
}

/**
 * Identity of one outcome: which fund set, from which run, on which commit. Used to keep the ledger
 * idempotent — the eval appends its own records, and CI replays the uploaded artefact through the
 * same path, so the same outcome can legitimately arrive twice.
 */
function identity(record: FundGateRecord): string {
  return `${record.setKey}|${record.generatedAt}|${record.commitSha ?? ""}`;
}

/** The records not already in `existing`. Pure, so idempotency is testable without touching disk. */
export function unrecorded(
  existing: readonly FundGateRecord[],
  incoming: readonly FundGateRecord[],
): FundGateRecord[] {
  const seen = new Set(existing.map(identity));
  return incoming.filter((record) => !seen.has(identity(record)));
}

/** Records already in the ledger. Unparseable lines are ignored here; the reader reports on those. */
export function readFundLedger(ledgerPath: string = LEDGER_PATH): FundGateRecord[] {
  try {
    return readFileSync(ledgerPath, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "")
      .flatMap((line) => {
        try {
          return [JSON.parse(line) as FundGateRecord];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

function readExisting(): FundGateRecord[] {
  return readFundLedger(LEDGER_PATH);
}

/**
 * Append records that are not in the ledger yet. Returns the repo-relative path and how many lines
 * were added.
 */
export function appendFundRecords(records: readonly FundGateRecord[]): { path: string; appended: number } {
  const relativePath = relative(repoRoot, LEDGER_PATH);
  if (records.length === 0) return { path: relativePath, appended: 0 };
  try {
    const fresh = unrecorded(readExisting(), records);
    if (fresh.length === 0) return { path: relativePath, appended: 0 };
    mkdirSync(LEDGER_DIR, { recursive: true });
    appendFileSync(LEDGER_PATH, `${fresh.map((record) => JSON.stringify(record)).join("\n")}\n`, "utf8");
    return { path: relativePath, appended: fresh.length };
  } catch (error) {
    console.error(`[fund-ledger] failed to append to ${relativePath}:`, error instanceof Error ? error.message : error);
    return { path: relativePath, appended: 0 };
  }
}

/**
 * After append, every passed fund outcome must be readable from the ledger. Idempotent replays
 * (0 appended, record already present) still pass.
 */
export function verifyFundRecordsRecorded(
  records: readonly FundGateRecord[],
  ledgerPath: string = LEDGER_PATH,
): { ok: boolean; missing: string[] } {
  const passed = records.filter((record) => record.status === "passed");
  if (passed.length === 0) {
    return { ok: true, missing: [] };
  }
  const seen = new Set(readFundLedger(ledgerPath).map(identity));
  const missing = passed.filter((record) => !seen.has(identity(record))).map((record) => record.setKey);
  return { ok: missing.length === 0, missing };
}
