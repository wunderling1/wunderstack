import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { roleplayErrorMessage } from "./errors.js";

describe("roleplayErrorMessage", () => {
  it("translates the codes a learner can actually hit", () => {
    assert.equal(roleplayErrorMessage("scenario_not_found"), "Dit scenario is niet beschikbaar.");
    assert.equal(roleplayErrorMessage("session_ended"), "Dit gesprek is al afgelopen.");
    assert.match(roleplayErrorMessage("no_turns_left"), /geen beurten/);
    assert.match(roleplayErrorMessage("invalid_lti_token"), /LMS-sessie/);
  });

  it("does not print an English identifier for an unknown code", () => {
    const message = roleplayErrorMessage("no_agent_instance");
    assert.doesNotMatch(message, /no_agent_instance/);
    assert.match(message, /Er ging iets mis/);
  });
});
