import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { arboProfile } from "../arbo/profile";
import { caoProfile } from "../cao/profile";
import { NOT_FOUND_MESSAGE } from "../cao/prompt";
import { NOT_IN_CATALOG_MESSAGE, OUT_OF_SCOPE_MESSAGE } from "../arbo/prompt";

describe("agent runtime profiles — specialisation snapshot", () => {
  it("locks cao profile fields that specialise the shared pipeline", () => {
    assert.equal(caoProfile.agentKey, "cao");
    assert.equal(caoProfile.notFoundMessage, NOT_FOUND_MESSAGE);
    assert.equal(caoProfile.outOfScopeMessage, null);
    assert.equal(caoProfile.clarify !== null, true);
    assert.equal(typeof caoProfile.clarify, "function");
    const parsed = caoProfile.questionSchema.parse({ question: "_", fund: "etd" }) as { minScore: number };
    assert.equal(parsed.minScore, 0.48);
  });

  it("locks arbo profile fields (no clarify; lower minScore; catalog refusal)", () => {
    assert.equal(arboProfile.agentKey, "arbo");
    assert.equal(arboProfile.notFoundMessage, NOT_IN_CATALOG_MESSAGE);
    assert.equal(arboProfile.outOfScopeMessage, OUT_OF_SCOPE_MESSAGE);
    assert.doesNotMatch(OUT_OF_SCOPE_MESSAGE, /CAO-agent/);
    assert.equal(arboProfile.clarify, null);
    const parsed = arboProfile.questionSchema.parse({ question: "_", fund: "oomt" }) as { minScore: number };
    assert.equal(parsed.minScore, 0.35);
  });

  it("runRetrieval is bound per profile (cao shares grounded helper; arbo wraps rewrite)", async () => {
    assert.equal(caoProfile.runRetrieval.name, "runGroundedRetrieval");
    assert.equal(arboProfile.runRetrieval.name, "runRetrieval");
    assert.notEqual(caoProfile.runRetrieval, arboProfile.runRetrieval);
  });
});
