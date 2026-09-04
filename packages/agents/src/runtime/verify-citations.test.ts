import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ModelCitation } from "@wunderstack/shared";

import { verifyCitations, stripFailedMarkers } from "./verify-citations";

const content = new Map<string, string>([
  ["vakantie-ouderen", "Oudere werknemers hebben recht op de volgende extra vakantiedagen: 55 t/m 59 jaar: twee dagen."],
  ["adv", "De werknemer heeft recht op 104 roostervrije uren."],
  [
    "bereik-niet",
    "Deze cao is niet van toepassing op: directeuren; adjunct-directeuren; degene die boven Functiegroep F valt; vakantiewerkers.",
  ],
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
    const result = verifyCitations([citation("adv", "recht op 208 roostervrije uren")], content);
    assert.deepEqual(result.strippedMarkers, [1]);
    assert.equal(result.verified.length, 0);
  });

  // golden-set.REVIEW.md §20 (etd-002): the model capitalizes the first letter when it starts a quote
  // mid-sentence. Case-folded matching accepts it; a real content change (different number) still fails.
  it("verifies a quote that differs only by a leading capital", () => {
    const result = verifyCitations([citation("adv", "Recht op 104 roostervrije uren")], content);
    assert.equal(result.strippedMarkers.length, 0);
    assert.equal(result.verified.length, 1);
  });

  it("still strips a case-folded quote whose number was changed", () => {
    const result = verifyCitations([citation("adv", "Recht op 105 roostervrije uren")], content);
    assert.deepEqual(result.strippedMarkers, [1]);
    assert.equal(result.verified.length, 0);
  });

  // PLAN-v3 Fase 14.0 stap 3: an ellipsis quote is accepted ONLY when every elided fragment is
  // itself verbatim AND the fragments appear in source order — the anti-fabrication property holds
  // (baseline v4 etd-010/etd-018). See golden-set.REVIEW.md.
  it("verifies an ellipsis quote when both fragments are verbatim and in source order", () => {
    const result = verifyCitations(
      [citation("bereik-niet", "Deze cao is niet van toepassing op: ... vakantiewerkers.")],
      content,
    );
    assert.equal(result.strippedMarkers.length, 0);
    assert.equal(result.verified.length, 1);
  });

  // golden-set.REVIEW.md §17: models (incl. Mistral Large, etd-010) also elide with an editorial
  // "[...]"/"[…]"/"(...)". These are treated identically to a bare ellipsis: accepted only when every
  // fragment is verbatim and in order.
  for (const bracketed of [
    "Deze cao is niet van toepassing op: [...] vakantiewerkers.",
    "Deze cao is niet van toepassing op: […] vakantiewerkers.",
    "Deze cao is niet van toepassing op: (...) vakantiewerkers.",
  ]) {
    it(`verifies a bracketed-ellipsis quote when both fragments are verbatim: "${bracketed}"`, () => {
      const result = verifyCitations([citation("bereik-niet", bracketed)], content);
      assert.equal(result.strippedMarkers.length, 0);
      assert.equal(result.verified.length, 1);
    });
  }

  it("strips a bracketed-ellipsis quote whose second fragment is not verbatim", () => {
    const result = verifyCitations(
      [citation("bereik-niet", "Deze cao is niet van toepassing op: [...] seizoenskrachten.")],
      content,
    );
    assert.deepEqual(result.strippedMarkers, [1]);
    assert.equal(result.verified.length, 0);
  });

  it("strips an ellipsis quote whose fragments are out of source order", () => {
    const result = verifyCitations(
      [citation("bereik-niet", "vakantiewerkers. ... Deze cao is niet van toepassing op:")],
      content,
    );
    assert.deepEqual(result.strippedMarkers, [1]);
    assert.equal(result.verified.length, 0);
  });

  it("strips an ellipsis quote when a fragment is present but not verbatim", () => {
    // "55 jaar" is not contiguous in the source ("55 t/m 59 jaar"), so the quote stays stripped.
    const result = verifyCitations(
      [citation("vakantie-ouderen (Artikel 5.3)", "extra vakantiedagen: ... 55 jaar: twee dagen")],
      content,
    );
    assert.deepEqual(result.strippedMarkers, [1]);
    assert.equal(result.verified.length, 0);
  });

  it("strips an ellipsis quote with a fragment too short to prove grounding", () => {
    const result = verifyCitations([citation("vakantie-ouderen", "55 ... twee dagen")], content);
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

  // Gate C close-out (etd-021): model wrote "vak-krachten" for passage id "vakkrachten".
  it("resolves a hyphenated chunk id to the unhyphenated corpus id when unique", () => {
    const withHyphenVariant = new Map(content);
    withHyphenVariant.set("vakkrachten", "Nadat de vakkracht zes weken is uitgezonden naar een werkgever.");
    const result = verifyCitations(
      [citation("vak-krachten", "Nadat de vakkracht zes weken is uitgezonden naar een werkgever.")],
      withHyphenVariant,
    );
    assert.equal(result.strippedMarkers.length, 0);
    assert.equal(result.verified[0]?.chunkId, "vakkrachten");
  });

  it("does NOT resolve when the normalized chunk id is ambiguous", () => {
    const ambiguous = new Map([
      ["vak-krachten", "tekst A"],
      ["vakkrachten", "tekst B"],
    ]);
    const result = verifyCitations([citation("vak krachten", "tekst A")], ambiguous);
    assert.deepEqual(result.strippedMarkers, [1]);
    assert.equal(result.verified.length, 0);
  });

  it("still strips a paraphrased quote even when the chunk id resolves via hyphen normalization", () => {
    const withHyphenVariant = new Map(content);
    withHyphenVariant.set(
      "vakkrachten",
      "Nadat de vakkracht zes weken is uitgezonden naar een werkgever op wie deze cao van toepassing is.",
    );
    // Paraphrase: "Naar de uitzendwerkgever" is not in the source ("naar een werkgever").
    const result = verifyCitations(
      [
        citation(
          "vak-krachten",
          "Naar de uitzendwerkgever op wie deze cao van toepassing is.",
        ),
      ],
      withHyphenVariant,
    );
    assert.deepEqual(result.strippedMarkers, [1]);
    assert.equal(result.verified.length, 0);
  });
});

describe("stripFailedMarkers", () => {
  it("preserves newlines and nested indent when stripping a citation marker", () => {
    const nested =
      "1. **Zet het voertuig vast** [1]\n   - Controleer of het voertuig niet kan wegrollen\n   - Schakel het voertuig uit\n1. **Berg de contactsleutel op** [2]\n   - Berg de sleutel op";
    const stripped = stripFailedMarkers(nested, [1]);
    assert.equal(stripped.includes("\n"), true);
    assert.match(stripped, /\n {3}- Controleer/);
    assert.match(stripped, /\n {3}- Schakel/);
    assert.match(stripped, /1\. \*\*Berg de contactsleutel op\*\* \[2\]/);
    assert.equal(stripped.includes("[1]"), false);
  });

  it("collapses double spaces mid-line after removing a marker", () => {
    const prose = "Je hebt recht op  25 dagen [1].";
    const stripped = stripFailedMarkers(prose, [1]);
    assert.equal(stripped, "Je hebt recht op 25 dagen.");
  });
});
