import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chunkArbo } from "./chunk-arbo.js";

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
