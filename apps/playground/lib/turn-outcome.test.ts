import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  answeredGrounded,
  clarifiedOutcome,
  refused,
} from "@wunderstack/shared/browser";

import { isRefusedTurn } from "./turn-outcome";

describe("turn-outcome mapping (B5)", () => {
  it("classifies refused turns", () => {
    assert.equal(isRefusedTurn(refused("no_coverage")), true);
    assert.equal(isRefusedTurn(answeredGrounded()), false);
    assert.equal(isRefusedTurn(clarifiedOutcome()), false);
  });

  it("does not guess when turnOutcome is missing", () => {
    assert.equal(isRefusedTurn(undefined), false);
  });
});
