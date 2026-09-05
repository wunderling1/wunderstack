import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { z } from "zod";

import { agentQuestionSchema } from "../types";
import { createGroundedAgent } from "./create-agent";
import type { AgentRuntimeProfile, RetrievalOutput } from "./profile";
import { retrievalInputSchema } from "./retrieval";

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

describe("pipeline passes profile.agentKey into retrieval (F1-08)", () => {
  it("supplies agentKey: probe from the profile, not a hardcoded cao literal", async () => {
    const seenKeys: string[] = [];
    const profile: AgentRuntimeProfile = {
      agentKey: "probe",
      label: "Probe",
      description: "Test-only profile proving agentKey flows from the pipeline",
      systemInstructions: "Fixture.",
      buildAnswerPrompt: (context, question) => `${context}\n${question}`,
      notFoundMessage: "Niet gevonden.",
      outOfScopeMessage: null,
      unverifiableMessage: "Niet verifieerbaar.",
      questionSchema: agentQuestionSchema.extend({
        minScore: z.number().min(0).max(1).default(0.4),
      }),
      runRetrieval: async (input) => {
        seenKeys.push(String(input.agentKey));
        assert.equal(input.agentKey, "probe");
        return EMPTY_RETRIEVAL;
      },
      clarify: null,
    };

    const agent = createGroundedAgent(profile);
    await agent.answer({ question: "Probe vraag?", fund: "demo" });

    assert.deepEqual(seenKeys, ["probe"]);
  });

  it("retrievalInputSchema requires agentKey", () => {
    const parsed = retrievalInputSchema.safeParse({
      query: "x",
      fund: "demo",
      topK: 1,
      minScore: 0,
    });
    assert.equal(parsed.success, false);
  });
});
