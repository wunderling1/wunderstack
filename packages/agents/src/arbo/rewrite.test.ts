import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { rewriteArboQuery } from "./rewrite.js";

describe("rewriteArboQuery", () => {
  it("expands ev, leerling and a bare 16 to catalog vocabulary", () => {
    const result = rewriteArboQuery("mijn leerling is 16, mag zij aan een ev werken?");
    assert.ok(result.rewritten.includes("e-voertuig"));
    assert.ok(result.rewritten.includes("elektrisch voertuig"));
    assert.ok(result.rewritten.includes("HV-systeem"));
    assert.ok(result.rewritten.includes("jongeren onder de 18 jaar leek"));
    assert.ok(result.rewritten.startsWith("mijn leerling is 16"), "original query is kept");
  });

  it("does not drop the original query when nothing matches", () => {
    const result = rewriteArboQuery("Wat is een thermal runaway?");
    assert.equal(result.rewritten, "Wat is een thermal runaway?");
    assert.deepEqual(result.expansions, []);
  });
});
