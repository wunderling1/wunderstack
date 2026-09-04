import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { containsHardFact, extractHardFacts, findUngroundedFacts, hasUngroundedHardFact } from "./hard-facts";

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

  // Compound-unit gap (§14): a number is a hard fact even when a compound noun sits between it and the
  // base unit — hyphenated ("120 vakantie-uren") or written together ("20 vakantiedagen").
  it("captures a hyphenated compound-unit quantity", () => {
    const facts = extractHardFacts("Je hebt recht op 120 vakantie-uren per jaar.");
    assert.ok(facts.some((fact) => fact.includes("120 vakantie-uren")), "hyphenated compound quantity");
  });

  it("captures a concatenated compound-unit quantity", () => {
    const facts = extractHardFacts("Je hebt 20 vakantiedagen.");
    assert.ok(facts.some((fact) => fact.includes("20 vakantiedagen")), "concatenated compound quantity");
  });

  // The compound prefix is hyphen-only, so a plain word that merely ENDS in a unit ("figuur" -> "uur",
  // "structuur" -> "uur") is never manufactured into a phantom fact.
  it("does not manufacture a fact from a word that merely ends in a unit", () => {
    assert.deepEqual(extractHardFacts("Bekijk 3 figuur en 2 structuur."), []);
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

/**
 * `hasUngroundedHardFact` is the shared guard/trigger decision (etd-026, decorative citation). These
 * are the FALSE-POSITIVE tests the widened guard has to pass BEFORE it ships: turning under-refusal
 * into over-refusal is nearly as damaging as fabricating, so a grounded number expressed in a
 * different-but-equivalent format must NOT be flagged. Every vector the helper cannot match is either
 * covered here as accepted (normalized) or pinned as a documented known limitation — no silent gaps.
 */
describe("hasUngroundedHardFact (false-positive guardrails)", () => {
  it("catches the decorative-citation figure (etd-026): 16 weken not in the context", () => {
    const grounding = "5.9. Wet Arbeid en Zorg. De Wet Arbeid en Zorg is van toepassing.";
    assert.equal(hasUngroundedHardFact("Je hebt recht op 16 weken zwangerschapsverlof [1].", grounding), true);
  });

  it("does not flag a grounded quantity (accepts the true positive's inverse)", () => {
    assert.equal(hasUngroundedHardFact("Een fulltimer heeft 190 uur vakantie.", "recht op 190 uur per jaar"), false);
  });

  // Format variant: percentage with/without a space. normalizeFact collapses whitespace, so "50 %"
  // in the answer matches "50%" in the context (and vice versa) — no over-flag.
  it("accepts a percentage regardless of the space before %", () => {
    assert.equal(hasUngroundedHardFact("De toeslag is 50 %.", "een toeslag van 50% geldt"), false);
    assert.equal(hasUngroundedHardFact("De toeslag is 50%.", "een toeslag van 50 % geldt"), false);
  });

  // Format variant: currency notation. A formatted amount is matched currency-insensitively, so the
  // answer's "€ 1.500,00" matches a bare "1.500,00" table cell.
  it("accepts a formatted euro amount whether or not the context prints the € sign", () => {
    assert.equal(hasUngroundedHardFact("Het bedrag is € 1.500,00 bruto.", "schaal 3: 1.500,00 per maand"), false);
  });

  // Format variant: "1500 euro" carries no € and the word "euro" is not a quantity unit, so it is not
  // a hard fact at all — the guard cannot over-flag a spelled-out currency word.
  it("does not treat a spelled-out currency word as a hard fact", () => {
    assert.equal(hasUngroundedHardFact("Je krijgt 1500 euro.", "geen enkel bedrag hier"), false);
  });

  // Derived (E13) — the case the diagnosis singled out. The INPUTS are grounded (190u fulltime, and
  // the user supplied 24u), but the self-computed pro-rata TOTAL (120 uur) is in neither: it must
  // still be flagged. This is intended E13 behavior, NOT a false positive — the safe derived answer
  // states the inputs + "naar rato" and asserts no total (next test).
  it("flags a computed pro-rata total even though its input values are grounded", () => {
    const grounding = "Een fulltimer (38 uur) heeft 190 uur vakantie; deeltijd naar rato.";
    const userSupplied = "En bij 24 uur per week?";
    assert.equal(hasUngroundedHardFact("Bij 24 uur per week is dat 120 uur.", grounding, userSupplied), true);
  });

  it("accepts the SAFE derived answer: grounded inputs + naar rato, no computed total", () => {
    const grounding = "Een fulltimer (38 uur) heeft 190 uur vakantie; deeltijd naar rato.";
    const userSupplied = "En bij 24 uur per week?";
    const safe = "Een fulltimer (38 uur) heeft 190 uur; bij 24 uur geldt dit naar rato. Je fonds rekent het exact uit.";
    assert.equal(hasUngroundedHardFact(safe, grounding, userSupplied), false);
  });

  // KNOWN LIMITATION (documented in hard-facts.ts): written-out numbers are not normalized. Pinned
  // here so the gap is explicit, not silent — if a real corpus trips it, normalize rather than widen.
  // Mitigated by retry-first + the eval's overRefusalRate ceiling.
  it("KNOWN LIMITATION: a digit figure grounded only in words reads as ungrounded", () => {
    assert.equal(hasUngroundedHardFact("Je hebt recht op 16 weken.", "recht op zestien weken verlof"), true);
  });

  // Compound-unit change (§14). The real fabrication: a self-computed pro-rata TOTAL expressed as a
  // compound ("120 vakantie-uren") whose number appears nowhere next to uur/uren in the context.
  it("flags a fabricated compound-unit pro-rata total (etd-d01: 120 vakantie-uren)", () => {
    const grounding = "5.2. Aantal vakantie-uren per jaar. Een fulltimer heeft recht op 190 uur vakantie per jaar.";
    const userSupplied = "Ik werk 24 uur per week. Op hoeveel vakantie-uren heb ik dan recht?";
    assert.equal(hasUngroundedHardFact("Je hebt recht op 120 vakantie-uren per jaar.", grounding, userSupplied), true);
    assert.equal(hasUngroundedHardFact("Bij 12 uur per week: 48 vakantie-uren.", grounding, "12 uur per week"), true);
  });

  // FALSE-POSITIVE guardrail for the compound-unit change: a GROUNDED figure phrased as a compound
  // ("190 vakantie-uren") when the context writes it plainly ("190 uur vakantie") must NOT be flagged.
  // The unit-family fallback grounds it by number + base unit, so the widening does not cause over-refusal.
  it("accepts a grounded number phrased as a compound the context writes plainly", () => {
    const grounding = "Een fulltimer heeft recht op 190 uur vakantie per jaar.";
    assert.equal(hasUngroundedHardFact("Een fulltimer heeft 190 vakantie-uren.", grounding), false);
  });

  it("accepts a grounded concatenated compound (20 vakantiedagen ~ context '20 dagen vakantie')", () => {
    const grounding = "De werknemer heeft 20 dagen vakantie per jaar.";
    assert.equal(hasUngroundedHardFact("Je hebt 20 vakantiedagen.", grounding), false);
  });

  // Space-separated adjective+unit ("104 roostervrije uren") is NOT captured (hyphen-only compound
  // prefix), so a grounded phrase like this is never flagged. Documented as the bounded known limitation:
  // a FABRICATED space-separated adjective+unit would also slip — acceptable, the pro-rata fabrications
  // that matter are the hyphenated/concatenated compounds above.
  it("KNOWN LIMITATION: space-separated adjective+unit is not treated as a hard fact", () => {
    assert.equal(hasUngroundedHardFact("Een fulltimer heeft 104 roostervrije uren.", "geen enkel getal hier"), false);
  });
});
