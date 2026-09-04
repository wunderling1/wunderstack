import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chunkArbo } from "./chunk-arbo";

describe("chunkArbo", () => {
  it("anchors numbered EV-catalog sections as sourceRef", () => {
    const text = [
      "1. Elektrische Voertuigen",
      "Inleiding over e-voertuigen boven de 60 volt.",
      "1.2. Risicobeschrijving",
      "De belangrijkste risico's zijn stroom door het lichaam en verbranding door de vlamboog.",
      "2.6. Persoonlijke beschermingsmiddelen (PBM's)",
      "Gebruik isolatiehandschoenen klasse 0 bij werkzaamheden aan het HV-systeem.",
    ].join("\n");

    const chunks = chunkArbo(text);
    const refs = chunks.map((chunk) => chunk.sourceRef);
    assert.ok(refs.some((ref) => ref?.includes("Risicobeschrijving")));
    assert.ok(refs.some((ref) => ref?.includes("Persoonlijke beschermingsmiddelen")));
    assert.equal(
      chunks.every((chunk) => chunk.sourceRef !== null),
      true,
    );
  });

  it("skips table-of-contents lines that end in a page number", () => {
    const text = ["1.  Elektrische Voertuigen  3", "Daarna volgt de echte tekst zonder kop."].join("\n");
    const chunks = chunkArbo(text);
    assert.equal(
      chunks.some((chunk) => chunk.sourceRef?.includes("Elektrische Voertuigen")),
      false,
    );
  });

  it("keeps numbered list sentences that end with a colon inside the parent section", () => {
    const text = [
      "1.2. Risicobeschrijving",
      "Let op!",
      "1. Aan de HV-batterij zelf mag alleen gewerkt worden door mensen met een getuigschrift.",
      "2. Jongeren onder de 18 jaar zijn per definitie leek en mogen:",
      "• Alleen onder toezicht aan e-voertuigen werken;",
      "Spanningsniveaus worden volgens ISO onderverdeeld.",
    ].join("\n");

    const chunks = chunkArbo(text);
    assert.equal(
      chunks.some((chunk) => chunk.sourceRef === "2. Jongeren onder de 18 jaar zijn per definitie leek en mogen:"),
      false,
    );
    const risk = chunks.find((chunk) => chunk.content.includes("Jongeren onder de 18 jaar"));
    assert.ok(risk, "the under-18 rule is in a chunk");
    assert.equal(risk.sourceRef, "1.2. Risicobeschrijving");
    assert.equal(risk.chapter, "1.2. Risicobeschrijving");
  });
});

/**
 * Regression suite for the 2026-08-23 arbo.oomt diagnosis. Every case below is a line shape taken
 * verbatim from the OOMT EV-arbocatalogus; before the heading-level fix each of them silently
 * relabelled the section it sat in, and G3-fund reported the result as a recall failure.
 *
 * The pre-existing colon test above never covered this: its list items are rejected by the length
 * and colon rules, not by any list-item logic. The shape that actually breaks is short, capitalised
 * and has no trailing colon.
 */
describe("chunkArbo — heading levels (arbeidshygiënische strategie)", () => {
  const strategy = [
    "1. Wegnemen bron",
    "2. Afscherming bron",
    "3. Organisatorische maatregelen",
    "4. Persoonlijke beschermingsmiddelen",
  ];

  it("keeps a short capitalised numbered list item inside its N.M section", () => {
    const text = [
      "2. Oplossingen",
      "2.3. Aanwijsbeleid e-voertuigen (EV- VOP, ev-VP, ev-WV) - Voorlichting en instructie",
      "Plaats arbeidshygiënische strategie",
      ...strategy,
      "Het aanwijsbeleid zoals beschreven in NEN 9140:2024 wordt uitgevoerd door de werkgever.",
      "2.4. Markeringsmiddelen",
      "Gebruik afzetlint en waarschuwingsborden rond het voertuig.",
    ].join("\n");

    const chunks = chunkArbo(text);
    const nen = chunks.find((chunk) => chunk.content.includes("NEN 9140:2024"));
    assert.ok(nen, "the NEN 9140 text is in a chunk");
    assert.equal(
      nen.chapter,
      "2.3. Aanwijsbeleid e-voertuigen (EV- VOP, ev-VP, ev-WV) - Voorlichting en instructie",
      "the strategy list must not relabel the section it sits in",
    );
    // And nothing anywhere carries a list item as its structural anchor.
    assert.equal(
      chunks.some((chunk) => strategy.includes(chunk.chapter ?? "")),
      false,
    );
  });

  it("recognises a genuine top-level chapter that has its own sub-sections", () => {
    const text = [
      "1. Elektrische Voertuigen",
      "Inleiding.",
      "1.1. Algemeen",
      "Deze catalogus geldt voor het motorvoertuigenbedrijf.",
    ].join("\n");

    const chunks = chunkArbo(text);
    const intro = chunks.find((chunk) => chunk.content.includes("Inleiding"));
    assert.ok(intro);
    assert.equal(intro.chapter, "1. Elektrische Voertuigen");
    const algemeen = chunks.find((chunk) => chunk.content.includes("motorvoertuigenbedrijf"));
    assert.ok(algemeen);
    assert.equal(algemeen.chapter, "1.1. Algemeen", "an N.M section outranks the chapter above it");
  });

  it("does not promote a list item whose number is the next chapter but has no sub-sections", () => {
    // "2. Verbranding door de vlamboog" sits inside 1.2 and is followed by 1.3 — chapter 2 starts
    // later, so the number alone must not be enough.
    const text = [
      "1.2. Risicobeschrijving",
      "De risico's zijn:",
      "1. Stroom door het lichaam",
      "2. Verbranding door de vlamboog",
      "Beide risico's treden op boven 60 volt gelijkspanning.",
      "1.3. Praktische oplossingen beschrijving",
      "Werk spanningsloos waar dat kan.",
    ].join("\n");

    const chunks = chunkArbo(text);
    const both = chunks.find((chunk) => chunk.content.includes("Beide risico's"));
    assert.ok(both);
    assert.equal(both.chapter, "1.2. Risicobeschrijving");
  });

  it("does not re-enter a chapter number that is already open", () => {
    // "2. De ev-vakbekwaam persoon" sits inside 2.3, is followed by 2.4 (prefix 2), and would pass
    // the lookahead on its own — the monotonic-chapter rule is what rejects it.
    const text = [
      "2. Oplossingen",
      "2.3. Aanwijsbeleid e-voertuigen",
      "Er zijn drie rollen:",
      "1. De ev-voldoend onderrichte persoon",
      "2. De ev-vakbekwaam persoon (ev-VP)",
      "3. De ev-werkverantwoordelijke (ev-WV)",
      "De ev-WV is eindverantwoordelijk voor de veiligheid op de werkplek.",
      "2.4. Markeringsmiddelen",
      "Gebruik afzetlint.",
    ].join("\n");

    const chunks = chunkArbo(text);
    const wv = chunks.find((chunk) => chunk.content.includes("eindverantwoordelijk"));
    assert.ok(wv);
    assert.equal(wv.chapter, "2.3. Aanwijsbeleid e-voertuigen");
  });

  it("closes the open section when a real new chapter starts", () => {
    const text = [
      "1. Elektrische Voertuigen",
      "1.6. Verwante normen",
      "NEN 3140 en NEN 9140 zijn van toepassing.",
      "2. Oplossingen",
      "Deze inleiding hoort bij hoofdstuk 2, niet bij 1.6.",
      "2.1. Spanningsloos maken HV-systeem in stappen",
      "Volg de stappen in volgorde.",
    ].join("\n");

    const chunks = chunkArbo(text);
    const intro = chunks.find((chunk) => chunk.content.includes("hoort bij hoofdstuk 2"));
    assert.ok(intro);
    assert.equal(intro.chapter, "2. Oplossingen");
  });

  it("still honours an explicit Hoofdstuk heading for catalogs that use one", () => {
    const text = [
      "Hoofdstuk 1 — Tillen en fysieke belasting",
      "Risico: tillen boven schouderhoogte",
      "Til nooit meer dan 25 kilo zonder hulpmiddel.",
    ].join("\n");

    const chunks = chunkArbo(text);
    const rule = chunks.find((chunk) => chunk.content.includes("25 kilo"));
    assert.ok(rule);
    assert.equal(
      rule.chapter,
      "Hoofdstuk 1 — Tillen en fysieke belasting",
      "a risico heading anchors its own chunk but must not become the chapter",
    );
  });
});
