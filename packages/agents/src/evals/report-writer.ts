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
// v1: initial (E9). v2: retrievalIntegration (E11). v3: funds[] (E12).
// v4: AnswerReport.cases carry id/question/answerRaw so under-refusal / citation failures are inspectable (Tier B).
// v5: AnswerCaseReport carries finishReason + answerChars (truncation diagnostic, Gate C close-out).
// v6: gate registry (four-layer model) — GateReport gains id/layer/title + a THREE-valued status
//     ("passed" | "failed" | "skipped"); the old boolean `passed`/`name` fields are replaced so a
//     skipped gate can never masquerade as passed (docs/eval/GATE-ARCHITECTURE.md §4.2).
// v7: FundLayerReport.cases — per-case verdict/rank/retrieved refs for the fund layer, so a red fund
//     gate is diagnosable from the artefact instead of only as an aggregate (arbo.oomt, 2026-08-23).
// v8: FundLayerReport.documents — the corpus a fund actually held when it was measured. A fund that
//     silently gained a second CAO read as a ranking collapse and left no trace in the artefact
//     (elektronische-detailhandel, 2026-08-24).
export const EVAL_REPORT_SCHEMA_VERSION = 8;

export interface ReportCheck {
  name: string;
  ok: boolean;
  detail?: string;
  /** Explicit N/A (neither pass nor skip) — see EvalCheck.na. */
  na?: boolean;
}

/** Gate outcome. `skipped` is a first-class status — a gate that could not run is NEVER `passed`. */
export type GateStatus = "passed" | "failed" | "skipped";

export interface GateReport {
  /** Stable G-identifier, e.g. "G2-retrieval" (per-fund gates append " [key]"). */
  id: string;
  /** Layer of the four-layer model: G1 CONTRACT / G2 GEDRAG / G3 PRODUCTIE. */
  layer: string;
  /** Human-readable description shown in the console and artefact. */
  title: string;
  status: GateStatus;
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

/**
 * Per-case Gate C record. Extends the scores with the raw inputs/outputs so a failed run can be
 * diagnosed without regenerating (Tier B — under-refusal and citation failures were previously
 * invisible once the aggregate was written).
 */
export interface AnswerCaseReport extends CaseScores {
  id: string;
  question: string;
  answerRaw: string;
  /**
   * Provider finish reason of the chosen generation attempt (`stop`, `length`, …). Distinguishes a
   * dropped closing bracket (etd-012 at ~65 tokens, finish=stop) from a maxTokens truncation.
   */
  finishReason: string | null;
  /** Character length of answerRaw — companion truncation diagnostic. */
  answerChars: number;
}

export interface AnswerReport {
  aggregate: AggregateScores;
  cases: AnswerCaseReport[];
}

export interface RecallThresholds {
  hitAt1: number;
  recallAt3: number;
  recallAt5: number;
  mrr: number;
}

/**
 * Gate B-integration (E11): the REAL retrieval pipeline (rewrite -> pgvector -> rerank -> assemble)
 * measured against ingested fixtures on the nightly job. `thresholds` are recorded on every run so
 * the provisional bar is visible as a trend (measure ~2 weeks, then tighten). `minScoreGuard` tracks
 * the refuse-without-LLM check: how many out-of-corpus probes returned 0 hits at the production
 * minScore floor.
 */
export interface RetrievalIntegrationReport {
  fund: string;
  queries: number;
  topK: number;
  minScore: number;
  metrics: RecallSnapshot;
  thresholds: RecallThresholds;
  minScoreGuard: {
    probes: number;
    empty: number;
    required: number;
  };
}

/**
 * Fund layer (E12) — per fund-specific golden set, scored against the REAL ingested corpus of that
 * fund via the integration path (retrieveContext), matched on article/lid. Reported SEPARATELY from
 * the base (corpus-agnostic) scores so a fund's correctness is a distinct, per-corpus trend. Each
 * fund set carries its own `corpusVersion` (independent of the base one). `refusalGuard` tracks the
 * minScore refuse-without-LLM check: how many out-of-corpus probes returned 0 hits.
 *
 * `unscoredNearMissCases` is deliberate bookkeeping, not a metric: the set's `refusal` cases describe
 * intended refusal behaviour that this layer cannot score (it runs no answer scoring), so the count
 * travels with the report instead of disappearing. See `docs/eval/BESLUIT-refusal-guard-2026-07-31.md`.
 */
/** One fund case's outcome: matched at a rank, present-but-unranked, or absent from the corpus. */
export interface FundCaseDiagnosis {
  id: string;
  expectedRef: string | null;
  verdict: "hit" | "unranked" | "label-only";
  rank: number | null;
  retrievedRefs: string[];
}

export interface FundLayerReport {
  key: string;
  fund: string;
  agentKey: string;
  corpusVersion: string;
  fixtureHash: string;
  answerableQueries: number;
  metrics: RecallSnapshot;
  thresholds: RecallThresholds;
  refusalGuard: {
    probes: number;
    empty: number;
    required: number;
  };
  /** The documents the fund's corpus actually held at measurement time (composition guard). */
  documents: { title: string; version: string }[];
  unscoredNearMissCases: number;
  /**
   * Per-case diagnosis (2026-08-23). Without it a red fund gate is a single aggregate number and
   * every explanation for it is a guess — which is exactly what arbo.oomt's 0.500 cost. `label-only`
   * means the expected ref exists nowhere in the fund (fixture/ingest), `unranked` means it exists
   * but this question never surfaced it (retrieval).
   */
  cases: FundCaseDiagnosis[];
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
  retrievalIntegration: RetrievalIntegrationReport | null;
  answer: AnswerReport | null;
  /** Per-fund correctness layers (E12); empty when no fund set ran (e.g. no DB on the PR hot path). */
  funds: FundLayerReport[];
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
