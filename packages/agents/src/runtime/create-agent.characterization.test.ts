import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { arboProfile } from "../arbo/profile";
import { NOT_IN_CATALOG_MESSAGE } from "../arbo/prompt";
import { caoProfile } from "../cao/profile";
import type { AgentStreamEvent } from "../types";
import { createGroundedAgent, followUpSpanName } from "./create-agent";
import type { AgentRuntimeProfile, RetrievalOutput } from "./profile";

/**
 * Characterization: arbo empty-retrieval stream must stay byte-identical to the pre-profile
 * pipeline (status → text → citations → done). Generate is never reached on this path.
 */

const EMPTY_RETRIEVAL: RetrievalOutput = {
  context: "",
  citations: [],
  hits: [],
  timings: { rewriteMs: 0, embedMs: 0, searchMs: 0, rerankMs: 0, totalMs: 0 },
  chunks: [],
  fullChunkContent: [],
  consideredCount: 0,
  aboveThresholdCount: 0,
  droppedChunks: [],
  progressFound: [],
  progressDropped: [],
  usedPassageCount: 0,
};

const EMPTY_RETRIEVAL_EVENT = {
  type: "retrieval" as const,
  corpus: { label: "bronnen", version: "" },
  considered: 0,
  aboveThreshold: 0,
  used: 0,
  hits: [] as { label: string; dropped: boolean }[],
};

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/** Recorded 24 Aug 2026 against arbo/agent.ts before createGroundedAgent (empty-hit stream). */
function arboEmptyHitStream(question: string): AgentStreamEvent[] {
  return [
    { type: "status", phase: "searching" },
    { ...EMPTY_RETRIEVAL_EVENT, query: question },
    { type: "text", delta: NOT_IN_CATALOG_MESSAGE },
    {
      type: "citations",
      found: false,
      needsClarification: false,
      turnOutcome: { outcome: "refused", outcomeReason: "no_coverage" },
      retrievedCount: 0,
      topScore: null,
      citations: [],
      citationVerificationFailed: false,
      answer: NOT_IN_CATALOG_MESSAGE,
    },
    { type: "done", usage: ZERO_USAGE, traceId: null },
  ];
}
describe("arbo characterization — empty retrieval stream", () => {
  it("emits the same events as the pre-refactor arbo agent (no clarify, catalog refusal)", async () => {
    const question = "Wat is de maximale tilnorm?";
    const profile: AgentRuntimeProfile = {
      ...arboProfile,
      runRetrieval: async () => EMPTY_RETRIEVAL,
    };
    const agent = createGroundedAgent(profile);
    const events: AgentStreamEvent[] = [];
    for await (const event of agent.answerStream({
      question,
      fund: "oomt",
    })) {
      events.push(event);
    }
    assert.deepEqual(events, arboEmptyHitStream(question));
  });

  it("does not run clarify for a salary-shaped question (clarify: null)", async () => {
    const question = "Hoeveel verdien ik?";
    let retrieved = false;
    const profile: AgentRuntimeProfile = {
      ...arboProfile,
      runRetrieval: async () => {
        retrieved = true;
        return EMPTY_RETRIEVAL;
      },
    };
    const agent = createGroundedAgent(profile);
    const events: AgentStreamEvent[] = [];
    for await (const event of agent.answerStream({
      question,
      fund: "oomt",
    })) {
      events.push(event);
    }
    assert.equal(retrieved, true);
    assert.equal(
      events.some((event) => event.type === "citations" && event.needsClarification === true),
      false,
    );
    assert.deepEqual(events, arboEmptyHitStream(question));
  });
});

describe("Langfuse follow-up span names (unchanged)", () => {
  it("cao profile yields cao-follow-ups; arbo yields arbo-follow-ups", () => {
    // Production helper used at create-agent.ts startModelCall — do not inline a different format.
    assert.equal(followUpSpanName(caoProfile.agentKey), "cao-follow-ups");
    assert.equal(followUpSpanName(arboProfile.agentKey), "arbo-follow-ups");
  });
});
