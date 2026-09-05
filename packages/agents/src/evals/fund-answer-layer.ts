/**
 * Deterministic answer-quality checks for G3-fund when a corpus is fund-reviewed (F4).
 * Pure functions only — live generation stays in cao.eval.ts.
 */

import type { RetrievedChunk } from "@wunderstack/rag";

import { resolveHardFactAgentKey } from "../hard-facts";

import type { GoldenCase, GoldenFundCase, GoldenPassage } from "./golden-set";
import {
  answerRefuses,
  scoreCitationVerification,
  scoreHardHallucination,
} from "./judge";
import type { ReportCheck } from "./report-writer";

export interface FundAnswerCaseServed {
  testCase: GoldenFundCase;
  rawAnswer: string;
  passages: GoldenPassage[];
  userSupplied: string;
}

/** Answer layer runs on fund-reviewed corpora, never on the PR hot path (B5). */
export function shouldRunFundAnswerLayer(
  contentStatus: "scaffold" | "starter" | "fund-reviewed",
  tier: "pr" | "merge" | "nightly",
): boolean {
  return contentStatus === "fund-reviewed" && tier !== "pr";
}

export function chunksToPassages(chunks: RetrievedChunk[]): GoldenPassage[] {
  return chunks.map((chunk) => ({
    id: chunk.chunkId,
    source: chunk.source.title,
    content: chunk.content,
    article: chunk.structure.article ?? undefined,
    lid: chunk.structure.lid ?? undefined,
    chunkType: (chunk.structure.chunkType === "table" ? "table" : "text") as GoldenPassage["chunkType"],
  }));
}

export function fundAnswerLayerChecks(
  setKey: string,
  agentKey: string,
  notFoundMessage: string,
  served: FundAnswerCaseServed[],
  outOfScopeMessage?: string | null,
): ReportCheck[] {
  if (served.length === 0) {
    return [];
  }

  const hardFactKey = resolveHardFactAgentKey(agentKey);
  let danglingCaseCount = 0;
  let unverifiableCaseCount = 0;
  let hardFactCaseCount = 0;
  let underRefusalCount = 0;
  const nearMissCount = served.filter((item) => item.testCase.category === "refusal").length;

  for (const item of served) {
    const asGoldenCase = item.testCase as GoldenCase;
    const { verification, danglingMarkerRate, prose } = scoreCitationVerification(
      item.rawAnswer,
      asGoldenCase,
      item.passages,
    );
    if (danglingMarkerRate > 0) {
      danglingCaseCount += 1;
    }
    if (verification === 0) {
      unverifiableCaseCount += 1;
    }
    if (scoreHardHallucination(prose, item.passages, item.userSupplied, hardFactKey).score === 0) {
      hardFactCaseCount += 1;
    }
    if (item.testCase.category === "refusal" && !answerRefuses(prose, notFoundMessage, outOfScopeMessage)) {
      underRefusalCount += 1;
    }
  }

  return [
    {
      name: `fund "${setKey}" answer: dangling markers — 0 of ${String(served.length)} cases`,
      ok: danglingCaseCount === 0,
      detail: `${String(danglingCaseCount)} case(s) with dangling marker(s)`,
    },
    {
      name: `fund "${setKey}" answer: unverifiable citations — 0 of ${String(served.length)} cases`,
      ok: unverifiableCaseCount === 0,
      detail: `${String(unverifiableCaseCount)} case(s) with unverified citation(s)`,
    },
    {
      name: `fund "${setKey}" answer: hard-fact guard — no ungrounded hard facts`,
      ok: hardFactCaseCount === 0,
      detail: `${String(hardFactCaseCount)} case(s) with ungrounded hard fact(s)`,
    },
    {
      name: `fund "${setKey}" answer: refusal hygiene — all ${String(nearMissCount)} near-miss cases refused`,
      ok: underRefusalCount === 0,
      detail: `${String(underRefusalCount)} of ${String(nearMissCount)} near-miss case(s) answered instead of refusing`,
    },
  ];
}
