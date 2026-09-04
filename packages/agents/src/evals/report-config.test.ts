import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildReportConfig, reportConfigFromEnv } from "./report-config";

describe("reportConfigFromEnv", () => {
  it("records generationSamples in the artefact config (non-default value)", () => {
    const config = buildReportConfig({
      requireAll: false,
      judgeSamples: 3,
      generationSamples: 7,
      writeBaseline: false,
      onlyGates: ["G2-answer"],
      tier: "nightly",
      contentGatesBlocking: true,
      pathScope: [],
    });
    assert.equal(config.generationSamples, 7);
    assert.equal(config.tier, "nightly");
  });

  it("reportConfigFromEnv always includes generationSamples", () => {
    const config = reportConfigFromEnv({
      requireAll: false,
      onlyGates: [],
      tier: "merge",
      contentGatesBlocking: true,
      pathScope: [],
    });
    assert.equal(typeof config.generationSamples, "number");
    assert.ok(config.generationSamples >= 1);
  });
});
