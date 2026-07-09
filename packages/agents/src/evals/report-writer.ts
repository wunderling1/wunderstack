/**
 * Per-run eval artefact (Fase E9). Console output alone leaves no history and nothing to show a
 * fund; a run must leave a downloadable, machine-readable record. This module owns the shape of
 * `eval-report.json` and writes it to the package root, from where CI uploads it as an artifact
 * (on every run, including failures — see .github/workflows/ci.yml).
 *
 * Deliberately dependency-free (only node:fs + local types) so it can be written even when a gate
 * threw mid-run: the writer must never be the reason a report is missing.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { AggregateScores, CaseScores } from "./judge.js";

const reportPath = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "eval-report.json");

/** Current on-disk schema version — bump when the report shape changes in a breaking way. */
export const EVAL_REPORT_SCHEMA_VERSION = 1;

export interface ReportCheck {
  name: string;
  ok: boolean;
  detail?: string;
}

export interface GateReport {
  name: string;
  passed: boolean;
  checks: ReportCheck[];
}

export interface RecallSnapshot {
  hitAt1: number;
  recallAt3: number;
  recallAt5: number;
  mrr: number;
}

export interface RetrievalReport {
  embeddingDim: number;
  passages: number;
  queries: number;
  before: RecallSnapshot;
  after: RecallSnapshot;
  rerank: {
    reranked: number;
    skipped: number;
    failed: number;
    total: number;
    mrrDeltaOnReranked: number;
  };
}

export interface AnswerReport {
  aggregate: AggregateScores;
  cases: CaseScores[];
}

export interface EvalReport {
  schemaVersion: number;
  generatedAt: string;
  commitSha: string | null;
  corpusVersion: string;
  passed: boolean;
  config: {
    requireAll: boolean;
    judgeSamples: number;
    writeBaseline: boolean;
  };
  models: {
    generator: string;
    judge: string;
    embedding: string | null;
    rerank: string | null;
  };
  gates: GateReport[];
  retrieval: RetrievalReport | null;
  answer: AnswerReport | null;
  judge: {
    parseRetryCount: number;
  };
}

/**
 * Write the report to disk (pretty-printed JSON). Returns the absolute path. Never throws for a
 * serialization problem — a run that already failed must not be masked by a broken artefact write;
 * instead it logs and returns the path it attempted.
 */
export function writeEvalReport(report: EvalReport): string {
  try {
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  } catch (error) {
    console.error(`[eval-report] failed to write ${reportPath}:`, error instanceof Error ? error.message : error);
  }
  return reportPath;
}
