import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildRetrievalStreamEvent } from "./retrieval-stream-event";
import type { RetrievalOutput } from "./profile";

function chunk(
  chunkId: string,
  title: string,
  article: string | null,
  score: number,
): RetrievalOutput["chunks"][number] {
  return {
    chunkId,
    ordinal: 0,
    content: article ? `Artikel ${article} — Vakantie\nTekst.` : "Tekst.",
    score,
    source: {
      documentId: "doc",
      title,
      sourceUri: "https://example.test/cao.pdf",
      fund: "oomt",
      agentKey: "cao",
      schemaName: "fund_oomt",
      version: "2025-2026",
    },
    structure: {
      chapter: null,
      article,
      lid: null,
      sourceRef: article ? `Artikel ${article}` : null,
      chunkType: "text",
    },
    metadata: {},
  };
}

function baseRetrieval(overrides: Partial<RetrievalOutput>): RetrievalOutput {
  return {
    context: "",
    citations: [],
    hits: [],
    timings: { rewriteMs: 0, embedMs: 0, searchMs: 0, rerankMs: 0, totalMs: 0 },
    chunks: [],
    fullChunkContent: [],
    consideredCount: 0,
    aboveThresholdCount: 0,
    droppedChunks: [],
    ...overrides,
  };
}

describe("buildRetrievalStreamEvent", () => {
  it("caps hits at six while reporting the full considered count", () => {
    const kept = Array.from({ length: 4 }, (_, index) =>
      chunk(`kept-${String(index)}`, "CAO Motor", "27", 0.8),
    );
    const dropped = Array.from({ length: 4 }, (_, index) =>
      chunk(`drop-${String(index)}`, "CAO Motor", "12", 0.3),
    );
    const event = buildRetrievalStreamEvent(
      baseRetrieval({
        chunks: kept,
        droppedChunks: dropped,
        consideredCount: 14,
        aboveThresholdCount: 4,
      }),
      "hoeveel vakantiedagen",
      "2025-2026",
    );
    assert.equal(event.hits.length, 6);
    assert.equal(event.considered, 14);
    assert.equal(event.aboveThreshold, 4);
    assert.equal(event.corpus.label, "CAO Motor");
    assert.equal(event.corpus.version, "2025-2026");
    assert.equal(event.query, "hoeveel vakantiedagen");
    assert.equal(event.hits.filter((hit) => hit.dropped).length, 2);
  });

  it("spends the cap on kept passages before dropped ones", () => {
    // The realistic shape: retrieval drops far more than it keeps. Every kept passage must still
    // reach the client, otherwise the UI shows only struck-through labels.
    const event = buildRetrievalStreamEvent(
      baseRetrieval({
        chunks: Array.from({ length: 5 }, (_, index) =>
          chunk(`kept-${String(index)}`, "CAO Motor", "27", 0.8),
        ),
        droppedChunks: Array.from({ length: 17 }, (_, index) =>
          chunk(`drop-${String(index)}`, "CAO Motor", "12", 0.2),
        ),
        consideredCount: 22,
        aboveThresholdCount: 5,
      }),
      "hoeveel vakantiedagen",
      "2025-2026",
    );
    assert.deepEqual(
      event.hits.map((hit) => hit.dropped),
      [false, false, false, false, false, true],
    );
  });

  it("uses deriveChunkHeading for hit labels", () => {
    const event = buildRetrievalStreamEvent(
      baseRetrieval({
        chunks: [chunk("a", "CAO Motor", "27", 0.9)],
        consideredCount: 1,
        aboveThresholdCount: 1,
      }),
      "hoeveel vakantiedagen",
    );
    assert.equal(event.hits[0]?.label, "Artikel 27 — Vakantie");
  });
});
