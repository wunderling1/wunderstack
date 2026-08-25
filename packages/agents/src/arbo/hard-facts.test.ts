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

  it("flags an ungrounded Arbowet article number (positive)", () => {
    const invented = findUngroundedFacts(
      "Dit volgt uit Arbowet artikel 3.",
      "Draag klasse-0 handschoenen bij HV-werk.",
      "welke PBM?",
    );
    assert.ok(
      invented.some((fact) => /Arbowet/i.test(fact)),
      `expected Arbowet fact, got ${JSON.stringify(invented)}`,
    );
  });

  it("accepts an Arbowet article when it is literally in the passage (negative)", () => {
    const grounding = "Zie Arbowet artikel 3 voor de zorgplicht van de werkgever.";
    assert.deepEqual(
      findUngroundedFacts("Dit volgt uit Arbowet artikel 3.", grounding, "wat zegt de catalogus?"),
      [],
    );
  });

  it("flags an ungrounded 60V claim (positive)", () => {
    const invented = findUngroundedFacts(
      "Boven 60V is het systeem gevaarlijk.",
      "Werk spanningsloos aan het HV-systeem.",
      "wanneer is het veilig?",
    );
    assert.ok(invented.some((fact) => /60\s?V/i.test(fact)), JSON.stringify(invented));
  });

  it("accepts 60V when grounded in the passage (negative)", () => {
    const grounding = "Boven 60V gelden aanvullende maatregelen.";
    assert.deepEqual(
      findUngroundedFacts("Boven 60V gelden aanvullende maatregelen.", grounding, "spanningsgrens?"),
      [],
    );
  });

  it("flags an ungrounded age-18 claim when neither catalog nor user stated 18 (positive)", () => {
    // Catalog mentions 18; this case uses a catalog WITHOUT 18 to isolate the pattern.
    const invented = findUngroundedFacts(
      "Jongeren onder de 18 jaar mogen niet alleen werken.",
      "Alleen aangewezen personen mogen aan het HV-systeem werken.",
      "mag een stagiair dit doen?",
    );
    assert.ok(invented.some((fact) => /18\s?jaar/i.test(fact)), JSON.stringify(invented));
  });

  it("accepts age 18 when grounded in the catalog (negative)", () => {
    assert.deepEqual(
      findUngroundedFacts(
        "Jongeren onder de 18 jaar zijn per definitie leek.",
        catalog,
        "mag een stagiair dit doen?",
      ),
      [],
    );
  });
});
