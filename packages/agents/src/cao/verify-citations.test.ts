import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ModelCitation } from "@wunderstack/shared";

import { verifyCitations } from "./verify-citations.js";

const content = new Map<string, string>([
  ["vakantie-ouderen", "Oudere werknemers hebben recht op de volgende extra vakantiedagen: 55 t/m 59 jaar: twee dagen."],
  ["adv", "De werknemer heeft recht op 104 roostervrije uren."],
]);

function citation(chunkId: string, quote: string, marker = 1): ModelCitation {
  return { marker, chunkId, quote };
}

describe("verifyCitations", () => {
  it("verifies a citation with a bare chunk id and a verbatim quote", () => {
    const result = verifyCitations([citation("adv", "104 roostervrije uren")], content);
    assert.equal(result.strippedMarkers.length, 0);
    assert.equal(result.verified.length, 1);
  });

  // Regression: baseline v4 cases etd-002/006/022/030/d02. The model folds the article reference from
  // the context into the chunk_id, in whatever form. Every form must resolve to the bare id.
  for (const decorated of [
    "vakantie-ouderen (Artikel 5.3)",
    "vakantie-ouderen 5.3",
    "vakantie-ouderen Artikel 5.3",
  ]) {
    it(`resolves a chunk id carrying an article reference: "${decorated}"`, () => {
      const result = verifyCitations([citation(decorated, "55 t/m 59 jaar: twee dagen")], content);
      assert.equal(result.strippedMarkers.length, 0);
      assert.equal(result.verified.length, 1);
      assert.equal(result.verified[0]?.chunkId, "vakantie-ouderen", "verified citation carries the bare id");
    });
  }

  it("still strips a citation whose quote is not a verbatim substring", () => {
    const result = verifyCitations(
      [citation("vakantie-ouderen (Artikel 5.3)", "55 jaar ... 59 jaar")],
      content,
    );
    assert.deepEqual(result.strippedMarkers, [1]);
    assert.equal(result.verified.length, 0);
  });

  // Tier B: the prompt allows two citation objects sharing a marker when two contiguous spans are
  // needed (instead of stitching with "..."). Each object verifies independently.
  it("verifies two citation objects that share a marker when both quotes are verbatim", () => {
    const result = verifyCitations(
      [
        citation("vakantie-ouderen", "55 t/m 59 jaar", 1),
        citation("vakantie-ouderen", "twee dagen", 1),
      ],
      content,
    );
    assert.equal(result.strippedMarkers.length, 0);
    assert.equal(result.verified.length, 2);
    assert.equal(result.verified[0]?.marker, 1);
    assert.equal(result.verified[1]?.marker, 1);
  });

  it("strips a citation whose id does not exist even after stripping the anchor", () => {
    const result = verifyCitations([citation("onbekend (Artikel 9)", "iets")], content);
    assert.deepEqual(result.strippedMarkers, [1]);
  });
});
