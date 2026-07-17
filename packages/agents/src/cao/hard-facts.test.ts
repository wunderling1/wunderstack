import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { containsHardFact, extractHardFacts, findUngroundedFacts } from "./hard-facts.js";

describe("extractHardFacts", () => {
  it("extracts money, percentages and quantities-with-unit", () => {
    const facts = extractHardFacts("Je krijgt € 6,25 netto, een toeslag van 25% en 190 uur vakantie.");
    assert.ok(facts.some((fact) => fact.includes("6,25")), "money amount");
    assert.ok(facts.some((fact) => fact.includes("25%")), "percentage");
    assert.ok(facts.some((fact) => fact.includes("190 uur")), "quantity + unit");
  });

  it("ignores inline citation markers so [1] is not read as a quantity", () => {
    assert.deepEqual(extractHardFacts("Dat klopt [1] en ook [2]."), []);
  });

  it("finds no hard facts in a plain refusal", () => {
    assert.equal(
      containsHardFact("Ik kan dit niet terugvinden in de CAO-documenten. Neem contact op met je fonds."),
      false,
    );
  });

  it("flags a bare euro amount as a hard fact", () => {
    assert.equal(containsHardFact("De vergoeding bedraagt € 6,25 netto."), true);
  });
});

describe("findUngroundedFacts", () => {
  it("passes a fact that appears verbatim in the grounding", () => {
    assert.deepEqual(findUngroundedFacts("Een fulltimer heeft 190 uur vakantie.", "recht op 190 uur vakantie per jaar"), []);
  });

  it("flags a computed pro-rata total that is not in the grounding", () => {
    const invented = findUngroundedFacts("Bij deeltijd is dat 120 uur.", "een fulltimer heeft 190 uur; deeltijd naar rato");
    assert.ok(invented.some((fact) => fact.includes("120 uur")), "the invented 120 uur is flagged");
  });

  it("treats a number the user supplied as grounding (not a hallucination)", () => {
    // The user said "24 uur"; echoing it back is a premise, not an invented fact.
    assert.deepEqual(findUngroundedFacts("Bij 24 uur per week geldt naar rato.", "naar rato --- ik werk 24 uur per week"), []);
  });
});
