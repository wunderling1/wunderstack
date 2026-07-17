import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { CITATIONS_SENTINEL } from "./generation-schema.js";
import { parseGenerationOutput } from "./parse-generation.js";

function withCitations(prose: string, block: string): string {
  return `${prose}\n${CITATIONS_SENTINEL}\n${block}`;
}

describe("parseGenerationOutput citation block", () => {
  it("parses a clean single array", () => {
    const raw = withCitations(
      "Antwoord [1].",
      '[{"marker":1,"chunk_id":"adv","quote":"104 roostervrije uren"}]',
    );
    const parsed = parseGenerationOutput(raw);
    assert.equal(parsed.citationParseFailed, false);
    assert.equal(parsed.modelCitations.length, 1);
    assert.equal(parsed.modelCitations[0]?.chunkId, "adv");
  });

  // Regression: the raw shapes below all failed the old first-[/last-] parser (baseline v4 cases
  // etd-004/005/007/011/014/d01/d03). Each must now recover the first balanced array.
  it("tolerates a trailing empty array (etd-004/005)", () => {
    const raw = withCitations(
      "Antwoord [1].",
      '[{"marker":1,"chunk_id":"adv","quote":"104 roostervrije uren"}]\n[]',
    );
    const parsed = parseGenerationOutput(raw);
    assert.equal(parsed.citationParseFailed, false);
    assert.equal(parsed.modelCitations.length, 1);
  });

  it("tolerates a stray trailing bracket (etd-011/d01/d03)", () => {
    const raw = withCitations(
      "Antwoord [1].",
      '[{"marker":1,"chunk_id":"ketenbepaling","quote":"maximaal drie contracten"}]\n]',
    );
    const parsed = parseGenerationOutput(raw);
    assert.equal(parsed.citationParseFailed, false);
    assert.equal(parsed.modelCitations.length, 1);
  });

  it("takes the first of several arrays (etd-007/014)", () => {
    const raw = withCitations(
      "Antwoord [1].",
      '[{"marker":1,"chunk_id":"leerbudget","quote":"€ 150 per werknemer"}]\n' +
        '[{"marker":1,"chunk_id":"leerbudget","quote":"meer dan 15 contracturen"}]',
    );
    const parsed = parseGenerationOutput(raw);
    assert.equal(parsed.citationParseFailed, false);
    assert.equal(parsed.modelCitations.length, 1);
    assert.equal(parsed.modelCitations[0]?.quote, "€ 150 per werknemer");
  });

  it("does not end the array on a bracket inside a quote", () => {
    const raw = withCitations(
      "Antwoord [1].",
      '[{"marker":1,"chunk_id":"x","quote":"tabel [A] geldt"}]',
    );
    const parsed = parseGenerationOutput(raw);
    assert.equal(parsed.citationParseFailed, false);
    assert.equal(parsed.modelCitations[0]?.quote, "tabel [A] geldt");
  });

  it("reports a genuinely truncated array as a parse failure (etd-012)", () => {
    const raw = withCitations(
      "Een 19-jarige verdient € 1.281,19 [1].",
      '[{"marker":1,"chunk_id":"salaristabel","quote":"19 jaar: 1.281,19"}',
    );
    const parsed = parseGenerationOutput(raw);
    assert.equal(parsed.citationParseFailed, true);
    assert.equal(parsed.modelCitations.length, 0);
  });
});
