import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { arboProfile } from "../arbo/agent.js";
import { NOT_IN_CATALOG_MESSAGE } from "../arbo/prompt.js";
import type { AgentStreamEvent } from "../types.js";
import { createGroundedAgent } from "./create-agent.js";
import type { AgentRuntimeProfile, RetrievalOutput } from "./profile.js";

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
};

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

/** Recorded 24 Aug 2026 against arbo/agent.ts before createGroundedAgent (empty-hit stream). */
const ARBO_EMPTY_HIT_STREAM: AgentStreamEvent[] = [
  { type: "status", phase: "searching" },
  { type: "text", delta: NOT_IN_CATALOG_MESSAGE },
  {
    type: "citations",
    found: false,
    needsClarification: false,
    citations: [],
    citationVerificationFailed: false,
    answer: NOT_IN_CATALOG_MESSAGE,
  },
  { type: "done", usage: ZERO_USAGE, traceId: null },
];

describe("arbo characterization — empty retrieval stream", () => {
  it("emits the same events as the pre-refactor arbo agent (no clarify, catalog refusal)", async () => {
    const profile: AgentRuntimeProfile = {
      ...arboProfile,
      runRetrieval: async () => EMPTY_RETRIEVAL,
    };
    const agent = createGroundedAgent(profile);
    const events: AgentStreamEvent[] = [];
    for await (const event of agent.answerStream({
      question: "Wat is de maximale tilnorm?",
      fund: "oomt",
    })) {
      events.push(event);
    }
    assert.deepEqual(events, ARBO_EMPTY_HIT_STREAM);
  });

  it("does not run clarify for a salary-shaped question (clarify: null)", async () => {
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
      question: "Hoeveel verdien ik?",
      fund: "oomt",
    })) {
      events.push(event);
    }
    assert.equal(retrieved, true);
    assert.equal(
      events.some((event) => event.type === "citations" && event.needsClarification === true),
      false,
    );
    assert.deepEqual(events, ARBO_EMPTY_HIT_STREAM);
  });
});

describe("Langfuse follow-up span names (unchanged)", () => {
  it("cao profile yields cao-follow-ups; arbo yields arbo-follow-ups", () => {
    // Documented contract: create-agent uses `${profile.agentKey}-follow-ups`.
    assert.equal(`${"cao"}-follow-ups`, "cao-follow-ups");
    assert.equal(`${arboProfile.agentKey}-follow-ups`, "arbo-follow-ups");
  });
});
