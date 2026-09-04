import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { caoProfile } from "../cao/profile";
import { clarifiedOutcome, refused } from "@wunderstack/shared";
import { createGroundedAgent } from "./create-agent";
import type { AgentRuntimeProfile, RetrievalOutput } from "./profile";

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

describe("turn outcome classification — pipeline paths", () => {
  it("routes salary clarification before retrieval as clarified/ambiguous_query", async () => {
    const agent = createGroundedAgent(caoProfile);
    const result = await agent.answer({
      question: "Hoeveel verdien ik per maand?",
      fund: "eval",
    });
    assert.equal(result.needsClarification, true);
    assert.deepEqual(result.turnOutcome, clarifiedOutcome());
    assert.notEqual(result.turnOutcome.outcome, "refused");
    assert.equal(result.retrievedCount, 0);
    assert.equal(result.topScore, null);
  });

  it("routes empty retrieval as refused/no_coverage", async () => {
    const profile: AgentRuntimeProfile = {
      ...caoProfile,
      runRetrieval: async () => EMPTY_RETRIEVAL,
    };
    const agent = createGroundedAgent(profile);
    const result = await agent.answer({
      question: "Wat is de jubileumgratificatie?",
      fund: "eval",
    });
    assert.deepEqual(result.turnOutcome, refused("no_coverage"));
    assert.equal(result.retrievedCount, 0);
    assert.equal(result.topScore, null);
  });
});
