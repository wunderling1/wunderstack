import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { chunk } from "./chunk";
import {
  computeStructureMetrics,
  isAnchorableByChunker,
  startsMidSentence,
  type ReportChunk,
} from "./report";

/** Shape a real chunker output into what the report measures — the production path, not a stub. */
function measure(text: string): ReturnType<typeof computeStructureMetrics> {
  const pieces: ReportChunk[] = chunk(text).map((piece) => ({
    content: piece.content,
    article: piece.article,
    sourceRef: piece.sourceRef,
    chunkType: piece.chunkType,
  }));
  return computeStructureMetrics(pieces);
}

const STRUCTURED_CAO = `Hoofdstuk 1 Algemene bepalingen

Artikel 3 Vakantie

1. De werknemer heeft recht op 25 vakantiedagen per jaar.
2. Opbouw vindt plaats naar rato van het dienstverband.

Artikel 4 Vakantiegeld

De werknemer ontvangt 8% vakantiegeld over het jaarsalaris.
`;

describe("ingest structure report — mirror of the frozen chunker", () => {
  // Drift guard (kerndiscipline 3): the report mirrors chunk.ts's isHeading / extractArticle /
  // extractSectionArticle patterns rather than importing them, because chunk.ts is frozen. If either
  // side drifts, structure the chunker DID anchor starts reading as "unanchored" and this fails.
  it("reports zero lost structure when the chunker anchored everything", () => {
    const metrics = measure(STRUCTURED_CAO);

    assert.equal(metrics.chunkCount, 4);
    // Only the chapter intro sits above article level; it still gets a "Hoofdstuk 1" anchor.
    assert.equal(metrics.withArticle, 3);
    assert.equal(metrics.withSourceRef, 4);
    assert.equal(metrics.articleHeadingInText, 3);
    assert.equal(metrics.unanchoredArticleHeadings, 0);
    assert.equal(metrics.anchorableButUnanchored, 0);
  });

  it("reports the same for the N.M section-number style", () => {
    const metrics = measure(`4.1 Deeltijdwerknemer

Je bent deeltijdwerknemer bij gemiddeld minder dan 38 uur per week.

4.2 Arbeidsduur

De volledige arbeidsduur bedraagt 38 uur per week.
`);

    assert.ok(metrics.sectionHeadingInText > 0);
    assert.equal(metrics.unanchoredSectionHeadings, 0);
    assert.equal(metrics.anchorableButUnanchored, 0);
    assert.equal(metrics.withArticle, metrics.chunkCount);
  });

  it("flags structure that is present in the text but not anchored", () => {
    // What the PDF ingest actually produces today: one run-on line, so no heading ever fires.
    const flattened = STRUCTURED_CAO.replace(/\n+/g, " ");
    const metrics = computeStructureMetrics([
      { content: flattened, article: null, sourceRef: null, chunkType: "text" },
      { content: "Artikel 9 Opzegtermijn\nDe opzegtermijn is twee maanden.", article: null, sourceRef: null, chunkType: "text" },
    ]);

    assert.equal(metrics.withArticle, 0);
    // The flattened chunk has no line-leading heading at all; the second one has one that was lost.
    assert.equal(metrics.articleHeadingInText, 1);
    assert.equal(metrics.unanchoredArticleHeadings, 1);
    assert.equal(metrics.anchorableButUnanchored, 1);
  });

  it("separates a heading-shaped line from prose that merely starts with a number", () => {
    const prose =
      "1.3. Gedeeltelijk arbeidsongeschikte werknemers met een dienstverband van ten minste zes " +
      "maanden behouden hun aanspraak op de in dit artikel genoemde toeslagen en vergoedingen.";
    const metrics = computeStructureMetrics([
      { content: prose, article: null, sourceRef: null, chunkType: "text" },
    ]);

    // Visible to the eye and to the raw pattern, invisible to the chunker (isHeading rejects it).
    assert.equal(metrics.sectionHeadingInText, 1);
    assert.equal(metrics.unanchoredSectionHeadings, 1);
    assert.equal(metrics.anchorableButUnanchored, 0);
  });
});

describe("ingest structure report — mirror agrees with the chunker line by line", () => {
  // The invariant: isAnchorableByChunker(line) is true exactly when the real chunker turns that line
  // into an article anchor. Asserted per line, because an aggregate assertion let a real divergence
  // through once already — the mirror rejected multi-word N.M headings that the chunker anchors.
  const cases = [
    "Artikel 5 Salaris",
    "Artikel 6a Overwerk",
    "1.1. Van toepassing",
    "4.3 Arbeidsduurverkorting (ADV)",
    "6.12 Maaltijdvergoeding",
    "Hoofdstuk 2 Beloning",
    "Bijlage 1 Salaristabellen",
    "1.",
    "2)",
    "15 jaar  580,30  609,32",
    "1.3. Gedeeltelijk arbeidsongeschikte werknemers met een dienstverband van ten minste zes maanden",
    "De werknemer heeft recht op vakantie.",
  ];

  for (const line of cases) {
    it(`agrees on ${JSON.stringify(line.slice(0, 40))}`, () => {
      const anchoredByChunker = chunk(`${line}\nDe tekst van dit onderdeel.`).some(
        (piece) => piece.article !== null,
      );
      assert.equal(isAnchorableByChunker(line), anchoredByChunker);
    });
  }
});

describe("ingest structure report — chunk-quality signals", () => {
  it("counts inline artikel references but not headings", () => {
    const metrics = computeStructureMetrics([
      {
        content: "Artikel 3 Vakantie\nDe schriftelijke bevestiging (artikel 3.1, tweede punt) geldt ook voor artikel 4.",
        article: "3",
        sourceRef: "Artikel 3",
        chunkType: "text",
      },
    ]);

    assert.equal(metrics.inlineArticleRefs, 2);
    assert.equal(metrics.chunksWithInlineArticleRef, 1);
  });

  it("treats table chunks as their own type", () => {
    const metrics = computeStructureMetrics([
      { content: "Trede 1: € 2.450", article: "5", sourceRef: "Artikel 5", chunkType: "table" },
      { content: "De lonen worden jaarlijks aangepast.", article: "5", sourceRef: "Artikel 5", chunkType: "text" },
    ]);

    assert.equal(metrics.tableChunks, 1);
    assert.equal(metrics.textChunks, 1);
    assert.equal(metrics.withSourceRef, 2);
  });

  it("applies the D4 mid-sentence heuristic", () => {
    assert.equal(startsMidSentence("vakantiewerkers hebben geen aanspraak."), true);
    assert.equal(startsMidSentence(", tweede en derde punt"), true);
    assert.equal(startsMidSentence("De werknemer heeft recht op vakantie."), false);
    assert.equal(startsMidSentence("• Schriftelijke bevestiging"), false);
    assert.equal(startsMidSentence("3. De opzegtermijn is twee maanden."), false);
    assert.equal(startsMidSentence("€ 2.450 bruto per maand"), false);
    assert.equal(startsMidSentence("   "), false);
  });
});