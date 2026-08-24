import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { arboProfile } from "../arbo/profile.js";
import { caoProfile } from "../cao/profile.js";
import { NOT_FOUND_MESSAGE } from "../cao/prompt.js";
import { NOT_IN_CATALOG_MESSAGE } from "../arbo/prompt.js";

describe("agent runtime profiles — specialisation snapshot", () => {
  it("locks cao profile fields that specialise the shared pipeline", () => {
    assert.equal(caoProfile.agentKey, "cao");
    assert.equal(caoProfile.notFoundMessage, NOT_FOUND_MESSAGE);
    assert.equal(caoProfile.clarify !== null, true);
    assert.equal(typeof caoProfile.clarify, "function");
    const parsed = caoProfile.questionSchema.parse({ question: "_", fund: "etd" }) as { minScore: number };
    assert.equal(parsed.minScore, 0.48);
  });

  it("locks arbo profile fields (no clarify; lower minScore; catalog refusal)", () => {
    assert.equal(arboProfile.agentKey, "arbo");
    assert.equal(arboProfile.notFoundMessage, NOT_IN_CATALOG_MESSAGE);
    assert.equal(arboProfile.clarify, null);
    const parsed = arboProfile.questionSchema.parse({ question: "_", fund: "oomt" }) as { minScore: number };
    assert.equal(parsed.minScore, 0.35);
  });

  it("runRetrieval is bound to the profile agentKey (via tools)", async () => {
    // Structural check only — do not hit the DB. The tool modules hardcode agentKey.
    assert.equal(caoProfile.runRetrieval.name, "runRetrieval");
    assert.equal(arboProfile.runRetrieval.name, "runRetrieval");
    assert.notEqual(caoProfile.runRetrieval, arboProfile.runRetrieval);
  });
});
