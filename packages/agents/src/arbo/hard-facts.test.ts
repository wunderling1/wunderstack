import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { findUngroundedFacts, hasUngroundedHardFact } from "./hard-facts.js";

describe("findUngroundedFacts (arbo)", () => {
  const catalog = "Jongeren onder de 18 jaar zijn per definitie leek en mogen alleen onder toezicht werken.";

  it("flags a quantity that is in neither the catalog nor the question", () => {
    const invented = findUngroundedFacts("Wacht 10 uur voor de ontlading.", catalog, "mag zij aan een ev werken?");
    assert.ok(invented.some((fact) => fact.includes("10 uur")), "ungrounded duration");
  });

  it("whitelists a user-supplied age even when the answer adds 'jaar'", () => {
    const invented = findUngroundedFacts(
      "Een leerling van 16 jaar is jonger dan 18 jaar en is per definitie leek.",
      catalog,
      "mijn leerling is 16, mag zij aan een ev werken?",
    );
    assert.deepEqual(invented, []);
  });

  it("does not treat 16 jaar as grounded when the user never said 16", () => {
    assert.equal(
      hasUngroundedHardFact(
        "Een leerling van 16 jaar mag alleen onder toezicht werken.",
        catalog,
        "mag een minderjarige aan een ev werken?",
      ),
      true,
    );
  });
});
