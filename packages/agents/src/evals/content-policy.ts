/**
 * Content policy — which eval checks measure pipeline mechanism vs scaffold-content quality.
 *
 * Pure (no I/O, no side effects), same shape as answer-floors.ts. Classification follows the source
 * labels already documented in docs/eval/GATE-ARCHITECTURE.md §3 and restated per threshold in
 * roleplay-floors.ts:
 *
 *   [X] — external/governance, binary by nature → mechanism (blocks everywhere)
 *   [C] — conservative-provisional, with a recalibration trigger → content (advisory on the PR path)
 *
 * That is not a softening: a threshold that itself says "promote to [X] when the detector has
 * survived a few real runs" is by definition not yet a merge-blocker on scaffold content.
 *
 * Two deliberate exceptions, named here rather than bent silently:
 *   1. maxEndFlagMismatchCount is labelled [C] in roleplay-floors.ts but stays mechanism — a
 *      reply/flag mismatch reaches the learner's LMS, so it blocks on every tier.
 *   2. Grounded thresholds whose §3 label lives only in GATE-ARCHITECTURE.md (not in
 *      answer-floors.ts) are classified by the table below; missing labels are a doc debt for PR 5.
 *
 * Import direction: this module imports the threshold objects. Floors modules must NOT import this
 * file — advisory is applied in cao.eval.ts / roleplay-gates.ts to avoid a cycle.
 */

import { ANSWER_THRESHOLDS } from "./answer-floors.js";
import { ROLEPLAY_THRESHOLDS } from "./roleplay-floors.js";

/** What a check measures. mechanism = the pipeline keeps its promise. content = the text is good enough. */
export type CheckKind = "mechanism" | "content";

/**
 * Exhaustive over ANSWER_THRESHOLDS: every threshold is classified exactly once.
 * Record<keyof typeof ANSWER_THRESHOLDS, CheckKind> fails the compile when a threshold is forgotten.
 */
export const ANSWER_CHECK_KIND = {
  hardHallucination: "mechanism",
  maxOrphanRate: "mechanism",
  maxUnverifiedCount: "mechanism",
  maxDanglingCount: "mechanism",
  maxUnderRefusalCount: "mechanism",
  maxOverRefusalRate: "mechanism",
  refusalCalibration: "mechanism",
  softFaithfulness: "content",
  relevance: "content",
  completeness: "content",
  citationCorrectness: "content",
} as const satisfies Record<keyof typeof ANSWER_THRESHOLDS, CheckKind>;

/**
 * Exhaustive over ROLEPLAY_THRESHOLDS. maxEndFlagMismatchCount is the named exception: [C] label,
 * mechanism kind — see module doc.
 */
export const ROLEPLAY_CHECK_KIND = {
  maxGenerationFailureCount: "mechanism",
  maxPersonaBreakCount: "mechanism",
  maxEarlyRevealCount: "mechanism",
  maxPrematureEndCount: "mechanism",
  maxMissingReviewCount: "mechanism",
  maxPassFlipCount: "mechanism",
  maxShapeFailureCount: "mechanism",
  maxOrderingViolations: "mechanism",
  maxEndFlagMismatchCount: "mechanism", // [C] label but blocks: mismatch reaches the learner LMS
  minInRoleScore: "content",
  maxScoreSpread: "content",
} as const satisfies Record<keyof typeof ROLEPLAY_THRESHOLDS, CheckKind>;

/** Where the eval is running. Missing/unknown → nightly (strict is the safe default). */
export type EvalTier = "pr" | "merge" | "nightly";

export function resolveTier(raw: string | undefined): EvalTier {
  if (raw === "pr" || raw === "merge" || raw === "nightly") {
    return raw;
  }
  return "nightly";
}

/** Content-checks block everywhere except the PR path. */
export function contentGatesBlocking(tier: EvalTier): boolean {
  return tier !== "pr";
}

/** Only the PR path may omit gates because of path-scope. */
export function pathScopeAllowed(tier: EvalTier): boolean {
  return tier === "pr";
}

/**
 * Sentinel written by `scripts/ci/resolve-path-scope.sh` when a PR diff touches neither grounded
 * nor roleplay surfaces. Distinct from an empty `EVAL_PATH_SCOPE` (full registry on push/merge).
 */
export const PATH_SCOPE_NONE = "none";

/** Split `EVAL_PATH_SCOPE` into ids. Empty string → `[]` (full registry). `"none"` → `["none"]`. */
export function parsePathScopeIds(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/** True when the scope is the docs-/untouched-PR sentinel (G2 not-applicable; G1 still runs). */
export function isPathScopeNone(scope: readonly string[]): boolean {
  return scope.length === 1 && scope[0] === PATH_SCOPE_NONE;
}

/** True when a check of this kind should be advisory (WARN, not FAIL) under the given tier. */
export function isAdvisory(kind: CheckKind, tier: EvalTier): boolean {
  return kind === "content" && !contentGatesBlocking(tier);
}
