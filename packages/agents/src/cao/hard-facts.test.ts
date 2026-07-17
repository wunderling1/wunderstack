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

  // Regression: baseline v4 etd-030. The user said "58"; the answer pairs it with an implicit unit
  // ("58 jaar"). It is a premise once passed as userSupplied, not an invented fact.
  it("whitelists a user-supplied number even when the answer adds an implicit unit", () => {
    const invented = findUngroundedFacts(
      "Bij 58 jaar heb je recht op twee dagen.",
      "55 t/m 59 jaar: twee dagen",
      "En hoeveel extra dagen krijg ik als ik 58 ben?",
    );
    assert.deepEqual(invented, []);
  });

  // Regression: baseline v4 etd-012. The salary table lists the amount bare; the answer prefixes "€".
  it("matches a formatted amount currency-insensitively", () => {
    const invented = findUngroundedFacts(
      "Een 19-jarige verdient € 1.281,19 per maand.",
      "19 jaar: 1.164,71 / 1.222,95 / 1.281,19",
    );
    assert.deepEqual(invented, []);
  });

  it("still flags a fabricated formatted amount that is not in the grounding", () => {
    const invented = findUngroundedFacts("Het salaris is € 9.999,99 per maand.", "19 jaar: 1.281,19");
    assert.ok(invented.some((fact) => fact.includes("9.999,99")), "the invented amount is flagged");
  });

  it("keeps a bare round euro amount strict (no separator, no currency-insensitive rescue)", () => {
    // "€ 190" must not be excused just because "190" appears as an unrelated quantity in grounding.
    const invented = findUngroundedFacts("De vergoeding is € 190.", "recht op 190 uur vakantie");
    assert.ok(invented.some((fact) => fact.includes("190")), "the bare euro amount stays flagged");
  });
});
