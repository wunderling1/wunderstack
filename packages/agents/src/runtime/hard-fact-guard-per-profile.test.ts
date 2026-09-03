import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { verifyAndBuild } from "./create-agent";
import type { RetrievalOutput } from "./profile";
import { AGENT_PROFILES } from "./registry";

/**
 * Hard-fact guard coverage per registered profile. Arbo has no G2-answer gate yet, so this
 * assert is the production promise that createGroundedAgent refuses ungrounded facts with the
 * profile's own agentKey patterns and notFoundMessage.
 */

function retrievalWithGrounding(grounding: string): RetrievalOutput {
  return {
    context: "",
    citations: [],
    hits: [],
    timings: { rewriteMs: 0, embedMs: 0, searchMs: 0, rerankMs: 0, totalMs: 0 },
    chunks: [],
    fullChunkContent: [["c1", grounding]],
    consideredCount: 0,
    aboveThresholdCount: 0,
    droppedChunks: [],
  };
}

describe("hard-fact-guard per registered profile", () => {
  for (const profile of Object.values(AGENT_PROFILES)) {
    it(`${profile.agentKey}: refuses an ungrounded hard fact with profile.notFoundMessage`, () => {
      const retrieval = retrievalWithGrounding("Er staan geen getallen in deze context.");
      // CAO patterns catch "120 uur"; arbo patterns catch "25 kg".
      const prose = profile.agentKey === "arbo" ? "Til maximaal 25 kg." : "Bij deeltijd is dat 120 uur.";
      const result = verifyAndBuild(profile, prose, retrieval, "");
      assert.equal(result.hardFactGuardTriggered, true);
      assert.equal(result.found, false);
      assert.equal(result.answer, profile.notFoundMessage);
      assert.deepEqual(result.turnOutcome, { outcome: "refused", outcomeReason: "guard_hard_fact" });
    });

    it(`${profile.agentKey}: does not refuse when the hard fact is grounded`, () => {
      const grounding =
        profile.agentKey === "arbo"
          ? "De maximale tilnorm is 25 kg per tilbeweging."
          : "Een fulltimer heeft recht op 190 uur vakantie per jaar.";
      const prose =
        profile.agentKey === "arbo" ? "De tilnorm is 25 kg." : "Een fulltimer heeft 190 uur vakantie.";
      const retrieval = retrievalWithGrounding(grounding);
      const result = verifyAndBuild(profile, prose, retrieval, "");
      // Without citations a substantive hard-fact answer trips the citation-coupling guard
      // (unverifiable), not the hard-fact guard — so hardFactGuardTriggered stays false when grounded.
      assert.equal(result.hardFactGuardTriggered, false);
    });
  }
});
