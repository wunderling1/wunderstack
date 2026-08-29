import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { scoreHardHallucination } from "./judge.js";

describe("scoreHardHallucination — per-agent patterns", () => {
  it("cao patterns flag ungrounded labour-law euros; arbo patterns do not", () => {
    const prose = "Het salaris bedraagt € 2500 bruto per maand.";
    assert.equal(scoreHardHallucination(prose, [], "", "cao").score, 0);
    assert.equal(scoreHardHallucination(prose, [], "", "arbo").score, 1);
  });

  it("arbo patterns flag ungrounded kg; cao patterns do not", () => {
    const prose = "Het maximaal toegestane gewicht is 25 kg.";
    assert.equal(scoreHardHallucination(prose, [], "", "arbo").score, 0);
    assert.equal(scoreHardHallucination(prose, [], "", "cao").score, 1);
  });
});
