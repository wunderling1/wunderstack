import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { getAgent, listAgents, resetAgentCache } from "../catalog";
import { agentQuestionSchema } from "../types";
import { createGroundedAgent } from "./create-agent";
import type { AgentRuntimeProfile, RetrievalOutput } from "./profile";
import { registerTestAgentProfile } from "./registry";

/**
 * Guards the promise of the shared-runtime series: agent 3 is a profile row, not a third
 * `agent.ts` / eval entrypoint. No production file is added for the fixture beyond this test.
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

describe("agent-3-is-a-profile-row (not a third agent.ts)", () => {
  it("registers a fixture profile without a new production agent module and serves it via catalog", async () => {
    const fixtureProfile: AgentRuntimeProfile = {
      agentKey: "fixture-agent-3",
      label: "Fixture agent 3",
      description: "Test-only third agent proving the profile seam",
      systemInstructions: "Antwoord alleen uit de fixture-context.",
      buildAnswerPrompt: (context, question) => `${context}\n\nVraag: ${question}`,
      notFoundMessage: "Niet in de fixture-catalogus.",
      outOfScopeMessage: null,
      unverifiableMessage: "Antwoord niet verifieerbaar.",
      questionSchema: agentQuestionSchema.extend({
        minScore: z.number().min(0).max(1).default(0.4),
      }),
      runRetrieval: async () => EMPTY_RETRIEVAL,
      clarify: null,
    };

    const unregister = registerTestAgentProfile(fixtureProfile);
    resetAgentCache();
    try {
      const listed = listAgents().find((entry) => entry.id === "fixture-agent-3");
      assert.ok(listed, "listAgents() must surface the fixture profile");
      assert.equal(listed.label, "Fixture agent 3");

      const viaCatalog = getAgent("fixture-agent-3");
      const viaFactory = createGroundedAgent(fixtureProfile);
      assert.equal(typeof viaCatalog.answer, "function");
      assert.equal(typeof viaFactory.answerStream, "function");

      const answered = await viaCatalog.answer({ question: "Test?", fund: "demo" });
      assert.equal(answered.found, false);
      assert.equal(answered.answer, "Niet in de fixture-catalogus.");
    } finally {
      unregister();
      resetAgentCache();
    }

    assert.equal(
      listAgents().some((entry) => entry.id === "fixture-agent-3"),
      false,
      "fixture must unregister",
    );
  });
});
